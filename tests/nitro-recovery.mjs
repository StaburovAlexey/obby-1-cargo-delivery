import test from 'node:test';
import assert from 'node:assert/strict';
import * as drift from '../dist/drift-dynamics.js';
import {initializeRapier} from '../dist/rapier-runtime.js';
import {createRapierDrivingModel} from '../dist/rapier-vehicle.js';
import {createNitro} from '../dist/vehicle-nitro.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';

const dt=1/60;
const pose={heading:0,velocityX:10,velocityZ:-20,angularVelocity:0,frontWheelAngle:0,active:true,handbrake:0};
const options={maxSpeed:48.3,engineAcceleration:7.2,surface:{frictionFactor:1},gradient:{x:0,z:0},dt};
const near=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} ~= ${b}`);

test('omitted or zero recovery preserves ordinary drift forces exactly',()=>{
 assert.deepEqual(drift.evaluateDriftDynamics(pose,options),drift.evaluateDriftDynamics(pose,{...options,nitroRecovery:0}));
});
test('recovery supplies bounded extra tire traction while all lateral forces oppose slip',()=>{
 const stock=drift.evaluateDriftDynamics(pose,options),assisted=drift.evaluateDriftDynamics(pose,{...options,nitroRecovery:1});
 for(let i=0;i<stock.tires.length;i++){
  const before=stock.tires[i],after=assisted.tires[i];
  near(after.grip/before.grip,i<2?1.2:1.35);
  assert.ok(after.lateralForce*after.lateralSpeed<=0);
  assert.ok(Math.hypot(after.longitudinalForce,after.lateralForce)<=after.grip+1e-8);
 }
 assert.ok(assisted.forceX<stock.forceX,'extra traction resists sideways motion');
 assert.ok(-assisted.forceZ> -stock.forceZ,'rear traction allows more useful forward drive during the slide');
 assert.deepEqual(drift.evaluateDriftDynamics(pose,{...options,nitroRecovery:7}),assisted);
 assert.deepEqual(drift.evaluateDriftDynamics(pose,{...options,nitroRecovery:-2}),stock);
});
test('nitro recovery fades smoothly with charge time and excludes straight travel and near spins',()=>{
 assert.equal(typeof drift.nitroRecoveryFactor,'function');
 const at=(degrees,remaining)=>drift.nitroRecoveryFactor({...pose,velocityX:Math.sin(degrees*Math.PI/180)*25,velocityZ:-Math.cos(degrees*Math.PI/180)*25},remaining);
 assert.equal(at(30,2),0);near(at(30,1.875),.5);near(at(30,1.75),1);
 near(at(30,.35),1);near(at(30,.175),.5);assert.equal(at(30,0),0);
 assert.equal(at(0,1),0);assert.equal(at(8,1),0);near(at(14,1),.5);near(at(20,1),1);
 near(at(65,1),1);near(at(75,1),.5);assert.equal(at(85,1),0);assert.equal(at(120,1),0);
 near(at(-30,1),at(30,1));assert.equal(at(30,Infinity),0);
});

function planarRun(mode,sign=1){
 const s={...pose,velocityX:sign*12,velocityZ:-22,frontWheelAngle:sign*.04,x:0,z:0};
 for(let frame=0;frame<60;frame++){
  const recovery=mode==='recovery'?drift.nitroRecoveryFactor(s,2-frame*dt):0;
  const f=drift.evaluateDriftDynamics(s,{...options,maxSpeed:mode==='none'?42:48.3,engineAcceleration:mode==='none'?4.8:7.2,nitroRecovery:recovery});
  s.velocityX+=f.forceX/1600*dt;s.velocityZ+=f.forceZ/1600*dt;s.angularVelocity+=f.torque/drift.BMW_DRIFT.yawInertia*dt;
  s.heading+=s.angularVelocity*dt;s.x+=s.velocityX*dt;s.z+=s.velocityZ*dt;
 }
 return {...s,angle:Math.abs(drift.driftTelemetry(s).slipAngle),forward:-Math.sin(s.heading)*s.velocityX-Math.cos(s.heading)*s.velocityZ};
}
for(const sign of [-1,1])test(`recovery reduces ${sign<0?'left':'right'} drift displacement versus throttle-only nitro`,()=>{
 const none=planarRun('none',sign),old=planarRun('old',sign),assisted=planarRun('recovery',sign);
 assert.ok(Math.abs(assisted.x)<Math.abs(old.x)*.97,JSON.stringify({none,old,assisted}));
 assert.ok(assisted.angle<old.angle);
 assert.ok(assisted.forward>none.forward);
});

const R=await initializeRapier();
const {driftFleetMetadata}=await import('./fixtures/drift-fleet.mjs');
function fixture(id='bmwreward',sign=1,{boost=true,steering=0}={}){
 const world=new R.World({x:0,y:-9.81,z:0});world.timestep=dt;
 world.createCollider(R.ColliderDesc.cuboid(500,.5,500).setTranslation(0,-.5,0));
 const nitro=createNitro();nitro.start(1);
 const model=createRapierDrivingModel({world,x:0,z:0,vehicleId:id,maxSpeed:42,getNitro:()=>nitro,getVehicleMetadata:()=>driftFleetMetadata.get(id)});
 const step=(frames=1)=>{for(let i=0;i<frames;i++){model.beforeStep(dt);world.step();model.afterStep(dt);}};
 step(120);model.body.setLinvel({x:sign*12,y:0,z:-22},true);model.afterStep(dt);
 model.setInput({active:true,steering:sign*steering});
 if(boost)assert.equal(nitro.activate(model.state),true);
 return {world,model,nitro,step,dispose(){model.dispose();world.free();}};
}
function actualRun(id,boost,sign,steering=0){
 const f=fixture(id,sign,{boost,steering});try{
  const start={x:f.model.state.x,z:f.model.state.z};f.step(60);const s=f.model.state;
  return {x:s.x-start.x,angle:Math.abs(s.slipAngle),forward:s.speed,heading:s.heading,grounded:s.grounded,upY:s.upY};
 }finally{f.dispose();}
}
for(const {id}of VEHICLE_CONFIG.filter(v=>v.rewardDrift))for(const sign of[-1,1])test(`${id} nitro reduces ${sign<0?'left':'right'} slide with real vehicle geometry`,()=>{
 const none=actualRun(id,false,sign),assisted=actualRun(id,true,sign);
 assert.ok(Math.abs(assisted.x)<Math.abs(none.x),JSON.stringify({none,assisted}));
 assert.ok(assisted.angle<none.angle,JSON.stringify({none,assisted}));
 assert.ok(assisted.forward>none.forward);
 assert.equal(assisted.grounded,true);assert.ok(assisted.upY>.98);
});
test('steering still changes the trajectory while recovery works',()=>{
 const left=actualRun('bmwreward',true,1,-.15),right=actualRun('bmwreward',true,1,.15);
 assert.ok(Math.abs(left.heading-right.heading)>.03);
 assert.ok(Math.abs(left.x-right.x)>.1);
});
for(const input of[{brake:1},{handbrake:1},{speedDemand:-1}])test(`nitro recovery is removed immediately for ${Object.keys(input)[0]}`,()=>{
 const f=fixture();try{
  f.step(15);assert.equal(f.model.state.nitroThrust,true);
  f.model.setInput({active:true,...input});assert.equal(f.nitro.state.remaining,0);assert.equal(f.model.state.nitroThrust,false);
  f.step();assert.equal(f.model.state.nitroThrust,false);
 }finally{f.dispose();}
});
test('leaving the ground suppresses nitro thrust and tire recovery until contact returns',()=>{
 const f=fixture();try{
  f.step(15);assert.equal(f.model.state.nitroThrust,true);
  const p=f.model.body.translation();f.model.body.setTranslation({...p,y:p.y+10},true);f.world.propagateModifiedBodyPositionsToColliders();
  f.step(2);assert.equal(f.model.state.nitroThrust,false);assert.equal(f.model.state.grounded,false);
  assert.ok(f.model.state.wheelContacts.every(contact=>!contact.grounded));
 }finally{f.dispose();}
});
test('nitro expiry and pose reset do not retain recovery',()=>{
 const f=fixture();try{
  f.step(121);assert.equal(f.nitro.state.remaining,0);assert.equal(f.model.state.nitroThrust,false);
  f.nitro.start(1);assert.equal(f.nitro.activate(f.model.state),true);f.model.reset();
  assert.equal(f.nitro.state.remaining,0);assert.equal(f.model.state.nitroThrust,false);
 }finally{f.dispose();}
});
