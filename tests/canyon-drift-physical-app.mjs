import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createAppDom} from './fixtures/app-dom.mjs';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import {createDrivingModel,VEHICLE_DYNAMICS} from '../dist/driving-model.js';
import {BMW_DRIFT} from '../dist/drift-dynamics.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {canyonPointAt,projectCanyon} from '../dist/canyon-track.js';
import {canyonDriverInput} from './fixtures/canyon-driver.mjs';

const dist=new URL('../dist/',import.meta.url),fixture=new URL('./fixtures/',import.meta.url);
const data=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const baselineDir=process.env.DRIFT_BASELINE_DIR||'/tmp/drift-before/';
async function baseline(){
 if(!['driving-model.js','drift-dynamics.js'].every(file=>fs.existsSync(baselineDir+file)))return null;
 const drift=data(fs.readFileSync(baselineDir+'drift-dynamics.js','utf8'));
 const source=fs.readFileSync(baselineDir+'driving-model.js','utf8').replace(/from '\.\/([^']+)'/g,(_,file)=>`from '${file==='drift-dynamics.js'?drift:new URL(file,dist).href}'`);
 const modelUrl=data(source),model=await import(modelUrl);
 const appSource=fs.readFileSync(new URL('app-dom.mjs',fixture),'utf8').replaceAll('../../dist/driving-model.js',modelUrl).replaceAll('../../dist/',dist.href).replaceAll('./vehicle-input-dom.mjs',new URL('vehicle-input-dom.mjs',fixture).href);
 return {model:model.createDrivingModel,app:(await import(data(appSource))).createAppDom};
}
const before=await baseline();
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const oldDriver=function(s,{speed=14,gain=2,look=.5,offsetGain=.035}={}){const p=projectCanyon(s.x,s.z),v=s.linearSpeed,lead=canyonPointAt(p.progress+v*look),curvature=wrap(canyonPointAt(lead.progress+1).heading-canyonPointAt(lead.progress-1).heading)/2;const intent=clamp(-v*curvature*(1+(v/45)**2)/.9366,-1,1);let low=0,high=1;for(let i=0;i<12;i++){const m=(low+high)/2;if(m*(.55+.45*m)<Math.abs(intent))low=m;else high=m;}const steer0=Math.sign(intent)*(.08+.92*(low+high)/2),beta=-Math.sign(steer0)*.62*smooth(6,13,v)*smooth(.15,.65,Math.abs(steer0));const error=wrap(lead.heading+beta+Math.atan(p.offset*offsetGain)-s.heading);return {steering:clamp(steer0-error*gain,-1,1),speedDemand:speed/42};}
;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const deg=a=>a*180/Math.PI;
const snapshot=s=>({speed:s.linearSpeed,slipDegrees:deg(s.slipAngle),yawRate:s.angularVelocity,heading:s.heading,x:s.x,z:s.z,blocked:s.blocked});
const energy=s=>.5*VEHICLE_DYNAMICS.mass*(s.velocityX*s.velocityX+s.velocityZ*s.velocityZ)+.5*BMW_DRIFT.yawInertia*s.angularVelocity*s.angularVelocity;
function maneuvers(factory){
 const out={};
 for(const sign of [-1,1]){
  const m=factory({vehicleId:'bmwreward',maxSpeed:42,x:0,z:0,groundSurface:()=>surfaceForBiome('city','bmwreward')});
  m.state.velocityZ=-22;
  const run=(seconds,input)=>{m.setInput(input);for(let i=0;i<seconds*120;i++)m.step(1/120);return snapshot(m.state);};
  const entry=run(.75,{active:true,steering:sign*.75});
  const counter=run(.5,{active:true,steering:-sign*.75});
  const release=run(2,{active:false,steering:0});
  Object.assign(m.state,{heading:0,velocityX:8,velocityZ:-20,angularVelocity:.6});m.setInput({active:false,steering:0});
  let previous=energy(m.state),maxEnergyRise=0;const initialEnergy=previous;
  for(let i=0;i<120*30;i++){m.step(1/120);const e=energy(m.state);maxEnergyRise=Math.max(maxEnergyRise,e-previous);previous=e;}
  out[sign]={entry,counter,release,initialEnergy,finalEnergy:previous,maxEnergyRise,stoppedSpeed:m.state.linearSpeed};
 }
 return out;
}
// Share the exact wheel-force pilot used by the standalone journey tests.
export const physicalCanyonInput=canyonDriverInput;

