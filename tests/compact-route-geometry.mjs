// Approved compact-route safety regression. Offline geometry and support only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as N from '../dist/route-network.js';
import * as C from '../dist/route-network-config.js';
import {BRIDGES,bridgeSupport} from '../dist/road-bridges.js';
import {buildRoadHazards,ROAD_HAZARD_EXCLUSIONS,ROAD_HAZARD_RULES as R,rockApproachIsClear} from '../dist/road-hazards.js';
const root=new URL('../',import.meta.url),out=new URL('../qa/compact-route/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const violations=[],checks={bridgeSamples:0,bridgeSupport:0,serviceSamples:0},bridgeRows=[];
let maxGrade=0,maxCurvature=0,minService=Infinity,minFork=Infinity,minBridgeSpacing=Infinity;
assert.equal(BRIDGES.length,25);
for(const biome of C.BIOME_DEFINITIONS)assert.equal(BRIDGES.filter(b=>b.biome===biome.id).length,5);
const centers=BRIDGES.map(b=>(b.from+b.to)/2).sort((a,b)=>a-b);
for(let i=1;i<centers.length;i++){const gap=N.routeDistanceAt(centers[i])-N.routeDistanceAt(centers[i-1]);minBridgeSpacing=Math.min(minBridgeSpacing,gap);if(gap<220-1e-6)violations.push({kind:'bridge-spacing',i,gap});}
for(const b of BRIDGES){
 assert.equal(b.to-b.from,24);assert.equal(b.halfWidth*2,5);let grade=0,curvature=0;
 const start=N.routePointAtProgress(b.from-60);
 for(let q=b.from-60;q<=b.to+60;q+=.5){const p=N.routePointAtProgress(q),g=Math.hypot(p.gradient.x,p.gradient.z),k=Math.abs(p.curvature);grade=Math.max(grade,g);curvature=Math.max(curvature,k);checks.bridgeSamples++;if(g>.065+1e-9||k>.0013+1e-9||p.biome!==b.biome||p.edgeId!==start.edgeId)violations.push({kind:'bridge-approach',id:b.id,q,grade:g,curvature:k,edge:p.edgeId});}
 maxGrade=Math.max(maxGrade,grade);maxCurvature=Math.max(maxCurvature,curvature);
 const from=N.routeDistanceAt(b.from),to=N.routeDistanceAt(b.to);
 for(const q of [...C.CHECKPOINT_PROGRESS,...C.PREVIEW_PROGRESS.map(p=>p.progress)]){const d=N.routeDistanceAt(q),margin=Math.max(from-d,d-to);minService=Math.min(minService,margin);if(margin<160-1e-8)violations.push({kind:'bridge-service',id:b.id,q,margin});}
 for(const f of C.FORK_DEFINITIONS){const margin=Math.max(N.routeDistanceAt(f.from)-to,from-N.routeDistanceAt(f.to));minFork=Math.min(minFork,margin);if(margin<150-1e-8)violations.push({kind:'bridge-fork',id:b.id,fork:f.id,margin});}
 for(const q of [b.from-2,b.from,b.from+2,(b.from+b.to)/2,b.to-2,b.to,b.to+2]){const p=N.routePointAtProgress(q);for(const reverse of [0,Math.PI])for(const yaw of [-5,0,5]){const pose={x:p.x+p.right.x*b.offset,z:p.z+p.right.z*b.offset,heading:p.heading+reverse+yaw*Math.PI/180};if(bridgeSupport(pose,p).fall)violations.push({kind:'bridge-support',id:b.id,q,reverse,yaw});checks.bridgeSupport++;}}
 bridgeRows.push({...b,maximumApproachGrade:grade,maximumApproachCurvature:curvature});
}
let maxShelfGrade=0,maxShelfHeightError=0;
for(const q of [...C.CHECKPOINT_PROGRESS,...C.PREVIEW_PROGRESS.map(p=>p.progress)])for(let d=-20;d<=20;d+=.5){const p=N.routePointAtProgress(q+d),err=Math.abs(p.height-N.routeHeight(q));maxShelfHeightError=Math.max(maxShelfHeightError,err);maxShelfGrade=Math.max(maxShelfGrade,Math.hypot(p.gradient.x,p.gradient.z));checks.serviceSamples++;if(err>1e-7||Math.hypot(p.gradient.x,p.gradient.z)>1e-7)violations.push({kind:'service-shelf',q,d,err});}
const hazards=buildRoadHazards(42);let minExclusion=Infinity,minSpacing=Infinity,maxMoverGrade=0,maxMoverCurve=0;
assert.equal(hazards.length,30);assert.equal(hazards.filter(h=>h.motion).length,20);
for(const h of hazards){const extent=Math.hypot(h.width,h.length)/2+1;for(const e of ROAD_HAZARD_EXCLUSIONS){const margin=Math.abs(h.distance-e.distance)-e.radius-extent;minExclusion=Math.min(minExclusion,margin);if(margin< -1e-7)violations.push({kind:'hazard-exclusion',id:h.id,excluded:e.id,margin});}
 const fork=N.FORKS.find(f=>f.id===N.NETWORK_EDGES.find(e=>e.id===h.edgeId)?.forkId);if(fork){const margin=Math.min(h.progress-fork.splitOverlapEnd,fork.mergeOverlapStart-h.progress)-R.forkTipExclusionMetres-extent;if(margin< -1e-7)violations.push({kind:'hazard-fork-tip',id:h.id,margin});}
 if(h.type==='rock'&&!rockApproachIsClear(h))violations.push({kind:'rock-approach',id:h.id});
 for(const o of hazards)if(o!==h&&o.edgeId===h.edgeId){const needed=h.motion||o.motion?R.moverSpacingMetres:R.staticSpacingMetres,margin=Math.abs(h.edgeDistance-o.edgeDistance)-needed;minSpacing=Math.min(minSpacing,margin);if(margin< -1e-7)violations.push({kind:'hazard-spacing',id:h.id,other:o.id,margin});}
 if(h.motion)for(let d=-R.moverSightlineMetres;d<=R.moverSightlineMetres;d+=.5){const p=N.pointOnEdge(h.edgeId,h.edgeDistance+d),g=Math.hypot(p.gradient.x,p.gradient.z),k=Math.abs(p.curvature);maxMoverGrade=Math.max(maxMoverGrade,g);maxMoverCurve=Math.max(maxMoverCurve,k);if(g>R.maximumApproachGrade||k>R.maximumApproachCurvature)violations.push({kind:'mover-sightline',id:h.id,d,g,k});}
}
const forks=N.FORKS.map(f=>{let grade=0,curve=0;for(const branch of ['main','alternate'])for(let q=f.from;q<=f.to;q+=.5){const p=N.routePointAtProgress(q,{branch});grade=Math.max(grade,Math.hypot(p.gradient.x,p.gradient.z));curve=Math.max(curve,Math.abs(p.curvature));}return{id:f.id,from:f.from,to:f.to,maxGrade:grade,maxCurvature:curve};});
const files=['route-network.js','route-network-config.js','road-bridges.js','road-hazards.js','economy-config.js'];
const hashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL('dist/'+f,root))).digest('hex')]));
const report={status:violations.length?'FAIL':'PASS',scope:'Offline real route geometry and bridge support. No browser/GPU/human-playtest claim.',routeLength:N.ROUTE_LENGTH,canonicalEnd:C.NETWORK_CONFIG.end,stops:C.CHECKPOINT_PROGRESS,biomes:C.BIOME_DEFINITIONS,forks,bridgeCount:BRIDGES.length,maximumBridgeGrade:maxGrade,maximumBridgeCurvature:maxCurvature,minServiceClearance:minService,minForkClearance:minFork,minBridgeSpacing,maxShelfGrade,maxShelfHeightError,checks,hazards:{count:hazards.length,moving:hazards.filter(h=>h.motion).length,crossing:hazards.filter(h=>h.motion?.crossesCenter).length,byBiome:Object.fromEntries(C.BIOME_DEFINITIONS.map(b=>[b.id,hazards.filter(h=>h.biome===b.id).length])),minExclusion,minSpacing,maxMoverGrade,maxMoverCurve},hashes,violations,bridges:bridgeRows};
fs.writeFileSync(new URL('geometry.json',out),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(new URL('hazards-seed42.json',out),JSON.stringify(hazards,null,2)+'\n');
console.log(JSON.stringify({...report,bridges:undefined,biomes:undefined},null,2));assert.equal(violations.length,0);
