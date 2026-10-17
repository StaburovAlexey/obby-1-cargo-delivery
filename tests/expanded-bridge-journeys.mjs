#!/usr/bin/env node





import assert from 'node:assert/strict';
import {createBridgeAwareController} from './fixtures/bridge-aware-controller.mjs';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { createGarageScene } from '../dist/garage-scene.js';
import { createGameplay, GAMEPLAY } from '../dist/gameplay.js';
import { createDrivingModel, VEHICLE_DYNAMICS } from '../dist/driving-model.js';
import { createRoadHazards } from '../dist/road-hazards.js';
import { getTruckContact } from '../dist/city-driving.js';
import { roadGroundGradient, roadGroundSurface } from '../dist/driving-ground.js';
import { projectRoad, routePointAtDistance, routePointAtProgress, routeDistanceAt, truckInRoad, BIOMES, ROUTE_LENGTH } from '../dist/road-layout.js';
import { VEHICLE_CONFIG, DELIVERY_CHECKPOINTS, vehicleConfig } from '../dist/economy-config.js';
import { getVehiclePerformance, getUpgradeOffer, getUpgradeModifiers } from '../dist/vehicle-upgrades.js';
import { biomeSurfaceAt } from '../dist/biome-surfaces.js';
import { graphBranch } from './fixtures/network-route-controller.mjs';
import { BRIDGES, bridgeAtProgress, bridgeSupport } from '../dist/road-bridges.js';
import {freshCareer} from '../dist/career-save.js';
import {calculateDeliveryReward} from '../dist/career-missions.js';
import {createCareerRouteTracker,HARD_BRANCHES} from '../dist/career-route-tracker.js';
const geometryOnly=process.argv.includes('--geometry-only');
const mastery=false;
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);
const expectedBridgeCount=Number(process.argv.find(a=>a.startsWith('--expected-bridges='))?.split('=')[1])||25;
const bridgeControl={speed:Number(process.argv.find(a=>a.startsWith('--bridge-speed='))?.split('=')[1])||8,approach:Number(process.argv.find(a=>a.startsWith('--bridge-approach='))?.split('=')[1])||80,exit:Number(process.argv.find(a=>a.startsWith('--bridge-exit='))?.split('=')[1])||15};
const moverSpeed=Number(process.argv.find(a=>a.startsWith('--mover-speed='))?.split('=')[1])||8;
const MAX={speed:10,handling:10,grip:10,fuel:10}, quick=process.argv.includes('--quick'), round=n=>Math.round(n*1000)/1000;
const ROOT=new URL('../',import.meta.url).pathname;
const g=createGarageScene(THREE,{group:new THREE.Group()}), sourceFiles=fs.readdirSync(ROOT+'/dist').filter(f=>f.endsWith('.js')).sort();
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,createHash('sha256').update(fs.readFileSync(ROOT+'/dist/'+f)).digest('hex')]));
const report={generatedAt:new Date().toISOString(),scope:'Offline production physics and gameplay, actual XZ pathDistance fuel, real refills, every-frame bridgeSupport checks, shifted-deck steering, held/released pedal only, 3D route lengths reported separately. No browser/rendering/human playtest claim.',runtimeHashes:hashes(),routeLength3D:ROUTE_LENGTH,checks:[],failures:[],complete:false};
const outputDir=process.argv.find(a=>a.startsWith('--output-dir='))?.slice(13)||ROOT+'/qa/current-route-calibration';fs.mkdirSync(outputDir,{recursive:true});
const selection=process.argv.find(a=>a.startsWith('--set='))?.slice(6)||'approved-controls';
const reportPath=outputDir+'/journeys-'+selection+'.json';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};

