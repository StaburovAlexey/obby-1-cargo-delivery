import assert from 'node:assert/strict';
import {VEHICLE_CONFIG,BIOME_SEQUENCE} from '../dist/economy-config.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {surfaceForBiome,biomeSurfaceAt} from '../dist/biome-surfaces.js';
import {getVehiclePerformance} from '../dist/vehicle-upgrades.js';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {routePointAtProgress} from '../dist/route-network.js';
const max={speed:10,handling:10,grip:10,fuel:10};
const create=(v,b,levels={})=>createDrivingModel({vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>levels,groundSurface:()=>surfaceForBiome(b,v.id)});
let comparisons=0,profiles=0;
for(let i=0;i<VEHICLE_CONFIG.length;i++){
 const v=VEHICLE_CONFIG[i],tier=BIOME_SEQUENCE.findIndex(b=>b.id===v.specialty);
 for(const [j,b] of BIOME_SEQUENCE.entries()){
  const surface=surfaceForBiome(b.id,v.id);assert.equal(surface.fuelFactor,j<=tier?1:j-tier+1);assert.equal(surface.handlingFactor,j<=tier?1:.75);
  const m=create(v,b.id);m.setInput({active:true});for(let frame=0;frame<4800;frame++)m.step(1/120);
  assert.ok(Math.abs(m.state.speed-v.maxSpeed*surface.speedFactor)<.06);profiles++;
  const g=createGameplay({vehicles:VEHICLE_CONFIG.map(c=>({id:c.id,park:{x:0,z:0,heading:0}})),career:{...freshCareer(),ownedVehicleIds:VEHICLE_CONFIG.map(c=>c.id)}});assert.ok(g.enter(v.id));const p=routePointAtProgress((b.from+b.to)/2),fuel=g.state.fuels[v.id];g.drive(10,p.x,p.z);assert.ok(Math.abs((fuel-g.state.fuels[v.id])-10*v.consumption*surface.fuelFactor)<1e-8);const f=g.state.fuels[v.id];g.drive(0,p.x,p.z);assert.equal(g.state.fuels[v.id],f);g.drive(-10,p.x,p.z);assert.ok(g.state.fuels[v.id]<f);
  if(i){const previous=VEHICLE_CONFIG[i-1],old=create(previous,b.id,max),next=create(v,b.id);old.setInput({active:true});next.setInput({active:true});for(let f=0;f<120;f++){old.step(1/120);next.step(1/120);}assert.ok(next.state.speed>old.state.speed,`${v.id}/${b.id} acceleration`);
   for(let f=0;f<4680;f++){old.step(1/120);next.step(1/120);}assert.ok(next.state.speed>old.state.speed,`${v.id}/${b.id} top speed`);
   old.reset();next.reset();old.setInput({steering:1});next.setInput({steering:1});old.step(.1);next.step(.1);assert.ok(Math.abs(next.state.frontWheelAngle)>Math.abs(old.state.frontWheelAngle),`${v.id}/${b.id} rack response`);
   assert.ok(surface.frictionFactor>surfaceForBiome(b.id,previous.id).frictionFactor*1.1,`${v.id}/${b.id} grip`);comparisons++;}
 }
 if(i){const prev=getVehiclePerformance(VEHICLE_CONFIG[i-1].id,max),next=getVehiclePerformance(v.id,{});for(const key of ['maxSpeed','acceleration','handling','grip','range','capacity'])assert.ok(next[key]>prev[key],`${v.id}/${key}`);}
}
for(const boundary of [2000,4000,6200,8400]){let prev=biomeSurfaceAt(boundary-25,'pickup');for(let p=boundary-24;p<=boundary+24;p++){const next=biomeSurfaceAt(p,'pickup');assert.ok(Math.abs(next.fuelFactor-prev.fuelFactor)<.04);prev=next;}}
console.log(`PASS ${profiles} actual solver speed/fuel profiles, ${comparisons} next-stock vs previous-max actual acceleration/top-speed/rack/grip comparisons; all range/capacity improvements, blended fuel and reverse/idle charging.`);
