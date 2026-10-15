#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import * as THREE from '../dist/vendor/three.module.js';
import {buildRoadHazards,createRoadHazards,roadHazardContact,ROAD_HAZARD_RULES as R,ROAD_HAZARD_EXCLUSIONS,rockApproachIsClear} from '../dist/road-hazards.js';
import {createRoadHazardsScene} from '../dist/road-hazards-scene.js';
import {pointOnEdge,pointInRoad,truckInRoad,queryRoadSurface,ROAD_SURFACE_OFFSET,BIOME_DEFINITIONS,NETWORK_EDGES,FORKS,projectRoad,routeDistanceAt} from '../dist/route-network.js';
const player={x:0,z:0,heading:0},groundHeight=(x,z)=>queryRoadSurface(x,z).height+ROAD_SURFACE_OFFSET;
const near=(a,b,e=1e-7)=>assert(Math.abs(a-b)<=e,`${a} != ${b} +/- ${e}`);
const report={scope:'Offline Node and actual Three.js matrices. No browser/GPU, visibility, Android, or human difficulty claim.',checks:[]};
function check(name,fn){const details=fn();report.checks.push({name,passed:true,...details});console.log('PASS '+name+(details?' '+JSON.stringify(details):''));}
check('32 seeds preserve 30 varied hazards, 20 eight-second movers and every packing safeguard',()=>{
 const byBiome={city:6,forest:6,desert:5,snow:5,volcanic:8};
 const byType={repair:2,log:2,dune:1,ice:1,rock:4,barrier:8,boulder:12};
 const signatures=new Set();let minimumExclusion=Infinity,minimumSpacing=Infinity,minimumStaticSpacing=Infinity,maximumSpeed=0;
 assert.equal(R.count,30);assert.equal(R.staticCount,10);assert.equal(R.movingCount,20);assert.equal(R.moversPerBiome,4);
 for(let seed=0;seed<32;seed++){
  const hazards=buildRoadHazards(seed);assert.equal(hazards.length,30);assert(Object.isFrozen(hazards));assert.equal(new Set(hazards.map(h=>h.id)).size,30);assert.deepEqual(hazards,buildRoadHazards(seed));signatures.add(JSON.stringify(hazards));
  assert.equal(hazards.filter(h=>!h.motion).length,10);assert.equal(hazards.filter(h=>h.motion).length,20);
  assert.deepEqual(Object.fromEntries(BIOME_DEFINITIONS.map(b=>[b.id,hazards.filter(h=>h.biome===b.id).length])),byBiome);
  assert.deepEqual(Object.fromEntries(Object.keys(byType).map(type=>[type,hazards.filter(h=>h.type===type).length])),byType);
  for(const biome of BIOME_DEFINITIONS){const local=hazards.filter(h=>h.biome===biome.id),movers=local.filter(h=>h.motion);assert.equal(movers.length,4);assert(movers.every(h=>h.motion.crossesCenter&&h.motion.minOffset<0&&h.motion.maxOffset>0));if(local.filter(h=>!h.motion).length>1)assert(local.some(h=>!h.motion&&h.offset<0)&&local.some(h=>!h.motion&&h.offset>0));}
  for(const [index,h] of hazards.entries()){
   assert(Object.isFrozen(h));if(index)assert(h.distance>=hazards[index-1].distance);
   for(const key of ['x','z','heading','progress','distance','edgeDistance','width','length','height','offset','groundHeight'])assert(Number.isFinite(h[key]),key);
   const p=pointOnEdge(h.edgeId,h.edgeDistance);near(h.distance,p.distance);near(h.progress,p.progress);near(h.x,p.x+p.right.x*h.offset);near(h.z,p.z+p.right.z*h.offset);near(h.roadHeading,p.heading);near(h.heading,p.heading+h.headingDelta);assert.equal(h.branch,p.branch);assert.equal(h.biome,p.biome);
   for(const e of ROAD_HAZARD_EXCLUSIONS){const gap=Math.abs(h.distance-e.distance)-Math.hypot(h.width,h.length)/2-1;minimumExclusion=Math.min(minimumExclusion,gap);assert(gap>=e.radius-1e-7);}
   const edge=NETWORK_EDGES.find(e=>e.id===h.edgeId),fork=FORKS.find(f=>f.id===edge.forkId),extent=Math.hypot(h.width,h.length)/2+1;
   if(fork){assert(h.progress-fork.splitOverlapEnd>=R.forkTipExclusionMetres+extent);assert(fork.mergeOverlapStart-h.progress>=R.forkTipExclusionMetres+extent);}
   for(const other of hazards.filter(o=>o.id!==h.id&&o.edgeId===h.edgeId)){
    const gap=Math.abs(h.edgeDistance-other.edgeDistance);
    if(h.motion||other.motion){minimumSpacing=Math.min(minimumSpacing,gap);assert(gap>=R.moverSpacingMetres-1e-7);}
    else {const required=R.staticSpacingMetres;minimumStaticSpacing=Math.min(minimumStaticSpacing,gap-required);assert(gap>=required-1e-7);}
   }
   if(h.motion){assert(h.expanded);assert(Object.isFrozen(h.motion));assert(h.motion.phase>=0&&h.motion.phase<1);assert.equal(h.motion.pauseSeconds,1.4);assert.equal(h.motion.startPause,1.2);assert.equal(h.motion.travelSeconds,8);assert.equal(h.motion.period,18.8);near(h.motion.minOffset,-10.6);near(h.motion.maxOffset,10.6);const speed=(h.motion.maxOffset-h.motion.minOffset)*1.5/h.motion.travelSeconds;maximumSpeed=Math.max(maximumSpeed,speed);assert(speed<=R.maximumMoverSpeed);}
  }
 }
 assert.equal(signatures.size,32);assert.deepEqual(buildRoadHazards('same'),buildRoadHazards('same'));assert.notDeepEqual(buildRoadHazards('same'),buildRoadHazards('different'));
 return {seeds:32,count:30,static:10,moving:20,centerCrossing:20,byBiome,byType,minimumExclusion,minimumSpacing,minimumStaticSpacing,maximumSpeed};
});
check('Independent perimeter, complete mover envelopes and two-way approach samples stay safe',()=>{
 let perimeterSamples=0,approachSamples=0,minimumRoadMargin=Infinity,minimumProjectedExclusion=Infinity,maximumGrade=0,maximumCurvature=0;
 const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 for(const seed of [0,1,17,42,2026,2027,4294967295])for(const h of buildRoadHazards(seed)){
  const center=pointOnEdge(h.edgeId,h.edgeDistance),offsets=h.motion?[h.motion.minOffset,(h.motion.minOffset+h.motion.maxOffset)/2,h.motion.maxOffset,h.offset]:[h.offset];
  for(const offset of offsets){
   const x=center.x+center.right.x*offset,z=center.z+center.right.z*offset,c=Math.cos(h.heading),s=Math.sin(h.heading);
   const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>({x:x+c*a*h.width/2+s*b*h.length/2,z:z-s*a*h.width/2+c*b*h.length/2}));
   for(let i=0;i<4;i++)for(let j=0;j<=8;j++){
    const a=corners[i],b=corners[(i+1)%4],x=a.x+(b.x-a.x)*j/8,z=a.z+(b.z-a.z)*j/8,q=projectRoad(x,z,h),margin=15-Math.abs(q.offset);minimumRoadMargin=Math.min(minimumRoadMargin,margin);assert(margin>.5);assert(pointInRoad(x,z,.4));
    for(const e of ROAD_HAZARD_EXCLUSIONS){const gap=Math.abs(q.distance-e.distance);minimumProjectedExclusion=Math.min(minimumProjectedExclusion,gap);assert(gap>=e.radius-1e-7,`${h.id}: projected footprint overlaps ${e.id}`);}perimeterSamples++;
   }
  }
  if(h.motion||h.type==='rock'){
   const sight=h.motion?R.moverSightlineMetres:R.rockSightlineMetres,edge=NETWORK_EDGES.find(e=>e.id===h.edgeId);assert(h.edgeDistance>sight);assert(edge.length-h.edgeDistance>sight);if(h.type==='rock')assert(rockApproachIsClear(h));
   for(let d=-sight;d<=sight;d+=2.5){const p=pointOnEdge(h.edgeId,h.edgeDistance+d),grade=Math.hypot(p.gradient.x,p.gradient.z);maximumGrade=Math.max(maximumGrade,grade);maximumCurvature=Math.max(maximumCurvature,Math.abs(p.curvature));assert(Math.abs(p.curvature)<=R.maximumApproachCurvature);assert(Math.abs(angleDelta(p.heading,center.heading))<=R.maximumApproachHeadingChange);assert(grade<=R.maximumApproachGrade);approachSamples++;}
  }
 }
 return {seeds:7,perimeterSamples,approachSamples,minimumRoadMargin,minimumProjectedExclusion,maximumGrade,maximumCurvature};
});
check('Live poses and collisions track the same bounded road-local sweep at every tested frame',()=>{
 const s=createRoadHazards(42),identities=[...s.poses],descriptors=JSON.stringify(s.hazards),rocks=JSON.stringify(s.rocks),seenCenter=new Set();let frames=0,minimumLargestPassage=Infinity,maximumStep=0;
 const previous=s.movers.map(h=>h.offset);
 for(let frame=0;frame<900;frame++){
  s.update(.05,player,true);
  for(const [i,h]of s.movers.entries()){
   const p=pointOnEdge(h.edgeId,h.edgeDistance);near(h.x,p.x+p.right.x*h.offset);near(h.z,p.z+p.right.z*h.offset);near(h.groundHeight,queryRoadSurface(h.x,h.z,p).height);assert(h.offset>=h.motion.minOffset-1e-8&&h.offset<=h.motion.maxOffset+1e-8);
   assert.equal(s.poseFor(h.id),h);assert(s.contact(h.x,h.z,h.heading));maximumStep=Math.max(maximumStep,Math.abs(h.offset-previous[i]));assert(Math.abs(h.offset-previous[i])<=R.maximumMoverSpeed*.05+1e-7);previous[i]=h.offset;


   const largestPassage=15-h.width/2+Math.abs(h.offset);minimumLargestPassage=Math.min(minimumLargestPassage,largestPassage);assert(largestPassage>=R.minimumFreeCorridor);
   for(const lx of [-h.width/2,h.width/2])for(const lz of [-h.length/2,h.length/2])assert(pointInRoad(h.x+Math.cos(h.heading)*lx+Math.sin(h.heading)*lz,h.z-Math.sin(h.heading)*lx+Math.cos(h.heading)*lz,.5));
   if(h.motion.crossesCenter){if(roadHazardContact(h,p.x,p.z,p.heading))seenCenter.add(h.id);const side=h.offset<=0?1:-1;assert.equal(h.bypassSide,side);const x=p.x+p.right.x*10.4*side,z=p.z+p.right.z*10.4*side;assert(!s.contact(x,z,p.heading));assert(truckInRoad(x,z,p.heading,p));}
  }frames++;
 }
 assert.equal(seenCenter.size,20,'Every center-crosser really obstructs the center lane during its cycle');assert.equal(JSON.stringify(s.hazards),descriptors);assert.equal(JSON.stringify(s.rocks),rocks);identities.forEach((h,i)=>assert.equal(s.poses[i],h));
 return {frames,moverFrames:frames*20,minimumLargestPassage,maximumStep,centerLaneObstructions:seenCenter.size};
});
check('Capped visible time, invalid inputs, pause, reset and replay preserve bounded pool identities',()=>{
 const a=createRoadHazards(42),b=createRoadHazards(42),initial=JSON.stringify(a.poses),identity=[...a.movers],input=structuredClone(player);
 for(let i=0;i<60;i++){a.update(.05,player,true);b.update(.05,player,true)}assert.deepEqual(a.poses,b.poses);assert.deepEqual(player,input);
 const snapshot=JSON.stringify(a.poses),time=a.elapsed;
 for(const dt of [NaN,Infinity,-1,0])a.update(dt,player,true);a.update(12,player,false);a.update(.1,{...player,x:NaN},true);assert.equal(JSON.stringify(a.poses),snapshot);near(a.elapsed,time);
 a.update(3600,player,true);b.update(.1,player,true);near(a.elapsed,time+.1);assert.deepEqual(a.poses,b.poses);
 a.reset();assert.equal(a.elapsed,0);assert.equal(JSON.stringify(a.poses),initial);identity.forEach((h,i)=>assert.equal(a.movers[i],h));assert(a.rocks.every(r=>r.phase==='landed'&&r.altitude===0&&!r.shadowVisible));
 for(let i=0;i<100;i++){a.update(.05,player,true);a.reset()}assert.equal(JSON.stringify(a.poses),initial);return {resets:101,maxDelta:R.maxDelta,staticBasalt:4};
});
check('Two new instanced pools show exact live collision footprints and terrain-conforming heights',()=>{
 const system=createRoadHazards(42),visual=createRoadHazardsScene(THREE,{system,groundHeight});const matrix=new THREE.Matrix4(),v=new THREE.Vector3();let checkedVertices=0,maxDaylight=-Infinity,maxBurial=0;
 const originals=visual.group.children.map(mesh=>[mesh,mesh.geometry,mesh.material,mesh.instanceMatrix?.array]);
 for(const seconds of [0,3,7,15,22,34,43]){
  while(system.elapsed<seconds-.001)system.update(Math.min(.05,seconds-system.elapsed),player,true);visual.update(.05);
  for(const mesh of visual.group.children.filter(m=>m.isInstancedMesh))for(let i=0;i<mesh.count;i++){
   const h=system.poseFor(mesh.userData.hazardIds[i]);if(!h?.motion)continue;mesh.getMatrixAt(i,matrix);near(matrix.elements[12],h.x,.002);near(matrix.elements[14],h.z,.002);const p=mesh.geometry.attributes.position;
   for(let j=0;j<p.count;j++){v.fromBufferAttribute(p,j).applyMatrix4(matrix);const dx=v.x-h.x,dz=v.z-h.z,lx=Math.cos(h.heading)*dx-Math.sin(h.heading)*dz,lz=Math.sin(h.heading)*dx+Math.cos(h.heading)*dz;assert(Math.abs(lx)<=h.width/2+.003);assert(Math.abs(lz)<=h.length/2+.003);if(p.getY(j)===0){const gap=v.y-groundHeight(v.x,v.z);maxDaylight=Math.max(maxDaylight,gap);maxBurial=Math.max(maxBurial,-gap);assert(gap<.001,`${h.id}: daylight ${gap}`);assert(gap>-.06,`${h.id}: burial ${gap}`)}checkedVertices++;}
  }
 }
 originals.forEach(([m,g,material,buffer],i)=>{assert.equal(visual.group.children[i],m);assert.equal(m.geometry,g);assert.equal(m.material,material);assert.equal(m.instanceMatrix?.array,buffer)});
 assert.equal(visual.stats.drawCalls,8);assert.equal(visual.stats.instancedMeshes,6);assert.equal(visual.stats.movers,20);assert.equal(visual.stats.visibleRocks,4);assert.equal(visual.stats.visibleWarnings,0);assert(visual.stats.triangles<8500);
 const stats={...visual.stats};visual.dispose();visual.dispose();visual.update(.1);assert.equal(visual.stats.drawCalls,0);assert.equal(visual.group.children.length,0);return {checkedVertices,maxDaylight,maxBurial,stats};
});
check('Runtime and scene CPU work stays pooled with no growing geometry or external clock',()=>{
 const system=createRoadHazards(42),visual=createRoadHazardsScene(THREE,{system,groundHeight}),times=[];
 for(let i=0;i<180;i++){const start=performance.now();system.update(1/60,player,true);visual.update(1/60);if(i>=30)times.push(performance.now()-start)}times.sort((a,b)=>a-b);const cpu={frames:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:times[Math.floor(times.length*.95)],maximumMs:times.at(-1),limitation:'Shared CPU Node timing only; no GPU FPS claim'};
 const source=fs.readFileSync(new URL('../dist/road-hazards.js',import.meta.url),'utf8');assert.doesNotMatch(source,/globalThis|CANDIDATE_|legacyCandidate|candidateExpansionPoints|candidateExpanded|addExpandedHazards/);assert.doesNotMatch(source,/Math\.random|setInterval|setTimeout|Date\.|performance\.|localStorage|document\.|window\.|player\.(?:x|z|heading|velocityX|velocityZ)\s*=(?!=)/);visual.dispose();return cpu;
});
report.generatedAt=new Date().toISOString();report.runtimeHashes=Object.fromEntries(['road-hazards.js','road-hazards-scene.js','road-bridges.js'].map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL('../dist/'+f,import.meta.url))).digest('hex')]));fs.mkdirSync(new URL('../qa/moving-road-hazards/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/moving-road-hazards/contracts.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`${report.checks.length} moving hazard groups passed.`);
