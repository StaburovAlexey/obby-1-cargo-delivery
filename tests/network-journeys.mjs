#!/usr/bin/env node
// Actual production Three.js, garage/checkpoint descriptors, driving forces,
// graph/union contacts, triangle ground, hazard state and persistent economy.
// No browser/renderer claims; no successful-route pose or fuel injection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import { createGarageScene } from '../dist/garage-scene.js';
import { createGameplay,GAMEPLAY } from '../dist/gameplay.js';
import { createDrivingModel,VEHICLE_DYNAMICS } from '../dist/driving-model.js';
import { createCareerStore } from '../dist/career-save.js';
import { createRoadHazards } from '../dist/road-hazards.js';
import { getTruckContact,fitTruckToGround } from '../dist/city-driving.js';
import { roadGroundGradient,roadGroundSurface } from '../dist/driving-ground.js';
import { ROUTE,ROUTE_LENGTH,FORKS,BIOMES,projectRoad,routePointAtProgress,truckInRoad } from '../dist/road-layout.js';
import { ECONOMY_CONFIG,VEHICLE_CONFIG,DELIVERY_CHECKPOINTS,vehicleConfig } from '../dist/economy-config.js';
import { getVehiclePerformance } from '../dist/vehicle-upgrades.js';
import { createNetworkRouteController,graphBranch } from './fixtures/network-route-controller.mjs';

export const MAX_LEVELS=Object.freeze({speed:3,handling:3,grip:3,fuel:3});
const round=n=>Math.round(n*1000)/1000;
const outDir=new URL('../qa/network-journeys/',import.meta.url);
const sourceFiles=['route-network.js','route-network-config.js','road-layout.js','driving-ground.js','driving-model.js','city-driving.js','gameplay.js','economy-config.js','vehicle-upgrades.js','biome-surfaces.js','road-hazards.js','garage-scene.js','app.js','network-scene.js','road-hazards-scene.js','wheel-particles.js'];
const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(new URL('../dist/'+file,import.meta.url))).digest('hex')]));
const thinEvent=e=>Object.fromEntries(Object.entries(e).filter(([key])=>key!=='runId'));
let garage;
function fixtures(){return garage??=createGarageScene(THREE,{group:new THREE.Group()});}
function expectedTarget(id,levels){let previous=0,index=-1;for(const [i,c] of DELIVERY_CHECKPOINTS.entries()){if(c.distance-previous>getVehiclePerformance(id,levels).range)break;previous=c.distance;index=i;}return index;}

