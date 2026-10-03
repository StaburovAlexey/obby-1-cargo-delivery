#!/usr/bin/env node
/** Independent balance review. Production solver + gameplay + actual service
 * circles. Only steering/throttle inputs after spawn; no fuel/pose injection.
 * --quick covers the starter pass/fail/upgrade, slalom and biome fuel tests.
 * Default also checks all ten stock/max maximum delivery routes. */
import assert from 'node:assert/strict';
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
const mastery=process.argv.includes('--mastery');
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);
const MAX={speed:10,handling:10,grip:10,fuel:10}, quick=process.argv.includes('--quick'), round=n=>Math.round(n*1000)/1000;
const g=createGarageScene(THREE,{group:new THREE.Group()}), sourceFiles=['economy-config.js','vehicle-upgrades.js','biome-surfaces.js','gameplay.js','driving-model.js','route-network.js','route-network-config.js','road-bridges.js'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL('../dist/'+f,import.meta.url))).digest('hex')]));
const report={generatedAt:new Date().toISOString(),scope:'Offline production physics and gameplay, actual XZ pathDistance fuel, real refills, every-frame bridgeSupport checks, shifted-deck steering, held/released pedal only, 3D route lengths reported separately. No browser/rendering/human playtest claim.',runtimeHashes:hashes(),routeLength3D:ROUTE_LENGTH,checks:[],failures:[],complete:false};
const reportPath=new URL('../qa/expanded-balance'+(mastery?'-mastery':quick?'-quick':only?'-'+only:'')+'.json',import.meta.url);
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function createBridgeAwareController({branch,stations,target,vehicleId,levels,hazards}){
 let history;
 return {sample(state){
  history=projectRoad(state.x,state.z,history);
  const distance=history.distance+12+Math.abs(state.speed)*.65,next=routePointAtDistance(distance,{branch:graphBranch(branch)});
  let offset=0;
  for(const station of stations){if(station.distance>=target.distance)break;offset=Math.max(offset,8*smooth((95-Math.abs(distance-station.distance))/45));}
  offset-=8*smooth((distance-(target.distance-95))/50);
  for(const b of BRIDGES){const q=next.progress;if(q<b.from-80||q>b.to+100)continue;
   const weight=q<b.from-20?smooth((q-(b.from-80))/60):q<=b.to+20?1:1-smooth((q-(b.to+20))/80);
   offset=offset*(1-weight)+b.offset*weight;
  }
  const dx=next.x+offset*next.right.x-state.x,dz=next.z+offset*next.right.z-state.z,desired=Math.atan2(-dx,-dz);
  const error=Math.atan2(Math.sin(desired-state.heading),Math.cos(desired-state.heading)),wheel=Math.atan(2*3.2*Math.sin(error)/Math.max(1,Math.hypot(dx,dz)));
  const surface=hazards.surfaceAt(state.x,state.z,roadGroundSurface(state.x,state.z,vehicleId,history)),grip=Math.sqrt(Math.min(1,surface.frictionFactor*(surface.longitudinalGripFactor||1)*getUpgradeModifiers(levels).grip));
  const response=Math.min(1,Math.abs(wheel)*(1+(state.linearSpeed/(grip*VEHICLE_DYNAMICS.steeringSpeedScale))**2)/.48),magnitude=(-.55+Math.sqrt(.55*.55+1.8*response))/.9;
  const nearBridge=BRIDGES.some(b=>history.progress>b.from-120&&history.progress<b.to+30);
  const futureUnsupported=biomeSurfaceAt(history.progress+350,vehicleId).handlingFactor<.99;
  const desiredSpeed=nearBridge?4:futureUnsupported?4:Infinity;
  return {active:Math.abs(state.speed)<desiredSpeed,steering:-Math.sign(wheel)*(.08+.92*magnitude),carefulPedal:Number.isFinite(desiredSpeed)};
 }};
}
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
function runJourney({id='pickup',max=false,target=2,expect='delivery',slalom=false,branch='primary',levelOverride=null}){
 const spec=vehicleConfig(id),levels=levelOverride??(max?MAX:{}),performance=getVehiclePerformance(id,levels),delivery=g.deliveries[target-1];
 const gameplay=createGameplay({vehicles:g.vehicles,stations:g.stations,deliveries:g.deliveries,career:{version:2,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),upgrades:{[id]:levels}}});
 assert.equal(gameplay.enter(id),true);let context=projectRoad(GAMEPLAY.roadSpawn.x,GAMEPLAY.roadSpawn.z),frames=0,travel=0,travel3D=0,fuelDemand=0,carefulPedalFrames=0,maxOffset=0,maxStep=0,refills=new Set(),crossedBridges=new Set(),events=[];
 const hazards=createRoadHazards(42),model=createDrivingModel({...GAMEPLAY.roadSpawn,vehicleId:id,maxSpeed:spec.maxSpeed,getUpgrades:()=>levels,
  contact:(x,z,h)=>{if(bridgeAtProgress(projectRoad(x,z,context).progress))return null;const a=getTruckContact(x,z,h,[],context),b=hazards.contact(x,z,h);return !a?b:!b||a.depth>=b.depth?a:b;},
  groundGradient:(x,z)=>{context=projectRoad(x,z,context);return roadGroundGradient(x,z,context);},
  groundSurface:(x,z,v)=>hazards.surfaceAt(x,z,roadGroundSurface(x,z,v,context))});
 const controller=createBridgeAwareController({branch,stations:g.stations,target:delivery,vehicleId:id,levels,hazards}),dt=.1;
 gameplay.events();
 while(gameplay.state.mode==='driving'&&frames<60000){
  const state=model.state,input=controller.sample(state),before={x:state.x,z:state.z,h:context.height,fuel:gameplay.state.fuels[id]};
  // Small real steering oscillation away from service circles. This consumes
  // additional measured path length rather than synthetic graph progress.
  if(slalom&&!BRIDGES.some(b=>Math.abs(context.progress-(b.from+b.to)/2)<140)&&!g.stations.some(s=>Math.abs(context.distance-s.distance)<70))input.steering+=.12*Math.sin(frames*dt*1.8);
  if(input.carefulPedal)carefulPedalFrames++;
  model.setInput(input);hazards.update(dt,{...state,routeContext:context},true);model.step(dt);frames++;
  context=projectRoad(state.x,state.z,context);const support=bridgeSupport(state,context);assert.equal(support.fall,false,`Unsupported wheel ${id}/${support.bridge?.id} at ${round(context.progress)}, lateral ${round(context.offset)}`);if(support.bridge)crossedBridges.add(support.bridge.id);const displacement=Math.hypot(state.x-before.x,state.z-before.z);
  assert.ok(displacement<=performance.maxSpeed*dt+.21,'bounded real motion');assert.ok(state.pathDistance+1e-8>=displacement,'pathDistance includes resolved motion');
  assert.equal(state.blocked,false,`Collision ${id} at ${round(context.progress)}, offset ${round(context.offset)}, speed ${round(state.speed)}, heading ${round(state.heading)}`);assert.ok(truckInRoad(state.x,state.z,state.heading,context),'inside road');
  travel+=state.pathDistance;travel3D+=Math.hypot(state.pathDistance,context.height-before.h);maxOffset=Math.max(maxOffset,Math.abs(context.offset));maxStep=Math.max(maxStep,displacement);
  const multiplier=biomeSurfaceAt(context.progress,id).fuelFactor,demand=state.pathDistance*spec.consumption*multiplier;fuelDemand+=demand;
  gameplay.drive(state.pathDistance,state.x,state.z);events.push(...gameplay.events());
  if(gameplay.state.mode==='driving'){
   const station=g.stations.find(s=>Math.hypot(state.x-s.x,state.z-s.z)<=s.radius);
   if(station){refills.add(station.id);assert.equal(gameplay.state.fuels[id],performance.capacity,'refill reaches upgraded capacity');}
   else assert.ok(Math.abs(gameplay.state.fuels[id]-(before.fuel-demand))<1e-7,'distance × consumption × biome fuel accounting');
  }
 }
 assert.equal(gameplay.state.mode,'walking',`Timed out ${id} at ${context.progress}`);
 const delivered=events.find(e=>e.type==='delivery'),end=events.findLast(e=>e.type==='garage'),outcome=delivered?'delivery':end?.reason;
 assert.equal(outcome,expect,`${id} ${max?'max10':'stock'} target${target} ended ${outcome} at${context.progress}`);
 if(delivered){assert.equal(delivered.id,delivery.id);assert.equal(gameplay.state.money,delivery.reward);}else assert.equal(gameplay.state.money,0);
 assert.equal(refills.size,target-1,'every prior service circle reached');
 return {id,upgrade:levelOverride?JSON.stringify(levelOverride):max?'max10':'stock',target,expect,outcome,branch,slalom,carefulPedalFrames,frames,seconds:round(frames*dt),travelXZ:round(travel),travel3D:round(travel3D),fuelDemand:round(fuelDemand),refills:[...refills],crossedBridges:[...crossedBridges],finalProgress:round(context.progress),finalDistance3D:round(context.distance),maxOffset:round(maxOffset),maxStep:round(maxStep),range:performance.range,reward:gameplay.state.money};
}
function check(name,fn){if(mastery&&!name.includes('stock0'))return;try{const result=fn();report.checks.push({name,passed:true,...result});console.log('PASS',name,JSON.stringify(result));}catch(e){report.failures.push({name,error:e.stack});console.error('FAIL',name,e.stack);}save();}
check('10 levels, strict next-stock performance and transparent costs',()=>{
 const totals=[];for(const [i,v]of VEHICLE_CONFIG.entries()){
  const base=getVehiclePerformance(v.id,{}),max=getVehiclePerformance(v.id,MAX);
  for(const stat of ['speed','handling','grip','fuel']){let total=0;for(let level=0;level<10;level++){const offer=getUpgradeOffer(v.id,stat,{[stat]:level});assert.equal(offer.maxLevel,10);assert.equal(offer.nextLevel,level+1);assert.ok(offer.next>offer.current);total+=offer.price;}assert.equal(getUpgradeOffer(v.id,stat,{[stat]:10}).maxed,true);if(stat==='fuel')totals.push({id:v.id,costPerStat:total,allFourStats:total*4});}
  if(i){const previous=getVehiclePerformance(VEHICLE_CONFIG[i-1].id,MAX);for(const key of ['maxSpeed','acceleration','handling','grip','range','capacity'])assert.ok(base[key]>previous[key],`${v.id}/${key} beats previous max`);}
  assert.ok(Math.abs(max.range/base.range-1.3)<1e-10);
 }return{cars:10,stats:4,levels:10,totals};
});
check('Starter cannot reach third circle even by geometric shortcut',()=>{const a=g.stations[1],b=g.stations[2],c=g.deliveries[2],min=Math.min(Math.hypot(a.x-b.x,a.z-b.z)-a.radius-b.radius,Math.hypot(a.x-c.x,a.z-c.z)-a.radius-c.radius);assert.ok(min>vehicleConfig('pickup').range+40);return {minimumXZAfterLastFullRefill:round(min),stockRange:vehicleConfig('pickup').range,margin:round(min-vehicleConfig('pickup').range)};});
check('Pickup stock reaches unload 2 with full refill',()=>runJourney({target:2}));
check('Pickup stock fails unload 3 despite both full refills',()=>runJourney({target:3,expect:'empty'}));
check('Pickup max10 reaches unload 3',()=>runJourney({max:true,target:3}));
check('Pickup max10 fails unload 4 despite full refills',()=>runJourney({max:true,target:4,expect:'empty'}));
check('Pickup stock slalom still reaches unload 2',()=>runJourney({target:2,slalom:true}));
check('World-space biome crossing uses actual distance multiplier',()=>{
 const game=createGameplay({vehicles:g.vehicles,career:{version:2,ownedVehicleIds:['pickup']}});assert.equal(game.enter('pickup'),true);let fuel=game.state.fuels.pickup;const demand=[];
 // Read-only accounting inputs isolate gameplay's biome lookup. Complete
 // input-only physical journeys above separately verify displacement origins.
 for(const b of BIOMES){const p=routePointAtProgress(b.id==='city'?60:b.from+60);game.drive(.75,p.x,p.z);const used=fuel-game.state.fuels.pickup,expected=.75*vehicleConfig('pickup').consumption*biomeSurfaceAt(p.progress,'pickup').fuelFactor;assert.ok(Math.abs(used-expected)<1e-9);demand.push({biome:b.id,factor:biomeSurfaceAt(p.progress,'pickup').fuelFactor,fuelFor075m:round(used)});fuel=game.state.fuels.pickup;}return{demand};
});
if(!quick){const stock=[2,3,4,5,6,7,9,12,13,15],max=[3,4,5,6,7,8,10,13,15,16];for(const [i,v]of VEHICLE_CONFIG.entries())for(const upgraded of [false,true]){if(i===0||(only&&v.id!==only))continue;const target=(upgraded?max:stock)[i],branch=i%2?'alternate':'primary';check(`${v.id} ${upgraded?'max10':'stock'} reaches expected unload`,()=>runJourney({id:v.id,max:upgraded,target,branch}));}}
if(!quick&&(!only||only==='ashhauler'))for(const branch of ['primary','alternate'])for(const fuel of [9,10])check(`Ash final ${branch} tank${fuel}`,()=>runJourney({id:'ashhauler',target:16,branch,levelOverride:{...MAX,fuel},expect:fuel===9?'empty':'delivery'}));
if(!quick&&(!only||only==='ashhauler'))check('Ash final mastery stock0 speed handling grip, tank10',()=>runJourney({id:'ashhauler',target:16,branch:'primary',levelOverride:{speed:0,handling:0,grip:0,fuel:10},expect:'delivery'}));
report.complete=true;report.runtimeHashesAtEnd=hashes();report.changedRuntimeFiles=sourceFiles.filter(f=>report.runtimeHashes[f]!==report.runtimeHashesAtEnd[f]);report.passed=report.failures.length===0&&report.changedRuntimeFiles.length===0;save();g.dispose();console.log(`Balance review ${report.checks.length} passed, ${report.failures.length} failed; runtime changes during run: ${report.changedRuntimeFiles.join(',')||'none'}.`);process.exitCode=report.passed?0:1;
