import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createCanyonMode} from '../dist/canyon-mode.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {createGameplay} from '../dist/gameplay.js';
import {canyonPointAt,CANYON_TRACK} from '../dist/canyon-track.js';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
import fs from 'node:fs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture({developerMode=false}={}){
 const career=earnedRewardCareer(),dom=createInputDom(),Element=dom.wheel.constructor,ids=new Map();dom.doc.body=new Element();
 for(const [,id]of fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').matchAll(/\bid="([^"]+)"/g))ids.set(id,new Element());dom.doc.getElementById=id=>ids.get(id);dom.doc.createElement=()=>new Element();ids.get('canyon-ranking-rows').replaceChildren=(...rows)=>ids.get('canyon-ranking-rows').children=rows;
 const scene=new THREE.Scene(),garage={group:new THREE.Group(),walkingSolids:[]},root=new THREE.Group();garage.group.add(root);scene.add(garage.group);
 const point=canyonPointAt(12),model=createDrivingModel({...point,vehicleId:'bmwreward'});
 const vehicle={id:'bmwreward',park:{x:24,z:44},group:root,model,position:model.state,rig:{root,update(pose){this.pose=pose;root.position.copy(pose.position);root.quaternion.copy(pose.quaternion);}}};garage.vehicles=[vehicle];
 const saved=[],submitted=[],writes=[],reading=deferred(),started=deferred();
 const platform={id:'yandex',accountGeneration:0,status:{},getLeaderboardStatus:async()=>({available:true,authorized:true}),getLeaderboardEntries:async()=>({entries:[]}),getLeaderboardPlayerEntry:async()=>null,setLeaderboardScore:async(...args)=>submitted.push(args)};
 const client={connected:false,roomId:null};
 const gameplay=createGameplay({vehicles:garage.vehicles,career,developerMode,persistence:{save:value=>writes.push(value)}});
 assert.equal(gameplay.enter('bmwreward'),true);gameplay.events();
 const recordDriftResult=gameplay.recordDriftResult.bind(gameplay);gameplay.recordDriftResult=record=>{saved.push(record);return recordDriftResult(record);};
 const context={garage,model,gameplay,online:{client},driving:true,...Object.fromEntries(['city','finishLine','roadHazardsScene'].map(key=>[key,{group:new THREE.Group()}]))};
 const canyon=createCanyonMode(THREE,{scene,document:dom.doc,platform,getContext:()=>context});
 const record={version:1,trackId:'canyon-v1',score:5000,durationMs:100000,maxCombo:3};
 return {canyon,model,context,platform,saved,submitted,writes,client,record,ids,reading,started,
  delayRead(){platform.getLeaderboardPlayerEntry=()=>{started.resolve();return reading.promise;};},
  async start({valid=true,finished=true}={}){assert.equal(canyon.enter(),true);assert.equal(canyon.phase,'running');assert.equal(canyon.controlsLocked,false);await Promise.resolve();Object.assign(canyon.score,{finished,valid,score:5000,elapsed:100,maxCombo:3});},
  hangar(){for(let i=0;i<40;i++)gameplay.advanceFinish(.05);assert.equal(gameplay.state.mode,'walking');assert.equal(gameplay.events().filter(e=>e.type==='garage').length,1);canyon.leave();context.driving=false;assert.equal(canyon.active,false);assert.equal(canyon.phase,'idle');},
  restart(){canyon.leave();gameplay.returnToGarage();gameplay.state.cooldown=0;assert.equal(gameplay.enter('bmwreward'),true);context.driving=true;Object.assign(model.state,canyonPointAt(12));assert.equal(canyon.enter(),true);assert.equal(canyon.phase,'running');}};
}

test('an offline room does not gate local scoring, celebration or direct Yandex submission',async()=>{
 const f=fixture();try{
  await f.start();assert.equal(f.canyon.score.rankedEligible,true);const before={...f.model.state},score=f.canyon.score,finishing=f.canyon.complete();
  assert.equal(f.canyon.phase,'celebrating');assert.equal(f.context.gameplay.state.eventMode,'finish');assert.equal(f.context.gameplay.state.finishKind,'canyon');assert.equal(f.context.gameplay.state.finishRemaining,2);
  assert.equal(f.context.gameplay.events().filter(event=>event.type==='finish').length,1);assert.equal(f.ids.get('canyon-overlay').hidden,true);assert.equal(f.ids.get('canyon-hud').hidden,true);
  assert.equal(f.canyon.controlsLocked,false);assert.deepEqual(f.model.state,before);assert.equal(f.canyon.model,f.model);
  assert.deepEqual(f.saved,[f.record],'a finished run is saved locally before any SDK wait');assert.equal(await f.canyon.complete(),null);
  const scoreAtFinish={...score};assert.equal(f.canyon.retry(),false);assert.ok(!await f.canyon.showRankings());assert.ok(!await f.canyon.login());f.ids.get('canyon-exit').dispatch('click');f.canyon.pause('paused');
  assert.equal(f.canyon.phase,'celebrating');assert.deepEqual(score,scoreAtFinish);
  assert.deepEqual(await finishing,f.record);assert.equal(Object.hasOwn(f.saved[0],'verified'),false);assert.equal(f.saved.length,1);assert.equal(f.submitted.length,1);assert.equal(f.canyon.phase,'celebrating');
 }finally{f.canyon.dispose();}
});

