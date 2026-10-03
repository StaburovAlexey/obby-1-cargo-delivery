import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createDrivingModel} from '../dist/driving-model.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
let source=execFileSync('git',['show','9df0a6c1d2b5ba850db8b4d1b70ae61da71fffef:dist/driving-model.js'],{encoding:'utf8'}).replace(/from ['"](\.\/[^'"]+)['"]/g,(_,p)=>`from '${new URL('../dist/'+p,import.meta.url).href}'`);
const baseline=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let brakeFrames=0,impacts=0;
for(const spec of VEHICLE_CONFIG){
 const opts={vehicleId:spec.id,contact:(x,z)=>z< -40?{depth:-40-z,normalX:0,normalZ:1}:undefined};
 const a=createDrivingModel(opts),b=baseline.createDrivingModel(opts);
 for(let i=0;i<900;i++){
  const gear=i>500?'R':'D',control={active:true,steering:i<300?.1:0};a.setGear(gear);b.setGear(gear);a.setInput(control);b.setInput(control);a.step(1/60);b.step(1/60);
  for(const key of Object.keys(b.state))assert.deepEqual(a.state[key],b.state[key],`${spec.id}:${key}:${i}`);
  brakeFrames+=a.state.braking>0;impacts+=a.state.impactSpeed>1;
 }
 a.pause();assert.equal(a.state.braking,0);assert.equal(a.state.impactSpeed,0);a.reset();assert.equal(a.state.braking,0);assert.equal(a.state.impactSpeed,0);
}
assert(brakeFrames>0);assert(impacts>0);console.log('PASS 11-car effects telemetry leaves 9900 physical states bit-identical, real reverse braking/collision speed and resets.',{brakeFrames,impacts});
