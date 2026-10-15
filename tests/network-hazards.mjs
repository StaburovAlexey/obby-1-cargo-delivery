#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildRoadHazards,createRoadHazards,roadHazardContact,rockApproachIsClear,ROAD_HAZARD_RULES as R,ROAD_HAZARD_EXCLUSIONS} from '../dist/road-hazards.js';
import {NETWORK_EDGES,FORKS,BIOME_DEFINITIONS,routePointAtProgress,pointOnEdge,routeDistanceAt,projectRoad,pointInRoad,queryRoadSurface,corridorContact} from '../dist/route-network.js';
import {VEHICLE_CONFIG,DELIVERY_CHECKPOINTS} from '../dist/economy-config.js';
import {BIOME_DESTINATIONS} from '../dist/biome-travel.js';
import {createDrivingModel,VEHICLE_DYNAMICS as P} from '../dist/driving-model.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {getVehiclePerformance} from '../dist/vehicle-upgrades.js';
const ZERO={speed:0,handling:0,grip:0,fuel:0},FULL={speed:3,handling:3,grip:3,fuel:3};
const report={kind:'Graph-aware seeded hazard contracts and actual four-tire solver',limitations:['Offline Node/Three.js only','Browser, WebGL, visual readability and Android remain unverified'],checks:[]};
const near=(a,b,e=1e-7)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,`${a} != ${b}`);
const check=(name,fn)=>{const details=fn();report.checks.push({name,passed:true,...details});console.log(`PASS ${name}${details?`: ${JSON.stringify(details)}`:''}`);};
const playerFor=(h,delta,sign=1,speed=20,offset=0)=>{const p=pointOnEdge(h.edgeId,h.edgeDistance+delta);return {...p,x:p.x+p.right.x*offset,z:p.z+p.right.z*offset,velocityX:-Math.sin(p.heading)*speed*sign,velocityZ:-Math.cos(p.heading)*speed*sign};};
const stateFor=(system,h)=>system.rocks.find(s=>s.id===h.id);
const hlist=buildRoadHazards(42);
check('Metadata tracks exact route edges and uses true arc instead of world-Z progression',()=>{
 let rotated=0;
 for(const h of hlist){const p=pointOnEdge(h.edgeId,h.edgeDistance);near(h.distance,p.distance);near(h.progress,p.progress);near(h.x,p.x+p.right.x*h.offset);near(h.z,p.z+p.right.z*h.offset);near(h.roadHeading,p.heading);assert.equal(h.branch,p.branch);assert.equal(h.biome,p.biome);if(Math.abs(h.progress+h.z)>100)rotated++;}
 assert.ok(rotated>40);
 return {count:hlist.length,positionsWithWorldZDifferentFromProgress:rotated,rockCapacity:hlist.filter(h=>h.type==='rock').length};
});
check('All actual preview, checkpoint and junction stations are protected across both alternatives',()=>{
 const protectedPoints=[...DELIVERY_CHECKPOINTS,...BIOME_DESTINATIONS,...FORKS.flatMap(f=>[{progress:f.from},{progress:f.to}])];let minimumGap=Infinity;
 for(const p of protectedPoints){assert.ok(Number.isFinite(p.progress));const distance=routeDistanceAt(p.progress);assert.ok(ROAD_HAZARD_EXCLUSIONS.some(e=>Math.abs(e.distance-distance)<1e-7));for(const h of hlist){const gap=Math.abs(h.distance-distance)-Math.hypot(h.width,h.length)/2;minimumGap=Math.min(minimumGap,gap);assert.ok(gap>=100);}}
 for(const p of BIOME_DESTINATIONS){const system=createRoadHazards(42);for(let n=0;n<80;n++)system.update(.1,{...p,velocityX:-Math.sin(p.heading)*37.524,velocityZ:-Math.cos(p.heading)*37.524},true);assert.ok(system.rocks.every(s=>s.phase==='dormant'));assert.equal(system.contact(p.x,p.z,p.heading),undefined);}
 return {protectedStations:protectedPoints.length,minimumWholeFootprintGapMetres:minimumGap};
});
check('Both arms have seeded side changes, angled logs, bounded groups and unequal quiet gaps',()=>{
 let groups=0;
 for(const biome of BIOME_DEFINITIONS){const local=hlist.filter(h=>h.biome===biome.id);assert.ok(local.some(h=>h.offset>0)&&local.some(h=>h.offset<0));assert.ok(new Set(local.map(h=>h.pattern)).size>=2);}
 for(const edge of NETWORK_EDGES.filter(e=>e.forkId)){const local=hlist.filter(h=>h.edgeId===edge.id);assert.ok(local.length>=3);assert.ok(local.some(h=>h.offset>0)&&local.some(h=>h.offset<0));for(const id of new Set(local.map(h=>h.series))){const group=local.filter(h=>h.series===id);assert.ok(group.length<=3);assert.ok(group.at(-1).distance-group[0].distance<=73);groups++;}}
 const city=hlist.filter(h=>h.biome==='city'),gaps=city.slice(1).map((h,i)=>h.distance-city[i].distance);assert.ok(Math.max(...gaps)>350);assert.ok(gaps.some(d=>d>80&&d<220));assert.ok(hlist.some(h=>h.pattern==='gentle-slalom'));assert.ok(hlist.filter(h=>h.type==='log').every(h=>Math.abs(h.headingDelta)>=.2));
 return {forkArmGroups:groups,patterns:[...new Set(hlist.map(h=>h.pattern))],maximumCityQuietGapMetres:Math.max(...gaps)};
});
check('Every rock has a 180m gentle two-way approach and wakes only on its own route edge',()=>{
 let approaches=0;
 for(const seed of [0,1,17,42,2026]){
  const system=createRoadHazards(seed);
  for(const h of system.hazards.filter(h=>h.type==='rock')){
   assert.ok(rockApproachIsClear(h));
   for(const sign of [-1,1])for(const distance of [160,170,180]){
    system.reset();const player=playerFor(h,-sign*distance,sign,37.524);system.update(1/120,player,true);assert.equal(stateFor(system,h).phase,'warning');for(const state of system.rocks.filter(s=>s.phase!=='dormant'))assert.equal(system.hazards.find(v=>v.id===state.id).edgeId,h.edgeId);approaches++;
   }
   for(const delta of [-159.9,-40,0,40,159.9]){system.reset();const player=playerFor(h,delta,delta>0?-1:1);for(let i=0;i<70;i++)system.update(.1,player,true);assert.equal(stateFor(system,h).phase,'dormant');}
   const other=routePointAtProgress(h.progress,{branch:h.branch==='main'?'alternate':'main'});system.reset();system.update(.1,{...other,velocityX:-Math.sin(other.heading)*37.524,velocityZ:-Math.cos(other.heading)*37.524},true);assert.equal(stateFor(system,h).phase,'dormant');
  }
 }
 return {twoWayApproaches:approaches,minimumWarningRangeMetres:R.armNear,warningSeconds:R.warningSeconds,fallSeconds:R.fallSeconds,maxTestSpeed:37.524};
});
check('Maximum-speed passes in both gears cannot make falling rocks land inside the driver',()=>{
 let passes=0,deferredFrames=0;
 for(const branch of ['main','alternate'])for(const sign of [-1,1]){
  const system=createRoadHazards(42),h=system.hazards.find(h=>h.type==='rock'&&h.branch===branch&&h.pattern==='gentle-slalom'),s=stateFor(system,h);
  for(let i=0;i<1000;i++){
   const travelled=i/120*37.524,player=playerFor(h,sign*(-170+travelled),sign,37.524,h.offset);system.update(1/120,player,true);
   if(s.deferred)deferredFrames++;
   if(s.phase==='landed')assert.equal(roadHazardContact(h,player.x,player.z,player.heading),undefined,'A landed rock may not overlap the driver');
  }
  assert.equal(s.phase,'landed');passes++;
 }
 assert.ok(deferredFrames>0);return {passes,deferredFrames};
});
check('120 stock/max catalog D/R oblique impacts cannot tunnel through thin angled fork logs',()=>{
 let cases=0,maxStep=0;
 const h=hlist.find(h=>h.type==='log'&&h.edgeId.includes('fork'));
 for(const car of VEHICLE_CONFIG)for(const upgrades of [ZERO,FULL])for(const gear of ['D','R'])for(const angle of [-.2,0,.2]){
  const sign=gear==='D'?1:-1,heading=h.heading+angle,c=Math.cos(h.heading),s=Math.sin(h.heading),reach=P.halfLength*Math.abs(Math.cos(angle))+P.halfWidth*Math.abs(Math.sin(angle)),back=sign*(h.length/2+reach+.15),speed=getVehiclePerformance(car.id,upgrades).maxSpeed;
  const system=createRoadHazards(42),model=createDrivingModel({x:h.x+s*back,z:h.z+c*back,heading,vehicleId:car.id,maxSpeed:car.maxSpeed,getUpgrades:()=>upgrades,groundSurface:()=>surfaceForBiome('forest',car.id),contact:system.contact});
  model.setGear(gear);model.state.velocityX=-s*speed*sign;model.state.velocityZ=-c*speed*sign;const before={...model.state};model.step(.1);
  for(const v of Object.values(model.state))if(typeof v==='number')assert.ok(Number.isFinite(v));assert.ok(model.state.blocked);assert.equal(system.contact(model.state.x,model.state.z,model.state.heading),undefined);assert.ok(sign*(s*(model.state.x-h.x)+c*(model.state.z-h.z))>0);maxStep=Math.max(maxStep,Math.hypot(model.state.x-before.x,model.state.z-before.z));cases++;
 }
 return {cases,maxFrameDisplacementMetres:maxStep,maximumSweepMetres:P.maxSweepDistance};
});
check('Physics and renderer pools remain bounded, frozen descriptors survive resets, and economy is untouched',()=>{
 const system=createRoadHazards('pool-reuse'),hazards=system.hazards,rocks=system.rocks,identities=[...rocks],before=JSON.stringify(hazards);
 for(let i=0;i<100;i++){const h=hazards.find(h=>h.type==='rock');system.update(.1,playerFor(h,-170),true);system.reset();}
 assert.equal(system.hazards,hazards);assert.equal(system.rocks,rocks);assert.equal(JSON.stringify(hazards),before);identities.forEach((s,i)=>assert.equal(rocks[i],s));assert.ok(hazards.length<=96&&rocks.length<=24);
 const source=fs.readFileSync(new URL('../dist/road-hazards.js',import.meta.url),'utf8');assert.doesNotMatch(source,/localStorage|setTimeout|setInterval|Math\.random|money\s*=|fuel\s*=|player\.(x|z|heading|velocityX|velocityZ)\s*=/);assert.doesNotMatch(source,/progress\s*=\s*-.*\.z|routeDistanceAt\(-.*\.z/);
 return {staticDescriptors:hazards.length,rockPool:rocks.length,resets:100};
});
const directory=new URL('../qa/network-hazards/',import.meta.url);fs.mkdirSync(directory,{recursive:true});report.generatedAt=new Date().toISOString();report.passed=report.checks.length;fs.writeFileSync(new URL('checks.json',directory),JSON.stringify(report,null,2)+'\n');

const all=NETWORK_EDGES.flatMap(e=>e.samples),minX=Math.min(...all.map(p=>p.x))-70,maxX=Math.max(...all.map(p=>p.x))+70,minZ=Math.min(...all.map(p=>p.z))-70,maxZ=Math.max(...all.map(p=>p.z))+70,scale=Math.min(1000/(maxX-minX),1600/(maxZ-minZ)),X=x=>40+(x-minX)*scale,Y=z=>90+(z-minZ)*scale;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1740" viewBox="0 0 1080 1740"><rect width="1080" height="1740" fill="#eef3ee"/><text x="28" y="30" font-family="sans-serif" font-size="21" fill="#173122">68 graph-aware hazards · seeded layout 42</text><text x="28" y="56" font-family="sans-serif" font-size="14">Offline geometry evidence. Both arms, protected stops, and an open central bypass.</text>`;
for(const e of NETWORK_EDGES){svg+=`<polyline points="${e.samples.filter((_,i)=>i%3===0).map(p=>`${X(p.x).toFixed(2)},${Y(p.z).toFixed(2)}`).join(' ')}" fill="none" stroke="#4a5561" stroke-width="${30*scale}"/>`;}
const colors={repair:'#fed443',log:'#a7672c',dune:'#dd921f',ice:'#23aaca',rock:'#e2604d'};
for(const h of hlist)svg+=`<circle cx="${X(h.x)}" cy="${Y(h.z)}" r="3" fill="${colors[h.type]}" stroke="#fff" stroke-width=".5"><title>${h.id}; ${h.pattern}; ${h.distance.toFixed(1)} m</title></circle>`;
for(const p of DELIVERY_CHECKPOINTS){const q=routePointAtProgress(p.progress);svg+=`<circle cx="${X(q.x)}" cy="${Y(q.z)}" r="4" fill="none" stroke="#26c261" stroke-width="1.5"/>`;}
svg+='<text x="28" y="1698" font-family="sans-serif" font-size="14">Yellow: repair · brown: angled log · ochre: dune · cyan: ice · coral: timed rock</text><text x="28" y="1722" font-family="sans-serif" font-size="14">Green rings: shared checkpoints. No browser, GPU, camera-visibility or Android validation.</text></svg>';fs.writeFileSync(new URL('route-hazards.svg',directory),svg);
console.log(`${report.passed} graph hazard checks passed. Offline only.`);
