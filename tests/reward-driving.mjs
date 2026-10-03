import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createDrivingModel,evaluateVehicleForces} from '../dist/driving-model.js';
import {VEHICLE_CONFIG,vehicleConfig} from '../dist/economy-config.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
const beforeSource=execFileSync('git',['show','718ac2d339d0aca152321c9b6fafb71b17c2dc2a:dist/driving-model.js'],{encoding:'utf8'}).replace(/from ['"]\.\/([^'"]+)['"]/g,(_,p)=>`from '${new URL('../dist/'+p,import.meta.url).href}'`);
const before=await import('data:text/javascript;base64,'+Buffer.from(beforeSource).toString('base64'));
for(const v of VEHICLE_CONFIG.filter(v=>!v.rewardOnly)){
 const options={vehicleId:v.id,maxSpeed:v.maxSpeed,groundSurface:()=>surfaceForBiome('city',v.id)};
 const a=createDrivingModel(options),b=before.createDrivingModel(options);
 for(let i=0;i<900;i++){const input={active:i<700,steering:Math.sin(i*.01)*.6};a.setInput(input);b.setInput(input);a.step(1/60);b.step(1/60);}
 for(const k of ['x','z','heading','velocityX','velocityZ','angularVelocity','speed'])assert.equal(a.state[k],b.state[k],`${v.id} unchanged ${k}`);
}
const spec=vehicleConfig('bmwreward');assert(spec.rewardOnly&&spec.rewardDrift);
const options={vehicleId:spec.id,maxSpeed:spec.maxSpeed,groundSurface:()=>surfaceForBiome('city',spec.id)};
const car=createDrivingModel(options);car.setInput({active:true,steering:0});for(let i=0;i<1800;i++)car.step(1/60);assert(car.state.speed>40,'reward exceeds former 40 m/s ceiling');
const state={heading:0,velocityX:4,velocityZ:-15,angularVelocity:.1,frontWheelAngle:.1,gear:'D',active:true};
const forceOptions={maxSpeed:spec.maxSpeed,surface:surfaceForBiome('city',spec.id),engineAcceleration:spec.acceleration};
const standard=evaluateVehicleForces(state,forceOptions),drift=evaluateVehicleForces(state,{...forceOptions,rewardDrift:spec.rewardDrift});
for(let i=0;i<drift.tires.length;i++){const a=standard.tires[i],b=drift.tires[i];if(a.name.startsWith('rear'))assert(Math.abs(b.lateralForce)<Math.abs(a.lateralForce),'rear lets go earlier');}
let maxSlip=0;car.setInput({active:true,steering:1});for(let i=0;i<60;i++){car.step(1/60);const s=car.state;maxSlip=Math.max(maxSlip,Math.abs(Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ));assert(Number.isFinite(s.x+s.z+s.heading));}
assert(maxSlip>2&&maxSlip<15,'deliberate power drift is visible and bounded for one second');
car.setInput({active:false,steering:0});for(let i=0;i<180;i++)car.step(1/60);
assert(Math.abs(Math.cos(car.state.heading)*car.state.velocityX-Math.sin(car.state.heading)*car.state.velocityZ)<.1,'lifting throttle catches slide');
for(let i=0;i<1200;i++)car.step(1/60);assert(car.state.linearSpeed<1,'released drift settles');
console.log(JSON.stringify({test:'reward-driving',oldCars:10,topSpeed:spec.maxSpeed,maxSlip,settled:car.state.linearSpeed}));
