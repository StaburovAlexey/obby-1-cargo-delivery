import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as originalSurface from './baselines/future-drift/biome-surfaces.js';
import * as originalDriving from './baselines/future-drift/driving-model.js';
const baselineManifest=JSON.parse(fs.readFileSync(new URL('./baselines/future-drift/manifest.json',import.meta.url),'utf8'));
import {VEHICLE_CONFIG,BIOME_SEQUENCE} from '../dist/economy-config.js';
import {createDrivingModel,evaluateVehicleForces} from '../dist/driving-model.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {routePointAtProgress} from '../dist/route-network.js';
import {getUpgradeModifiers} from '../dist/vehicle-upgrades.js';
const path=new URL('../qa/future-biome-drift.json',import.meta.url);
const levels={stock:{},max:{speed:10,handling:10,grip:10,fuel:10}};
const baselineStates=[
 {heading:0,velocityX:0,velocityZ:0,angularVelocity:0,frontWheelAngle:0,gear:'D',active:true},
 {heading:.37,velocityX:3.1,velocityZ:-8.4,angularVelocity:.19,frontWheelAngle:-.12,gear:'D',active:true},
 {heading:-.68,velocityX:-2.1,velocityZ:5.7,angularVelocity:-.31,frontWheelAngle:.21,gear:'R',active:true},
 {heading:.18,velocityX:2.2,velocityZ:-4.7,angularVelocity:.05,frontWheelAngle:.1,gear:'D',active:false},
];
function supportedSnapshot(surfaceReader=surfaceForBiome,evaluate=evaluateVehicleForces){
 const rows=[];
 for(const v of VEHICLE_CONFIG){const tier=BIOME_SEQUENCE.findIndex(b=>b.id===v.specialty);
 for(const b of BIOME_SEQUENCE.slice(0,tier+1)) for(const [upgrade,l] of Object.entries(levels)){
 const m=getUpgradeModifiers(l),surface={...surfaceReader(b.id,v.id)};
 surface.frictionFactor*=m.grip;surface.lateralDampingFactor*=m.grip;
 for(const [index,state] of baselineStates.entries()) for(const grade of [0,.075]){
 const force=evaluate(state,{maxSpeed:v.maxSpeed*m.speed,gradient:{x:grade/3,z:-grade},braking:index===2?.7:false,surface,engineAcceleration:v.acceleration*m.engine,brakeFactor:v.grip*m.grip});
 delete surface.longitudinalGripFactor;rows.push({vehicle:v.id,biome:b.id,upgrade,index,grade,surface,force});
 }} }
 return rows;
}
const report={};
const original=supportedSnapshot(originalSurface.surfaceForBiome,originalDriving.evaluateVehicleForces);
assert.deepEqual(supportedSnapshot(),original,'Own/earlier profiles and force vectors must be bit-for-bit unchanged');


let supportedTrajectories=0;
for(const v of VEHICLE_CONFIG){const tier=BIOME_SEQUENCE.findIndex(b=>b.id===v.specialty);for(const b of BIOME_SEQUENCE.slice(0,tier+1))for(const l of Object.values(levels)){
 const options={vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>l,groundGradient:()=>({x:.015,z:-.05})};
 const current=createDrivingModel({...options,groundSurface:()=>surfaceForBiome(b.id,v.id)}),originalModel=originalDriving.createDrivingModel({...options,groundSurface:()=>originalSurface.surfaceForBiome(b.id,v.id)});
 for(let frame=0;frame<600;frame++){const input={active:frame<450,steering:frame<180?0:frame<360?.65:0};current.setInput(input);originalModel.setInput(input);current.step(1/120);originalModel.step(1/120);assert.deepEqual(current.state,originalModel.state,`${v.id}/${b.id} trajectory frame ${frame}`);}supportedTrajectories++;
}}

