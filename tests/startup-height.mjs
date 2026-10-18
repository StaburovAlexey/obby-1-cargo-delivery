import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../dist/route-network.js';
import {groundHeight} from '../dist/city-driving.js';

test('height-only hits retain exact road/terrain heights without solving the route curve',t=>{
 const probes=[];
 for(const mesh of [R.ROAD_MESH,R.GROUND_MESH])for(let i=0;i<mesh.indices.length;i+=39){
  let x=0,z=0;for(let j=0;j<3;j++){const n=mesh.indices[i+j]*3;x+=mesh.positions[n]/3;z+=mesh.positions[n+2]/3;}
  probes.push({x,z,height:R.queryRoadSurface(x,z).height});
 }
 const sin=Math.sin;let curveWork=0;t.mock.method(Math,'sin',value=>{curveWork++;return sin(value);});
 for(const {x,z,height}of probes)assert.equal(R.surfaceHeight(x,-z),height);
 assert.equal(curveWork,0,'a triangle already contains the exact height; route reprojection delays world startup');
});
test('world placement uses the indexed height path with the unchanged surface offset',t=>{
 const probes=[];
 for(const mesh of [R.ROAD_MESH,R.GROUND_MESH])for(let i=0;i<mesh.indices.length;i+=201){
  const n=mesh.indices[i]*3,x=mesh.positions[n],z=mesh.positions[n+2];
  probes.push({x,z,height:R.queryRoadSurface(x,z).height+R.ROAD_SURFACE_OFFSET});
 }
 const sin=Math.sin;let curveWork=0;t.mock.method(Math,'sin',value=>{curveWork++;return sin(value);});
 for(const {x,z,height}of probes)assert.equal(groundHeight(x,z),height);
 assert.equal(curveWork,0,'placing world objects must not repeat route reprojection for a known surface hit');
});
test('height-only fallback preserves out-of-mesh, invalid and branch-history results',()=>{
 for(const [x,z]of [[1e6,-1e6],[-1e6,1e6],[NaN,0],[0,Infinity],[-57,26],[31,90]])
  assert.equal(R.surfaceHeight(x,-z),R.queryRoadSurface(x,z).height);
 for(const edge of R.NETWORK_EDGES)for(const q of [edge.progressFrom,edge.progressTo,(edge.progressFrom+edge.progressTo)/2]){
  const p=R.routePointAtProgress(q,{branch:edge.branch});
  for(const offset of [-100,-15,0,15,100]){
   const x=p.x+p.right.x*offset,z=p.z+p.right.z*offset;
   assert.equal(R.surfaceHeight(x,-z,p),R.queryRoadSurface(x,z,p).height);
  }
 }
});
test('height-only lookup retains strict numeric coordinates instead of coercing invalid x',()=>{
 const p=R.routePointAtProgress(9000);
 for(const x of [String(p.x),[p.x],null,undefined,0n,Symbol('invalid'),{}])
  assert.equal(R.surfaceHeight(x,-p.z),0);
 assert.equal(R.surfaceHeight(0,0n),0);
});
test('world placement retains strict numeric z before converting coordinate conventions',()=>{
 const p=R.routePointAtProgress(9000);
 for(const z of [String(p.z),[p.z],null,undefined,0n,Symbol('invalid'),{}])
  assert.equal(groundHeight(p.x,z),R.ROAD_SURFACE_OFFSET);
});
