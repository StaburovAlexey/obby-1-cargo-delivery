#!/usr/bin/env node
// Isolated production drivability coverage: input-only after each legitimate
// segment spawn. Fuel use is measured from actual displacement and reported,
// not replenished or injected; economy depletion is tested by journey tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import * as N from '../dist/route-network.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {createRoadHazards} from '../dist/road-hazards.js';
import {getTruckContact,fitTruckToGround} from '../dist/city-driving.js';
import {roadGroundGradient,roadGroundSurface} from '../dist/driving-ground.js';
import {getVehiclePerformance} from '../dist/vehicle-upgrades.js';
import {createNetworkRouteController} from './fixtures/network-route-controller.mjs';
const dir=new URL('../qa/route-hills/',import.meta.url);fs.mkdirSync(dir,{recursive:true});
const sourceFiles=['route-network-config.js','route-network.js','driving-model.js','turn-assist.js','driving-ground.js','city-driving.js','road-hazards.js','economy-config.js','vehicle-upgrades.js'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(new URL('../dist/'+f,import.meta.url))).digest('hex')]));
const MAX={speed:3,handling:3,grip:3,fuel:3},round=n=>Math.round(n*1e6)/1e6,quick=process.argv.includes('--quick');
const report={generatedAt:new Date().toISOString(),scope:'Actual production four-tire solver, real graph/terrain/hazard contact, input-only route controller. Segment spawns isolate drivability; no pose/speed/fuel injection after spawn. Fuel demand measured from actual travel, compared to tank range; this is not a claim that a stock pickup can fuel a 1km segment.',limitations:['Offline Node/Three.js, no browser or gameplay rendering','Independent segment drivability is separate from complete economy/fuel-depletion journeys'],sourceHashes:hashes(),controllerHash:crypto.createHash('sha256').update(fs.readFileSync(new URL('./fixtures/network-route-controller.mjs',import.meta.url))).digest('hex'),expectedForward:quick?16:160,expectedReverse:quick?4:40,checks:[],failures:[],complete:false};
function run({spec,levels,branch,fork,direction=1}){
 const qStart=direction>0?fork.from-25:fork.to+25,qEnd=direction>0?fork.to+25:fork.from-25,start=N.routePointAtProgress(qStart,{branch}),performance=getVehiclePerformance(spec.id,levels),hazards=createRoadHazards(42);
 let context=start;
 const model=createDrivingModel({x:start.x,z:start.z,heading:start.heading,vehicleId:spec.id,maxSpeed:spec.maxSpeed,getUpgrades:()=>levels,
  contact:(x,z,h)=>{const road=getTruckContact(x,z,h,[],context),obstacle=hazards.contact(x,z,h);return !road?obstacle:!obstacle||road.depth>=obstacle.depth?road:obstacle;},
  groundGradient:(x,z)=>{context=N.projectRoad(x,z,context);return roadGroundGradient(x,z,context);},
  groundSurface:(x,z,id)=>hazards.surfaceAt(x,z,roadGroundSurface(x,z,id,context)),
 });
 model.setGear(direction>0?'D':'R');
 const control=createNetworkRouteController({branch,vehicleId:spec.id,levels,hazards,direction}),dt=.1;
 let frames=0,travel=0,maxOffset=0,maxStep=0,minMovingSpeed=Infinity,uphillSpeed=Infinity,maxGrade=0,poses=0,minClearance=Infinity,maxClearance=0,maxSupportResidualStep=0,maxNormalStep=0,previousFit,stalledSeconds=0,maxStalledSeconds=0,confirmedBranch=0;
 const visited=new Set();
 for(;frames<20000&&direction*(qEnd-context.progress)>0;frames++){
  const s=model.state,input=control.sample(s),before={x:s.x,z:s.z,progress:context.progress};model.setInput(input);hazards.update(dt,{...s,routeContext:context},true);model.step(dt);context=N.projectRoad(s.x,s.z,context);
  const step=Math.hypot(s.x-before.x,s.z-before.z),advance=direction*(context.progress-before.progress);travel+=s.pathDistance;maxStep=Math.max(maxStep,step);maxOffset=Math.max(maxOffset,Math.abs(context.offset));
  assert.ok([s.x,s.z,s.heading,s.speed,s.pathDistance].every(Number.isFinite));assert.ok(step<=(performance.maxSpeed+2)*dt+.01,`Pose step ${step}`);assert.ok(s.pathDistance+1e-8>=step);assert.ok(advance>=-.06,`Rolled backwards ${advance} at ${context.progress}`);assert.ok(advance<(performance.maxSpeed+3)*dt+.5,`Branch progress jump ${advance}`);assert.equal(s.blocked,false,`Contact at ${context.progress}`);assert.ok(N.truckInRoad(s.x,s.z,s.heading,context),`Left corridor ${context.progress}`);
  if(context.progress>fork.splitOverlapEnd+12&&context.progress<fork.mergeOverlapStart-12){assert.equal(context.branch,branch,`Wrong branch at ${context.progress}`);confirmedBranch++;visited.add(context.edgeId);}
  const surface=N.getSurface(s.x,s.z,context),grade=Math.hypot(surface.gradient.x,surface.gradient.z);maxGrade=Math.max(maxGrade,grade);if(frames>30){minMovingSpeed=Math.min(minMovingSpeed,Math.abs(s.speed));if(N.routeGrade(context.progress)*direction>.015)uphillSpeed=Math.min(uphillSpeed,Math.abs(s.speed));}
  stalledSeconds=frames>30&&advance<.02?stalledSeconds+dt:0;maxStalledSeconds=Math.max(maxStalledSeconds,stalledSeconds);assert.ok(stalledSeconds<4,`Stalled on grade at ${context.progress}`);
  if(frames%10===0||direction*(qEnd-context.progress)<=0){const fit=fitTruckToGround(THREE,s.x,s.z,s.heading,context),residual=fit.position.y-surface.height;assert.ok(fit.quaternion.toArray().every(Number.isFinite));assert.ok(fit.normal.y>.99);assert.ok(fit.clearances.every(c=>c>=.01199&&c<.04));minClearance=Math.min(minClearance,...fit.clearances);maxClearance=Math.max(maxClearance,...fit.clearances);if(previousFit){maxSupportResidualStep=Math.max(maxSupportResidualStep,Math.abs(residual-previousFit.residual));maxNormalStep=Math.max(maxNormalStep,fit.normal.distanceTo(previousFit.normal));assert.ok(Math.abs(residual-previousFit.residual)<.02,`Chassis support jump ${residual-previousFit.residual}`);}previousFit={residual,normal:fit.normal};poses++;}
 }
 assert.ok(direction*(context.progress-qEnd)>=0,`Timed out ${context.progress}/${qEnd}`);assert.ok(confirmedBranch>0);assert.equal(visited.size,1);assert.ok(maxGrade<=.075001);
 return{passed:true,vehicle:spec.id,upgrade:levels.fuel===3?'max':'stock',fork:fork.id,branch,gear:direction>0?'D':'R',startProgress:qStart,endProgress:round(context.progress),seconds:round(frames*dt),frames,actualTravel:round(travel),fuelDemand:round(travel*spec.consumption),tankCapacity:performance.capacity,tankRange:performance.range,segmentFitsOneTank:travel<=performance.range,minimumMovingSpeed:round(minMovingSpeed),minimumUphillSpeed:Number.isFinite(uphillSpeed)?round(uphillSpeed):null,maxGrade:round(maxGrade),maxOffset:round(maxOffset),maxStep:round(maxStep),maxStalledSeconds:round(maxStalledSeconds),groundFits:poses,minClearance:round(minClearance),maxClearance:round(maxClearance),maxSupportResidualStep:round(maxSupportResidualStep),maxNormalStep:round(maxNormalStep),postSpawnPoseMutations:0,postSpawnSpeedMutations:0,fuelInjections:0};
}
const specs=quick?VEHICLE_CONFIG.filter(v=>['pickup','ashhauler'].includes(v.id)):VEHICLE_CONFIG;
const scenarios=[];
for(const spec of specs)for(const levels of [{},MAX])for(const branch of ['main','alternate'])for(const fork of N.FORKS)scenarios.push({spec,levels,branch,fork});
// Reversing the forest hill traverses both slopes of its 7.5% crest, on each arm.
for(const spec of specs)for(const levels of [{},MAX])for(const branch of ['main','alternate'])scenarios.push({spec,levels,branch,fork:N.FORKS[0],direction:-1});
report.expectedForward=specs.length*2*2*4;report.expectedReverse=specs.length*2*2;
const target=new URL(quick?'driving-quick.json':'driving.json',dir);
for(const options of scenarios){try{const result=run(options);report.checks.push(result);console.log(`PASS ${result.vehicle} ${result.upgrade} ${result.gear} ${result.fork} ${result.branch}: ${result.seconds}s, ${result.actualTravel}m, minimum uphill speed ${result.minimumUphillSpeed}`);}catch(error){const failure={vehicle:options.spec.id,upgrade:options.levels.fuel===3?'max':'stock',fork:options.fork.id,branch:options.branch,gear:options.direction===-1?'R':'D',error:error.stack};report.failures.push(failure);console.error('FAIL',JSON.stringify(failure));}if((report.checks.length+report.failures.length)%4===0)fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');}
report.complete=true;report.sourceHashesAtEnd=hashes();report.sourceChangedDuringRun=sourceFiles.filter(f=>report.sourceHashes[f]!==report.sourceHashesAtEnd[f]);report.controllerHashAtEnd=crypto.createHash('sha256').update(fs.readFileSync(new URL('./fixtures/network-route-controller.mjs',import.meta.url))).digest('hex');report.passed=report.failures.length===0&&report.sourceChangedDuringRun.length===0&&report.controllerHash===report.controllerHashAtEnd&&report.checks.length===report.expectedForward+report.expectedReverse;fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log(`Hill driving ${report.checks.length}/${scenarios.length} passed; ${report.failures.length} failures; unchanged runtime=${!report.sourceChangedDuringRun.length}.`);process.exitCode=report.passed?0:1;
