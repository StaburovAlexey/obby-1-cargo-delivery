import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as route from '../dist/route-network.js';
import {createRoadHazards} from '../dist/road-hazards.js';
const player={x:0,z:0,heading:0};
const fields=s=>({height:s.height,gradient:s.gradient,normal:s.normal,onRoad:s.onRoad});
async function transformedModule(url,transform){const original=await fs.readFile(url,'utf8'),source=transform(original).replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g,(_,quote,relative)=>`from ${quote}${new URL(relative,url).href}${quote}`);return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);}

test('plane sampler exactly matches full projection height and gradients at seeded mover poses and triangle borders',()=>{
 assert.equal(typeof route.sampleRoadSurfacePlane,'function','height/gradient queries need a projection-free plane sampler');
 let comparisons=0;
 for(const seed of [0,1,42,255]){
  const system=createRoadHazards(seed),frames=new Map(system.movers.map(h=>[h.id,route.pointOnEdge(h.edgeId,h.edgeDistance)]));
  for(const dt of [0,1/60,.1,.1,.1,.1,.1,.1,.1,.1,.1,.1,.1]){
   if(dt)system.update(dt,player);
   for(const h of system.movers){assert.deepEqual(fields(route.sampleRoadSurfacePlane(h.x,h.z,frames.get(h.id))),fields(route.queryRoadSurface(h.x,h.z,frames.get(h.id))),`${seed}/${system.elapsed}/${h.id}`);comparisons++;}
  }
 }
 for(const mesh of [route.ROAD_MESH,route.GROUND_MESH]){
  const step=Math.max(3,Math.floor(mesh.indices.length/90/3)*3);
  for(let i=0;i<mesh.indices.length;i+=step){
   const points=mesh.indices.slice(i,i+3).map(n=>({x:mesh.positions[n*3],z:mesh.positions[n*3+2]}));
   for(const p of [...points,{x:(points[0].x+points[1].x)/2,z:(points[0].z+points[1].z)/2}])for(const epsilon of [-1e-8,0,1e-8]){
    const x=p.x+epsilon,z=p.z-epsilon;assert.deepEqual(fields(route.sampleRoadSurfacePlane(x,z)),fields(route.queryRoadSurface(x,z)),`triangle border ${x},${z}`);comparisons++;
   }
  }
 }
 console.log(`exact plane samples: ${comparisons}`);
});

test('plane sampler falls back to the full original result outside indexed surfaces and for invalid coordinates',()=>{
 assert.equal(typeof route.sampleRoadSurfacePlane,'function');
 const history=route.routePointAtProgress(2000);
 for(const [x,z] of [[1e7,1e7],[-1e7,-1e7],[NaN,0],[0,Infinity],[-Infinity,0]])for(const hint of [undefined,history])assert.deepEqual(route.sampleRoadSurfacePlane(x,z,hint),route.queryRoadSurface(x,z,hint));
});

test('indexed plane samples do zero route projections while unsupported fallback still projects',async()=>{
 assert.equal(typeof route.sampleRoadSurfacePlane,'function');
 const key='__fpsPlaneProjectCalls',url=new URL('../dist/route-network.js',import.meta.url);
 const measured=await transformedModule(url,source=>{const needle='export function projectRoad(x,z,history){';assert.ok(source.includes(needle));return source.replace(needle,`${needle}globalThis.${key}++;`);});
 try{
  globalThis[key]=0;
  const system=createRoadHazards(42);
  for(const h of system.movers)measured.sampleRoadSurfacePlane(h.x,h.z,route.pointOnEdge(h.edgeId,h.edgeDistance));
  assert.equal(globalThis[key],0,'every mover is covered by the exact road/ground triangle index');
  measured.sampleRoadSurfacePlane(1e7,-1e7);assert.equal(globalThis[key],1,'unsupported points retain original projection fallback');
 }finally{delete globalThis[key];}
});

test('all live mover pose fields remain exact against the original projection sampler over fixed ticks, pause and reset',async()=>{
 assert.equal(typeof route.sampleRoadSurfacePlane,'function');
 const reference=await transformedModule(new URL('../dist/road-hazards.js',import.meta.url),source=>{const needle='sampleRoadSurfacePlane(h.x,h.z,p)';assert.ok(source.includes(needle),'reference must replace only the mover plane call');return source.replace(needle,'queryRoadSurface(h.x,h.z,p)');});
 for(const seed of [0,42]){
  const expected=reference.createRoadHazards(seed),actual=createRoadHazards(seed),identities=[...actual.movers];
  for(let frame=0;frame<180;frame++){
   expected.update(1/60,player);actual.update(1/60,player);
   assert.equal(actual.elapsed,expected.elapsed);assert.deepEqual(actual.poses,expected.poses,`seed ${seed} fixed frame ${frame}`);
  }
  expected.update(1000,player,false);actual.update(1000,player,false);assert.deepEqual(actual.poses,expected.poses);
  expected.reset();actual.reset();assert.deepEqual(actual.poses,expected.poses);actual.movers.forEach((h,i)=>assert.equal(h,identities[i]));
 }
});