export function driveNetworkJourney({id='pickup',branch='primary',levels={},targetIndex=0,dt=.05,expect='delivery',limitSeconds=4000,finish=false}={}) {
  const g=fixtures(),spec=vehicleConfig(id),performance=getVehiclePerformance(id,levels),target=finish?{id:'route-finish',progress:ROUTE.end-8,distance:ROUTE_LENGTH-8}:g.deliveries[targetIndex];
  assert.ok(target,`Missing checkpoint ${targetIndex}`);
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const persistence=createCareerStore({storage});
  const career={version:ECONOMY_CONFIG.saveVersion,money:0,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),characterId:'bacon',completedRuns:0,upgrades:Object.fromEntries(VEHICLE_CONFIG.map(v=>[v.id,{...levels}]))};
  const gameplay=createGameplay({vehicles:g.vehicles,stations:g.stations,deliveries:g.deliveries,career,persistence});
  assert.equal(gameplay.enter(id),true);
  const runId=gameplay.state.run.id,hazards=createRoadHazards(42);
  let context=projectRoad(GAMEPLAY.roadSpawn.x,GAMEPLAY.roadSpawn.z);
  const model=createDrivingModel({...GAMEPLAY.roadSpawn,vehicleId:id,maxSpeed:spec.maxSpeed,getUpgrades:()=>gameplay.state.upgrades[id],
    contact:(x,z,h)=>{const road=getTruckContact(x,z,h,[],context),obstacle=hazards.contact(x,z,h);return !road?obstacle:!obstacle||road.depth>=obstacle.depth?road:obstacle;},
    groundGradient:(x,z)=>{context=projectRoad(x,z,context);return roadGroundGradient(x,z,context);},
    groundSurface:(x,z,vehicleId)=>hazards.surfaceAt(x,z,roadGroundSurface(x,z,vehicleId,context)),
  });
  const control=createNetworkRouteController({branch,stations:g.stations,target:finish?undefined:target,vehicleId:id,levels,hazards});
  const stations=new Set(),biomes=new Set(),edges=new Set(),forks=new Set(),events=[],gaps=[],trace=[];
  let frames=0,totalTravel=0,lastRefillTravel=0,lastRefillId='spawn',lastProgress=0,maxStep=0,maxOffset=0,minClearance=Infinity,maxHeight=-Infinity,minHeight=Infinity,blocked=0,previousStation=null;
  gameplay.events();
  while(gameplay.state.mode==='driving'&&frames*dt<limitSeconds){
    const state=model.state,input=control.sample(state),before={x:state.x,z:state.z},beforeFuel=gameplay.state.fuels[id];
    model.setInput(input);
    hazards.update(dt,{...state,routeContext:context},true);
    model.step(dt);frames++;
    const step=Math.hypot(state.x-before.x,state.z-before.z);
    totalTravel+=state.pathDistance;maxStep=Math.max(maxStep,step);
    assert.ok(step<=(performance.maxSpeed+2)*Math.min(dt,.1)+.01,`Unphysical pose step ${step}`);
    assert.ok(state.pathDistance+1e-8>=step,'Travel includes full contact-resolved path');
    context=projectRoad(state.x,state.z,context);
    assert.ok(context.progress>=lastProgress-.05,`${id} reversed progress at ${context.progress}`);
    assert.ok(context.progress-lastProgress<(performance.maxSpeed+3)*Math.min(dt,.1)+.5,'No graph progress jump');
    lastProgress=context.progress;
    assert.ok(truckInRoad(state.x,state.z,state.heading,context),`${id} left road at ${context.progress}`);
    if(state.blocked)blocked++;
    assert.equal(blocked,0,`${id} collided at ${round(context.progress)} on ${context.edgeId}`);
    maxOffset=Math.max(maxOffset,Math.abs(context.offset));biomes.add(context.biome);edges.add(context.edgeId);
    for(const fork of FORKS)if(context.progress>fork.from+100&&context.progress<fork.to-100){assert.equal(context.branch,graphBranch(branch),`Wrong ${fork.id} route`);forks.add(fork.id);}
    if(frames%20===0){const pose=fitTruckToGround(THREE,state.x,state.z,state.heading,context);assert.ok(pose.quaternion.toArray().every(Number.isFinite));const clearance=Math.min(...pose.clearances);assert.ok(clearance>=.01199,'Actual wheel ground clearance');minClearance=Math.min(minClearance,clearance);maxHeight=Math.max(maxHeight,pose.position.y);minHeight=Math.min(minHeight,pose.position.y);}
    gameplay.tickProgress(state.movingSeconds,{distance:state.pathDistance,active:true});
    gameplay.drive(state.pathDistance,state.x,state.z);
    const newEvents=gameplay.events();events.push(...newEvents.map(thinEvent));
    const activeStation=gameplay.state.mode==='driving'?g.stations.find(s=>Math.hypot(state.x-s.x,state.z-s.z)<=s.radius)?.id:null;
    const afterFuel=gameplay.state.fuels[id];
    if(activeStation){
      assert.equal(afterFuel,performance.capacity,'Real station refills the upgraded/stock tank');
      if(activeStation!==previousStation){stations.add(activeStation);gaps.push({from:lastRefillId,to:activeStation,travel:round(totalTravel-lastRefillTravel),fuelOnEntry:round(beforeFuel-state.pathDistance*spec.consumption),range:round(performance.range)});}
      lastRefillId=activeStation;lastRefillTravel=totalTravel;
    }else if(gameplay.state.mode==='driving')assert.ok(Math.abs(afterFuel-(beforeFuel-state.pathDistance*spec.consumption))<1e-8,'Actual base consumption per travelled metre');
    previousStation=activeStation;
    if(gameplay.state.mode==='driving'){assert.equal(gameplay.state.money,0,'Refilling never pays');assert.equal(gameplay.state.run.id,runId);assert.equal(gameplay.state.run.loaded,true);}
    if(frames%200===0||newEvents.length)trace.push({frame:frames,seconds:round(frames*dt),progress:round(context.progress),distance:round(context.distance),x:round(state.x),z:round(state.z),heading:round(state.heading),edgeId:context.edgeId,fuel:round(afterFuel),speed:round(state.speed)});
    if(finish&&context.progress>=target.progress){gameplay.returnToGarage('route-finish');events.push(...gameplay.events().map(thinEvent));break;}
  }
  assert.equal(gameplay.state.mode,'walking',`${id} timed out at progress ${round(context.progress)} / ${target.progress}`);
  const delivery=events.find(e=>e.type==='delivery'),end=events.findLast(e=>e.type==='garage');
  const outcome=delivery?'delivery':end?.reason;
  gaps.push({from:lastRefillId,to:delivery?.id||(finish?'route-finish':'fuel-empty'),travel:round(totalTravel-lastRefillTravel),range:round(performance.range)});
  const result={passed:true,id,upgrade:levels.fuel===3?'max':'stock',branch,target:target.id,targetIndex,expect,outcome,dt,frames,seconds:round(frames*dt),actualTravel:round(totalTravel),finalProgress:round(context.progress),finalDistance:round(context.distance),money:gameplay.state.money,refills:stations.size,stationIds:[...stations],biomes:[...biomes],edges:[...edges],forks:[...forks],gaps,maxStep:round(maxStep),maxOffset:round(maxOffset),minClearance:round(minClearance),heightRange:[round(minHeight),round(maxHeight)],blocked,trace};
  assert.equal(outcome,expect,`${id} ${branch} ${result.upgrade}: ${outcome} at ${round(context.progress)}, expected ${expect} at ${target.progress}; gaps ${JSON.stringify(gaps)}`);
  if(finish){assert.equal(stations.size,DELIVERY_CHECKPOINTS.length);assert.deepEqual([...biomes],BIOMES.map(b=>b.id));assert.equal(forks.size,4);}
  if(delivery){assert.equal(delivery.id,target.id);assert.equal(gameplay.state.money,target.reward);assert.equal(stations.size,targetIndex);assert.equal(gameplay.state.completedRuns,1);}
  else {assert.equal(gameplay.state.money,0);assert.equal(gameplay.state.completedRuns,0);}
  assert.equal(gameplay.state.run,null);
  for(const v of VEHICLE_CONFIG)assert.equal(gameplay.state.fuels[v.id],getVehiclePerformance(v.id,levels).capacity);
  // Repeated overlap/replayed frames cannot pay the consumed run again.
  const money=gameplay.state.money,runs=gameplay.state.completedRuns;
  for(let i=0;i<12;i++)gameplay.drive(0,model.state.x,model.state.z);
  assert.equal(gameplay.state.money,money);assert.equal(gameplay.state.completedRuns,runs);assert.equal(gameplay.events().filter(e=>e.type==='delivery').length,0);
  gameplay.flushProgress();
  const saved=JSON.parse(storage.getItem(ECONOMY_CONFIG.saveKey));
  assert.equal(saved.money,money);assert.equal(saved.completedRuns,runs);assert.equal('run' in saved,false);assert.equal('fuels' in saved,false);
  const restored=createGameplay({vehicles:g.vehicles,persistence});assert.equal(restored.state.money,money);assert.equal(restored.state.mode,'walking');assert.equal(restored.state.run,null);assert.deepEqual(restored.state.upgrades[id],gameplay.state.upgrades[id]);
  return result;
}

