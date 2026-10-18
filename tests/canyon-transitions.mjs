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
 const saved=[],submitted=[],writes=[],finish=deferred(),platform={id:'yandex',accountGeneration:0,status:{},getLeaderboardStatus:async()=>({available:true,authorized:true}),getLeaderboardPlayerEntry:async()=>null,setLeaderboardScore:async(...args)=>submitted.push(args)};
 let starts=0,finishes=0,cancellations=0;
 const client={connected:true,roomId:'persistent-room',startDriftRun:async()=>{starts++;return {ok:true,runId:`run-${starts}`};},finishDriftRun:()=>{finishes++;return finish.promise;},cancelDriftRun(){cancellations++;}};
 const gameplay=createGameplay({vehicles:garage.vehicles,career,developerMode,persistence:{save:value=>writes.push(value)}});
 assert.equal(gameplay.enter('bmwreward'),true);gameplay.events();
 const recordDriftResult=gameplay.recordDriftResult.bind(gameplay);gameplay.recordDriftResult=record=>{saved.push(record);return recordDriftResult(record);};
 const context={garage,model,gameplay,online:{client},driving:true,...Object.fromEntries(['city','finishLine','roadHazardsScene'].map(key=>[key,{group:new THREE.Group()}]))};
 const canyon=createCanyonMode(THREE,{scene,document:dom.doc,platform,getContext:()=>context});
 const record={version:1,trackId:'canyon-v1',score:5000,durationMs:100000,maxCombo:3,verified:true};
 return {canyon,model,context,platform,saved,submitted,writes,finish,client,record,ids,get starts(){return starts;},get finishes(){return finishes;},get cancellations(){return cancellations;},async start({valid=true,finished=true}={}){assert.equal(canyon.enter(),true);assert.equal(canyon.phase,'running');assert.equal(canyon.controlsLocked,false);await Promise.resolve();Object.assign(canyon.score,{finished,valid,score:5000,elapsed:100,maxCombo:3});},hangar(){for(let i=0;i<40;i++)gameplay.advanceFinish(.05);assert.equal(gameplay.state.mode,'walking');assert.equal(gameplay.events().filter(e=>e.type==='garage').length,1);canyon.leave();context.driving=false;assert.equal(canyon.active,false);assert.equal(canyon.phase,'idle');},restart(){canyon.leave();gameplay.returnToGarage();gameplay.state.cooldown=0;assert.equal(gameplay.enter('bmwreward'),true);context.driving=true;Object.assign(model.state,canyonPointAt(12));assert.equal(canyon.enter(),true);assert.equal(canyon.phase,'running');}};
}

test('successful completion starts the common two-second finish synchronously and cannot be retried or ranked mid-celebration',async()=>{
 const f=fixture();try{
  await f.start();const before={...f.model.state},room=f.client,score=f.canyon.score,finishing=f.canyon.complete();
  assert.equal(f.canyon.phase,'celebrating');assert.equal(f.context.gameplay.state.eventMode,'finish');assert.equal(f.context.gameplay.state.finishKind,'canyon');assert.equal(f.context.gameplay.state.finishRemaining,2);
  assert.equal(f.context.gameplay.events().filter(event=>event.type==='finish').length,1);assert.equal(f.ids.get('canyon-overlay').hidden,true);assert.equal(f.ids.get('canyon-hud').hidden,true);
  assert.equal(f.canyon.controlsLocked,false);assert.deepEqual(f.model.state,before);assert.equal(f.canyon.model,f.model);assert.equal(f.client,room);assert.equal(f.client.roomId,'persistent-room');
  assert.equal(await f.canyon.complete(),null,'a duplicate finish cannot create another settlement');
  const cancellations=f.cancellations,scoreAtFinish={...score};
  assert.equal(f.canyon.retry(),false);assert.ok(!await f.canyon.showRankings());assert.ok(!await f.canyon.login());f.ids.get('canyon-exit').dispatch('click');f.canyon.pause('paused');
  assert.equal(f.canyon.phase,'celebrating');assert.deepEqual(score,scoreAtFinish,'post-finish pauses cannot alter eligibility, score or combo');assert.equal(f.cancellations,cancellations,'post-finish controls cannot cancel verification');
  f.finish.resolve(f.record);assert.deepEqual(await finishing,f.record);assert.equal(f.finishes,1);assert.equal(f.saved.length,1);assert.equal(f.submitted.length,1);assert.equal(f.canyon.phase,'celebrating');assert.equal(f.ids.get('canyon-overlay').hidden,true);
 }finally{f.canyon.dispose();}
});

