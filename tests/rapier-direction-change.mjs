import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeRapier} from '../dist/rapier-runtime.js';
import {createRapierDrivingModel} from '../dist/rapier-vehicle.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {vehicleConfig} from '../dist/economy-config.js';
import {createVehicleInput} from '../dist/vehicle-input.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';

const R=await initializeRapier(),dt=1/60;

function fixture(slope=0,{vehicleId='pickup',groundSurface}={}){
  const world=new R.World({x:0,y:-9.81,z:0});world.timestep=dt;
  world.createCollider(R.ColliderDesc.cuboid(100,.5,100).setTranslation(0,-.5,0)
    .setRotation({x:Math.sin(slope/2),y:0,z:0,w:Math.cos(slope/2)}));
  const model=createRapierDrivingModel({world,x:0,z:0,y:1,vehicleId,maxSpeed:vehicleConfig(vehicleId).maxSpeed,groundSurface});
  const dom=createInputDom();
  const reverse=dom.root.append(new dom.root.constructor(['gas-pedal','reverse-pedal']));
  const input=createVehicleInput({root:dom.root,onInput:value=>model.setInput(value),onGear:value=>model.setGear(value)});
  const step=seconds=>{for(let i=0;i<Math.round(seconds/dt);i++){
    model.beforeStep(dt);world.step();model.afterStep(dt);
  }};
  return {model,dom,reverse,input,step,dispose(){input.destroy();model.dispose();world.free();}};
}

for(const grade of [.15,.25])for(const direction of [1,-1]){
  test(`${direction===1?'gas':'reverse'} pedal drives uphill after rolling the opposite way on a ${grade} radian slope`,()=>{
    const f=fixture(grade*direction);
    try{
      f.step(4);
      assert.ok(f.model.state.speed*direction<-.5,'car has rolled downhill before the press');
      f.dom.pointer(direction===1?f.dom.pedal:f.reverse,'pointerdown',0,2);
      assert.equal(f.model.state.active,true,'the actual pedal handler requests throttle');
      assert.equal(f.dom.root.dataset.throttle,'true');
      f.step(5);
      assert.ok(f.model.state.speed*direction>1,`must drive uphill, signed speed=${f.model.state.speed*direction}`);
      assert.equal(f.model.state.braking,0,'direction-change brake must release');
      assert.equal(f.model.state.grounded,true);
    }finally{f.dispose();}
  });
}

test('changing direction at driving speed brakes first and then drives the other way',()=>{
  const f=fixture();
  try{
    f.step(2);f.dom.pointer(f.dom.pedal,'pointerdown',0,2);f.step(2);
    assert.ok(f.model.state.speed>5);
    f.dom.pointer(f.dom.pedal,'pointerup',0,2);
    f.dom.pointer(f.reverse,'pointerdown',0,3);f.step(dt);
    assert.equal(f.model.state.braking,1,'reverse must first brake forward motion');
    f.step(4);
    assert.ok(f.model.state.speed< -1);
    assert.equal(f.model.state.braking,0);
  }finally{f.dispose();}
});

for(const vehicleId of ['pickup','bmwreward'])for(const biome of ['city','snow','volcanic'])for(const angle of [Math.PI,Math.PI*.75]){
  test(`${vehicleId} forward throttle recovers after a ${Math.round(angle*180/Math.PI)} degree spin on ${biome} without requesting reverse`,()=>{
    const f=fixture(0,{vehicleId,groundSurface:()=>surfaceForBiome(biome,vehicleId)});
    try{
      f.step(2);f.dom.pointer(f.dom.pedal,'pointerdown',0,2);f.step(2);
      const velocity={...f.model.body.linvel()};
      f.model.body.setRotation({x:0,y:Math.sin(angle/2),z:0,w:Math.cos(angle/2)},true);
      f.model.body.setLinvel(velocity,true);
      if(angle<Math.PI){
        f.dom.pointer(f.dom.pedal,'pointerup',0,2);
        f.dom.pointer(f.dom.pedal,'pointerdown',0,2);
      }
      f.step(dt);
      assert.equal(f.model.state.gear,'D');
      assert.ok(f.model.state.speed<0,'momentum initially carries the spun car backward');
      assert.equal(f.model.state.braking,0,'a spin must not latch the gear-change brake while gas stays held');
      f.step(12);
      assert.ok(f.model.state.speed>1,`forward throttle must recover, speed=${f.model.state.speed}`);
    }finally{f.dispose();}
  });
}
