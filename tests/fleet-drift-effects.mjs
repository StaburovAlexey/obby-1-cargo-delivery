import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createCanyonMode} from '../dist/canyon-mode.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {freshCareer} from '../dist/career-save.js';

// Production controller, physics and effect meshes; only the UI and platform are stubs.
function fixture(){
 const nodes=new Map(),doc={body:{classList:{toggle(){}}},createElement:()=>({}),getElementById(id){
  if(!nodes.has(id))nodes.set(id,{setAttribute(){},addEventListener(){},removeEventListener(){}});
  return nodes.get(id);
 }};
 const context={driving:true,gameplay:{state:freshCareer(),snapshot(){return this.state;}},garage:{vehicles:[],walkingSolids:[]}};
 const mode=createCanyonMode(THREE,{scene:new THREE.Scene(),document:doc,getContext:()=>context,leaderboard:{},language:()=> 'ru'});
 return {mode,context,select(spec){
  const metadata={dimensions:[4.7,2,7],wheelContacts:[{front:true,center:[-1,0,-2]},{front:true,center:[1,0,-2]},{front:false,center:[-2,0,3],halfWidth:.35},{front:false,center:[2,0,3],halfWidth:.35}]};
  const model=createDrivingModel({vehicleId:spec.id,maxSpeed:spec.maxSpeed,getVehicleMetadata:()=>metadata,groundSurface:()=>surfaceForBiome(spec.specialty||'city',spec.id)});
  context.model=model;context.gameplay.state.selectedId=spec.id;
  context.garage.vehicles=[{model,visual:{metadata},rig:{}}];mode.effects.clear();return model;
 }};
}
test('every catalog car emits smoke and tracks from its rear tires, without mutating driving telemetry',()=>{
 const f=fixture();
 try{for(const spec of VEHICLE_CONFIG){
  const model=f.select(spec);
  for(let i=0;i<45;i++){
   Object.assign(model.state,{x:i*.1,z:-i*.3,heading:0,velocityX:6,velocityZ:-18,linearSpeed:19,driftIntensity:spec.rewardOnly?.8:0});
   const before={...model.state};f.mode.updateEffects(1/60);assert.deepEqual(model.state,before);
  }
  assert.ok(f.mode.effects.smokeCount>0,`${spec.id}: smoke`);
  assert.ok(f.mode.effects.skidCount>0,`${spec.id}: tracks`);
  const p=f.mode.effects.skids.geometry.attributes.position;
  assert.ok(Math.abs((p.getX(0)+p.getX(1))/2+2)<.001,`${spec.id}: left rear tire alignment`);
  assert.ok(Math.abs((p.getX(4)+p.getX(5))/2-2)<.001,`${spec.id}: right rear tire alignment`);
 }}finally{f.mode.dispose();}
});
test('ordinary cars emit effects during actual controlled skids',()=>{
 const f=fixture();
 try{for(const spec of VEHICLE_CONFIG.filter(v=>!v.rewardOnly)){
  const model=f.select(spec);model.setInput({active:true});
  for(let i=0;i<15*60;i++)model.step(1/60);
  model.setInput({active:true,steering:1});let smoke=false,tracks=false;
  for(let i=0;i<3*60;i++){model.step(1/60);f.mode.updateEffects(1/60);smoke||=f.mode.effects.smokeCount>0;tracks||=f.mode.effects.skidCount>0;}
  assert.ok(smoke&&tracks,`${spec.id}: physical skid produces both effects`);
 }}finally{f.mode.dispose();}
});
test('straight driving, pausing, walking and falling do not emit new effects',()=>{
 const f=fixture();
 try{for(const scenario of ['straight','paused','walking','falling']){
  const model=f.select(VEHICLE_CONFIG[0]);f.context.driving=scenario!=='walking';
  for(let i=0;i<40;i++){
   Object.assign(model.state,{x:i*.1,z:-i*.3,heading:0,velocityX:scenario==='straight'?0:6,velocityZ:-18,linearSpeed:19});
   f.mode.updateEffects(1/60,{paused:scenario==='paused',grounded:scenario!=='falling'});
  }
  assert.equal(f.mode.effects.smokeCount,0,scenario);assert.equal(f.mode.effects.skidCount,0,scenario);
 }}finally{f.mode.dispose();}
});
