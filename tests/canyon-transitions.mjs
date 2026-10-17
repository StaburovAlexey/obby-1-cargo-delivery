import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createCanyonMode} from '../dist/canyon-mode.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {canyonPointAt,CANYON_TRACK} from '../dist/canyon-track.js';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
import fs from 'node:fs';

const career=earnedRewardCareer();
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture({developerMode=false}={}){
 const dom=createInputDom(),Element=dom.wheel.constructor,ids=new Map();dom.doc.body=new Element();
 for(const [,id]of fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').matchAll(/\bid="([^"]+)"/g))ids.set(id,new Element());dom.doc.getElementById=id=>ids.get(id);dom.doc.createElement=()=>new Element();ids.get('canyon-ranking-rows').replaceChildren=(...rows)=>ids.get('canyon-ranking-rows').children=rows;
 const scene=new THREE.Scene(),garage={group:new THREE.Group(),walkingSolids:[]},root=new THREE.Group();garage.group.add(root);scene.add(garage.group);
 const point=canyonPointAt(12),model=createDrivingModel({...point,vehicleId:'bmwreward'});
 const vehicle={id:'bmwreward',group:root,model,position:model.state,rig:{root,update(pose){this.pose=pose;root.position.copy(pose.position);root.quaternion.copy(pose.quaternion);}}};garage.vehicles=[vehicle];
 const saved=[],submitted=[],finish=deferred(),platform={id:'yandex',accountGeneration:0,status:{},getLeaderboardStatus:async()=>({available:true,authorized:true}),getLeaderboardPlayerEntry:async()=>null,setLeaderboardScore:async(...args)=>submitted.push(args)};
 let starts=0,cancellations=0;
 const client={connected:true,roomId:'persistent-room',startDriftRun:async()=>{starts++;return {ok:true,runId:`run-${starts}`};},finishDriftRun:()=>finish.promise,cancelDriftRun(){cancellations++;}};
 const gameplay={state:{routeCompletion:career.routeCompletion,fuels:{bmwreward:100},player:{...point},mode:'driving',selectedId:'bmwreward',developerMode,eventMode:null},snapshot:()=>career,beginCanyonRun(){this.state.eventMode='canyon';return true;},endCanyonRun(){this.state.eventMode=null;return true;},recordDriftResult:record=>saved.push(record)};
 const context={garage,model,gameplay,online:{client},driving:true,...Object.fromEntries(['city','finishLine','roadHazardsScene'].map(key=>[key,{group:new THREE.Group()}]))};
 const canyon=createCanyonMode(THREE,{scene,document:dom.doc,platform,getContext:()=>context});
 const record={version:1,trackId:'canyon-v1',score:5000,durationMs:100000,maxCombo:3,verified:true};
 return {canyon,model,context,platform,saved,submitted,finish,client,record,ids,get starts(){return starts;},get cancellations(){return cancellations;},async start(){assert.equal(canyon.enter(),true);assert.equal(canyon.phase,'running');assert.equal(canyon.controlsLocked,false);await Promise.resolve();Object.assign(canyon.score,{finished:true,score:5000,elapsed:100,maxCombo:3});},restart(){Object.assign(model.state,{x:CANYON_TRACK.origin.x-5,z:CANYON_TRACK.origin.z});canyon.step(0);assert.equal(canyon.active,false);Object.assign(model.state,canyonPointAt(12));assert.equal(canyon.enter(),true);assert.equal(canyon.phase,'running');}};
}
test('retry dismisses the attempt, ignores an earlier finish and keeps the original room connection',async()=>{
 const f=fixture();try{
  await f.start();const room=f.client,model=f.model,before={...model.state},finishing=f.canyon.complete();await Promise.resolve();
  assert.equal(f.canyon.retry(),true);f.finish.resolve(f.record);assert.equal(await finishing,null);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);
  assert.equal(f.canyon.phase,'touring');assert.equal(f.canyon.active,true);assert.equal(f.canyon.score,undefined);assert.equal(f.canyon.controlsLocked,false);assert.equal(f.ids.get('canyon-overlay').hidden,true);
  assert.equal(f.canyon.model,model);assert.deepEqual(model.state,before);assert.equal(f.client,room);assert.equal(f.client.roomId,'persistent-room');
  assert.equal(f.starts,1,'retry does not create a remote start or teleport to the start');f.restart();assert.equal(f.starts,2,'physically returning starts a new attempt');
 }finally{f.canyon.dispose();}
});
test('account changes discard a finish instead of saving or publishing it for a different player',async()=>{
 const f=fixture();try{await f.start();const finishing=f.canyon.complete();await Promise.resolve();f.platform.accountGeneration++;f.finish.resolve(f.record);assert.equal(await finishing,null);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);assert.equal(f.canyon.controlsLocked,false);}finally{f.canyon.dispose();}
});
test('only a fresh server result is saved as verified and submitted to Yandex',async()=>{
 const f=fixture();try{await f.start();const finishing=f.canyon.complete();await Promise.resolve();f.finish.resolve(f.record);assert.deepEqual(await finishing,f.record);assert.equal(f.saved.length,1);assert.equal(f.saved[0].verified,true);assert.equal(f.submitted[0][1],5000);assert.equal(f.canyon.phase,'result');assert.equal(f.canyon.controlsLocked,false);}finally{f.canyon.dispose();}
});
test('retry cancels a prior result waiting to write the Yandex score',async()=>{
 const f=fixture(),reading=deferred(),started=deferred();f.platform.getLeaderboardPlayerEntry=()=>{started.resolve();return reading.promise;};
 try{await f.start();const finishing=f.canyon.complete();f.finish.resolve(f.record);await started.promise;assert.equal(f.canyon.phase,'result');f.canyon.retry();reading.resolve(null);await finishing;assert.deepEqual(f.submitted,[],'the cancelled read must not issue an SDK write');assert.equal(f.saved.length,1,'the completed local record remains saved');assert.equal(f.ids.get('canyon-overlay').hidden,true);}finally{f.canyon.dispose();}
});
test('explicit result exit cancels a pending finish without leaving or moving the car',async()=>{
 const f=fixture();try{
  await f.start();const before={...f.model.state},finishing=f.canyon.complete();await Promise.resolve();
  assert.equal(f.canyon.phase,'checking');f.ids.get('canyon-exit').dispatch('click');
  assert.equal(f.canyon.active,true);assert.equal(f.context.gameplay.state.eventMode,'canyon');assert.equal(f.canyon.phase,'touring');assert.equal(f.canyon.controlsLocked,false);assert.deepEqual(f.model.state,before);
  f.finish.resolve(f.record);assert.equal(await finishing,null);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);assert.equal(f.ids.get('canyon-overlay').hidden,true,'a late result cannot reopen a dismissed overlay');
 }finally{f.canyon.dispose();}
});
test('leaving the canyon cancels pending verification and preserves the car and room',async()=>{
 const f=fixture();try{
  await f.start();const finishing=f.canyon.complete();await Promise.resolve();const room=f.client,parent=f.context.garage.vehicles[0].rig.root.parent;
  Object.assign(f.model.state,{x:CANYON_TRACK.origin.x-5,z:CANYON_TRACK.origin.z});const before={...f.model.state};f.canyon.step(0);
  assert.equal(f.canyon.active,false);assert.equal(f.context.gameplay.state.eventMode,null);assert.equal(f.context.gameplay.state.mode,'driving');assert.equal(f.context.gameplay.state.selectedId,'bmwreward');
  for(const key of ['x','z','heading','velocityX','velocityZ','gear'])assert.equal(f.model.state[key],before[key],key);
  assert.equal(f.canyon.model,f.model);assert.equal(f.context.garage.vehicles[0].rig.root.parent,parent);assert.equal(f.client,room);
  f.finish.resolve(f.record);assert.equal(await finishing,null);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);assert.equal(f.ids.get('canyon-overlay').hidden,true);
 }finally{f.canyon.dispose();}
});
test('checking and result phases continue physics rather than freezing the vehicle',async()=>{
 const f=fixture();try{
  await f.start();f.model.state.velocityX=8;f.model.setInput({active:true});const finishing=f.canyon.complete();await Promise.resolve();
  const x=f.model.state.x;f.canyon.step(.05);assert.ok(f.model.state.x>x);assert.equal(f.model.state.active,true);assert.equal(f.canyon.controlsLocked,false);
  f.finish.resolve(f.record);await finishing;const resultX=f.model.state.x;f.canyon.step(.05);assert.ok(f.model.state.x>resultX);assert.equal(f.model.state.active,true);assert.equal(f.canyon.controlsLocked,false);
 }finally{f.canyon.dispose();}
});
test('developer canyon runs remain local practice even with an earned career and online client',async()=>{
 const f=fixture({developerMode:true});
 try{
  await f.start();assert.equal(f.starts,0,'developer practice cannot request a ranked server ticket');assert.equal(f.canyon.score.rankedEligible,false);assert.equal(f.canyon.score.reason,'development');
  const result=await f.canyon.complete();assert.equal(result.verified,false);assert.equal(result.score,5000);assert.deepEqual(f.submitted,[]);
  assert.equal(f.canyon.retry(),true);assert.equal(f.canyon.phase,'touring');f.restart();
  assert.equal(f.starts,0,'returning also remains local practice');assert.equal(f.canyon.score.rankedEligible,false);assert.equal(f.canyon.score.reason,'development');
 }finally{f.canyon.dispose();}
});
