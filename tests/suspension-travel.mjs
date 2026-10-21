import assert from 'node:assert/strict';
import test from 'node:test';
import {createDrivingModel} from '../dist/driving-model.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';

function motion(spec){
 const model=createDrivingModel({vehicleId:spec.id,maxSpeed:spec.maxSpeed,groundSurface:()=>surfaceForBiome(spec.specialty||'city',spec.id)});
 const peaks={bodyPitch:0,bodyRoll:0,bodyBob:0};
 for(const input of [{active:true,steering:0},{active:true,steering:1},{active:true,steering:-1},{active:false,brake:1}]){
  model.setInput(input);
  for(let i=0;i<120*6;i++){
   model.step(1/120);
   for(const key of Object.keys(peaks))peaks[key]=Math.max(peaks[key],Math.abs(model.state[key]));
  }
 }
 return peaks;
}
test('all ordinary cars retain moderate body movement with reduced travel',()=>{
 for(const spec of VEHICLE_CONFIG.filter(v=>!v.rewardOnly)){
  const p=motion(spec);
  assert.ok(p.bodyRoll<=.125/3,`${spec.id}: roll ${p.bodyRoll}`);
  assert.ok(p.bodyPitch<=.05/3,`${spec.id}: pitch ${p.bodyPitch}`);
  assert.ok(p.bodyBob<=.05/3,`${spec.id}: bob ${p.bodyBob}`);
  assert.ok(p.bodyRoll>.02,`${spec.id}: retain visible suspension animation`);
 }
});
test('BMW retains its full suspension movement',()=>{
 const p=motion(VEHICLE_CONFIG.find(v=>v.id==='bmwreward'));
 // Captured from the unchanged BMW solver before reducing ordinary-car travel.
 const before={bodyPitch:.041025097079185405,bodyRoll:.10968629784382841,bodyBob:.005398987654019678};
 for(const key of Object.keys(before))assert.ok(Math.abs(p[key]-before[key])<1e-10,key);
});
