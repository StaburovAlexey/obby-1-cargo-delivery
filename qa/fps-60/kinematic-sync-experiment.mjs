// Rejected candidate QA tests; intentionally outside the active production test suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../../dist/vendor/three.module.js';
import {initializeRapier,getRapier} from '../../dist/rapier-runtime.js';
import {createPhysicsWorld} from './kinematic-sync-candidate.js';
await initializeRapier();const R=getRapier();
async function originalWorld(){const url=new URL('./kinematic-sync-candidate.js',import.meta.url),source=await fs.readFile(url,'utf8'),start=source.indexOf('      for (const ' ,source.indexOf('roadHazards?.update?.(PHYSICS_FIXED_STEP')),end=source.indexOf('\n      world.step();',start);assert.ok(start>=0&&end>start);const restored=source.slice(0,start)+'      for (const {h, body} of moving) { const pose = hazardPose(h); body.setNextKinematicTranslation(hazardPosition(pose)); body.setNextKinematicRotation(hazardRotation(pose)); }'+source.slice(end);return import(`data:text/javascript;base64,${Buffer.from(restored.replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g,(_,quote,relative)=>`from ${quote}${new URL(relative,url).href}${quote}`)).toString('base64')}`);}
const platform=()=>({id:'platform',x:0,z:0,heading:0,groundHeight:0,width:4,height:2,length:4,solid:true});
function fixture(create=createPhysicsWorld,sequence=[],initial={}){const pose=Object.assign(platform(),initial);let tick=0;const hazards={movers:[pose],poses:[pose],poseFor:()=>pose,update(){Object.assign(pose,sequence[tick++]||{});}};const w=create({THREE,roadHazards:hazards});let body;w.world.bodies.forEach(b=>{if(b.isKinematic())body=b;});return{w,body,pose};}
function spy(object,name){const calls=[],original=object[name].bind(object);object[name]=(...args)=>{calls.push(structuredClone(args));return original(...args);};return calls;}
const values=v=>Object.fromEntries(Object.keys(v).map(k=>[k,v[k]]));
const snapshot=b=>Object.fromEntries(['translation','rotation','nextTranslation','nextRotation','linvel','angvel'].map(name=>[name,values(b[name]())]).concat([['pointVelocity',values(b.velocityAtPoint({x:.3,y:2,z:.2}))]]));

test('unchanged kinematic targets avoid repeated WASM writes while generic mutable headings and positions update',()=>{
 const {w,body,pose}=fixture();try{w.step(1/60);const translations=spy(body,'setNextKinematicTranslation'),rotations=spy(body,'setNextKinematicRotation');
  for(let i=0;i<120;i++)w.step(1/60);
  assert.equal(rotations.length,0,'constant heading must not resend the same kinematic rotation');assert.equal(translations.length,0,'exact dwell pose must not resend the same kinematic translation');
  pose.x=.5;w.step(1/60);assert.equal(translations.length,1);assert.equal(rotations.length,0);
  w.step(1/60);assert.equal(translations.length,1);assert.equal(body.linvel().x,0,'first dwell tick after motion has zero velocity');
  pose.heading=.4;w.step(1/60);assert.equal(rotations.length,1);w.step(1/60);assert.equal(rotations.length,1);assert.equal(body.angvel().y,0,'first dwell tick after rotation has zero angular velocity');
  pose.groundHeight=.2;w.step(1/60);assert.equal(translations.length,2);
 }finally{w.dispose();}
});

test('cached and original kinematics retain every next/current pose, velocity, support velocity and dynamic contact over move/dwell transitions',async()=>{
 const original=await originalWorld(),sequence=Array.from({length:180},(_,i)=>({x:i<20?0:i<50?(i-20)*.01:i<75?.3:i<105?.3-(i-75)*.01:0,heading:i<35?0:i<60?(i-35)*.006:i<100?.15:i<125?.15-(i-100)*.006:0,groundHeight:i<55?0:i<85?.08:0}));
 const current=fixture(createPhysicsWorld,sequence),reference=fixture(original.createPhysicsWorld,sequence);
 const makeBall=w=>{const b=w.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(.3,2.24,.2).setCanSleep(false).setCcdEnabled(true));const c=w.world.createCollider(R.ColliderDesc.ball(.25).setFriction(.8),b);return{b,c};},a=makeBall(current.w),b=makeBall(reference.w);
 const ray=w=>{const hit=w.world.castRayAndGetNormal(new R.Ray({x:1,y:5,z:1},{x:0,y:-1,z:0}),8,true);return hit?{timeOfImpact:hit.timeOfImpact,normal:values(hit.normal)}:null;};
 let contacts=0;try{for(let i=0;i<sequence.length;i++){
  current.w.step(1/60);reference.w.step(1/60);assert.deepEqual(snapshot(current.body),snapshot(reference.body),`kinematic frame ${i}`);assert.deepEqual(snapshot(a.b),snapshot(b.b),`supported dynamic body frame ${i}`);assert.deepEqual(ray(current.w),ray(reference.w));
  let ca=0,cb=0;current.w.world.contactPairsWith(a.c,()=>ca++);reference.w.world.contactPairsWith(b.c,()=>cb++);assert.equal(ca,cb);contacts+=ca;
 }assert.ok(contacts>0,'workload must actually exercise dynamic contact with the moving support');}finally{current.w.dispose();reference.w.dispose();}
});

// Constructor rotation normalization and setNextKinematicRotation rounding can
// differ by one float32 ULP, so the first command cannot be inferred from spawn.
test('first kinematic command preserves exact nonzero-heading float32 pose and velocity at route-scale coordinates',async()=>{
 const {createRoadHazards}=await import('../../dist/road-hazards.js'),initial=createRoadHazards(42).movers.find(h=>h.id==='city-barrier-extra-mover-1'),original=await originalWorld();
 assert.ok(initial);const current=fixture(createPhysicsWorld,[],initial),reference=fixture(original.createPhysicsWorld,[],initial);
 try{for(let i=0;i<20;i++){current.w.step(1/60);reference.w.step(1/60);assert.deepEqual(snapshot(current.body),snapshot(reference.body),`nonzero-heading initialization frame ${i}`);}}finally{current.w.dispose();reference.w.dispose();}
});
