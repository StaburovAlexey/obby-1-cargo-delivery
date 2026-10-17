import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {createGarageScene} from '../dist/garage-scene.js';
import {createGameplay,GAMEPLAY} from '../dist/gameplay.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {createRoadHazards} from '../dist/road-hazards.js';
import {getTruckContact} from '../dist/city-driving.js';
import {roadGroundGradient,roadGroundSurface} from '../dist/driving-ground.js';
import {projectRoad,routeDistanceAt,truckInRoad} from '../dist/road-layout.js';
import {VEHICLE_CONFIG,BIOME_SEQUENCE,DELIVERY_CHECKPOINTS} from '../dist/economy-config.js';
import {getVehiclePerformance} from '../dist/vehicle-upgrades.js';
import {BRIDGES,bridgeAtProgress,bridgeSupport} from '../dist/road-bridges.js';
import {freshCareer,sanitizeCareer} from '../dist/career-save.js';
import {createCareerRouteTracker,HARD_BRANCHES} from '../dist/career-route-tracker.js';
import {createBridgeAwareController} from './fixtures/bridge-aware-controller.mjs';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';

const scene=createGarageScene(THREE,{group:new THREE.Group()}),dt=.05;
const only=process.argv.find(a=>a.startsWith('--scenario='))?.slice(11);
const shard=process.argv.find(a=>a.startsWith('--shard='))?.slice(8).split('/').map(Number);
if(shard)assert.ok(shard.length===2&&shard.every(Number.isInteger)&&shard[0]>=0&&shard[0]<shard[1]&&shard[1]>0,'valid shard');
const sourceHashes=()=>Object.fromEntries(fs.readdirSync(new URL('../dist/',import.meta.url)).filter(f=>f.endsWith('.js')).sort().map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL('../dist/'+f,import.meta.url))).digest('hex')]));
const before=sourceHashes(),results=[];
function journey({name,id,checkpoint,discovery,levels={},expect='delivery',career,controllerConfig={}}){
 const vehicle=VEHICLE_CONFIG.find(v=>v.id===id),target=discovery?{progress:BIOME_SEQUENCE.find(b=>b.id===discovery).from+50}:scene.deliveries[checkpoint-1];
 if(discovery)target.distance=routeDistanceAt(target.progress);
 let saved=null;const game=createGameplay({vehicles:scene.vehicles,stations:scene.stations,deliveries:scene.deliveries,hardBranches:HARD_BRANCHES,
  career:career||{...freshCareer(),ownedVehicleIds:['pickup',...(id==='pickup'?[]:[id])],upgrades:{[id]:levels}},
  persistence:{save(value){saved=value;return true;}}});
 assert.ok(game.enter(id));let context=projectRoad(GAMEPLAY.roadSpawn.x,GAMEPLAY.roadSpawn.z),frames=0,refills=new Set(),minFuel=1;
 const hazards=createRoadHazards(42),performance=getVehiclePerformance(id,levels),model=createDrivingModel({...GAMEPLAY.roadSpawn,vehicleId:id,maxSpeed:vehicle.maxSpeed,getUpgrades:()=>levels,
  contact:(x,z,h)=>{if(bridgeAtProgress(projectRoad(x,z,context).progress))return null;const road=getTruckContact(x,z,h,[],context),obstacle=hazards.contact(x,z,h);return !road?obstacle:!obstacle||road.depth>=obstacle.depth?road:obstacle;},
  groundGradient:(x,z)=>{context=projectRoad(x,z,context);return roadGroundGradient(x,z,context);},
  groundSurface:(x,z,v)=>hazards.surfaceAt(x,z,roadGroundSurface(x,z,v,context))});
 const stations=discovery?scene.stations.filter(s=>s.progress<BIOME_SEQUENCE.find(b=>b.id===discovery).from):scene.stations;
 const controller=createBridgeAwareController({branch:'primary',stations,target,vehicleId:id,levels,hazards,...controllerConfig}),tracker=createCareerRouteTracker();
 game.events();const events=[];
 while(game.state.mode==='driving'&&frames<35000){
  const state=model.state;model.setInput(controller.sample(state));hazards.update(dt,{...state,routeContext:context},true);model.step(dt);frames++;
  context=projectRoad(state.x,state.z,context);assert.equal(bridgeSupport(state,context).fall,false,name+' wheel support at '+context.progress);
  assert.equal(state.blocked,false,name+' collision at '+context.progress);assert.ok(truckInRoad(state.x,state.z,state.heading,context),name+' road containment');
  game.tickProgress(state.movingSeconds||0,{distance:state.pathDistance,active:true});tracker.update(game,{...state,routeContext:context},dt);game.drive(state.pathDistance,state.x,state.z);
  events.push(...game.events());minFuel=Math.min(minFuel,game.state.fuels[id]/performance.capacity);
  for(const station of stations)if(Math.hypot(state.x-station.x,state.z-station.z)<=station.radius)refills.add(station.id);
  if(discovery&&context.progress>=target.progress)break;
 }
 const paid=events.find(e=>e.type==='delivery');
 if(discovery){
  assert.equal(game.state.mode,'driving',name+' reaches the new biome before running out of fuel');
  assert.ok(game.state.discoveredBiomeIds.includes(discovery),name+' real discovery recorded');assert.ok(minFuel>.15,name+' at least 15% reserve');
  assert.equal(game.state.money,0);assert.equal(paid,undefined);assert.ok(game.getVehicleAvailability(VEHICLE_CONFIG.find(v=>v.specialty===discovery).id).purchasable);
  assert.ok(saved.discoveredBiomeIds.includes(discovery));game.returnToGarage('garage');assert.ok(sanitizeCareer(saved).discoveredBiomeIds.includes(discovery));
 }else if(expect==='empty'){
  assert.equal(paid,undefined);assert.equal(events.findLast(e=>e.type==='garage')?.reason,'empty');assert.equal(game.state.routeCompletion,null);assert.equal(game.isOwned('bmwreward'),false);
 }else{
  assert.ok(paid,name+' successful delivery');assert.equal(paid.checkpointId,DELIVERY_CHECKPOINTS[checkpoint-1].id);assert.ok(paid.clean);assert.equal(game.state.completedRuns,(career?.completedRuns||0)+1);
  if(checkpoint===16){assert.ok(game.state.routeCompletion);assert.equal(game.isOwned('bmwreward'),true);assert.ok(sanitizeCareer(saved).ownedVehicleIds.includes('bmwreward'));}
 }
 const result={name,id,checkpoint:checkpoint??null,discovery:discovery??null,outcome:discovery?'discovery':paid?'delivery':'empty',seconds:Math.round(frames*dt*100)/100,minFuelFraction:Math.round(minFuel*1000)/1000,baseReward:paid?.breakdown.base??0,totalReward:paid?.reward??0,hard:paid?.hard??false,controllerConfig,refills:refills.size,career:game.snapshot()};
 results.push(result);console.log('PASS '+JSON.stringify({...result,career:undefined}));return result;
}
const cases=[
 {name:'pickup-delivery',id:'pickup',checkpoint:2},
 {name:'citycourier-delivery',id:'citycourier',checkpoint:7},
 {name:'citycourier-discovery',id:'citycourier',discovery:'forest'},
 {name:'rover-delivery',id:'rover',checkpoint:9},
 {name:'foresthauler-delivery',id:'foresthauler',checkpoint:11},
 {name:'foresthauler-discovery',id:'foresthauler',discovery:'desert'},
 {name:'van-delivery',id:'van',checkpoint:12},
 {name:'desertscout-delivery',id:'desertscout',checkpoint:13},
 {name:'desertscout-discovery',id:'desertscout',discovery:'snow'},
 {name:'snowgrip-delivery',id:'snowgrip',checkpoint:14},
 {name:'snowgrip-discovery',id:'snowgrip',discovery:'volcanic'},
 {name:'snowrunner-delivery',id:'snowrunner',checkpoint:14},
 {name:'snowrunner-discovery',id:'snowrunner',discovery:'volcanic'},
 {name:'lavacrawler-delivery',id:'lavacrawler',checkpoint:15},
 {name:'lavacrawler-cannot-finish-with-tank10',id:'lavacrawler',checkpoint:16,levels:{fuel:10},expect:'empty'},
 {name:'ashhauler-finish',id:'ashhauler',checkpoint:16},
];
try{
 for(const [index,entry] of cases.entries())if((!only||entry.name===only)&&(!shard||index%shard[1]===shard[0]))journey(entry);
 if(only==='reward-bmw-repeat')journey({name:only,id:'bmwreward',checkpoint:16,career:earnedRewardCareer(),controllerConfig:{serviceSpeed:8,cruiseSpeed:24}});
 assert.ok(results.length,'at least one selected journey');
 if(!only&&results.some(r=>r.name==='ashhauler-finish')){const earned=results.find(r=>r.name==='ashhauler-finish').career;journey({name:'reward-bmw-repeat',id:'bmwreward',checkpoint:16,career:earned,controllerConfig:{serviceSpeed:8,cruiseSpeed:24}});}
 assert.deepEqual(sourceHashes(),before,'no runtime source changed during physics checks');
 if(process.env.BIOME_REPORT_PATH)fs.writeFileSync(process.env.BIOME_REPORT_PATH,JSON.stringify({generatedAt:new Date().toISOString(),runtimeHashes:before,scope:'Real production physics, hazards, refills, continuous route proof and gameplay. Input controller at20Hz; not human playtest or browser/GPU validation.',results},null,2)+'\n');
 console.log(`PASS ${results.length} biome progression journeys; runtime unchanged.`);
}finally{scene.dispose();}
