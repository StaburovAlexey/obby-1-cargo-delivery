#!/usr/bin/env node
// Independent narrow rollback audit. Actual production solver/Three.js/app;
// mock DOM/renderer. No browser, WebGL, physical touch or Android claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as THREE from '../dist/vendor/three.module.js';
import * as N from '../dist/route-network.js';
import {createDrivingModel,evaluateVehicleForces,VEHICLE_DYNAMICS} from '../dist/driving-model.js';
import {createDrivingModel as baselineModel,evaluateVehicleForces as baselineForces} from '../qa/turn-assist/baseline-v34/driving-model.js';
import {VEHICLE_CONFIG,ECONOMY_CONFIG} from '../dist/economy-config.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {roadGroundGradient,roadGroundSurface} from '../dist/driving-ground.js';
import {getTruckContact,fitTruckToGround} from '../dist/city-driving.js';
import {createRoadHazards} from '../dist/road-hazards.js';
import {getVehiclePerformance} from '../dist/vehicle-upgrades.js';
import {freshCareer} from '../dist/career-save.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createNetworkRouteController} from './fixtures/network-route-controller.mjs';

const root=new URL('../',import.meta.url),out=new URL('../qa/handling-rollback/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const site34='3f53dc9c685a5a514c02ea790887b86ba7061253',site35='c7c6e00266c2622f338c2b7df7bd72636146e92c';
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:16*1024*1024});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const bytes=path=>fs.readFileSync(new URL(path,root));
const tracked35=git('ls-tree','-r','--name-only',site35,'--','dist/').toString().trim().split('\n');
const hashes=()=>Object.fromEntries(tracked35.map(path=>[path,fs.existsSync(new URL(path,root))?hash(bytes(path)):null]));
const save=(name,value)=>fs.writeFileSync(new URL(name,out),JSON.stringify(value,null,2)+'\n');
const near=(a,b,e=1e-8,label='')=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=e,`${label}: ${a} != ${b}`);
const finite=s=>{for(const[k,v]of Object.entries(s))if(typeof v==='number')assert.ok(Number.isFinite(v),k);};
const exact=(a,b,label)=>{for(const key of Reflect.ownKeys(a)){assert.ok(Object.hasOwn(b,key),`${label}: unexpected ${String(key)}`);assert.equal(a[key],b[key],`${label}/${String(key)}`);}assert.equal(Reflect.ownKeys(a).length,Reflect.ownKeys(b).length,label);};
const MAX={speed:3,handling:3,grip:3,fuel:3},biomes=['city','forest','desert','snow','volcanic'];
const profiles=VEHICLE_CONFIG.flatMap(spec=>biomes.flatMap(biome=>[false,true].map(max=>({spec,biome,max,levels:max?MAX:undefined}))));
const report={generatedAt:new Date().toISOString(),scope:'Restore Site34 handling exactly while preserving all other Site35 runtime bytes and 0–66m hills.',baseline:site34,preserved:site35,limitations:['Actual Three.js math, meshes and application logic execute in Node with mock DOM/renderer.','No browser, WebGL, GPU, Android or physical multitouch verification.','Short slope segment spawns establish handling/support, not complete fuel-economy journeys.'],runtimeHashesAtStart:hashes(),checks:[]};
function check(name,fn){const start=performance.now();try{const details=fn();report.checks.push({name,passed:true,milliseconds:Math.round(performance.now()-start),details});console.log('PASS',name,JSON.stringify(details));}catch(error){report.checks.push({name,passed:false,milliseconds:Math.round(performance.now()-start),error:error.stack});console.error('FAIL',name,error.stack);}save('report.json',report);}
const make=(profile,{baseline=false,gear='D',gradient=()=>({x:0,z:0}),speed=0}={})=>{
 const m=(baseline?baselineModel:createDrivingModel)({x:0,z:0,heading:.37,vehicleId:profile.spec.id,maxSpeed:profile.spec.maxSpeed,getUpgrades:()=>profile.levels,groundSurface:()=>surfaceForBiome(profile.biome,profile.spec.id),groundGradient:gradient});
 m.setGear(gear);const signed=speed*(gear==='R'?-1:1);Object.assign(m.state,{velocityX:-Math.sin(.37)*signed,velocityZ:-Math.cos(.37)*signed,speed:signed,linearSpeed:speed});return m;
};

