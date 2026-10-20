import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDrivingModel,VEHICLE_DYNAMICS} from '../dist/driving-model.js';

const h=VEHICLE_DYNAMICS.fixedStep;
const near=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const render=model=>model.getRenderState?.()??model.state;
function movingModel(){
  const model=createDrivingModel({x:0,z:0});
  Object.assign(model.state,{velocityZ:-11,speed:11,linearSpeed:11});
  model.setInput({active:true});return model;
}

test('the displayed pose interpolates the last two physics steps without moving the physics state',()=>{
  const model=movingModel();model.step(h*1.5);
  const physical={...model.state},pose=render(model);
  near(pose.z,-11*h*.5);
  near(model.state.z,-11*h);
  assert.deepEqual(model.state,physical);
  assert.notEqual(pose,model.state);
});

test('displayed motion continues between fixed ticks at 90, 144 and 165 render frames per second',()=>{
  for(const fps of [90,144,165]){
    const model=movingModel();let previous=null;
    for(let frame=0;frame<fps;frame++){
      model.step(1/fps);const z=render(model).z;
      if(previous!==null&&frame>2)near(previous-z,11/fps);
      previous=z;
    }
  }
});

test('displayed heading, wheels and suspension share the same interpolation time',()=>{
  const model=movingModel();
  Object.assign(model.state,{heading:Math.PI-.001,velocityZ:11,angularVelocity:1});
  const before={...model.state};model.step(h*1.5);
  const pose=render(model);
  for(const field of ['heading','frontWheelAngle','wheelSpin','bodyPitch','bodyRoll','bodyBob']){
    near(pose[field],(before[field]+model.state[field])*.5);
  }
});

test('pause, reset and externally teleported poses discard interpolation history immediately',()=>{
  const model=movingModel();model.step(h*1.5);
  model.pause();near(render(model).z,model.state.z);
  Object.assign(model.state,{x:500,z:-900,heading:-2});
  assert.equal(render(model).x,500);assert.equal(render(model).z,-900);assert.equal(render(model).heading,-2);
  model.reset();near(render(model).x,0);near(render(model).z,0);near(render(model).wheelSpin,0);
  model.step(h*.25);near(render(model).z,0);
});

test('sampling a display pose preserves identical acceleration, turning and path telemetry',()=>{
  const a=movingModel(),b=movingModel();
  for(let frame=0;frame<500;frame++){
    const input={active:true,steering:Math.sin(frame*.01)*.4},dt=frame%2?.021:.012;
    a.setInput(input);b.setInput(input);a.step(dt);b.step(dt);
    for(let sample=0;sample<3;sample++)render(a);
    assert.deepEqual(a.state,b.state);
  }
});
