import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import {CANYON_TRACK,canyonPointAt} from '../dist/canyon-track.js';
import {canyonApproachPoint,CANYON_APPROACH_LENGTH,canyonApproachQuads} from '../dist/canyon-approach.js';
import {polygonIntersectionArea} from '../dist/network-scene.js';

const motionKeys=['x','z','heading','velocityX','velocityZ','yawRate','speed','linearSpeed','active','steering','gear','brake','handbrake','wheelSpin'];
const motion=model=>Object.fromEntries(motionKeys.map(key=>[key,model.state[key]]));
function selectBmw(f,distance=-30){
 const d=f.debug;d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('bmwreward'),true);
 const p=distance<0?canyonApproachPoint(CANYON_APPROACH_LENGTH+distance):canyonPointAt(distance);Object.assign(d.model.state,{x:p.x,z:p.z,heading:p.heading,velocityX:0,velocityZ:0});
 d.applyTruckPose();d.followTruck(1,true);return d;
}
function worldVisible(d){
 for(const group of [d.city.group,d.garage.group,d.canyon.environment.group,d.canyon.entrance.group,d.roadHazardsScene.group]){
  assert.equal(group.visible,true,`${group.name} stays visible`);assert.ok(group.parent,`${group.name} stays in the scene`);
 }
}
function frameUntil(f,predicate,maxFrames=1200){
 for(let i=0;i<maxFrames;i++){if(predicate())return;f.frame();}
 assert.ok(predicate(),'physical traversal must reach its destination');
}

test('a fresh production career keeps the canyon barrier closed in the shared world',()=>{
 const f=createAppDom({startDriving:false});
 try{
  const d=f.debug;assert.ok(d.canyon,'canyon controller is integrated');worldVisible(d);
  assert.equal(d.canyon.entrance.unlocked,false);assert.equal(d.canyon.enter(),false);assert.equal(d.gameplay.state.eventMode,null);
  for(const approach of canyonApproachQuads(3))for(const feature of d.city.features.filter(f=>f.type==='building'))assert.equal(polygonIntersectionArea(approach,feature.footprint.map(p=>({x:p.x,z:-p.y}))),0,'the entrance cannot run through a house');
 }finally{f.dispose();}
});

test('only the currently driven BMW inside the canyon starts an event',()=>{
 const f=createAppDom({startDriving:false,career:earnedRewardCareer()});
 try{
  const d=f.debug;assert.equal(d.canyon.entrance.unlocked,true);
  assert.equal(d.canyon.enter(),false,'walking cannot select or teleport to the BMW');
  selectBmw(f);assert.equal(d.canyon.enter(),false,'the approach is not a remote event button');
  Object.assign(d.model.state,canyonPointAt(12));const before=motion(d.model);
  assert.equal(d.canyon.enter(),true);assert.equal(d.canyon.phase,'running');assert.equal(d.canyon.controlsLocked,false);
  assert.deepEqual(motion(d.model),before,'entry preserves the exact current motion');
  assert.equal(d.canyon.score.started,true);assert.equal(d.canyon.score.elapsed,0);assert.equal(d.input.state.enabled,true);
  assert.equal(d.gameplay.state.eventMode,'canyon');assert.equal(d.gameplay.state.run,null);worldVisible(d);
  d.returnToGarage();d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('pickup'),true);
  Object.assign(d.model.state,canyonPointAt(12));assert.equal(d.canyon.enter(),false,'another car does not become the BMW');
  assert.equal(d.gameplay.state.selectedId,'pickup');assert.equal(d.gameplay.state.eventMode,null);
 }finally{f.dispose();}
});

