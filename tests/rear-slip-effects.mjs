import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createCanyonMode} from '../dist/canyon-mode.js';
import {freshCareer} from '../dist/career-save.js';

const rearZ=3;
const metadata={wheelContacts:[
 {front:true,center:[-1,0,-2]},
 {front:true,center:[1,0,-2]},
 {front:false,center:[-2,0,rearZ],halfWidth:.35},
 {front:false,center:[2,0,rearZ],halfWidth:.35},
]};
function fixture(vehicleId='tow'){
 const nodes=new Map(),doc={body:{classList:{toggle(){}}},createElement:()=>({}),getElementById(id){
  if(!nodes.has(id))nodes.set(id,{setAttribute(){},addEventListener(){},removeEventListener(){}});
  return nodes.get(id);
 }};
 const state={x:0,z:0,heading:0,velocityX:0,velocityZ:0,angularVelocity:0,linearSpeed:0,driftIntensity:0};
 const model={state},career=freshCareer();career.selectedId=vehicleId;
 const context={model,driving:true,gameplay:{state:career,snapshot(){return this.state;}},garage:{vehicles:[{model,visual:{metadata},rig:{}}],walkingSolids:[]}};
 const mode=createCanyonMode(THREE,{scene:new THREE.Scene(),document:doc,getContext:()=>context,leaderboard:{},language:()=> 'ru'});
 return {mode,state,context,drive({forward=12,side=0,omega=0,intensity=0}={},options={}){
  for(let i=0;i<45;i++){
   Object.assign(state,{x:i*side/60,z:-i*forward/60,velocityX:side,velocityZ:-forward,angularVelocity:omega,linearSpeed:Math.hypot(forward,side),driftIntensity:intensity});
   const before={...state};mode.updateEffects(1/60,options);assert.deepEqual(state,before,'effects must preserve model telemetry');
  }
 }};
}
test('rolling rear tires produce no effects even when the center of mass travels sideways in a tight turn',()=>{
 const f=fixture();
 try{
  // Rear contact lateral speed = body side speed + yaw rate * rear Z = 0.
  for(const {forward,side} of [{forward:4,side:3},{forward:12,side:6}]){
   f.mode.effects.clear();
   f.drive({forward,side,omega:-side/rearZ});
   assert.equal(f.mode.effects.smokeCount,0);
   assert.equal(f.mode.effects.skidCount,0);
  }
 }finally{f.mode.dispose();}
});
test('ordinary tire effects stay off below six meters per second even during a real rear slide',()=>{
 const f=fixture();
 try{
  f.drive({forward:5,side:3,omega:0});
  assert.equal(f.mode.effects.smokeCount,0);
  assert.equal(f.mode.effects.skidCount,0);
 }finally{f.mode.dispose();}
});
test('an actual rear contact slide produces smoke and tracks at the rear tires',()=>{
 const f=fixture();
 try{
  f.drive({forward:18,side:4,omega:.3});
  assert.ok(f.mode.effects.smokeCount>0,'rear tire smoke');
  assert.ok(f.mode.effects.skidCount>0,'rear tire marks');
  const p=f.mode.effects.skids.geometry.attributes.position;
  assert.ok(Math.abs((p.getX(0)+p.getX(1))/2+2)<.001,'left rear contact');
  assert.ok(Math.abs((p.getX(4)+p.getX(5))/2-2)<.001,'right rear contact');
 }finally{f.mode.dispose();}
});
test('ordinary effect strength increases smoothly with speed for the same rear slip',()=>{
 const count=forward=>{
  const f=fixture();
  try{f.drive({forward,side:forward*Math.tan(.14)});return f.mode.effects.smokeCount;}
  finally{f.mode.dispose();}
 };
 assert.equal(count(6),0);
 assert.ok(count(8)>0,'moderate speed emits visible rear smoke');
 assert.ok(count(8)<count(12),'effect rate rises progressively with speed');
});
test('paused, walking and airborne cars emit no new rear contact effects',()=>{
 for(const scenario of ['paused','walking','airborne']){
  const f=fixture();
  try{
   f.context.driving=scenario!=='walking';
   f.drive({forward:18,side:4,omega:.3},{paused:scenario==='paused',grounded:scenario!=='airborne'});
   assert.equal(f.mode.effects.smokeCount,0,scenario);
   assert.equal(f.mode.effects.skidCount,0,scenario);
  }finally{f.mode.dispose();}
 }
});
test('BMW smoke continues to use its published drift intensity',()=>{
 for(const intensity of [0,.8]){
  const f=fixture('bmwreward');
  try{
   f.drive({forward:5,side:3,omega:0,intensity});
   assert.equal(f.mode.effects.smokeCount>0,intensity>0);
   assert.equal(f.mode.effects.skidCount>0,intensity>0);
  }finally{f.mode.dispose();}
 }
});
