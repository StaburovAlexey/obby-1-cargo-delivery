import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import * as N from '../dist/route-network.js';
import * as C from '../dist/route-network-config.js';
import {BRIDGES,bridgeSupport} from '../dist/road-bridges.js';
import {buildRoadHazards,roadHazardContact,ROAD_HAZARD_EXCLUSIONS,ROAD_HAZARD_RULES as R} from '../dist/road-hazards.js';
import {buildCity,createRoadFootprintIndex,polygonIntersectionArea} from '../dist/network-scene.js';

const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} differs from ${b}`);
const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const report={scope:'Deterministic production route, actual collision/mesh footprints and CPU scene geometry. Input-only physical driving and browser feel are separate checks.',passed:false};
const expectedBiomes={city:6,forest:5,desert:5,snow:4,volcanic:10};
const expectedTypes={repair:2,log:1,dune:1,ice:1,rock:6,barrier:7,boulder:12};

near(N.ROUTE_LENGTH,15868.841887310184,1e-8);
assert.equal(C.NETWORK_CONFIG.end,15850);
assert.equal(C.NETWORK_CONFIG.halfWidth,15);
assert.equal(C.BIOME_DEFINITIONS.length,5);
assert.equal(C.FORK_DEFINITIONS.length,4);
assert.deepEqual(C.CHECKPOINT_PROGRESS,[180,440,780,1140,1540,1980,2480,3040,3670,4380,5180,6080,7520,9390,11830,15830]);
assert.equal(C.TURN_DEFINITIONS.length,28);
const technical=C.TURN_DEFINITIONS.filter(([from,to])=>to-from<=120);
assert.equal(technical.length,9);
report.turns=C.TURN_DEFINITIONS.map(([from,to,a,b])=>({from,to,length:to-from,headingChangeDegrees:(b-a)*180/Math.PI,minimumRadius:(to-from)/(1.875*Math.abs(b-a))}));
assert.ok(report.turns.filter(t=>t.length>=400).reduce((s,t)=>s+t.length,0)/report.turns.reduce((s,t)=>s+t.length,0)>.5,'Most of the route uses long smooth sweeps');
for(const biome of C.BIOME_DEFINITIONS)assert.ok(report.turns.some(t=>(t.from+t.to)/2>=biome.from&&(t.from+t.to)/2<biome.to&&t.minimumRadius<60),`${biome.id} has a meaningful technical bend`);
assert.ok(report.turns.every(t=>t.minimumRadius>=35));
for(let q=1112;q<=1168;q++)near(N.routePointAtProgress(q).curvature,0);

let samples=0,maximumCurvature=0,maximumDerivativeError=0;
for(const edge of N.NETWORK_EDGES)for(let q=Math.max(6,edge.progressFrom+6);q<Math.min(C.NETWORK_CONFIG.end-6,edge.progressTo-6);q+=2){
 const p=N.routePointAtProgress(q,{branch:edge.branch});
 assert.equal(p.edgeId,edge.id);
 assert.ok(p.tangent.z<-.7,'The route never doubles back');
 maximumCurvature=Math.max(maximumCurvature,Math.abs(p.curvature));
 for(const offset of [-8,0,8])for(const yaw of [-20,0,20]){
  assert.ok(N.truckInRoad(p.x+p.right.x*offset,p.z+p.right.z*offset,p.heading+yaw*Math.PI/180,p),`Recovery footprint at ${q}/${offset}/${yaw}`);
 }
 if(!edge.forkId){
  assert.ok(1-15*Math.abs(p.curvature)>.57,'Inside asphalt edge does not fold');
  const a=N.routePointAtProgress(q-.01),b=N.routePointAtProgress(q+.01);
  const error=Math.hypot((b.x-a.x)/.02-p.tangent.x,(b.z-a.z)/.02-p.tangent.z);
  maximumDerivativeError=Math.max(maximumDerivativeError,error);
  assert.ok(error<1e-6,'Short-turn centerline uses sufficiently dense samples');
 }
 samples++;
}
report.corridor={samples,bodyPoseChecks:samples*9,maximumCurvature,maximumDerivativeError,minimumTechnicalRadius:Math.min(...report.turns.map(t=>t.minimumRadius))};

let bridgeSamples=0,maximumBridgeCurvature=0,maximumBridgeGrade=0;
assert.equal(BRIDGES.length,25);
for(const b of BRIDGES){
 assert.equal(b.to-b.from,24);assert.equal(b.halfWidth,2.5);
 for(let q=b.from-60;q<=b.to+60;q+=.5){
  const p=N.routePointAtProgress(q),k=Math.abs(p.curvature),grade=Math.hypot(p.gradient.x,p.gradient.z);
  assert.equal(p.biome,b.biome);assert.ok(k<=.0013+1e-9);assert.ok(grade<=.065+1e-9);
  maximumBridgeCurvature=Math.max(maximumBridgeCurvature,k);maximumBridgeGrade=Math.max(maximumBridgeGrade,grade);
  if(q>=b.from&&q<=b.to)for(const reverse of [0,Math.PI])for(const yaw of [-5,0,5])assert.equal(bridgeSupport({x:p.x+p.right.x*b.offset,z:p.z+p.right.z*b.offset,heading:p.heading+reverse+yaw*Math.PI/180},p).fall,false);
  bridgeSamples++;
 }
}
report.bridges={count:25,approachSamples:bridgeSamples,maximumBridgeCurvature,maximumBridgeGrade};
for(const q of [...C.CHECKPOINT_PROGRESS,...C.PREVIEW_PROGRESS.map(p=>p.progress)])for(let d=-20;d<=20;d+=2){
 const p=N.routePointAtProgress(q+d);near(p.height,N.routeHeight(q));near(Math.hypot(p.gradient.x,p.gradient.z),0);
}

let approachSamples=0,footprints=0,maximumHazardCurvature=0,minimumHazardSpacing=Infinity,minimumPassingWidth=Infinity;
const recovery=C.HAZARD_FREE_DRIVING_SECTIONS.map(s=>({...s,start:N.routeDistanceAt(s.from)-s.recovery,end:N.routeDistanceAt(s.to)+s.recovery}));
for(let seed=0;seed<32;seed++){
 const hazards=buildRoadHazards(seed);assert.equal(hazards.length,30);assert.equal(R.count,30);assert.equal(R.movingCount,30);
 assert.deepEqual(hazards,buildRoadHazards(seed));assert.equal(new Set(hazards.map(h=>h.id)).size,30);
 assert.deepEqual(Object.fromEntries(C.BIOME_DEFINITIONS.map(b=>[b.id,hazards.filter(h=>h.biome===b.id).length])),expectedBiomes);
 assert.deepEqual(Object.fromEntries(Object.keys(expectedTypes).map(t=>[t,hazards.filter(h=>h.type===t).length])),expectedTypes);
 for(const [i,h] of hazards.entries()){
  const p=N.pointOnEdge(h.edgeId,h.edgeDistance),extent=Math.hypot(h.width,h.length)/2+1;
  assert.ok(Object.isFrozen(h));assert.ok(h.motion&&h.motion.crossesCenter);assert.ok(!N.getEdge(h.edgeId).forkId,'Forks are reserved for steering/recovery');
  assert.equal(h.motion.travelSeconds,8);assert.equal(h.motion.pauseSeconds,1.4);
  for(const section of recovery)assert.ok(h.distance+extent<section.start||h.distance-extent>section.end,`${h.id} intrudes on ${section.id}`);
  for(const exclusion of ROAD_HAZARD_EXCLUSIONS)assert.ok(Math.abs(h.distance-exclusion.distance)>=exclusion.radius+extent-1e-6);
  assert.ok(hazards.filter(other=>other.distance>=h.distance&&other.distance<h.distance+320).length<=2,'No three-hazard chain in a 320 m driving window');
  if(i){const gap=h.distance-hazards[i-1].distance;assert.ok(gap>=180-1e-6);minimumHazardSpacing=Math.min(minimumHazardSpacing,gap);}
  for(let d=-100;d<=100;d+=2.5){
   const q=N.pointOnEdge(h.edgeId,h.edgeDistance+d);maximumHazardCurvature=Math.max(maximumHazardCurvature,Math.abs(q.curvature));
   assert.ok(Math.abs(q.curvature)<=.0025+1e-9);assert.ok(Math.abs(angle(q.heading,p.heading))<=.34+1e-9);assert.ok(Math.hypot(q.gradient.x,q.gradient.z)<=.105+1e-9);approachSamples++;
  }
  for(const offset of [h.motion.minOffset,0,h.motion.maxOffset]){
   const pose={...h,offset,x:p.x+p.right.x*offset,z:p.z+p.right.z*offset},passingWidth=15-h.width/2+Math.abs(offset);
   assert.ok(passingWidth>=R.minimumFreeCorridor);minimumPassingWidth=Math.min(minimumPassingWidth,passingWidth);
   const side=offset<=0?1:-1,x=p.x+p.right.x*10.4*side,z=p.z+p.right.z*10.4*side;
   assert.equal(roadHazardContact(pose,x,z,p.heading,0,{halfWidth:2.9,halfLength:3.6}),undefined,'A full-size body can pass on the open side');
   assert.ok(N.truckInRoad(x,z,p.heading,p));
   for(const right of [-1,0,1])for(const forward of [-1,0,1]){
    const x=pose.x+Math.cos(h.heading)*right*h.width/2+Math.sin(h.heading)*forward*h.length/2;
    const z=pose.z-Math.sin(h.heading)*right*h.width/2+Math.cos(h.heading)*forward*h.length/2;
    assert.ok(N.pointInRoad(x,z,.4));footprints++;
   }
  }
 }
}
report.hazards={count:30,moving:30,seeds:32,byBiome:expectedBiomes,byType:expectedTypes,approachSamples,footprintPoints:footprints,maximumHazardCurvature,minimumHazardSpacing,minimumPassingWidth,recoverySections:recovery};

const road=createRoadFootprintIndex(N.ROAD_MESH),ground=createRoadFootprintIndex(N.GROUND_MESH);
let roadPairs=0,groundPairs=0,maximumRoadOverlap=0,maximumGroundOverlap=0,maximumRoadGroundOverlap=0;
for(const a of road.triangles)for(const b of road.candidates(a.p))if(b.id>a.id){
 const area=polygonIntersectionArea(a.p,b.p);maximumRoadOverlap=Math.max(maximumRoadOverlap,area);assert.ok(area<.002);roadPairs++;
}
for(const a of ground.triangles){
 for(const b of road.candidates(a.p)){const area=polygonIntersectionArea(a.p,b.p);maximumRoadGroundOverlap=Math.max(maximumRoadGroundOverlap,area);assert.ok(area<.004);}
 // The compact city S needs a tapered inside shoulder. Check the complete
 // tapered region and its joins, where the old 110 m shoulder folded.
 const q=N.GROUND_MESH.progress[N.GROUND_MESH.indices[a.id*3]];
 if(!technical.some(([from,to])=>q>=from-65&&q<=to+65))continue;
 for(const b of ground.candidates(a.p))if(b.id>a.id){const area=polygonIntersectionArea(a.p,b.p);maximumGroundOverlap=Math.max(maximumGroundOverlap,area);assert.ok(area<.004);groundPairs++;}
}
const city=buildCity(THREE);let buildings=0,barriers=0,housePairs=0,maximumHouseOverlap=0;
try{
 const houses=[];
 for(const feature of city.features.filter(f=>f.type==='building'||f.type==='barrier'&&f.side)){
  const footprint=feature.footprint.map(p=>({x:Math.fround(p.x),z:Math.fround(-p.y)}));
  assert.ok(!road.intersects(footprint,.001),`${feature.type} enters the drivable road`);
  if(feature.type==='building'){buildings++;houses.push(footprint);}else barriers++;
 }
 for(let i=0;i<houses.length;i++)for(let j=i+1;j<houses.length;j++){
  const area=polygonIntersectionArea(houses[i],houses[j]);maximumHouseOverlap=Math.max(maximumHouseOverlap,area);assert.ok(area<.001);housePairs++;
 }
 report.scene={roadPairs,groundPairs,maximumRoadOverlap,maximumGroundOverlap,maximumRoadGroundOverlap,buildings,barriers,housePairs,maximumHouseOverlap,drawCalls:city.stats.drawCalls,triangles:city.stats.triangles};
}finally{city.dispose();}
report.routeLength=N.ROUTE_LENGTH;
report.sourceHashes=Object.fromEntries(['route-network-config.js','route-network.js','road-hazards.js','network-scene.js'].map(file=>[file,createHash('sha256').update(fs.readFileSync(new URL('../dist/'+file,import.meta.url))).digest('hex')]));
report.passed=true;
fs.mkdirSync(new URL('../qa/controlled-skid/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../qa/controlled-skid/routes.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
