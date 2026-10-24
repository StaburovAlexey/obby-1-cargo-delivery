import fs from 'node:fs/promises';
import os from 'node:os';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import * as THREE from '../../dist/vendor/three.module.js';
import {initializeRapier} from '../../dist/rapier-runtime.js';
import {createPhysicsWorld} from './kinematic-sync-candidate.js';
import {buildCity} from '../../dist/network-scene.js';
import {createGarageScene} from '../../dist/garage-scene.js';
import {createCanyonScene} from '../../dist/canyon-scene.js';
import {createCanyonEntrance} from '../../dist/canyon-entrance.js';
import {createRoadHazards} from '../../dist/road-hazards.js';
import {createRapierDrivingModel} from '../../dist/rapier-vehicle.js';
import {routePointAtProgress} from '../../dist/route-network.js';
import {surfaceForBiome} from '../../dist/biome-surfaces.js';
import {VEHICLE_SOURCE_BOUNDS} from '../../dist/vehicle-source-bounds.js';
await initializeRapier();
const url=new URL('./kinematic-sync-candidate.js',import.meta.url),source=await fs.readFile(url,'utf8'),start=source.indexOf('      for (const ',source.indexOf('roadHazards?.update?.(PHYSICS_FIXED_STEP')),end=source.indexOf('\n      world.step();',start);assert.ok(start>=0&&end>start);
const referenceSource=(source.slice(0,start)+'      for (const {h, body} of moving) { const pose = hazardPose(h); body.setNextKinematicTranslation(hazardPosition(pose)); body.setNextKinematicRotation(hazardRotation(pose)); }'+source.slice(end)).replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g,(_,quote,relative)=>`from ${quote}${new URL(relative,url).href}${quote}`);
const reference=await import(`data:text/javascript;base64,${Buffer.from(referenceSource).toString('base64')}`);
const seed=42,DT=1/60,framesPerRound=120,rounds=3,warmupTicks=180,countTicks=60;
const city=buildCity(THREE,{seed}),garage=createGarageScene(THREE,city,{document:null}),entrance=createCanyonEntrance(THREE,{document:null}),environment=createCanyonScene(THREE),point=routePointAtProgress(7425),variants={};
const bounds=VEHICLE_SOURCE_BOUNDS.desertscout,metadata={bounds},surface=surfaceForBiome('desert','desertscout');
for(const [name,create] of Object.entries({baseline:reference.createPhysicsWorld,current:createPhysicsWorld})){
 const hazards=createRoadHazards(seed),w=create({THREE,city,garage,canyon:{entrance,environment},roadHazards:hazards});w.syncParkedVehicles('desertscout');
 const model=createRapierDrivingModel({world:w.world,x:point.x,z:point.z,heading:point.heading,y:point.height+.2,vehicleId:'desertscout',getVehicleMetadata:()=>metadata,groundSurface:()=>surface});model.setInput({active:true,speedDemand:.18});
 const record={w,model,hazards,rawMs:0,writes:{translation:0,rotation:0},elapsedMs:[],worldStepMs:[]};const original=w.world.step.bind(w.world);w.world.step=(...args)=>{const t=performance.now();const result=original(...args);record.rawMs+=performance.now()-t;return result;};variants[name]=record;
}
const run=(v,ticks)=>{for(let frame=0;frame<ticks;frame++)v.w.step(DT,v.model);};
const vector=v=>({x:v.x,y:v.y,z:v.z,...('w'in v?{w:v.w}:{})});
const snapshot=v=>{const bodies=[];v.w.world.bodies.forEach(b=>bodies.push({handle:b.handle,translation:vector(b.translation()),rotation:vector(b.rotation()),velocity:vector(b.linvel()),angularVelocity:vector(b.angvel())}));return bodies;};
const equivalent=()=>{assert.deepEqual(variants.current.hazards.poses,variants.baseline.hazards.poses);assert.deepEqual(snapshot(variants.current),snapshot(variants.baseline));};
let report;try{
 for(const v of Object.values(variants))run(v,warmupTicks);equivalent();
 for(const v of Object.values(variants)){
  const originals=[];v.w.world.bodies.forEach(b=>{if(!b.isKinematic())return;for(const [method,key] of [['setNextKinematicTranslation','translation'],['setNextKinematicRotation','rotation']]){const original=b[method];originals.push([b,method,original]);b[method]=function(...args){v.writes[key]++;return original.apply(this,args);};}});
  run(v,countTicks);for(const [body,method,original]of originals)body[method]=original;
 }equivalent();
 for(let round=0;round<rounds;round++){
  for(const name of round%2?['current','baseline']:['baseline','current']){const v=variants[name];v.rawMs=0;const t=performance.now();run(v,framesPerRound);v.elapsedMs.push(performance.now()-t);v.worldStepMs.push(v.rawMs);}
  equivalent();
 }
 const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)],metrics=Object.fromEntries(Object.entries(variants).map(([name,v])=>[name,{elapsedMs:v.elapsedMs,worldStepMs:v.worldStepMs,medianTotalMs:median(v.elapsedMs),medianWorldStepMs:median(v.worldStepMs),kinematicWritesOver60Ticks:v.writes,finalVehicle:{x:v.model.state.x,y:v.model.state.y,z:v.model.state.z,linearSpeed:v.model.state.linearSpeed,grounded:v.model.state.grounded},stats:v.w.stats}]));
 report={recordedAt:new Date().toISOString(),runtime:process.version,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,seed,warmupTicks,countTicks,framesPerRound,rounds,dt:DT,measuredSimulationRangeSeconds:[(warmupTicks+countTicks)*DT,(warmupTicks+countTicks+framesPerRound*rounds)*DT],metrics,totalMedianReductionPercent:(1-metrics.current.medianTotalMs/metrics.baseline.medianTotalMs)*100,worldStepMedianReductionPercent:(1-metrics.current.medianWorldStepMs/metrics.baseline.medianWorldStepMs)*100,allBodyAndMoverFieldsExact:true,scope:'Real Rapier world: complete generated city, garage, canyon, 88 continuously updated movers and one active desertscout driving model with source GLB bounds and default wheel geometry. No GLB visual downloads or road-pit cutouts. Reference restores only unconditional kinematic target writes; all other current optimizations are shared. Timed rounds are uninstrumented except identical world.step timers; setter counts use a separate preceding 60-tick pass. Measurement begins after the shared 1.2-second mover start pause. This is CPU-only, not browser/Android FPS evidence.'};
 await fs.writeFile(new URL('kinematic-sync-benchmark.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{for(const v of Object.values(variants)){v.model.dispose();v.w.dispose();}city.dispose();garage.dispose();entrance.dispose();environment.dispose();}