test('a pending Yandex write survives the timed hangar cleanup without reopening results or delivery rewards',async()=>{
 const f=fixture();f.delayRead();try{
  await f.start();const before=f.context.gameplay.snapshot(),finishing=f.canyon.complete();await f.started.promise;assert.deepEqual(f.saved,[f.record]);
  f.hangar();assert.equal(f.ids.get('canyon-overlay').hidden,true);assert.equal(f.submitted.length,0);f.reading.resolve(null);assert.deepEqual(await finishing,f.record);
  assert.equal(f.saved.length,1);assert.equal(f.submitted.length,1);assert.equal(f.submitted[0][1],5000);assert.deepEqual(f.context.gameplay.snapshot().driftRecord,f.record);
  for(const key of ['money','brains','completedRuns','routeCompletion','ownedVehicleIds'])assert.deepEqual(f.context.gameplay.snapshot()[key],before[key],key);
  assert.equal(f.context.gameplay.state.eventMode,null);assert.equal(f.canyon.phase,'idle');assert.equal(f.ids.get('canyon-overlay').hidden,true);assert.equal(await f.canyon.complete(),null);
 }finally{f.canyon.dispose();}
});

test('account changes, disposal and newer attempts cancel delayed writes without losing an already saved local result',async()=>{
 for(const change of ['account','reload','dispose','new-attempt']){
  const f=fixture();f.delayRead();try{
   await f.start();const finishing=f.canyon.complete();await f.started.promise;f.hangar();
   if(change==='account')f.platform.accountGeneration++;else if(change==='reload')f.platform.status.reloadRequired=true;else if(change==='dispose')f.canyon.dispose();else f.restart();
   f.reading.resolve(null);assert.equal(await finishing,null);assert.deepEqual(f.saved,[f.record]);assert.deepEqual(f.submitted,[]);assert.equal(f.ids.get('canyon-overlay').hidden,true);
   if(change==='new-attempt')assert.equal(f.canyon.phase,'running');
  }finally{f.canyon.dispose();}
 }
});

test('invalid or unfinished attempts never save, submit or start the finish celebration',async()=>{
 for(const finish of [{valid:false,finished:false},{valid:true,finished:false},{valid:false,finished:true}]){
  const f=fixture();try{
   await f.start(finish);const before={...f.model.state};assert.equal(await f.canyon.complete(),null);
   assert.equal(f.canyon.phase,'result');assert.equal(f.context.gameplay.state.eventMode,'canyon');assert.equal(f.context.gameplay.state.finishKind,null);
   f.ids.get('canyon-exit').dispatch('click');assert.equal(f.canyon.active,true);assert.equal(f.canyon.phase,'touring');assert.deepEqual(f.model.state,before);
   assert.equal(f.canyon.score,undefined);assert.equal(f.canyon.controlsLocked,false);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);assert.equal(f.ids.get('canyon-overlay').hidden,true);
  }finally{f.canyon.dispose();}
 }
});

test('leaving an unfinished canyon attempt preserves car motion and never contacts the room',async()=>{
 const f=fixture();try{
  await f.start({finished:false});const parent=f.context.garage.vehicles[0].rig.root.parent;
  Object.assign(f.model.state,{x:CANYON_TRACK.origin.x-5,z:CANYON_TRACK.origin.z});const before={...f.model.state};f.canyon.step(0);
  assert.equal(f.canyon.active,false);assert.equal(f.context.gameplay.state.eventMode,null);assert.equal(f.context.gameplay.state.mode,'driving');assert.equal(f.context.gameplay.state.selectedId,'bmwreward');
  for(const key of ['x','z','heading','velocityX','velocityZ','gear'])assert.equal(f.model.state[key],before[key],key);
  assert.equal(f.canyon.model,f.model);assert.equal(f.context.garage.vehicles[0].rig.root.parent,parent);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);
 }finally{f.canyon.dispose();}
});