const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
function runJourney({id='pickup',max=false,target=2,expect='delivery',slalom=false,branch='primary',levelOverride=null}){
 const spec=vehicleConfig(id),levels=levelOverride??(max?MAX:{}),performance=getVehiclePerformance(id,levels),delivery=g.deliveries[target-1];
 const gameplay=createGameplay({vehicles:g.vehicles,stations:g.stations,deliveries:g.deliveries,hardBranches:HARD_BRANCHES,career:{...freshCareer(),ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),upgrades:{[id]:levels}}});
 assert.equal(gameplay.enter(id),true);let context=projectRoad(GAMEPLAY.roadSpawn.x,GAMEPLAY.roadSpawn.z),frames=0,travel=0,travel3D=0,fuelDemand=0,carefulPedalFrames=0,maxOffset=0,maxStep=0,refills=new Set(),crossedBridges=new Set(),events=[],endingFuel=null;
 const hazards=geometryOnly?{hazards:[],update(){},contact(){},surfaceAt(x,z,s){return s;}}:createRoadHazards(42),model=createDrivingModel({...GAMEPLAY.roadSpawn,vehicleId:id,maxSpeed:spec.maxSpeed,getUpgrades:()=>levels,
  contact:(x,z,h)=>{if(bridgeAtProgress(projectRoad(x,z,context).progress))return null;const a=getTruckContact(x,z,h,[],context),b=hazards.contact(x,z,h);return !a?b:!b||a.depth>=b.depth?a:b;},
  groundGradient:(x,z)=>{context=projectRoad(x,z,context);return roadGroundGradient(x,z,context);},
  groundSurface:(x,z,v)=>hazards.surfaceAt(x,z,roadGroundSurface(x,z,v,context))});
 const timingBreakdown=Object.fromEntries(['bridge-deck','bridge-approach','unsuitable-terrain','moving-obstacle-approach','service-approach','cruise'].map(key=>[key,{seconds:0,distance:0}]));
 const tracker=createCareerRouteTracker(),recordedBridges=[],recordedHardBranches=[],originalRecord=gameplay.recordBridgeCrossing,originalHard=gameplay.recordHardBranch;
 gameplay.recordBridgeCrossing=input=>{const accepted=originalRecord(input);if(accepted)recordedBridges.push(input.bridgeId);return accepted;};
 gameplay.recordHardBranch=input=>{const accepted=originalHard(input);if(accepted)recordedHardBranches.push(input.forkId);return accepted;};
 const controller=createBridgeAwareController({branch,stations:g.stations,target:delivery,vehicleId:id,levels,hazards,bridgeControl,moverSpeed}),dt=.05;
 gameplay.events();
 while(gameplay.state.mode==='driving'&&frames<120000){
  const state=model.state,input=controller.sample(state),before={x:state.x,z:state.z,h:context.height,fuel:gameplay.state.fuels[id]};


  if(slalom&&!BRIDGES.some(b=>Math.abs(context.progress-(b.from+b.to)/2)<140)&&!g.stations.some(s=>Math.abs(context.distance-s.distance)<70))input.steering+=.12*Math.sin(frames*dt*1.8);
  if(input.carefulPedal)carefulPedalFrames++;
  model.setInput(input);hazards.update(dt,{...state,routeContext:context},true);model.step(dt);frames++;
  context=projectRoad(state.x,state.z,context);const support=bridgeSupport(state,context);assert.equal(support.fall,false,`Unsupported wheel ${id}/${support.bridge?.id} at ${round(context.progress)}, lateral ${round(context.offset)}`);if(support.bridge)crossedBridges.add(support.bridge.id);const displacement=Math.hypot(state.x-before.x,state.z-before.z);
  assert.ok(displacement<=performance.maxSpeed*dt+.21,'bounded real motion');assert.ok(state.pathDistance+1e-8>=displacement,'pathDistance includes resolved motion');
  assert.equal(state.blocked,false,`Collision ${id} at ${round(context.progress)}, offset ${round(context.offset)}, speed ${round(state.speed)}, heading ${round(state.heading)}`);assert.ok(truckInRoad(state.x,state.z,state.heading,context),'inside road');
  timingBreakdown[input.timingCategory].seconds+=dt;timingBreakdown[input.timingCategory].distance+=state.pathDistance;
  travel+=state.pathDistance;travel3D+=Math.hypot(state.pathDistance,context.height-before.h);maxOffset=Math.max(maxOffset,Math.abs(context.offset));maxStep=Math.max(maxStep,displacement);
  const multiplier=biomeSurfaceAt(context.progress,id).fuelFactor,demand=state.pathDistance*spec.consumption*multiplier;fuelDemand+=demand;
  gameplay.tickProgress(state.movingSeconds||0,{distance:state.pathDistance,active:true});tracker.update(gameplay,{...state,routeContext:context},dt);endingFuel=Math.max(0,before.fuel-demand);gameplay.drive(state.pathDistance,state.x,state.z);events.push(...gameplay.events());
  if(gameplay.state.mode==='driving'){
   const station=g.stations.find(s=>Math.hypot(state.x-s.x,state.z-s.z)<=s.radius);
   if(station){refills.add(station.id);assert.equal(gameplay.state.fuels[id],performance.capacity,'refill reaches upgraded capacity');}
   else assert.ok(Math.abs(gameplay.state.fuels[id]-(before.fuel-demand))<1e-7,'distance × consumption × biome fuel accounting');
  }
 }
 assert.equal(gameplay.state.mode,'walking',`Timed out ${id} at ${context.progress}`);
 const delivered=events.find(e=>e.type==='delivery'),end=events.findLast(e=>e.type==='garage'),outcome=delivered?'delivery':end?.reason;
 if(expect==='observe')assert.ok(outcome==='delivery'||outcome==='empty','Observed delivery or fuel-limited outcome');else assert.equal(outcome,expect,`${id} ${max?'max10':'stock'} target${target} ended ${outcome} at${context.progress}`);
 if(delivered){
  assert.equal(delivered.id,delivery.id);
  const expectedReward=calculateDeliveryReward(delivery.reward,{clean:true,hard:recordedHardBranches.length>0,first:true});
  assert.deepEqual(delivered.breakdown,expectedReward);assert.equal(gameplay.state.money,expectedReward.totalCash);
  const passedBridges=BRIDGES.filter(b=>b.to+3<context.progress).map(b=>b.id);
  assert.deepEqual([...recordedBridges].sort(),passedBridges.sort(),'all actual full bridge crossings receive valid telemetry');
  if(target===16)assert.equal(recordedBridges.length,expectedBridgeCount,'final route traverses every expected bridge');
 }else assert.equal(gameplay.state.money,0);
 assert.equal(refills.size,target-1,'every prior service circle reached');
 return {id,upgrade:levelOverride?JSON.stringify(levelOverride):max?'max10':'stock',target,expect,outcome,branch,slalom,carefulPedalFrames,frames,seconds:round(frames*dt),travelXZ:round(travel),travel3D:round(travel3D),fuelDemand:round(fuelDemand),refills:[...refills],crossedBridges:[...crossedBridges],finalProgress:round(context.progress),finalDistance3D:round(context.distance),maxOffset:round(maxOffset),maxStep:round(maxStep),range:performance.range,capacity:performance.capacity,endingFuel:round(endingFuel),brainsEarned:round(gameplay.state.brains),timingBreakdown:Object.fromEntries(Object.entries(timingBreakdown).map(([key,value])=>[key,{seconds:round(value.seconds),distance:round(value.distance),averageSpeed:round(value.distance/(value.seconds||1)),overheadVersusFlatMax:round(value.seconds-value.distance/performance.maxSpeed)}])),maxSpeed:performance.maxSpeed,avoidanceFrames:controller.avoidanceFrames,avoidedObstacleIds:controller.obstacleIds,reward:delivery.reward,totalReward:gameplay.state.money,rewardBreakdown:delivered?.breakdown??null,recordedBridges,recordedHardBranches,fuelReserveMetres:round(endingFuel/(spec.consumption*biomeSurfaceAt(context.progress,id).fuelFactor))};
}