check('Exact Site34 model and baseline closure; every unrelated Site35 runtime byte retained',()=>{
 assert.deepEqual(bytes('dist/driving-model.js'),git('show',`${site34}:dist/driving-model.js`));
 const baselineDir=new URL('../qa/turn-assist/baseline-v34/',import.meta.url),closure=[];
 for(const line of fs.readFileSync(new URL('SHA256SUMS',baselineDir),'utf8').trim().split('\n')){const[expected,path]=line.split('  '),content=fs.readFileSync(new URL(path,baselineDir));assert.equal(hash(content),expected,path);assert.deepEqual(content,git('show',`${site34}:dist/${path}`),`Baseline git provenance ${path}`);closure.push(path);}
 const changes=[];
 for(const path of tracked35){const current=fs.existsSync(new URL(path,root))?bytes(path):null,old=git('show',`${site35}:${path}`);if(!current||!current.equals(old))changes.push(path);if(!['dist/driving-model.js','dist/turn-assist.js'].includes(path))assert.deepEqual(current,old,path);}
 assert.deepEqual(changes,['dist/driving-model.js','dist/turn-assist.js']);assert.equal(fs.existsSync(new URL('dist/turn-assist.js',root)),false);
 const runtimeJs=tracked35.filter(f=>f.endsWith('.js')&&fs.existsSync(new URL(f,root)));
 for(const path of runtimeJs)assert.doesNotMatch(bytes(path).toString(),/from\s*['"][^'"]*turn-assist\.js['"]|import\s*\(\s*['"][^'"]*turn-assist\.js['"]/u,path);
 assert.equal(Math.max(...N.ELEVATION_PROFILE.map(p=>p[1])),66);assert.equal(Math.min(...N.ELEVATION_PROFILE.map(p=>p[1])),0);
 return{modelSha256:hash(bytes('dist/driving-model.js')),baselineDependencyFiles:closure.length,unchangedSite35Files:tracked35.length-2,changedRuntimeFiles:changes,hillMetres:[0,66],appPricesSavesControlsRoutes:'Byte-identical to Site35'};
});

check('Bit-exact dynamics across 10 cars × 5 biomes × stock/max, D/R, weak/full steering, throttle/coast and slopes',()=>{
 const gradients=[()=>({x:0,z:0}),()=>({x:.044,z:-.058}),(x,z)=>({x:.055*Math.sin(x/19),z:.035*Math.cos(z/21)})];
 const pattern=[1/120,1/60,1/30,.009,.024];let cases=0,frames=0,callbackChecks=0;
 for(const p of profiles)for(const gear of ['D','R'])for(const steering of [-1,-.6,-.3,0,.3,.6,1])for(const active of [false,true])for(let g=0;g<gradients.length;g++){
  const calls=[[],[]],wrap=i=>(x,z)=>{calls[i].push([x,z]);return gradients[g](x,z);};
  const a=make(p,{gear,gradient:wrap(0),speed:p.spec.maxSpeed*.75}),b=make(p,{baseline:true,gear,gradient:wrap(1),speed:p.spec.maxSpeed*.75});
  a.setInput({steering,active});b.setInput({steering,active});
  for(let i=0;i<24;i++){const dt=pattern[i%pattern.length];a.step(dt);b.step(dt);finite(a.state);exact(a.state,b.state,`${p.spec.id}/${p.biome}/${p.max}/${gear}/${steering}/${active}/${g}/${i}`);frames++;}
  assert.deepEqual(calls[0],calls[1]);callbackChecks+=calls[0].length;assert.ok(calls[0].length>0);assert.equal(Object.hasOwn(a.state,'turnAssist'),false);cases++;
 }
 return{profiles:profiles.length,cases,comparedFrames:frames,matchingSlopeCallbackCalls:callbackChecks,maxStateDifference:0};
});

check('Baseline force equality and four physical contact patches survive rollback',()=>{
 let cases=0;
 for(const p of profiles)for(const gear of ['D','R'])for(const steering of [-1,-.3,.3,1])for(const active of [false,true]){
  const state={heading:.7,velocityX:7,velocityZ:-p.spec.maxSpeed*.7,angularVelocity:.3,frontWheelAngle:.22,steering,gear,active},options={maxSpeed:p.spec.maxSpeed,surface:surfaceForBiome(p.biome,p.spec.id),gradient:{x:.045,z:-.04}};
  const actual=evaluateVehicleForces(state,options),expected=baselineForces(state,options);assert.deepEqual(actual,expected);assert.equal(actual.tires.length,4);
  for(const tire of actual.tires)assert.ok(Math.hypot(tire.longitudinalForce,tire.lateralForce)<=tire.grip+1e-7);cases++;
 }return{cases,maxForceDifference:0,tireContacts:4};
});

check('30/60/120 Hz, jitter and clamped stalls reproduce Site34; pause/reset and reversing retain exact state',()=>{
 const patterns=[[1/120],[1/60],[1/30],[.005,.019,.027,.009,.025,.015],[.35,.025,.025,.05]];let cases=0,frames=0,gearChanges=0,resets=0;
 for(const p of profiles)for(const gear of ['D','R'])for(const pattern of patterns){
  const gradient=(x,z)=>({x:.04*Math.sin(x/7),z:-.035*Math.cos(z/9)}),a=make(p,{gear,gradient}),b=make(p,{baseline:true,gear,gradient});let elapsed=0,i=0;
  while(elapsed<4-1e-10){const raw=pattern[i++%pattern.length],dt=Math.min(raw,4-elapsed),input={active:elapsed<3,steering:elapsed<1?1:elapsed<2?-.3:-1};a.setInput(input);b.setInput(input);a.step(dt);b.step(dt);elapsed+=Math.min(dt,VEHICLE_DYNAMICS.maxFrameDelta);exact(a.state,b.state,`Timing/${p.spec.id}/${p.biome}/${p.max}/${gear}/${i}`);frames++;}
  for(const model of[a,b]){model.setGear(gear==='D'?'R':'D');model.setInput({active:true,steering:1});}
  for(let j=0;j<180;j++){a.step(1/120);b.step(1/120);exact(a.state,b.state,'Gear reversal');frames++;}gearChanges++;
  for(const op of ['pause','reset']){a[op]();b[op]();exact(a.state,b.state,op);assert.equal(a.state.linearSpeed,0);a.setInput({active:true,steering:-1});b.setInput({active:true,steering:-1});a.step(.1);b.step(.1);exact(a.state,b.state,`${op} restart`);resets++;}cases++;
 }
 return{profiles:profiles.length,timingSchedules:patterns.length,cases,comparedFrames:frames,gearChanges,resets,maxStateDifference:0};
});

check('Short input-only real uphill segments retain terrain contact with the restored solver',()=>{
 const rows=[],scenarios=[
  {biome:'forest',from:2860,to:2960,branch:'main'},
  {biome:'forest',from:2960,to:2860,branch:'alternate'},
  {biome:'desert',from:5180,to:5280,branch:'alternate'},
  {biome:'snow',from:7260,to:7360,branch:'main'},
  {biome:'volcanic',from:8170,to:8270,branch:'main'},
 ];
 for(const spec of[VEHICLE_CONFIG[0],VEHICLE_CONFIG.at(-1)])for(const max of[false,true])for(const segment of scenarios){
  const levels=max?MAX:undefined,direction=Math.sign(segment.to-segment.from),start=N.routePointAtProgress(segment.from,{branch:segment.branch}),hazards=createRoadHazards(42),performance=getVehiclePerformance(spec.id,levels);let context=start,contacts=0;
  const model=createDrivingModel({x:start.x,z:start.z,heading:start.heading,vehicleId:spec.id,maxSpeed:spec.maxSpeed,getUpgrades:()=>levels,
   groundGradient:(x,z)=>{context=N.projectRoad(x,z,context);return roadGroundGradient(x,z,context);},groundSurface:(x,z,id)=>hazards.surfaceAt(x,z,roadGroundSurface(x,z,id,context)),
   contact:(x,z,h)=>{const a=getTruckContact(x,z,h,[],context),b=hazards.contact(x,z,h),hit=!a?b:!b||a.depth>=b.depth?a:b;if(hit)contacts++;return hit;},
  });model.setGear(direction>0?'D':'R');
  const control=createNetworkRouteController({branch:segment.branch,vehicleId:spec.id,levels,hazards,direction});let frames=0,travel=0,maxGrade=0,maxOffset=0,minClearance=Infinity,maxClearance=0,maxHeight=0,maxStep=0;
  for(;frames<3000&&direction*(segment.to-context.progress)>0;frames++){
   const s=model.state,before={x:s.x,z:s.z},input=control.sample(s);model.setInput(input);hazards.update(.1,{...s,routeContext:context},true);model.step(.1);context=N.projectRoad(s.x,s.z,context);finite(s);assert.equal(s.blocked,false);assert.ok(N.truckInRoad(s.x,s.z,s.heading,context));
   const step=Math.hypot(s.x-before.x,s.z-before.z);maxStep=Math.max(maxStep,step);assert.ok(step<(performance.maxSpeed+2)*.1+.02);assert.ok(s.pathDistance+1e-8>=step);travel+=s.pathDistance;maxOffset=Math.max(maxOffset,Math.abs(context.offset));const ground=N.getSurface(s.x,s.z,context);maxGrade=Math.max(maxGrade,Math.hypot(ground.gradient.x,ground.gradient.z));maxHeight=Math.max(maxHeight,ground.height);
   if(frames%10===0){const fit=fitTruckToGround(THREE,s.x,s.z,s.heading,context);assert.ok(fit.quaternion.toArray().every(Number.isFinite));for(const c of fit.clearances){minClearance=Math.min(minClearance,c);maxClearance=Math.max(maxClearance,c);assert.ok(c>=.01199&&c<.06);}}
  }
  assert.ok(direction*(context.progress-segment.to)>=0,`Segment timed out ${spec.id}/${segment.biome}/${max}: ${context.progress}`);assert.equal(contacts,0);assert.ok(maxGrade>.025&&maxGrade<=.075001);rows.push({vehicle:spec.id,upgrades:max?'max':'stock',...segment,gear:direction>0?'D':'R',seconds:frames*.1,travel,maxGrade,maxHeight,maxOffset,maxStep,minClearance,maxClearance,contacts,postSpawnPoseOrSpeedWrites:0});
 }
 save('slope-runs.json',rows);return{cases:rows.length,totalInputOnlyMetres:rows.reduce((a,r)=>a+r.travel,0),maximumGrade:Math.max(...rows.map(r=>r.maxGrade)),highestSampledMetres:Math.max(...rows.map(r=>r.maxHeight)),minimumTireClearance:Math.min(...rows.map(r=>r.minClearance)),maximumTireClearance:Math.max(...rows.map(r=>r.maxClearance)),contacts:0,postSpawnPoseOrSpeedWrites:0};
});

check('Actual app pointer input, coast, fuel, camera, lifecycle reset and saved ownership still work',()=>{
 const career={...freshCareer(),money:12345,brains:123,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),upgrades:Object.fromEntries(VEHICLE_CONFIG.map(v=>[v.id,{...MAX}]))},app=createAppDom({career,startDriving:false});let time=1000,frames=0,travel=0;
 const frame=(dt=1/60)=>{app.frame(time+=dt*1000);frames++;finite(app.debug.model.state);};
 try{let d=app.debug;d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('ashhauler'),true);frame();const p=N.routePointAtProgress(2860);Object.assign(d.model.state,{x:p.x,z:p.z,heading:p.heading});d.applyTruckPose();d.followTruck(0,true);const fuel=d.gameplay.state.fuels.ashhauler,camera=d.cameraState.state.distanceSinceLook;
  app.pointer(app.wheel,'pointerdown',0,1);app.pointer(app.wheel,'pointermove',90,1);app.pointer(app.wheel,'pointermove',135,1);near(d.input.state.steering,1,1e-12);near(parseFloat(app.wheel.style.getPropertyValue('--steering-angle')),135,1e-10);
  for(let i=0;i<90;i++){frame();travel+=d.model.state.pathDistance;assert.equal(Object.hasOwn(d.model.state,'turnAssist'),false);assert.ok(d.camera.position.toArray().every(Number.isFinite));}
  near(fuel-d.gameplay.state.fuels.ashhauler,travel*VEHICLE_CONFIG.at(-1).consumption,2e-8);near(d.cameraState.state.distanceSinceLook-camera,travel,1e-8);
  const state={...d.model.state};app.pointer(app.wheel,'pointercancel',135,1);assert.equal(d.input.state.active,false);assert.equal(d.model.state.active,false);for(const key of ['x','z','heading','velocityX','velocityZ','angularVelocity'])assert.equal(d.model.state[key],state[key]);frame();assert.ok(d.model.state.linearSpeed>0);
  const rest=()=>{for(const key of['velocityX','velocityZ','angularVelocity','frontWheelAngle','pathDistance','travel'])near(d.model.state[key],0,0,key);assert.equal(d.model.state.active,false);assert.equal(d.input.state.active,false);};
  app.win.dispatch('blur');rest();frame(30);rest();app.win.dispatch('focus');frame();app.doc.hidden=true;app.doc.dispatch('visibilitychange');rest();app.doc.hidden=false;app.doc.dispatch('visibilitychange');frame();rest();
  let previews=0;for(const biome of biomes){assert.equal(d.setBiomeMenu(true),true);assert.equal(d.travelToBiome(biome),true);rest();assert.equal(d.model.state.gear,'D');frame();previews++;}
  d.returnToGarage();rest();assert.equal(d.gameplay.state.mode,'walking');const saved=JSON.parse(app.storage.getItem(ECONOMY_CONFIG.saveKey));assert.deepEqual(saved.ownedVehicleIds,career.ownedVehicleIds);assert.deepEqual(saved.upgrades,career.upgrades);assert.equal(saved.money,career.money);
  return{frames,actualTravel:travel,fuelConsumption:travel*VEHICLE_CONFIG.at(-1).consumption,wheelDegrees:135,biomePreviews:previews,savedVehicleCount:saved.ownedVehicleIds.length,savedUpgradesRetained:true,moneyRetained:true};
 }finally{app.dispose();}
});

report.runtimeHashesAtEnd=hashes();report.runtimeFilesChangedDuringRun=tracked35.filter(f=>report.runtimeHashesAtStart[f]!==report.runtimeHashesAtEnd[f]);report.passed=report.checks.every(c=>c.passed)&&report.runtimeFilesChangedDuringRun.length===0;report.completedAt=new Date().toISOString();save('report.json',report);console.log(`${report.checks.filter(c=>c.passed).length}/${report.checks.length} groups passed; runtime changed during audit: ${report.runtimeFilesChangedDuringRun.join(',')||'none'}`);process.exitCode=report.passed?0:1;
