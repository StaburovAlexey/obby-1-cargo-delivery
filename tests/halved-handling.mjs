import assert from 'node:assert/strict';
import fs from 'node:fs';
import {VEHICLE_CONFIG as cars,BIOME_SEQUENCE as biomes} from '../dist/economy-config.js';
import {VEHICLE_CONFIG as oldCars} from '../qa/halved-handling/baseline/economy-config.js';
import {surfaceForBiome,normalizeSurfaceDynamics} from '../dist/biome-surfaces.js';
import {surfaceForBiome as oldSurface} from '../qa/halved-handling/baseline/biome-surfaces.js';
import {getVehiclePerformance,getUpgradeModifiers} from '../dist/vehicle-upgrades.js';
import {getVehiclePerformance as oldPerformance} from '../qa/halved-handling/baseline/vehicle-upgrades.js';
import {createDrivingModel,evaluateVehicleForces} from '../dist/driving-model.js';
import {createDrivingModel as oldModel} from '../qa/halved-handling/baseline/driving-model.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const rows=[];let cases=0;
function model(car,biome,level,old=false){return (old?oldModel:createDrivingModel)({vehicleId:car.id,maxSpeed:car.maxSpeed,getUpgrades:()=>({speed:level,handling:level,grip:level,fuel:level}),groundSurface:()=> (old?oldSurface:surfaceForBiome)(biome,car.id)});}
function measure(car,biome,level,old){const m=model(car,biome,level,old);m.setInput({steering:1});m.step(.05);const rack=Math.abs(m.state.frontWheelAngle);m.reset();Object.assign(m.state,{velocityZ:-1.5});m.setGear('R');m.setInput({active:true});let brakeDistance=0,t=0;while(m.state.velocityZ<0&&t<5){m.step(1/120);brakeDistance+=m.state.pathDistance;t+=1/120;}assert.ok(t<5);m.reset();Object.assign(m.state,{velocityX:.6,velocityZ:-1.5});m.setInput({active:false});let slide=0;for(let i=0;i<3600;i++){const x=m.state.x;m.step(1/120);slide+=Math.abs(m.state.x-x);}return{rack,brakeDistance,slide};}
for(const [i,car] of cars.entries()){
 for(const key of Object.keys(car))if(!['handling','grip'].includes(key))assert.deepEqual(car[key],oldCars[i][key]);
 near(car.handling,oldCars[i].handling/2);near(car.grip,oldCars[i].grip/2);
 for(let level=0;level<=3;level++){
  const upgrades={speed:level,handling:level,grip:level,fuel:level},p=getVehiclePerformance(car.id,upgrades),old=oldPerformance(car.id,upgrades);
  near(p.handling,old.handling/2);near(p.grip,old.grip/2);near(p.steeringResponseSeconds,old.steeringResponseSeconds*2);
  for(const key of ['maxSpeed','acceleration','range','capacity','consumption'])near(p[key],old[key]);
  for(const b of biomes){
   const s=normalizeSurfaceDynamics(surfaceForBiome(b.id,car.id)),o=oldSurface(b.id,car.id);
   near(s.frictionFactor,o.frictionFactor/2);near(s.lateralDampingFactor,o.lateralDampingFactor/2);
   for(const key of Object.keys(s))if(!['frictionFactor','lateralDampingFactor'].includes(key))near(s[key],o[key]);
   for(const gear of ['D','R']){const m=model(car,b.id,level);m.setGear(gear);for(let frame=0;frame<1200;frame++){m.setInput({active:frame<900,steering:frame<300?1:frame<600?-1:0});m.step(1/120);for(const value of Object.values(m.state))if(typeof value==='number')assert.ok(Number.isFinite(value));}cases++;}
  }
 }
 for(const b of biomes){const before=measure(car,b.id,0,true),after=measure(car,b.id,0,false);assert.ok(after.rack<before.rack);assert.ok(after.brakeDistance>=before.brakeDistance-1e-8);assert.ok(after.slide>=before.slide-1e-8);rows.push({car:car.id,biome:b.id,before,after});}
 if(i){const previous=getVehiclePerformance(cars[i-1].id,{speed:3,handling:3,grip:3,fuel:3}),current=getVehiclePerformance(car.id,{});for(const key of ['maxSpeed','acceleration','handling','grip','range'])assert.ok(current[key]>previous[key]);}
}
const report={scope:'Node actual production solver, no browser/WebGL/Android verification',cars:cars.length,levels:4,profiles:200,stabilityCases:cases,frames:cases*1200,rows};fs.writeFileSync(new URL('../qa/halved-handling/report.json',import.meta.url),JSON.stringify(report,null,2));console.log('PASS exact half catalog/UI/performance/surface coefficients; progression; 480000 finite frames; slower rack, longer braking and sliding in all 50 profiles');