function journey(appFactory,controller,{seconds=180}={}){
 const f=appFactory({startDriving:false,career:earnedRewardCareer()});
 try{
  const d=f.debug;d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('bmwreward'),true);
  Object.assign(d.model.state,canyonPointAt(12));d.applyTruckPose();assert.equal(d.canyon.enter(),true);
  let contactSeconds=0,maxSlip=0,scoringSeconds=0,frames=0,maxOffset=0;
  for(;frames<seconds*60;frames++){
   d.model.setInput(controller(d.model.state));f.frame();
   const s=d.model.state,p=projectCanyon(s.x,s.z);
   if(s.blocked)contactSeconds+=1/60;
   maxSlip=Math.max(maxSlip,Math.abs(deg(s.slipAngle)));maxOffset=Math.max(maxOffset,Math.abs(p.offset));
   if(Math.abs(deg(s.slipAngle))>=12&&s.linearSpeed>=9&&!s.blocked)scoringSeconds+=1/60;
   if(d.canyon.score?.finished||d.canyon.score?.valid===false)break;
  }
  return {execution:'actual app.js, real gameplay/physics/scoring; mocked DOM, renderer, asset loading; no browser',elapsed:(frames+1)/60,contactSeconds,maxSlip,maxOffset,scoringSeconds,pose:snapshot(d.model.state),score:{...d.canyon.score}};
 }finally{f.dispose();}
}
function digitalManeuver(){
 const f=createAppDom({startDriving:false,career:earnedRewardCareer()});
 try{
  const d=f.debug;d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('bmwreward'),true);
  const p=canyonPointAt(12);Object.assign(d.model.state,p,{velocityX:-Math.sin(p.heading)*24,velocityZ:-Math.cos(p.heading)*24});d.applyTruckPose();assert.equal(d.canyon.enter(),true);
  f.pointer(f.wheel,'pointerdown',0,88);f.pointer(f.wheel,'pointermove',.75*135,88);f.win.dispatch('keydown',{code:'KeyW'});
  let maxSlip=0,contacts=0,peakScore=0;
  for(let i=0;i<120;i++){
   if(i===24)f.win.dispatch('keydown',{code:'ShiftLeft'});
   if(i===42){f.win.dispatch('keyup',{code:'ShiftLeft'});f.pointer(f.wheel,'pointermove',0,88);f.pointer(f.wheel,'pointermove',-.7*135,88);}
   if(i===72){f.pointer(f.wheel,'pointermove',0,88);f.win.dispatch('keyup',{code:'KeyW'});}
   f.frame();maxSlip=Math.max(maxSlip,Math.abs(deg(d.model.state.slipAngle)));contacts+=d.model.state.blocked/60;peakScore=Math.max(peakScore,d.canyon.score.score);
  }
  return {execution:'actual app, DOM wheel pointer + W + Shift events',maxSlip,contacts,peakScore,final:snapshot(d.model.state)};
 }finally{f.dispose();}
}
const report={comparisonNotes:'Identical open-flat maneuver inputs; full-route pilots differ because the baseline pilot encodes the retired yaw/slip servo. Current pilot uses geometric wheelbase steering and analog .3 handbrake in bends. Separate DOM test proves digital wheel/W/Shift control and clean recovery. No visual/browser claims.',scope:'CPU simulations, not browser or visual validation',baselineAvailable:!!before,digitalManeuver:digitalManeuver(),currentManeuvers:maneuvers(createDrivingModel),baselineManeuvers:before?maneuvers(before.model):null};
console.log('MANEUVERS',JSON.stringify(report));
report.currentJourney=journey(createAppDom,physicalCanyonInput);
if(before)report.baselineJourney=journey(before.app,oldDriver);
fs.writeFileSync(new URL('../qa/canyon-drift-physical.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('JOURNEYS',JSON.stringify({current:report.currentJourney,baseline:report.baselineJourney}));
test('physical entry, countersteer, release and mirrored steering remain finite and symmetric',()=>{
 const left=report.currentManeuvers[-1],right=report.currentManeuvers[1];
 for(const phase of ['entry','counter','release']){
  for(const key of ['speed','slipDegrees','yawRate','heading','x','z'])assert.ok(Number.isFinite(left[phase][key]));
  for(const key of ['slipDegrees','yawRate','heading','x'])assert.ok(Math.abs(left[phase][key]+right[phase][key])<1e-8,`${phase} ${key} symmetry`);
  assert.ok(Math.abs(left[phase].speed-right[phase].speed)<1e-8);
 }
 assert.ok(Math.abs(left.entry.yawRate)>.05,'steering develops actual yaw');
 assert.ok(left.entry.yawRate*left.counter.yawRate<0,'countersteer reverses yaw');
 assert.ok(Math.abs(left.release.slipDegrees)<5,'centering and lifting regains grip');
});
test('no-input kinetic energy dissipates on flat ground',()=>{
 for(const s of Object.values(report.currentManeuvers)){assert.ok(s.maxEnergyRise<1e-6);assert.ok(s.stoppedSpeed<.001);assert.equal(s.finalEnergy,0);}
});
test('actual app earns a valid practical canyon score with wheel-based controller',()=>{
 const j=report.currentJourney;assert.equal(j.score.valid,true);assert.equal(j.score.finished,true);assert.ok(j.score.score>20,`earned score ${j.score.score}`);assert.ok(j.contactSeconds<3,`contact seconds ${j.contactSeconds}`);
});

test('DOM steering, rear brake and countersteer earn real points',()=>{const d=report.digitalManeuver;assert.ok(d.peakScore>=20);assert.equal(d.contacts,0);assert.ok(d.maxSlip>=12);});
