

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {createGarageScene} from '../dist/garage-scene.js';
import {createGameplay,GAMEPLAY} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {getTruckContact} from '../dist/city-driving.js';
import {roadGroundGradient,roadGroundSurface} from '../dist/driving-ground.js';
import {projectRoad,truckInRoad} from '../dist/route-network.js';
import {vehicleConfig} from '../dist/economy-config.js';
import {createNetworkRouteController} from './fixtures/network-route-controller.mjs';
const garage=createGarageScene(THREE,{group:new THREE.Group()}),rows=[],hazards={surfaceAt:(x,z,s)=>s};
try{
 for(const [target,upgraded,expect] of [[2,false,'delivery'],[3,false,'empty'],[3,true,'delivery']]){
  const id='pickup',levels=upgraded?{speed:10,handling:10,grip:10,fuel:10}:{},delivery=garage.deliveries[target-1];
  const game=createGameplay({vehicles:garage.vehicles,stations:garage.stations,deliveries:garage.deliveries,career:{...freshCareer(),ownedVehicleIds:[id],upgrades:{[id]:levels}}});
  assert.equal(game.enter(id),true);
  let history=projectRoad(GAMEPLAY.roadSpawn.x,GAMEPLAY.roadSpawn.z),frames=0,travel=0,maxOffset=0;
  const model=createDrivingModel({...GAMEPLAY.roadSpawn,vehicleId:id,maxSpeed:vehicleConfig(id).maxSpeed,getUpgrades:()=>levels,contact:(x,z,h)=>getTruckContact(x,z,h,[],history),groundGradient:(x,z)=>{history=projectRoad(x,z,history);return roadGroundGradient(x,z,history);},groundSurface:(x,z,v)=>roadGroundSurface(x,z,v,history)});
  const controller=createNetworkRouteController({stations:garage.stations,target:delivery,vehicleId:id,levels,hazards});
  const events=[],refills=new Set();game.events();
  while(game.state.mode==='driving'&&frames<12000){
   model.setInput(controller.sample(model.state));model.step(.05);frames++;
   const s=model.state;history=projectRoad(s.x,s.z,history);
   assert.equal(s.blocked,false,`Unexpected boundary contact at ${history.progress}`);
   assert.equal(truckInRoad(s.x,s.z,s.heading,history),true);
   travel+=s.pathDistance;maxOffset=Math.max(maxOffset,Math.abs(history.offset));
   game.drive(s.pathDistance,s.x,s.z);events.push(...game.events());
   if(game.state.mode==='driving')for(const stop of garage.stations)if(Math.hypot(s.x-stop.x,s.z-stop.z)<=stop.radius)refills.add(stop.id);
  }
  assert.equal(game.state.mode,'walking','Starter journey reaches a terminal outcome');
  const delivered=events.find(e=>e.type==='delivery'),reason=delivered?'delivery':events.findLast(e=>e.type==='garage')?.reason;
  assert.equal(reason,expect);assert.equal(refills.size,target-1);
  if(delivered)assert.equal(delivered.id,delivery.id);
  rows.push({target,upgrade:upgraded?'max10':'stock',outcome:reason,seconds:frames*.05,travelXZ:travel,finalProgress:history.progress,maxOffset,refills:[...refills]});
 }
 const report={passed:true,scope:'Input-only production physics and gameplay, no obstacle simulation. First three checkpoint turns and fuel boundary only; no browser, full-route or human-play claim.',checks:rows};
 fs.mkdirSync(new URL('../qa/varied-turns/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/varied-turns/starter.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{garage.dispose();}
