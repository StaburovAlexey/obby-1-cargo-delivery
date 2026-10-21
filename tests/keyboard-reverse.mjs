import assert from 'node:assert/strict';
import test from 'node:test';
import {createVehicleInput} from '../dist/vehicle-input.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
function setup(spec){
 const f=createInputDom();f.root.append(new f.pedal.constructor(['reverse-pedal']));
 const model=createDrivingModel({vehicleId:spec.id,maxSpeed:spec.maxSpeed,x:0,z:0});
 const input=createVehicleInput({root:f.root,onInput:value=>model.setInput(value),onGear:value=>model.setGear(value)});
 return {...f,model,input,key:(code,type='keydown',extra={})=>f.win.dispatch(type,{code,...extra})};
}
const step=(model,seconds)=>{for(let i=0;i<seconds*120;i++)model.step(1/120);};
test('S and down brake through zero into reverse for all ten ordinary vehicles',()=>{
 for(const spec of VEHICLE_CONFIG.filter(v=>!v.rewardOnly))for(const key of ['KeyS','ArrowDown']){
  const f=setup(spec),m=f.model;
  try{
   f.key('KeyW');step(m,2);f.key('KeyW','keyup');const forward=m.state.speed;
   assert.ok(forward>1);f.key(key);
   assert.equal(m.state.gear,'R',`${spec.id} ${key}`);assert.equal(m.state.active,true);
   assert.equal(m.state.speed,forward,'no instant velocity reversal');
   m.step(1/120);assert.ok(m.state.speed>0&&m.state.speed<forward);
   step(m,12);assert.ok(m.state.speed<-.3,`${spec.id} ${key} physically reverses`);
   f.key('KeyA');assert.equal(m.state.steering,-1);f.key('KeyA','keyup');
   f.key(key,'keyup');assert.equal(m.state.active,false);assert.equal(m.state.gear,'R');
   f.key('KeyW');assert.equal(m.state.gear,'D');step(m,12);assert.ok(m.state.speed>0);
  }finally{f.input.destroy();}
 }
});
test('reverse keyboard handles fallback, held W, repeats and safety resets',()=>{
 const f=setup(VEHICLE_CONFIG[0]);
 try{
  f.key(undefined,'keydown',{key:'s'});assert.equal(f.model.state.gear,'R');assert.equal(f.model.state.active,true);
  f.key(undefined,'keyup',{key:'s'});assert.equal(f.model.state.active,false);
  f.key('KeyW');f.key('KeyS');assert.equal(f.model.state.gear,'R');
  f.key('KeyS','keydown',{repeat:true});assert.equal(f.model.state.gear,'R');
  f.key('KeyS','keyup');assert.equal(f.model.state.gear,'D');assert.equal(f.model.state.active,true);
  f.win.dispatch('blur');assert.equal(f.model.state.active,false);
  f.key('KeyS','keydown',{target:{tagName:'INPUT'}});assert.equal(f.model.state.active,false);
  f.key('KeyS','keydown',{ctrlKey:true});assert.equal(f.model.state.active,false);
  f.key('ShiftLeft');assert.equal(f.model.state.active,false);
  f.key('KeyS');f.input.setEnabled(false);assert.equal(f.model.state.active,false);
 }finally{f.input.destroy();}
});