report.sourceCommit='working-tree';
report.harnessSource='tests/expanded-bridge-journeys.mjs';
report.harnessSourceHash=createHash('sha256').update(fs.readFileSync(ROOT+'/tests/expanded-bridge-journeys.mjs')).digest('hex');
report.expectedBridgeCount=expectedBridgeCount;report.bridgeControl=bridgeControl;report.moverControl={speed:moverSpeed};report.frameSeconds=.05;
report.physicsFixedStep=VEHICLE_DYNAMICS.fixedStep;
report.routeFingerprint=createHash('sha256').update(JSON.stringify(Object.fromEntries(['route-network-config.js','route-network.js','road-bridges.js'].map(f=>[f,report.runtimeHashes[f]])))).digest('hex');
report.stations=g.deliveries.map((d,i)=>({stop:i+1,deliveryId:d.id,fuelId:g.stations[i].id,progress:d.progress,distance3D:round(d.distance),reward:d.reward,biome:d.biome,deliveryCenter:{x:round(d.x),z:round(d.z)},fuelCenter:{x:round(g.stations[i].x),z:round(g.stations[i].z)},radius:d.radius}));
report.bridges=BRIDGES;
report.assumptions={driver:'Deterministic clean bridge-aware controller, not fastest possible or human-play timing. Holds/releases ordinary pedal only; uses the recorded bridgeControl target/approach/exit, about 4 m/s on unsuitable terrain and the recorded moverControl.speed near crossing obstacles. Predicts full-width mover phase and chooses the opposite side through the body crossing interval, using the shared runtime clock without mutating it. No pose/speed/fuel injection. This controller is not an optimal or human driver.',refills:'Free and instantaneous when the actual vehicle centre enters each prior right-hand 4.4 m fuel circle; every prior station required by the harness. No dwell time added. Successful delivery to the left-hand circle instantly pays and returns to hangar.',restart:'Driving-only timing excludes garage walking, cooldown, car purchase, menus and reload. Cash/min shown separately with assumed 0, 5, 10 and 20 seconds of restart overhead per run. Those overheads are sensitivities, not measurements.',upgrades:'Stock means all levels 0; max10 means all four stats level 10 already owned. Does not charge time or brains to buy upgrades, and does not assert an optimal purchase plan.',failures:'All reported successful rates assume no missed refills, collision or bridge fall. Real learning and mistakes are unmeasured. Late failed runs pay zero, so real long-route yield can be substantially lower.',reward:'One endpoint payout per run, with production clean/hard/first bonuses and route tracker. reward stores base for budget compatibility; totalReward is actual payout. Each run starts a fresh career with owned vehicles/upgrades as test setup; purchase acquisition is excluded.',scope:'Offline CPU production modules at 20 Hz controller update and 120 Hz fixed physics. No browser/GPU/rendering or human playtest claim.'};
report.scope=report.assumptions.scope;
if(geometryOnly){report.geometryOnly=true;report.scope='GEOMETRY-ONLY: production input-driven physics,25bridges,terrain,fuel and real service circles. Static and moving hazards deliberately absent from this test harness. Not a complete-obstacle journey or human/browser/GPU test.';report.assumptions.obstacles='Disabled only in isolated test harness; candidate runtime hazard files unchanged. Result cannot validate obstacle placement, collision or moving-hazard timing.';}
function check(name,args){
 const begin=Date.now();
 try{const result=runJourney(args);result.cashPerMinute=Object.fromEntries([0,5,10,20].map(overhead=>[overhead+'sRestart',round(result.totalReward*60/(result.seconds+overhead))]));report.checks.push({name,passed:true,...result});console.log(JSON.stringify({name,passed:true,wallSeconds:(Date.now()-begin)/1000,...result}));}
 catch(e){report.failures.push({name,args,error:e.stack});console.error('FAIL',name,e.stack);}
 save();
}
assert.equal(BRIDGES.length,expectedBridgeCount,'Require expected frozen bridge set');
const finalRuns=[
 ['final ashhauler max10 primary',{id:'ashhauler',max:true,target:16,branch:'primary'}],
 ['final ashhauler max10 alternate',{id:'ashhauler',max:true,target:16,branch:'alternate'}],
 ['final ashhauler tank10 other stats0 primary',{id:'ashhauler',target:16,branch:'primary',levelOverride:{speed:0,handling:0,grip:0,fuel:10}}],
 ['final ashhauler tank10 other stats0 alternate',{id:'ashhauler',target:16,branch:'alternate',levelOverride:{speed:0,handling:0,grip:0,fuel:10}}],
];
const stockTargets={pickup:2,citycourier:3,van:6,snowgrip:9,snowrunner:12,lavacrawler:13,ashhauler:15};
const stockRuns=Object.entries(stockTargets).map(([id,target])=>['endpoint '+id+' stock',{id,target,expect:id==='snowrunner'?'observe':'delivery',branch:VEHICLE_CONFIG.findIndex(v=>v.id===id)%2?'alternate':'primary'}]);
const typicalTargets={pickup:3,citycourier:4,van:7,snowgrip:10,snowrunner:13,lavacrawler:15,ashhauler:16};
const typicalRuns=Object.entries(typicalTargets).map(([id,target])=>['typical '+id+' tank10 other stats3',{id,target,branch:VEHICLE_CONFIG.findIndex(v=>v.id===id)%2?'alternate':'primary',levelOverride:{speed:3,handling:3,grip:3,fuel:10}}]);
const starterRuns=[['starter fuel-limit failure',{id:'pickup',target:3,expect:'empty'}],['starter modest slalom',{id:'pickup',target:2,slalom:true}]];
const careerStockTargets={pickup:2,citycourier:4,rover:7,foresthauler:9,van:11,desertscout:12,snowgrip:12,snowrunner:13,lavacrawler:14,ashhauler:15};
const careerStock=Object.entries(careerStockTargets).map(([id,target])=>['endpoint '+id+' stock',{id,target,branch:VEHICLE_CONFIG.findIndex(v=>v.id===id)%2?'alternate':'primary'}]);
const careerComfortTargets={rover:9,van:12,snowgrip:13,snowrunner:14,lavacrawler:15,ashhauler:16};
const careerComfort=Object.entries(careerComfortTargets).map(([id,target])=>['typical '+id+' tank10 other stats3',{id,target,branch:VEHICLE_CONFIG.findIndex(v=>v.id===id)%2?'alternate':'primary',levelOverride:{speed:3,handling:3,grip:3,fuel:10}}]);
const approvedControls=[finalRuns[0],finalRuns[2],['final ashhauler max-other tank9 primary',{id:'ashhauler',target:16,branch:'primary',levelOverride:{speed:10,handling:10,grip:10,fuel:9},expect:'empty'}],stockRuns[0],starterRuns[0]];
const lateProgression=[['snowgrip',13],['snowrunner',14],['lavacrawler',15]].flatMap(([id,target])=>[
 ['late '+id+' stock next-stop boundary',{id,target,branch:'primary',expect:'empty'}],
 ['late '+id+' tank1 other0 reaches next stop',{id,target,branch:'primary',levelOverride:{speed:0,handling:0,grip:0,fuel:1}}],
]);
const runs=selection==='starter'?[stockRuns[0],...starterRuns]:selection==='final-alternate'?[finalRuns[1]]:selection==='van-small-tank'?[['van tank3 other0 reaches stop12',{id:'van',target:12,branch:'primary',levelOverride:{speed:0,handling:0,grip:0,fuel:3}}]]:selection==='approved-controls'?approvedControls:selection==='late-progression'?lateProgression:selection==='career-stock'?careerStock:selection==='career-typical'?careerComfort:selection==='career-short'?[['farm citycourier stock stop3',{id:'citycourier',target:3,branch:'alternate'}]]:selection==='tank9'?[['final ashhauler max-other tank9 primary',{id:'ashhauler',target:16,branch:'primary',levelOverride:{speed:10,handling:10,grip:10,fuel:9},expect:'empty'}]]:selection==='candidate'?[finalRuns[0],finalRuns[2],stockRuns[0],starterRuns[0]]:['breakdown','bridge8','bridge10'].includes(selection)?[finalRuns[0]]:selection==='final'?finalRuns:selection==='stock'?[...stockRuns,...starterRuns]:selection==='typical'?typicalRuns:[...finalRuns,...stockRuns,...typicalRuns,...starterRuns];
for(const [name,args]of runs)check(name,args);
report.completedAt=new Date().toISOString();report.complete=true;report.runtimeHashesAtEnd=hashes();report.changedRuntimeFiles=sourceFiles.filter(f=>report.runtimeHashes[f]!==report.runtimeHashesAtEnd[f]);report.ignoredDependencies=geometryOnly?['road-hazards.js','road-hazards-scene.js']:[];report.changedRelevantRuntimeFiles=report.changedRuntimeFiles.filter(f=>!report.ignoredDependencies.includes(f));report.passed=report.failures.length===0&&report.changedRelevantRuntimeFiles.length===0;save();g.dispose();console.log(`Calibration ${report.checks.length} passed, ${report.failures.length} failed; changed runtime: ${report.changedRuntimeFiles.join(',')||'none'}`);process.exitCode=report.passed?0:1;