test('verified drift result settles once after the timed hangar cleanup without reopening results or awarding delivery rewards',async()=>{
 const f=fixture();try{
  await f.start();const before=f.context.gameplay.snapshot(),finishing=f.canyon.complete();await Promise.resolve();assert.equal(f.finishes,1);
  const cancellations=f.cancellations;f.hangar();assert.equal(f.cancellations,cancellations,'the timed cleanup preserves the pending verified finish');assert.equal(f.ids.get('canyon-overlay').hidden,true);assert.equal(f.ids.get('canyon-hud').hidden,true);
  assert.equal(f.saved.length,0);assert.equal(f.submitted.length,0);f.finish.resolve(f.record);assert.deepEqual(await finishing,f.record);
  assert.deepEqual(f.saved,[f.record]);assert.equal(f.submitted.length,1);assert.equal(f.submitted[0][1],5000);assert.deepEqual(f.context.gameplay.snapshot().driftRecord,f.record);
  for(const key of ['money','brains','completedRuns','routeCompletion','ownedVehicleIds'])assert.deepEqual(f.context.gameplay.snapshot()[key],before[key],key);
  assert.equal(f.context.gameplay.state.eventMode,null);assert.equal(f.context.gameplay.state.finishKind,null);assert.equal(f.canyon.phase,'idle');assert.equal(f.ids.get('canyon-overlay').hidden,true);
  assert.equal(await f.canyon.complete(),null);f.canyon.leave();assert.equal(f.saved.length,1);assert.equal(f.submitted.length,1);
 }finally{f.canyon.dispose();}
});

test('a pending leaderboard write survives only the successful timed cleanup',async()=>{
 const f=fixture(),reading=deferred(),started=deferred();f.platform.getLeaderboardPlayerEntry=()=>{started.resolve();return reading.promise;};
 try{
  await f.start();const finishing=f.canyon.complete();f.finish.resolve(f.record);await started.promise;assert.equal(f.saved.length,1);assert.equal(f.canyon.phase,'celebrating');
  f.hangar();reading.resolve(null);assert.deepEqual(await finishing,f.record);assert.equal(f.saved.length,1);assert.equal(f.submitted.length,1);assert.equal(f.ids.get('canyon-overlay').hidden,true);
 }finally{f.canyon.dispose();}
});

test('account changes or required reload discard a pending finish for the old player, including after hangar',async()=>{
 for(const changed of ['account','reload']){
  const f=fixture();try{await f.start();const finishing=f.canyon.complete();await Promise.resolve();f.hangar();if(changed==='account')f.platform.accountGeneration++;else f.platform.status.reloadRequired=true;f.finish.resolve(f.record);assert.equal(await finishing,null);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);assert.equal(f.ids.get('canyon-overlay').hidden,true);}finally{f.canyon.dispose();}
 }
});

test('a new physical canyon attempt invalidates a late result from the previous finish',async()=>{
 const f=fixture();try{
  await f.start();const finishing=f.canyon.complete();await Promise.resolve();f.hangar();f.restart();await Promise.resolve();assert.equal(f.starts,2);
  f.finish.resolve(f.record);assert.equal(await finishing,null);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);assert.equal(f.canyon.phase,'running');assert.equal(f.ids.get('canyon-overlay').hidden,true);
 }finally{f.canyon.dispose();}
});

test('disposal invalidates pending finish verification and pending leaderboard reads',async()=>{
 for(const stage of ['verification','leaderboard']){
  const f=fixture(),reading=deferred(),started=deferred();
  if(stage==='leaderboard')f.platform.getLeaderboardPlayerEntry=()=>{started.resolve();return reading.promise;};
  await f.start();const finishing=f.canyon.complete();await Promise.resolve();
  if(stage==='leaderboard'){f.finish.resolve(f.record);await started.promise;}
  f.canyon.dispose();f.finish.resolve(f.record);reading.resolve(null);assert.equal(await finishing,null);assert.deepEqual(f.submitted,[]);assert.equal(f.saved.length,stage==='leaderboard'?1:0);assert.equal(f.ids.get('canyon-overlay').hidden,true);
 }
});

test('invalid unfinished attempts keep dismiss-and-retry behavior without starting a finish celebration',async()=>{
 const f=fixture();try{
  await f.start({valid:false,finished:false});const before={...f.model.state},finishing=f.canyon.complete();
  assert.equal(f.canyon.phase,'checking');assert.equal(f.context.gameplay.state.eventMode,'canyon');assert.equal(f.context.gameplay.state.finishKind,null);assert.equal(f.ids.get('canyon-overlay').hidden,false);
  f.ids.get('canyon-exit').dispatch('click');assert.equal(f.canyon.active,true);assert.equal(f.canyon.phase,'touring');assert.deepEqual(f.model.state,before);assert.equal(await finishing,null);
  assert.equal(f.canyon.score,undefined);assert.equal(f.canyon.controlsLocked,false);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);assert.equal(f.ids.get('canyon-overlay').hidden,true);
 }finally{f.canyon.dispose();}
});