export async function runNetworkJourneys({upgrades=['stock','max'],branches=['primary','alternate'],ids=VEHICLE_CONFIG.map(v=>v.id),checkpoints=true,negative=true,label='all'}={}){
  assert.equal(ROUTE.end,10800);assert.equal(DELIVERY_CHECKPOINTS.length,11);assert.ok(ROUTE_LENGTH>10800);
  for(const c of DELIVERY_CHECKPOINTS){assert.ok(Number.isFinite(c.progress));const p=routePointAtProgress(c.progress);assert.ok(Math.abs(p.distance-c.distance)<1e-8);}
  const results=[],failures=[];
  const execute=options=>{try{const result=driveNetworkJourney(options);results.push(result);console.log(`PASS ${result.id} ${result.upgrade} ${result.branch} → ${result.target}: ${result.outcome}, ${result.refills} refills, ${result.actualTravel} m, ${result.frames} frames`);return result;}catch(error){failures.push({...options,error:error.stack});console.error(error.stack);return null;}};
  // The free first car must reach its very first paying delivery.
  if(checkpoints)execute({id:'pickup',targetIndex:0,dt:.05});
  for(const upgrade of upgrades)for(const [b,branch] of branches.entries())for(const id of ids){const levels=upgrade==='max'?MAX_LEVELS:{},targetIndex=expectedTarget(id,levels),dt=(b+(upgrade==='max'?1:0))%2?.1:.05;execute({id,branch,levels,targetIndex,dt});if(negative&&targetIndex<DELIVERY_CHECKPOINTS.length-1)execute({id,branch,levels,targetIndex:targetIndex+1,dt,expect:'empty'});}
  // Every payout is reached by driving from spawn; every intermediate refill
  // is therefore exercised. The final gate is already covered by the matrix.
  if(checkpoints)for(let targetIndex=1;targetIndex<DELIVERY_CHECKPOINTS.length-1;targetIndex++)execute({id:'ashhauler',targetIndex,branch:targetIndex%2?'alternate':'primary',levels:MAX_LEVELS,dt:1/20});
  const report={passed:failures.length===0,sourceHashes,rendererFree:true,actualProductionModules:true,poseMutationsAfterSpawn:0,routeLength:ROUTE_LENGTH,biomes:BIOMES.map(b=>({id:b.id,from:b.from,to:b.to})),checkpoints:DELIVERY_CHECKPOINTS,checks:results,failures};
  fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(new URL(`${label}.json`,outDir),JSON.stringify(report,null,2)+'\n');
  garage?.dispose();garage=undefined;
  console.log(`${results.length} passed, ${failures.length} failed; qa/network-journeys/${label}.json`);
  return report;
}
export function runNetworkMechanicsChecks(){
  const checks=[],failures=[];
  const attempt=(name,fn)=>{try{const detail=fn();checks.push({passed:true,name,...detail});console.log(`PASS ${name}`);}catch(error){failures.push({name,error:error.stack});console.error(error.stack);}};
  for(const branch of ['primary','alternate'])for(const levels of [{},MAX_LEVELS])attempt(`Full route ${branch} ${levels.fuel===3?'max':'stock'}`,()=>driveNetworkJourney({id:'ashhauler',branch,levels,finish:true,expect:'route-finish',dt:levels.fuel===3?.1:.05}));
  const rates=[];
  for(const dt of [1/120,1/60,.05,.1])attempt(`First reward ${round(1/dt)} FPS`,()=>{const r=driveNetworkJourney({dt,targetIndex:0});rates.push(r);return {dt,travel:r.actualTravel,money:r.money,frames:r.frames};});
  attempt('Fixed-step journey frame-rate agreement',()=>{assert.ok(Math.max(...rates.map(r=>r.actualTravel))-Math.min(...rates.map(r=>r.actualTravel))<1.2);assert.ok(rates.every(r=>r.money===DELIVERY_CHECKPOINTS[0].reward));return {maxTravelDifference:round(Math.max(...rates.map(r=>r.actualTravel))-Math.min(...rates.map(r=>r.actualTravel))),fixedStep:VEHICLE_DYNAMICS.fixedStep};});
  for(const fork of FORKS)for(const branch of ['primary','alternate'])for(const direction of [1,-1])attempt(`${fork.id} ${branch} ${direction>0?'D':'R'}`,()=>{
    const id='ashhauler',spec=vehicleConfig(id),start=routePointAtProgress(direction>0?fork.from-70:fork.to+70,{branch:graphBranch(branch)}),hazards=createRoadHazards(42);let context=projectRoad(start.x,start.z),frames=0,travel=0,chosen=false;
    const model=createDrivingModel({x:start.x,z:start.z,heading:start.heading,vehicleId:id,maxSpeed:spec.maxSpeed,
      contact:(x,z,h)=>{const a=getTruckContact(x,z,h,[],context),b=hazards.contact(x,z,h);return !a?b:!b||a.depth>=b.depth?a:b;},
      groundGradient:(x,z)=>{context=projectRoad(x,z,context);return roadGroundGradient(x,z,context);},groundSurface:(x,z)=>hazards.surfaceAt(x,z,roadGroundSurface(x,z,id,context))});
    model.setGear(direction>0?'D':'R');const controller=createNetworkRouteController({branch,vehicleId:id,hazards,direction});
    while(frames<6000){const input=controller.sample(model.state),before={x:model.state.x,z:model.state.z};model.setInput(input);hazards.update(.05,model.state,true);model.step(.05);frames++;travel+=model.state.pathDistance;context=projectRoad(model.state.x,model.state.z,context);
      assert.ok(Math.hypot(model.state.x-before.x,model.state.z-before.z)<(spec.maxSpeed+2)*.05+.01);assert.equal(model.state.blocked,false,`Collision at ${context.progress}`);assert.ok(truckInRoad(model.state.x,model.state.z,model.state.heading,context));
      if(context.progress>fork.from+100&&context.progress<fork.to-100){assert.equal(context.branch,graphBranch(branch));chosen=true;}
      if(direction>0?context.progress>fork.to+50:context.progress<fork.from-50)break;
    }
    assert.ok(frames<6000,'D/R fork traversal stalled');assert.ok(chosen);return {frames,travel:round(travel),finalProgress:round(context.progress),poseMutationsAfterStart:0};
  });
  const report={passed:failures.length===0,sourceHashes,checks,failures};fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(new URL('mechanics.json',outDir),JSON.stringify(report,null,2)+'\n');garage?.dispose();garage=undefined;return report;
}