const dt=1/120;
const lateral=s=>Math.abs(Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ);
const slip=s=>Math.atan2(lateral(s),Math.max(.001,Math.abs(s.speed)))*180/Math.PI;
function model(v,b,l,grade=0){return createDrivingModel({vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>l,groundSurface:()=>surfaceForBiome(b,v.id),groundGradient:()=>({x:0,z:-grade})});}
const straight=[],turns=[],fuelChecks=[];
for(const [file,hash] of Object.entries(baselineManifest.sha256))assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../dist/'+file,import.meta.url))).digest('hex'),hash,`${file} changed`);
for(const v of VEHICLE_CONFIG){const tier=BIOME_SEQUENCE.findIndex(b=>b.id===v.specialty);
for(const [j,b] of BIOME_SEQUENCE.entries()){if(j<=tier)continue;
 const surface=surfaceForBiome(b.id,v.id);
 assert.equal(surface.speedFactor,.75,`${v.id}/${b.id} nominal speed`);
 assert.equal(surface.fuelFactor,j-tier+1,`${v.id}/${b.id} fuel`);
 assert.equal(surface.handlingFactor,.75,`${v.id}/${b.id} rack latency`);
 for(const [upgrade,l] of Object.entries(levels)){
 const target=v.maxSpeed*getUpgradeModifiers(l).speed*.75;
 const g=createGameplay({vehicles:VEHICLE_CONFIG.map(c=>({id:c.id,park:{x:0,z:0,heading:0}})),career:{...freshCareer(),ownedVehicleIds:VEHICLE_CONFIG.map(c=>c.id),vehicleUpgrades:{[v.id]:l}}});assert.ok(g.enter(v.id));const point=routePointAtProgress((b.from+b.to)/2),fuel=g.state.fuels[v.id];g.drive(10,point.x,point.z);const burn=fuel-g.state.fuels[v.id];assert.ok(Math.abs(burn-10*v.consumption*(j-tier+1))<1e-8);fuelChecks.push({vehicle:v.id,biome:b.id,upgrade,burn});
 for(const grade of [0,.025,.05,.075]){
 const m=model(v,b.id,l,grade);m.setInput({active:true});let timeTo95=null;
 for(let frame=1;frame<=120*35;frame++){m.step(dt);if(timeTo95===null&&m.state.speed>=target*.95)timeTo95=frame*dt;}
 const row={vehicle:v.id,biome:b.id,upgrade,grade,target,timeTo95,settled:m.state.speed};straight.push(row);
 assert.ok(timeTo95!==null,`${JSON.stringify(row)} did not reach 95% target`);
 assert.ok(Math.abs(m.state.speed-target)<.22,`${JSON.stringify(row)} settled cap`);
 }
 for(const biome of [v.specialty,b.id]){
 const m=model(v,biome,l);m.setInput({active:true});for(let f=0;f<120*15;f++)m.step(dt);
 m.setInput({active:true,steering:.8});let maxSlip=0,maxLateral=0;
 for(let f=0;f<120*3;f++){m.step(dt);maxSlip=Math.max(maxSlip,slip(m.state));maxLateral=Math.max(maxLateral,lateral(m.state));}
 const releaseSlip=slip(m.state);m.setInput({active:true,steering:0});let recoverySeconds=null;
 for(let f=1;f<=120*15;f++){m.step(dt);if(recoverySeconds===null&&slip(m.state)<1)recoverySeconds=f*dt;}
 turns.push({vehicle:v.id,biome,comparison:b.id,upgrade,target,maxSlip,maxLateral,releaseSlip,recoverySeconds,finalSlip:slip(m.state)});
 assert.ok(recoverySeconds!==null,`${v.id}/${biome}/${upgrade} fails turn recovery`);
 }
 }
}}
for(const f of turns.filter(r=>r.biome===r.comparison)){const own=turns.find(r=>r.vehicle===f.vehicle&&r.comparison===f.comparison&&r.upgrade===f.upgrade&&r.biome!==r.comparison);assert.ok(f.maxSlip>own.maxSlip*2,`${f.vehicle}/${f.biome}/${f.upgrade} should visibly slide more than own biome`);}
report.baselineCommit='89eec0fe33e7550154e525c128631c720d898322';report.measurements={straight,turns,fuelChecks};report.coverage={supportedForceSamples:original.length,supportedTrajectories,fuelChecks:fuelChecks.length,futurePairs:20,straightRuns:straight.length,turnRuns:turns.length,gpuValidation:false};fs.writeFileSync(path,JSON.stringify(report,null,2));
console.log(JSON.stringify({coverage:report.coverage,timeTo95:[Math.min(...straight.map(r=>r.timeTo95)),Math.max(...straight.map(r=>r.timeTo95))],maxSlip:Math.max(...turns.map(r=>r.maxSlip)),maxRecovery:Math.max(...turns.map(r=>r.recoverySeconds))},null,2));
