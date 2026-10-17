import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCity,createRoadFootprintIndex,polygonIntersectionArea} from '../dist/network-scene.js';
import {createCanyonEntrance} from '../dist/canyon-entrance.js';
import {createCanyonScene} from '../dist/canyon-scene.js';
import {canyonApproachPoint,CANYON_APPROACH_LENGTH,canyonApproachQuads} from '../dist/canyon-approach.js';
import {canyonPointAt,CANYON_TRACK} from '../dist/canyon-track.js';
import {ROAD_MESH} from '../dist/route-network.js';
import {polygonIndex,subtractFootprints} from '../dist/surface-cut.js';
const data=mesh=>({positions:Array.from(mesh.geometry.attributes.position.array),indices:mesh.geometry.index?Array.from(mesh.geometry.index.array):Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i)});
const triangles=mesh=>{const d=data(mesh);return Array.from({length:d.indices.length/3},(_,i)=>[0,1,2].map(j=>{const k=d.indices[i*3+j]*3;return {x:d.positions[k],z:d.positions[k+2]};}));};
const area=p=>Math.abs(p.slice(1,-1).reduce((s,a,i)=>{const b=p[i+2],o=p[0];return s+(a.x-o.x)*(b.z-o.z)-(a.z-o.z)*(b.x-o.x);},0)/2);

test('convex subtraction preserves area, holes and interpolated attributes',()=>{
 const p=[{x:0,z:0,h:0},{x:10,z:0,h:10},{x:10,z:10,h:10},{x:0,z:10,h:0}],cut=[{x:3,z:3},{x:7,z:3},{x:7,z:7},{x:3,z:7}];
 const pieces=subtractFootprints(p,polygonIndex([cut]));assert.ok(Math.abs(pieces.reduce((s,q)=>s+area(q),0)-84)<1e-9);
 for(const q of pieces){assert.ok(polygonIntersectionArea(q,cut)<1e-9);for(const v of q)assert.ok(Math.abs(v.h-v.x)<1e-9);}
});

test('branch pavement starts at the main-road edge and owns no city asphalt or terrain',()=>{
 const city=buildCity(THREE),entrance=createCanyonEntrance(THREE),road=createRoadFootprintIndex(ROAD_MESH),terrain=createRoadFootprintIndex(data(city.group.getObjectByName('Closed continuous terrain foundation')));
 try{
  let count=0;
  for(const name of ['Canyon approach asphalt','Entrance curved shoulders']){
   const mesh=entrance.group.getObjectByName(name),n=mesh.geometry.attributes.normal;
   for(let i=0;i<n.count;i++)assert.ok(n.getY(i)>.999,'nondegenerate upward face');
   for(const tri of triangles(mesh)){
    assert.ok(!road.intersects(tri,1e-6),'branch must not cover main-road asphalt');
    assert.ok(!terrain.intersects(tri,.0001),'city terrain is cut out beneath the entire branch width');count++;
   }
  }
  assert.ok(count>400);
  const asphalt=entrance.group.getObjectByName('Canyon approach asphalt'),p=asphalt.geometry.attributes.position;
  let boundary=0;for(let i=0;i<p.count;i++){if(p.getX(i)===15)boundary++;}assert.ok(boundary>2,'exact x=15 shared initial city edge');
  // Combined road union covers every wheel-support sample across the fork.
  const branch=createRoadFootprintIndex(data(asphalt));
  for(let s=0;s<CANYON_APPROACH_LENGTH;s+=.5)for(const w of [-8.9,-5,0,5,8.9]){
   const c=canyonApproachPoint(s),x=c.x+c.right.x*w,z=c.z+c.right.z*w,r=.0001,probe=[{x:x-r,z:z-r},{x:x+r,z:z-r},{x:x+r,z:z+r},{x:x-r,z:z+r}];
   assert.ok(road.intersects(probe,1e-10)||branch.intersects(probe,1e-10),`no pavement hole s=${s}, offset=${w}`);
  }
 }finally{city.dispose();entrance.dispose();}
});

test('city facades stay clear of the canyon landscape corridor',()=>{
 const city=buildCity(THREE),corridor=canyonApproachQuads(15);
 for(let s=0;s<CANYON_TRACK.length;s+=2){const a=canyonPointAt(s),b=canyonPointAt(s+2),edge=(p,w)=>({x:p.x+p.right.x*w,z:p.z+p.right.z*w});corridor.push([edge(a,-70),edge(b,-70),edge(b,70),edge(a,70)]);}
 const index=polygonIndex(corridor);
 try{for(const b of city.features.filter(f=>f.type==='building')){const p=b.footprint.map(v=>({x:v.x,z:-v.y}));for(const q of index.candidates(p))assert.ok(polygonIntersectionArea(p,q)<1e-6,'house must not enter fork/canyon landscape');}}
 finally{city.dispose();}
});

test('sandstone bands share their boundaries without coplanar sidewall overlap or internal caps',()=>{
 const scene=createCanyonScene(THREE),m=new THREE.Matrix4();
 try{
  const layers=[0,1,2].map(i=>scene.group.getObjectByName('Canyon sandstone stratum '+i));
  for(let k=0;k<layers.length;k++){
   const g=layers[k].geometry,n=g.attributes.normal,ix=g.index;
   for(let i=0;i<ix.count;i++){const y=n.getY(ix.getX(i));if(k<2)assert.ok(y<.99,'no internal top cap');if(k>0)assert.ok(y>-.99,'no internal bottom cap');}
  }
  for(let i=0;i<layers[0].count;i++){
   const bands=layers.map(l=>{l.getMatrixAt(i,m);return {lo:m.elements[13]-m.elements[5]/2,hi:m.elements[13]+m.elements[5]/2};});
   for(let k=1;k<3;k++)assert.ok(Math.abs(bands[k].lo-bands[k-1].hi)<.00002,'shared ring, no 20 cm sidewall overlap');
  }
 }finally{scene.dispose();}
});

test('canyon floor keeps an upward winding through every S bend',()=>{
 const scene=createCanyonScene(THREE);
 try{const m=scene.group.getObjectByName('Canyon basin floor'),p=m.geometry.attributes.position,ix=m.geometry.index;
 for(let i=0;i<ix.count;i+=3){const [a,b,c]=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+j)));assert.ok(b.sub(a).cross(c.sub(a)).y>0,'no inverted or folded basin triangle');}}
 finally{scene.dispose();}
});