export async function runNetworkAppJourneys(){
  const {createAppDom}=await import('./fixtures/app-dom.mjs');
  const results=[],failures=[];
  const scenarios=[{id:'pickup',targetIndex:0,branch:'primary',levels:{},frameMilliseconds:1000/15},
    ...['primary','alternate'].flatMap(branch=>[{},MAX_LEVELS].map(levels=>({id:'ashhauler',targetIndex:10,branch,levels,frameMilliseconds:100})))];
  for(const options of scenarios){let app;try{
    const {id,targetIndex,branch,levels,frameMilliseconds}=options;
    app=createAppDom({startDriving:false,career:id==='pickup'?undefined:{version:ECONOMY_CONFIG.saveVersion,money:0,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),characterId:'bacon',completedRuns:0,upgrades:Object.fromEntries(VEHICLE_CONFIG.map(v=>[v.id,{...levels}]))}});
    const d=app.debug,target=d.garage.deliveries[targetIndex];if(id==='pickup'){assert.deepEqual(d.gameplay.state.ownedVehicleIds,['pickup']);assert.equal(d.gameplay.state.money,0);}
    d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle(id),true);
    const controller=createNetworkRouteController({branch,stations:d.garage.stations,target,vehicleId:id,levels,hazards:d.roadHazards});
    let time=2000,frames=0,maxProgress=0,totalTravel=0;const stations=new Set(),biomes=new Set(),forks=new Set();app.frame(time);
    while(d.gameplay.state.mode==='driving'&&frames<40000){
      const state=d.model.state,input=controller.sample(state),before={x:state.x,z:state.z};d.model.setInput(input);app.frame(time+=frameMilliseconds);frames++;
      if(d.gameplay.state.mode!=='driving')break;
      const p=projectRoad(state.x,state.z,controller.history);maxProgress=Math.max(maxProgress,p.progress);totalTravel+=state.pathDistance;
      assert.ok(Math.hypot(state.x-before.x,state.z-before.z)<=(getVehiclePerformance(id,levels).maxSpeed+2)*.05+.01,'Actual app frame never teleports on the road');
      assert.ok(truckInRoad(state.x,state.z,state.heading,p));assert.equal(state.blocked,false,`App collision at ${p.progress}`);
      if(d.gameplay.state.stationId)stations.add(d.gameplay.state.stationId);biomes.add(app.doc.body.dataset.biome);
      for(const fork of FORKS)if(p.progress>fork.from+100&&p.progress<fork.to-100){assert.equal(p.branch,graphBranch(branch));forks.add(fork.id);}
      assert.equal(d.gameplay.state.money,0);
    }
    assert.equal(d.gameplay.state.mode,'walking');assert.equal(d.gameplay.state.money,target.reward);assert.equal(d.gameplay.state.completedRuns,1);assert.equal(stations.size,targetIndex);assert.equal(d.gameplay.state.run,null);
    assert.equal(d.input.state.active,false);assert.equal(d.lookInput.active,false);assert.ok(d.garage.vehicles.every(v=>!v.cargo.visible));
    if(id==='ashhauler'){assert.deepEqual([...biomes],BIOMES.map(b=>b.id));assert.equal(forks.size,4);}
    const money=d.gameplay.state.money;for(let i=0;i<10;i++)app.frame(time+=frameMilliseconds);assert.equal(d.gameplay.state.money,money);assert.equal(d.gameplay.state.completedRuns,1);
    const result={passed:true,id,branch,upgrade:levels.fuel===3?'max':'stock',frames,frameMilliseconds,physicsFrameCap:.05,maxProgress:round(maxProgress),actualTravel:round(totalTravel),refills:stations.size,money,biomes:[...biomes],forks:[...forks],rendererFree:true};results.push(result);console.log(`PASS actual app ${id} ${result.upgrade} ${branch}: ${money} earned, ${stations.size} refills, ${frames} frames`);
  }catch(error){failures.push({...options,error:error.stack});console.error(error.stack);}finally{app?.dispose();}}
  const report={passed:failures.length===0,sourceHashes,checks:results,failures};fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(new URL('app.json',outDir),JSON.stringify(report,null,2)+'\n');return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2);const report=args.includes('--mechanics')?runNetworkMechanicsChecks():args.includes('--app')?await runNetworkAppJourneys():await runNetworkJourneys({...(args.includes('--quick')?{ids:['pickup','ashhauler'],checkpoints:false,negative:false}:{}),...(args.includes('--stock')?{upgrades:['stock'],checkpoints:false}:{}),...(args.includes('--max')?{upgrades:['max'],checkpoints:false}:{}),label:args.includes('--quick')?'quick':args.includes('--stock')?'stock':args.includes('--max')?'max':'all'});process.exitCode=report.passed?0:1;}