test('real app driving crosses the canyon seam forward and in reverse without a reset, model swap, camera snap or hidden world',()=>{
 const f=createAppDom({startDriving:false,career:earnedRewardCareer()});
 try{
  const d=selectBmw(f),model=d.model,root=d.rig.root,parent=root.parent,transitions=[];
  const snapshot=()=>({motion:motion(d.model),camera:d.camera.position.toArray(),quaternion:d.camera.quaternion.toArray(),cameraState:{...d.cameraState.state}});
  for(const action of ['enter','leave']){
   const original=d.canyon[action].bind(d.canyon);
   d.canyon[action]=(...args)=>{
    const active=d.canyon.active,before=snapshot(),result=original(...args);
    if(active!==d.canyon.active){
     assert.deepEqual(snapshot(),before,`${action} preserves motion and camera at the exact transition`);
     assert.equal(d.model,model);assert.equal(d.canyon.model,model);assert.equal(d.rig.root,root);assert.equal(root.parent,parent);
     assert.equal(d.input.state.enabled,true);assert.equal(d.canyon.controlsLocked,false);worldVisible(d);transitions.push(action);
    }
    return result;
   };
  }
  let pauses=0,resets=0,cameraResets=0;
  const pause=model.pause.bind(model),reset=model.reset.bind(model),resetCamera=d.cameraState.reset.bind(d.cameraState);
  model.pause=(...args)=>{pauses++;return pause(...args);};model.reset=(...args)=>{resets++;return reset(...args);};
  d.cameraState.reset=(...args)=>{cameraResets++;return resetCamera(...args);};
  f.win.dispatch('keydown',{code:'KeyW'});
  let previous={x:model.state.x};
  const originalStep=model.step.bind(model);model.step=dt=>{originalStep(dt);assert.ok(Math.abs(model.state.x-previous.x)<1,'one physical step cannot teleport across the seam');previous.x=model.state.x;};
  frameUntil(f,()=>d.canyon.active);
  assert.equal(d.canyon.phase,'running');assert.equal(d.canyon.score.started,true);assert.equal(d.canyon.score.elapsed,0,'entry has no countdown');
  assert.ok(model.state.x>=CANYON_TRACK.origin.x-2.01&&model.state.x<CANYON_TRACK.origin.x+1);
  assert.equal(model.state.active,true);assert.ok(model.state.velocityX>1);assert.equal(f.ids.get('canyon-hud').hidden,false);
  frameUntil(f,()=>model.state.x>CANYON_TRACK.origin.x+8);
  const before={money:d.gameplay.state.money,brains:d.gameplay.state.brains},checkpoint=d.garage.deliveries[0];
  d.gameplay.drive(0,checkpoint.x,checkpoint.z);d.gameplay.tickProgress(10,{distance:100,active:true});
  assert.equal(d.gameplay.state.money,before.money);assert.equal(d.gameplay.state.brains,before.brains);
  f.win.dispatch('keyup',{code:'KeyW'});
  const reverse=f.ids.get('reverse-pedal');reverse.dispatch('pointerdown',{pointerId:82,button:0,clientX:60,clientY:70});
  frameUntil(f,()=>!d.canyon.active);
  assert.equal(model.state.gear,'R');assert.equal(model.state.active,true);assert.ok(model.state.velocityX<0);
  assert.equal(d.gameplay.state.mode,'driving');assert.equal(d.gameplay.state.selectedId,'bmwreward');assert.equal(d.gameplay.state.eventMode,null);
  assert.equal(f.ids.get('canyon-overlay').hidden,true);assert.equal(f.ids.get('canyon-hud').hidden,true);
  frameUntil(f,()=>model.state.x<CANYON_TRACK.origin.x-20);
  assert.deepEqual(transitions,['enter','leave']);assert.equal(pauses,0);assert.equal(resets,0);assert.equal(cameraResets,0);
  assert.equal(root.parent,parent);assert.equal(d.model,model);worldVisible(d);
  reverse.dispatch('pointerup',{pointerId:82,button:0,clientX:60,clientY:70});
  f.win.dispatch('keydown',{code:'KeyW'});frameUntil(f,()=>d.canyon.active);
  assert.equal(d.canyon.phase,'running');assert.equal(d.canyon.score.elapsed,0,'driving back starts a fresh attempt');
  assert.deepEqual(transitions,['enter','leave','enter']);assert.equal(pauses,0);assert.equal(resets,0);assert.equal(cameraResets,0);
 }finally{f.dispose();}
});

test('result dismissal and retry keep the BMW in place and allow continued driving',async()=>{
 const f=createAppDom({startDriving:false,career:earnedRewardCareer()});
 try{
  const d=selectBmw(f,12),model=d.model;f.win.dispatch('keydown',{code:'KeyW'});assert.equal(d.canyon.enter(),true);
  Object.assign(d.canyon.score,{finished:true,score:5000,elapsed:100,maxCombo:3});await d.canyon.complete();
  assert.equal(d.canyon.phase,'result');assert.equal(d.input.state.enabled,true);assert.equal(d.canyon.controlsLocked,false);
  const before=motion(model),parent=d.rig.root.parent;f.ids.get('canyon-exit').dispatch('click');
  assert.equal(d.canyon.active,true);assert.equal(d.gameplay.state.mode,'driving');assert.equal(d.gameplay.state.eventMode,'canyon');
  assert.deepEqual(motion(model),before);assert.equal(d.rig.root.parent,parent);assert.equal(f.ids.get('canyon-overlay').hidden,true);worldVisible(d);
  const x=model.state.x;for(let i=0;i<30;i++)f.frame();assert.ok(model.state.x>x,'driving continues after result dismissal');
  const retryPose=motion(model);assert.equal(d.canyon.retry(),true);assert.equal(d.canyon.phase,'touring');assert.equal(d.canyon.score,undefined);
  assert.deepEqual(motion(model),retryPose);assert.equal(d.input.state.enabled,true);assert.equal(f.ids.get('canyon-overlay').hidden,true);
  assert.equal(d.canyon.enter(),false,'retry requires physically returning to the entrance');
  const old=d.canyon;d.rebuild(42);assert.equal(old.entrance.group.parent,null);assert.equal(old.environment.group.parent,null);assert.equal(old.effects.group.parent,null);
  assert.notEqual(f.debug.canyon,old);assert.equal(f.debug.canyon.active,false);assert.equal(f.debug.gameplay.state.eventMode,null);worldVisible(f.debug);
 }finally{f.dispose();}
});

test('a cached pagehide preserves the canyon and pageshow resumes without stale controls',()=>{
 const f=createAppDom({startDriving:false,career:earnedRewardCareer()});
 try{
  const d=selectBmw(f,12);assert.equal(d.canyon.enter(),true);const controller=d.canyon,model=d.model,parent=d.rig.root.parent;
  f.win.dispatch('pagehide',{persisted:true});assert.equal(controller.active,true,'a cached page retains its canyon resources');
  f.win.dispatch('pageshow',{persisted:true});f.win.dispatch('focus');f.frame();
  assert.equal(d.canyon,controller);assert.equal(d.model,model);assert.equal(d.rig.root.parent,parent);assert.equal(d.gameplay.state.eventMode,'canyon');
  assert.equal(d.model.state.active,false);assert.equal(d.input.state.enabled,true);assert.ok(d.garage.vehicles.some(v=>v.model===d.model));worldVisible(d);
 }finally{f.dispose();}
});
