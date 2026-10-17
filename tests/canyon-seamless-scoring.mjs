import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import {canyonDriverInput} from './fixtures/canyon-driver.mjs';
import {canyonApproachPoint,projectCanyonApproach,CANYON_APPROACH_LENGTH} from '../dist/canyon-approach.js';
import {canyonPointAt,projectCanyon,CANYON_TRACK} from '../dist/canyon-track.js';
import {DRIFT_RULES} from '../dist/drift-score.js';
import {ECONOMY_CONFIG} from '../dist/economy-config.js';

const FPS=30,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const numericText=node=>Number((node.textContent||'').replace(/[^0-9]/g,''));

// Only the initial placement is synthetic. Every subsequent position, heading,
// velocity and score is produced by the real app frame loop and BMW physics.
function roadJourney({developerMode=false,career=earnedRewardCareer()}={}){
 const raw=JSON.stringify(career),writes=[];
 const storage={getItem:key=>key===ECONOMY_CONFIG.saveKey?raw:null,setItem:(...args)=>writes.push(args)};
 const f=createAppDom({startDriving:false,search:developerMode?'?dev=1':'',storage}),d=f.debug;
 d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('bmwreward'),true);
 const model=d.model,root=d.rig.root,parent=root.parent;
 Object.assign(model.state,{x:0,z:-12,heading:0,velocityX:0,velocityZ:0});
 d.applyTruckPose();d.followTruck(1,true);
 let now=1000,steering=0,gas=false,reversing=false,distance=0,contacts=0;
 f.pointer(f.wheel,'pointerdown',0,91);
 function steer(value){
  value=clamp(value,-1,1);
  // The wheel follows the shorter pointer arc, so split a large change.
  while(Math.abs(value-steering)>.5){steering+=Math.sign(value-steering)*.5;f.pointer(f.wheel,'pointermove',steering*135,91);}
  steering=value;f.pointer(f.wheel,'pointermove',steering*135,91);
 }
 function throttle(value){if(value!==gas){f.win.dispatch(value?'keydown':'keyup',{code:'KeyW'});gas=value;}}
 function reverse(value){if(value===reversing)return;reversing=value;f.ids.get('reverse-pedal').dispatch(value?'pointerdown':'pointerup',{pointerId:92,button:0,clientX:60,clientY:70});}
 function frame(){
  const before={x:model.state.x,z:model.state.z};now+=1000/FPS;f.frame(now);
  const delta=Math.hypot(model.state.x-before.x,model.state.z-before.z);distance+=delta;if(model.state.blocked)contacts++;
  assert.ok(delta<2,'one app frame cannot teleport the BMW');
  assert.equal(d.model,model);assert.equal(d.canyon.model,model);assert.equal(d.rig.root,root);assert.equal(root.parent,parent);
 }
 function until(predicate,input,seconds=60){
  for(let i=0;i<FPS*seconds&&!predicate();i++){input();frame();}
  assert.ok(predicate(),`driving did not reach the target: ${JSON.stringify({phase:d.canyon.phase,pose:projectCanyon(model.state.x,model.state.z),speed:model.state.linearSpeed})}`);
 }
 function approach(offset=0){
  until(()=>d.canyon.active,()=>{
   const s=model.state,p=projectCanyonApproach(s.x,s.z),target=canyonApproachPoint(p.progress+10);
   const lane=offset*clamp((p.progress-200)/60,0,1);target.x+=target.right.x*lane;target.z+=target.right.z*lane;
   const heading=Math.atan2(-(target.x-s.x),-(target.z-s.z));steer(-wrap(heading-s.heading)*2);throttle(s.linearSpeed<8);
  });
  assert.ok(distance>300,'the BMW drives from the main road through the complete approach');
  assert.equal(contacts,0,'the main-road fork and entry lane are collision-free');
 }
 return {f,d,model,writes,steer,throttle,reverse,frame,until,approach,get contacts(){return contacts;},dispose:()=>f.dispose()};
}

function checkStarted(j){
 assert.equal(j.d.canyon.phase,'running');assert.equal(j.d.canyon.score.started,true);
 assert.equal(j.d.canyon.score.valid,true);assert.equal(j.f.ids.get('canyon-hud').hidden,false);
 assert.equal(j.f.ids.get('canyon-overlay').hidden,true);assert.equal(j.d.input.state.enabled,true);
 assert.equal(j.d.canyon.controlsLocked,false);assert.equal(j.d.gameplay.state.eventMode,'canyon');
}
function driftWithDom(j,{straightUntil=15,steering=.75}={}){
 j.until(()=>projectCanyon(j.model.state.x,j.model.state.z).progress>=straightUntil,()=>{j.steer(0);j.throttle(true);},8);
 assert.ok(j.model.state.linearSpeed>DRIFT_RULES.minSpeed,'straight driving is fast enough to score if steering were ignored');
 assert.equal(j.d.canyon.score.score,0,'ordinary forward driving must not earn drift points');
 assert.equal(numericText(j.f.ids.get('canyon-score')),0);
 j.until(()=>j.d.canyon.score.score>=20,()=>{j.steer(steering);j.throttle(true);},4);
 const s=j.model.state,forward=-Math.sin(s.heading)*s.velocityX-Math.cos(s.heading)*s.velocityZ,lateral=Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ;
 assert.ok(Math.abs(Math.atan2(lateral,forward))>=DRIFT_RULES.minAngle,'points follow genuine BMW lateral slip');
 assert.ok(Math.abs(lateral)>2,'the car is moving laterally, not just visually rotating');
 assert.equal(numericText(j.f.ids.get('canyon-score')),j.d.canyon.score.score,'the actual DOM HUD shows the earned points');
 assert.equal(j.contacts,0,'the scoring maneuver does not use wall impacts');
}

