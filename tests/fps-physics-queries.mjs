import test from 'node:test';
import assert from 'node:assert/strict';
import * as hazardsModule from '../dist/road-hazards.js';
const {createRoadHazards,roadHazardPatchDistance,ROAD_HAZARD_RULES:R}=hazardsModule;
const base={frictionFactor:1.1,lateralDampingFactor:1.2,rollingFactor:.8,engineFactor:.9,speedFactor:.7,coastingFactor:1.3,vibration:.2,unrelated:'preserved'};
const factors={dune:{frictionFactor:.95,lateralDampingFactor:.95,rollingFactor:1.28,engineFactor:.86,speedFactor:.8,coastingFactor:1.1},ice:{frictionFactor:.62,lateralDampingFactor:.5,rollingFactor:.9,engineFactor:.94,coastingFactor:.76}};
function linearSurface(patches,x,z){
 for(const h of patches){const edge=Math.max(0,Math.min(1,roadHazardPatchDistance(h,x,z)/R.softEdgeMetres)),weight=edge*edge*(3-2*edge);if(weight<=0)continue;const result={...base};for(const [key,factor] of Object.entries(factors[h.type]))result[key]=base[key]*(1+(factor-1)*weight);if(h.type==='dune')result.vibration=Math.min(1,base.vibration+.08*weight);return result;}return base;
}
function worldPoint(h,p,scale=1){const c=Math.cos(h.heading),s=Math.sin(h.heading);return {x:h.x+(c*p.x+s*p.z)*scale,z:h.z+(-s*p.x+c*p.z)*scale};}

test('static patch index rejects distant geometry and preserves overlap ordering and all finite margins',()=>{
 assert.equal(typeof hazardsModule.createRoadHazardPatchIndex,'function','query index must be available for synthetic overlap and work-count probes');
 const square=[{x:-4,z:-4},{x:4,z:-4},{x:4,z:4},{x:-4,z:4}];
 const patches=Array.from({length:120},(_,i)=>({id:i,x:i<2?0:i*100,z:i<2?0:i*17,heading:i%3*.4,width:8,length:8,patchOutline:square}));
 const index=hazardsModule.createRoadHazardPatchIndex(patches);
 assert.deepEqual(index.candidatesAt(-1000,-1000),[]);
 assert.deepEqual(index.candidatesAt(0,0).map(h=>h.id),[0,1]);
 for(const x of [-64,-4,-1e-8,0,4,64,1400])for(const z of [-64,-4,0,4,64,238])for(const margin of [-2,0,1e-8,3,64,1e6,Number.MAX_VALUE]){
  const expected=patches.find(h=>roadHazardPatchDistance(h,x,z)>=-margin-1e-8)||null;
  const actual=index.candidatesAt(x,z,margin).find(h=>roadHazardPatchDistance(h,x,z)>=-margin-1e-8)||null;
  assert.equal(actual,expected,`${x},${z},margin=${margin}`);
 }
 assert.ok(index.candidatesAt(0,0).length<patches.length/10,'nearby query must avoid visiting every patch');
});

test('indexed surface and entry results exactly match the linear baseline across seeds, edges, margins and grid boundaries',()=>{
 let queries=0;
 for(const seed of [0,1,42,255]){
  const system=createRoadHazards(seed),patches=system.poses.filter(h=>h.edgeBlend),points=[];
  for(const h of patches){
   points.push({x:h.x,z:h.z});
   for(const p of h.patchOutline)for(const scale of [1-1e-7,1,1+1e-7])points.push(worldPoint(h,p,scale));
   for(const sx of [-1,1])for(const sz of [-1,1])points.push(worldPoint(h,{x:sx*h.width/2,z:sz*h.length/2}));
   for(const axis of ['x','z'])for(const delta of [-1e-8,0,1e-8])points.push({...h,[axis]:Math.floor(h[axis]/64)*64+delta});
  }
  points.push({x:-64,z:-64},{x:0,z:0},{x:1e7,z:-1e7});
  const linearEntries=[],indexedEntries=[];
  for(const p of points){
   const expectedSurface=linearSurface(patches,p.x,p.z),actualSurface=system.surfaceAt(p.x,p.z,base);
   assert.deepEqual(actualSurface,expectedSurface,`seed ${seed}:surface ${p.x},${p.z}`);
   if(expectedSurface===base)assert.equal(actualSurface,base,'outside query retains base object identity');
   for(const margin of [-2.5,-1e-8,0,1e-8,.8,2,2.5,64,10000]){
    const expected=patches.find(h=>roadHazardPatchDistance(h,p.x,p.z)>=-margin-1e-8)||null;
    const actual=system.patchAt(p.x,p.z,margin);assert.equal(actual,expected,`seed ${seed}:patch margin=${margin} at ${p.x},${p.z}`);queries++;
    if(margin===2){linearEntries.push(expected?.id??null);indexedEntries.push(actual?.id??null);}
   }
  }
  assert.deepEqual(indexedEntries,linearEntries,'entry/exit id sequence used for fuel entry stays exact');
  for(const invalid of [NaN,Infinity,-Infinity]){assert.equal(system.patchAt(invalid,0),null);assert.equal(system.patchAt(0,0,invalid),null);assert.equal(system.surfaceAt(0,invalid,base),base);}
 }
 console.log(`patch equivalence: ${queries} margin queries plus weighted surfaces`);
});