test('developer canyon finishes celebrate while suppressing local and Yandex writes',async()=>{
 const f=fixture({developerMode:true});try{
  const before=f.context.gameplay.snapshot();await f.start();assert.equal(f.canyon.score.rankedEligible,false);assert.equal(f.canyon.score.reason,'development');
  const result=await f.canyon.complete();assert.equal(f.canyon.phase,'celebrating');assert.equal(result.score,5000);assert.equal(Object.hasOwn(result,'verified'),false);assert.deepEqual(f.submitted,[]);assert.deepEqual(f.saved,[]);
  f.hangar();assert.deepEqual(f.context.gameplay.snapshot(),before);assert.equal(f.writes.length,0);assert.equal(f.canyon.retry(),false);
 }finally{f.canyon.dispose();}
});

test('pauses and time gaps disqualify online submission while preserving local practice',async()=>{
 for(const reason of ['paused','time-gap']){
  const f=fixture();try{await f.start();f.canyon.pause(reason);assert.equal(f.canyon.score.rankedEligible,false);assert.deepEqual(await f.canyon.complete(),{...f.record,maxCombo:3});assert.equal(f.saved.length,1);assert.equal(f.submitted.length,0);}finally{f.canyon.dispose();}
 }
});

test('SDK failure or unavailable platform cannot prevent a valid local finish',async()=>{
 for(const status of ['network','unavailable','anonymous']){
  const f=fixture();try{
   if(status==='network')f.platform.getLeaderboardStatus=async()=>{throw new Error('network');};
   if(status==='unavailable')f.platform.id='vk';
   if(status==='anonymous')f.platform.getLeaderboardStatus=async()=>({available:true,authorized:false});
   await f.start();assert.deepEqual(await f.canyon.complete(),f.record);assert.deepEqual(f.saved,[f.record]);assert.equal(f.submitted.length,0);assert.equal(f.canyon.phase,'celebrating');
  }finally{f.canyon.dispose();}
 }
});

test('dismissing an armed edge entry stays touring until physically leaving and reentering',async()=>{
 for(const developerMode of [false,true]){
  const f=fixture({developerMode});try{
   const point=canyonPointAt(12);Object.assign(f.model.state,{x:point.x+point.right.x*9.5,z:point.z+point.right.z*9.5});
   assert.equal(f.canyon.enter(),true);assert.equal(f.canyon.phase,'arming');assert.equal(f.canyon.score.started,false);
   assert.equal(f.canyon.retry(),true);Object.assign(f.model.state,{x:point.x,z:point.z});for(let i=0;i<3;i++)f.canyon.step(0);
   assert.equal(f.canyon.active,true);assert.equal(f.canyon.phase,'touring');assert.equal(f.canyon.score,undefined);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);
   f.restart();assert.equal(f.canyon.score.started,true);assert.equal(f.canyon.score.rankedEligible,!developerMode);
  }finally{f.canyon.dispose();}
 }
});

test('common finish entry rejects invalid kinds, positions and competing main-route completion without changing state',()=>{
 const vehicle={id:'bmwreward',park:{x:24,z:44}},g=createGameplay({vehicles:[vehicle],career:earnedRewardCareer()});assert.equal(g.enter(vehicle.id),true);g.events();
 const point=canyonPointAt(CANYON_TRACK.finish);
 assert.equal(g.beginFinish('canyon',point),false,'canyon must already be the active event');assert.equal(g.beginFinish('other',point),false);assert.equal(g.state.eventMode,null);
 assert.equal(g.beginCanyonRun(),true);const before={...g.state};
 for(const invalid of [undefined,null,{}, {x:Infinity,z:0},{x:0,z:NaN}])assert.equal(g.beginFinish('canyon',invalid),false);
 assert.equal(g.beginFinish('main',point),false,'a canyon event cannot be replaced by the main road finish');assert.deepEqual(g.state,before);assert.deepEqual(g.events(),[]);
 assert.equal(g.beginFinish('canyon',point),true);g.advanceFinish(.05);const remaining=g.state.finishRemaining;
 assert.equal(g.beginFinish('canyon',point),false);assert.equal(g.beginFinish('main',point),false);assert.equal(g.state.finishRemaining,remaining,'a repeated finish cannot extend the timer');assert.equal(g.events().filter(e=>e.type==='finish').length,1);
 const fuel=g.state.fuels.bmwreward;g.drive(1000,point.x,point.z);g.tickProgress(100,{distance:1000,active:true});assert.equal(g.state.finishRemaining,remaining);assert.equal(g.state.fuels.bmwreward,fuel);
});