test('leaving an unfinished canyon attempt preserves the car and room but cancels that run',async()=>{
 const f=fixture();try{
  await f.start({finished:false});const room=f.client,parent=f.context.garage.vehicles[0].rig.root.parent,cancellations=f.cancellations;
  Object.assign(f.model.state,{x:CANYON_TRACK.origin.x-5,z:CANYON_TRACK.origin.z});const before={...f.model.state};f.canyon.step(0);
  assert.equal(f.canyon.active,false);assert.equal(f.context.gameplay.state.eventMode,null);assert.equal(f.context.gameplay.state.mode,'driving');assert.equal(f.context.gameplay.state.selectedId,'bmwreward');
  for(const key of ['x','z','heading','velocityX','velocityZ','gear'])assert.equal(f.model.state[key],before[key],key);
  assert.equal(f.canyon.model,f.model);assert.equal(f.context.garage.vehicles[0].rig.root.parent,parent);assert.equal(f.client,room);assert.equal(f.cancellations,cancellations+1);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);assert.equal(f.ids.get('canyon-overlay').hidden,true);
 }finally{f.canyon.dispose();}
});

test('developer canyon finishes celebrate while remaining entirely local practice',async()=>{
 const f=fixture({developerMode:true});try{
  const before=f.context.gameplay.snapshot();await f.start();assert.equal(f.starts,0);assert.equal(f.canyon.score.rankedEligible,false);assert.equal(f.canyon.score.reason,'development');
  const finishing=f.canyon.complete();assert.equal(f.canyon.phase,'celebrating');assert.equal(f.context.gameplay.state.finishKind,'canyon');const result=await finishing;
  assert.equal(result.verified,false);assert.equal(result.score,5000);assert.equal(f.finishes,0);assert.deepEqual(f.submitted,[]);assert.deepEqual(f.saved,[]);assert.equal(f.ids.get('canyon-overlay').hidden,true);
  f.hangar();assert.deepEqual(f.context.gameplay.snapshot(),before);assert.equal(f.writes.length,0);assert.equal(f.canyon.retry(),false);
 }finally{f.canyon.dispose();}
});

test('dismissing an armed edge entry stays touring until the car leaves and reenters',async()=>{
 for(const developerMode of [false,true]){
  const f=fixture({developerMode});try{
   const point=canyonPointAt(12);Object.assign(f.model.state,{x:point.x+point.right.x*9.5,z:point.z+point.right.z*9.5});
   assert.equal(f.canyon.enter(),true);assert.equal(f.canyon.phase,'arming');assert.equal(f.canyon.score.started,false);assert.equal(f.starts,0);
   assert.equal(f.canyon.retry(),true);assert.equal(f.canyon.phase,'touring');Object.assign(f.model.state,{x:point.x,z:point.z});for(let i=0;i<3;i++)f.canyon.step(0);
   assert.equal(f.canyon.active,true);assert.equal(f.canyon.phase,'touring');assert.equal(f.canyon.score,undefined);assert.equal(f.starts,0);assert.equal(f.ids.get('canyon-hud').hidden,true);assert.equal(f.ids.get('canyon-overlay').hidden,true);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);
   f.restart();await Promise.resolve();assert.equal(f.canyon.score.started,true);assert.equal(f.starts,developerMode?0:1);
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

test('an old delayed start reply cannot cancel the new run after a completed celebration',async()=>{
 const f=fixture(),ticket=deferred(),originalStart=f.client.startDriftRun;let requests=0;
 f.client.startDriftRun=()=>++requests===1?ticket.promise:originalStart();
 try{
  await f.start();const finishing=f.canyon.complete();f.hangar();f.restart();await Promise.resolve();const cancellations=f.cancellations;
  ticket.resolve({ok:true,runId:'obsolete-run'});assert.equal(await finishing,null);assert.equal(f.cancellations,cancellations,'late obsolete runReady must not cancel the current client ticket');
  assert.equal(f.finishes,0);assert.equal(requests,2);assert.equal(f.canyon.phase,'running');assert.equal(f.canyon.score.rankedEligible,true);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);
 }finally{f.canyon.dispose();}
});