test('DOM-driven BMW enters from the outer approach lane, scores a real drift, then exits and reenters continuously',()=>{
 const j=roadJourney();
 try{
  j.approach(6.5);
  const entry=projectCanyon(j.model.state.x,j.model.state.z);
  assert.ok(entry.offset>6&&entry.offset<CANYON_TRACK.halfWidth-.1,`regression entry is outside the former 6 m start band: ${entry.offset}`);
  checkStarted(j);driftWithDom(j,{straightUntil:8,steering:-.75});
  const firstScore=j.d.canyon.score;
  j.throttle(false);j.reverse(true);
  j.until(()=>!j.d.canyon.active,()=>{
   const s=j.model.state,p=projectCanyon(s.x,s.z),target=p.progress>10?canyonPointAt(p.progress-10):canyonApproachPoint(CANYON_APPROACH_LENGTH-10+p.progress);
   const nose=Math.atan2(target.x-s.x,target.z-s.z);j.steer(wrap(nose-s.heading)*2);
  },40);
  assert.equal(j.model.state.gear,'R');assert.equal(j.d.gameplay.state.mode,'driving');assert.equal(j.d.gameplay.state.selectedId,'bmwreward');
  assert.equal(j.d.gameplay.state.eventMode,null);assert.equal(j.f.ids.get('canyon-hud').hidden,true);
  j.until(()=>projectCanyonApproach(j.model.state.x,j.model.state.z).progress<CANYON_APPROACH_LENGTH-20,()=>j.steer(0),15);
  j.reverse(false);j.throttle(true);
  j.until(()=>j.d.canyon.active,()=>{
   const s=j.model.state,target=canyonPointAt(8),heading=Math.atan2(-(target.x-s.x),-(target.z-s.z));j.steer(-wrap(heading-s.heading)*2);
  },20);
  checkStarted(j);assert.notEqual(j.d.canyon.score,firstScore);assert.equal(j.d.canyon.score.elapsed,0);assert.equal(j.d.canyon.score.score,0);
 }finally{j.dispose();}
});

test('developer BMW shows real straight-versus-drift scoring but completing the course never saves or ranks rewards',async()=>{
 const j=roadJourney({developerMode:true}),initial=j.d.gameplay.snapshot(),calls={submit:0,record:0};
 j.d.canyon.leaderboard.submit=()=>{calls.submit++;return Promise.resolve({status:'posted'});};
 const record=j.d.gameplay.recordDriftResult.bind(j.d.gameplay);
 j.d.gameplay.recordDriftResult=(...args)=>{calls.record++;return record(...args);};
 try{
  j.approach();checkStarted(j);const before=j.d.gameplay.snapshot();
  for(const key of ['money','routeCompletion','driftRecord'])assert.deepEqual(before[key],initial[key],`${key} is preserved through the approach`);
  driftWithDom(j);
  assert.equal(j.d.canyon.score.rankedEligible,false);assert.equal(j.d.canyon.score.reason,'development');
  // The remainder uses the existing deterministic analog driver. Its only
  // outputs are real model input commands; the app still owns each physics,
  // scoring, HUD and completion step, with no synthetic finish or score data.
  j.throttle(false);
  j.until(()=>j.d.canyon.phase==='checking'||j.d.canyon.phase==='result',()=>j.model.setInput(canyonDriverInput(j.model.state)),220);
  await Promise.resolve();await Promise.resolve();
  assert.equal(j.d.canyon.phase,'result');assert.equal(j.d.canyon.score.finished,true);assert.equal(j.d.canyon.score.valid,true);
  assert.ok(j.d.canyon.score.score>1000);assert.ok(j.d.canyon.score.elapsed>60);
  assert.equal(j.f.ids.get('canyon-overlay').hidden,false);
  assert.equal(numericText(j.f.ids.get('canyon-result-score')),j.d.canyon.score.score);
  assert.match(j.f.ids.get('canyon-result-note').textContent,/не сохраня|not saved/i);
  assert.deepEqual(calls,{submit:0,record:0},'development cannot submit ranked results or record even an earned-career result');
  assert.deepEqual(j.d.gameplay.snapshot(),before,'money, brains, deliveries and saved drift records remain unchanged');
  assert.equal(j.writes.length,0);
 }finally{j.dispose();}
 assert.equal(j.writes.length,0,'disposing the developer app must not flush a reward save');
});

