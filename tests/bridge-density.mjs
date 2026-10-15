import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BRIDGES,buildBridges,bridgeAtProgress,bridgeSupport} from '../dist/road-bridges.js';
import {routePointAtProgress,routeDistanceAt,queryRoadSurface} from '../dist/route-network.js';
import {BIOME_DEFINITIONS,CHECKPOINT_PROGRESS,FORK_DEFINITIONS,NETWORK_CONFIG,PREVIEW_PROGRESS} from '../dist/route-network-config.js';
import {buildRoadHazards,ROAD_HAZARD_RULES} from '../dist/road-hazards.js';


const baseline42=[
 ['city',950,3.9],['city',2390,0],['city',5640,-6.6],
 ['forest',6620,-5.5],['forest',7380,6],['forest',11580,0],
 ['desert',12750,-6],['desert',13740,0],['desert',18180,5.1],
 ['snow',19440,0],['snow',20670,6.3],['snow',24580,-5.7],
 ['volcanic',25420,-5.5],['volcanic',29250,0],['volcanic',30900,5.1],
].map(([biome,q,offset],i)=>({id:`${biome}-bridge-${i%3+1}`,biome,from:q-12,to:q+12,halfWidth:2.5,offset}));


function legacyFor(seed=42){
 const centers={city:[510,2550,5640],forest:[6660,7380,11580],desert:[12750,13740,18180],snow:[19440,20670,24060],volcanic:[25380,29250,30900]};
 let state=seed>>>0||1;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;return state/4294967296;};
 return Object.entries(centers).flatMap(([biome,points])=>{
  const sides=[-1,0,1];for(let i=2;i>0;i--){const j=Math.floor(random()*(i+1));[sides[i],sides[j]]=[sides[j],sides[i]];}
  return points.map((preferred,i)=>{
   const area=BIOME_DEFINITIONS.find(b=>b.id===biome),candidates=Array.from({length:61},(_,j)=>preferred+(j?Math.ceil(j/2)*40*(j%2?1:-1):0));
   const q=candidates.find(q=>q>area.from+180&&q<area.to-180&&!CHECKPOINT_PROGRESS.some(p=>Math.abs(p-q)<160)&&!FORK_DEFINITIONS.some(f=>q>f.from-150&&q<f.to+150));
   return {id:`${biome}-bridge-${i+1}`,biome,from:q-12,to:q+12,halfWidth:2.5,offset:sides[i]*Math.round((3.5+random()*3.5)*10)/10};
  });
 });
}
assert.deepEqual(BRIDGES.slice(0,15),baseline42);
assert.deepEqual(buildBridges(),BRIDGES);
const center=b=>(b.from+b.to)/2,added=b=>Number(b.id.split('-').at(-1))>3;
let geometryProbes=0,supportProbes=0,maxAddedGrade=0,maxAllGrade=0,maxAddedCurvature=0,maxAllCurvature=0,maxAddedLateralGrade=0,minSpacing=Infinity;
let minAddedCheckpointDeckClearance=Infinity,minAddedForkDeckClearance=Infinity,minAddedPreviewDeckClearance=Infinity;
const rows=[];
function structuralChecks(bridges){
 assert.equal(bridges.length,45);assert.equal(new Set(bridges.map(b=>b.id)).size,45);assert.ok(Object.isFrozen(bridges));
 for(const biome of BIOME_DEFINITIONS){
  const local=bridges.filter(b=>b.biome===biome.id);assert.equal(local.length,9);
  assert.deepEqual(local.map(b=>b.id).sort(),Array.from({length:9},(_,i)=>`${biome.id}-bridge-${i+1}`).sort());
  assert.deepEqual([-1,0,1].map(side=>local.filter(b=>Math.sign(b.offset)===side).length),[3,3,3]);
 }
 const ordered=bridges.slice().sort((a,b)=>center(a)-center(b));
 for(let i=1;i<ordered.length;i++)assert.ok(routeDistanceAt(center(ordered[i]))-routeDistanceAt(center(ordered[i-1]))>=220);
 for(const b of bridges){
  assert.ok(Object.isFrozen(b));assert.equal(b.to-b.from,24);assert.equal(b.halfWidth*2,5);
  assert.ok(Math.abs(b.offset)+b.halfWidth<=NETWORK_CONFIG.halfWidth);
  assert.ok(b.from>CHECKPOINT_PROGRESS[2]+150,'Starter section through first three stops stays bridge-free');
  assert.ok(CHECKPOINT_PROGRESS.every(p=>Math.abs(center(b)-p)>=160));
  assert.ok(FORK_DEFINITIONS.every(f=>center(b)<=f.from-150||center(b)>=f.to+150));
  if(added(b)){
   const from=routeDistanceAt(b.from),to=routeDistanceAt(b.to);
   for(const p of [...CHECKPOINT_PROGRESS,...PREVIEW_PROGRESS.map(p=>p.progress)].map(routeDistanceAt))assert.ok(p<=from-160||p>=to+160);
   for(const f of FORK_DEFINITIONS)assert.ok(to<=routeDistanceAt(f.from)-150||from>=routeDistanceAt(f.to)+150);
  }
 }
}
structuralChecks(BRIDGES);
const seeds=[...Array.from({length:128},(_,i)=>i),2026,0x12345678,0x7fffffff,0xffffffff,-1];
const seededCenters=new Set();
for(const seed of seeds){const result=buildBridges(seed);structuralChecks(result);assert.deepEqual(result.slice(0,15),legacyFor(seed));assert.deepEqual(result,buildBridges(seed));for(const b of result.slice(15))seededCenters.add(center(b));}
let seededGeometryProbes=0,maximumSeededAddedApproachGrade=0,maximumSeededAddedApproachCurvature=0;
for(const q of seededCenters)for(let d=-72;d<=72;d+=.5){
 const p=routePointAtProgress(q+d),g=Math.hypot(p.gradient.x,p.gradient.z),k=Math.abs(p.curvature);seededGeometryProbes++;
 assert.ok(g<=.065+1e-9,`Seeded approach grade at ${q+d}: ${g}`);assert.ok(k<=.0013+1e-9);
 maximumSeededAddedApproachGrade=Math.max(maximumSeededAddedApproachGrade,g);maximumSeededAddedApproachCurvature=Math.max(maximumSeededAddedApproachCurvature,k);
}
assert.notDeepEqual(buildBridges(41).slice(15).map(center),BRIDGES.slice(15).map(center),'Seed changes added longitudinal placements');
assert.notDeepEqual(buildBridges(41).slice(15).map(b=>b.offset),BRIDGES.slice(15).map(b=>b.offset),'Seed changes lateral placements');
for(const b of BRIDGES){
 let grade=0,curvature=0,lateralGrade=0,headingSpan=0;const start=routePointAtProgress(b.from-60);
 for(let q=b.from-60;q<=b.to+60;q+=.5){
  const p=routePointAtProgress(q),g=Math.hypot(p.gradient.x,p.gradient.z),k=Math.abs(p.curvature);geometryProbes++;
  grade=Math.max(grade,g);curvature=Math.max(curvature,k);headingSpan=Math.max(headingSpan,Math.abs(Math.atan2(Math.sin(p.heading-start.heading),Math.cos(p.heading-start.heading))));
  assert.equal(p.biome,b.biome);assert.equal(p.edgeId,start.edgeId);
  if(added(b)){
   assert.ok(g<=.065+1e-9,`${b.id}: added approach grade ${g}`);assert.ok(k<=.0013+1e-9,`${b.id}: added approach curvature ${k}`);
   for(const offset of [b.offset-b.halfWidth,b.offset+b.halfWidth]){
    const surface=queryRoadSurface(p.x+p.right.x*offset,p.z+p.right.z*offset,p);assert.ok(surface.onRoad);
    lateralGrade=Math.max(lateralGrade,Math.hypot(surface.gradient.x,surface.gradient.z));
   }
  }
 }
 maxAllGrade=Math.max(maxAllGrade,grade);maxAllCurvature=Math.max(maxAllCurvature,curvature);
 if(added(b)){
  maxAddedGrade=Math.max(maxAddedGrade,grade);maxAddedCurvature=Math.max(maxAddedCurvature,curvature);maxAddedLateralGrade=Math.max(maxAddedLateralGrade,lateralGrade);
  assert.ok(lateralGrade<.067);assert.ok(headingSpan<.19);
  const from=routeDistanceAt(b.from),to=routeDistanceAt(b.to);
  minAddedCheckpointDeckClearance=Math.min(minAddedCheckpointDeckClearance,...CHECKPOINT_PROGRESS.map(routeDistanceAt).map(p=>Math.min(Math.abs(p-from),Math.abs(p-to))));
  minAddedPreviewDeckClearance=Math.min(minAddedPreviewDeckClearance,...PREVIEW_PROGRESS.map(p=>routeDistanceAt(p.progress)).map(p=>Math.min(Math.abs(p-from),Math.abs(p-to))));
  minAddedForkDeckClearance=Math.min(minAddedForkDeckClearance,...FORK_DEFINITIONS.flatMap(f=>[routeDistanceAt(f.from),routeDistanceAt(f.to)]).map(p=>Math.min(Math.abs(p-from),Math.abs(p-to))));
 }
 for(const q of [b.from-2,b.from,b.from+2,center(b),b.to-2,b.to,b.to+2]){
  const p=routePointAtProgress(q);for(const reverse of [0,Math.PI])for(const yaw of [-5,0,5]){
   const pose={x:p.x+p.right.x*b.offset,z:p.z+p.right.z*b.offset,heading:p.heading+reverse+yaw*Math.PI/180};
   assert.equal(bridgeSupport(pose,p).fall,false,`${b.id}: centered support ${q}/${reverse}/${yaw}`);supportProbes++;
  }
 }
 assert.equal(bridgeAtProgress(center(b)).id,b.id);
 rows.push({...b,center:center(b),added:added(b),maximumApproachGrade:grade,maximumApproachCurvature:curvature,maximumDeckEdgeApproachGrade:lateralGrade,approachHeadingSpanRadians:headingSpan});
}
const sorted=BRIDGES.slice().sort((a,b)=>center(a)-center(b)),gaps=[];
for(let i=1;i<sorted.length;i++){const gap=routeDistanceAt(center(sorted[i]))-routeDistanceAt(center(sorted[i-1]));gaps.push(gap);minSpacing=Math.min(minSpacing,gap);}
assert.ok(new Set(gaps.map(g=>Math.round(g))).size>20,'Distribution has varied longitudinal gaps');
const hazards=buildRoadHazards();assert.equal(hazards.length,ROAD_HAZARD_RULES.count);
const report={status:'PASS',bridgeCount:45,perBiome:Object.fromEntries(BIOME_DEFINITIONS.map(b=>[b.id,9])),seedCases:seeds.length,legacyDescriptorsPreserved:15,newDescriptors:30,width:5,length:24,firstBridgeCenter:950,firstThreeCheckpoints:CHECKPOINT_PROGRESS.slice(0,3),geometryProbes,supportProbes,seededGeometryProbes,uniqueSeededAddedCenters:seededCenters.size,maximumSeededAddedApproachGrade,maximumSeededAddedApproachCurvature,minimumCenterSpacing:minSpacing,minimumAddedCheckpointDeckClearance:minAddedCheckpointDeckClearance,minimumAddedForkDeckClearance:minAddedForkDeckClearance,minimumAddedPreviewDeckClearance:minAddedPreviewDeckClearance,maximumAddedApproachGrade:maxAddedGrade,maximumAllApproachGrade:maxAllGrade,maximumAddedApproachCurvature:maxAddedCurvature,maximumAllApproachCurvature:maxAllCurvature,maximumAddedDeckEdgeApproachGrade:maxAddedLateralGrade,hazardCount:hazards.length,scope:'Node geometry and support; half-metre independent approach samples, 133 deterministic seeds, preserved legacy PRNG/IDs/positions/offsets; no browser/GPU/device claim',legacyNote:'Existing crossings retain their prior approaches, including 9.8% grades. Added crossings alone are bounded to 6.5% centerline grade and .0013 curvature over the deck and both 60 m approaches.',bridges:rows};
fs.mkdirSync(new URL('../qa/bridge-density/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/bridge-density/report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,bridges:undefined}));
