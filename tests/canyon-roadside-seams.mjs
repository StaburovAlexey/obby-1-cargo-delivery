import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {barrierStripData,createBarrierGeometry} from '../dist/roadside-barrier.js';
import {createCanyonScene} from '../dist/canyon-scene.js';
import {buildCity,createRoadFootprintIndex} from '../dist/network-scene.js';
import {CANYON_APPROACH_LENGTH,canyonApproachPoint} from '../dist/canyon-approach.js';
import {canyonPointAt,CANYON_TRACK} from '../dist/canyon-track.js';
import {ROAD_MESH,NETWORK_EDGES} from '../dist/route-network.js';

const pointKey=p=>p.map(Math.fround).join(',');
function assertClosed(geometry,start=0,count=geometry.index.count){
 const positions=geometry.getAttribute('position'),indices=geometry.index,edges=new Map(),triangles=new Set();
 for(let i=start;i<start+count;i+=3){
  const p=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,indices.getX(i+j))),keys=p.map(v=>pointKey(v.toArray()));
  assert.ok(p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).length()>1e-8,'nondegenerate triangle');
  const key=keys.slice().sort().join('|');assert.ok(!triangles.has(key),'no duplicate/internal coplanar triangles');triangles.add(key);
  for(let j=0;j<3;j++){const edge=[keys[j],keys[(j+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}
 }
 assert.ok([...edges.values()].every(n=>n===2),'every welded edge belongs to exactly two triangles');
}
function assertSharedSections(geometry,part){
 const {start=0,sectionCount:n}=part,p=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),face=geometry.getAttribute('urPrismFace');
 assert.ok(n>2);assert.equal(part.indexCount??geometry.index.count,8*(n-1)*3+12,'only four longitudinal surfaces and two external caps');
 for(let side=0;side<4;side++)for(let i=0;i<n;i++)for(let j=0;j<2;j++){
  const id=start+side*n*2+i*2+j;
  assert.ok([p.getX(id),p.getY(id),p.getZ(id),normal.getX(id),normal.getY(id),normal.getZ(id)].every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(normal.getX(id),normal.getY(id),normal.getZ(id))-1)<1e-5);
  assert.equal(face.getZ(id),0,'no cross-section end face inside a run');
 }
}

test('shared-section sweeps stay closed on tight bends, grades and short joins',()=>{
 const sections=[];
 for(let i=0;i<=90;i++){const a=i*Math.PI/180,r=12;sections.push({near:{x:(r-.11)*Math.cos(a),z:(r-.11)*Math.sin(a)},far:{x:(r+.11)*Math.cos(a),z:(r+.11)*Math.sin(a)},bottom:2-i*.03,top:2.5-i*.03});}
 const data=barrierStripData(sections),g=createBarrierGeometry(THREE,sections);
 try{assertClosed(g);assertSharedSections(g,{sectionCount:sections.length});assert.equal(data.position.length/3,sections.length*8+8);}
 finally{g.dispose();}
});

test('approach, downhill and terminal steel form continuous capped surfaces',()=>{
 const scene=createCanyonScene(THREE);
 try{
  const rail=scene.group.getObjectByName('Canyon steel guardrails'),g=rail.geometry;
  assert.ok(!rail.isInstancedMesh,'rails are no longer overlapping boxes');assertClosed(g);assertSharedSections(g,g.userData);
  assert.equal(scene.group.getObjectByName('Canyon terminal guardrail'),undefined,'terminal is part of the same mitered sweep');
  const a=canyonApproachPoint(CANYON_APPROACH_LENGTH),b=canyonPointAt(0);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<1e-9);assert.equal(a.height,b.height);
  const p=g.getAttribute('position');
  for(const side of [-1,1])for(const width of [9.14,9.36])for(const height of [.53,1.03]){
   const target=[Math.fround(a.x+a.right.x*side*width),Math.fround(a.height+height),Math.fround(a.z+a.right.z*side*width)];
   assert.ok(Array.from({length:p.count},(_,i)=>i).some(i=>p.getX(i)===target[0]&&p.getY(i)===target[1]&&p.getZ(i)===target[2]),'the exact approach/canyon join cross-section is present');
  }
  const end=canyonPointAt(CANYON_TRACK.length);assert.ok(g.boundingBox.containsPoint(new THREE.Vector3(end.x,end.height+.78,end.z)));
 }finally{scene.dispose();}
});

test('approach guardrails never obstruct the main-road fork opening',()=>{
 const scene=createCanyonScene(THREE),index=createRoadFootprintIndex(ROAD_MESH);
 try{let tested=0;scene.group.traverse(mesh=>{if(!mesh.name.startsWith('Canyon steel guardrails'))return;const p=mesh.geometry.getAttribute('position'),ix=mesh.geometry.index;
  for(let i=0;i<ix.count;i+=3){const triangle=[0,1,2].map(j=>({x:p.getX(ix.getX(i+j)),z:p.getZ(ix.getX(i+j))}));assert.ok(!index.intersects(triangle,.001),'rail has no footprint inside the main-road opening');tested++;}
 });assert.ok(tested>10000);
 const posts=scene.group.getObjectByName('Canyon guardrail posts'),matrix=new THREE.Matrix4();
 assert.ok(posts.count>Math.ceil(CANYON_TRACK.length/12)*2+20,'the approach rails have support posts too');
 for(let i=0;i<posts.count;i++){posts.getMatrixAt(i,matrix);const x=matrix.elements[12],z=matrix.elements[14],quad=[[-.125,-.125],[-.125,.125],[.125,.125],[.125,-.125]].map(([dx,dz])=>({x:x+dx,z:z+dz}));assert.ok(!index.intersects(quad,.001),'support posts leave the main-road fork opening clear');}
 }finally{scene.dispose();}
});

test('biome strata join at graph nodes with continuous metric texture coordinates',()=>{
 const city=buildCity(THREE);
 try{
  const mesh=city.group.getObjectByName('Massive biome barriers'),g=mesh.geometry,m=g.getAttribute('urPrismMeters'),parts=g.userData.parts.filter(p=>p.continuous);
  assert.ok(parts.length>30);assert.equal(city.stats.continuousBarrierSurfaces,true);assert.ok(city.stats.drawCalls<=7,'the second fork remains within the static draw-call budget');
  for(const part of parts){assertClosed(g,part.indexStart,part.indexCount);assertSharedSections(g,part);
   for(const face of [0,1])for(let i=1;i<part.sectionCount;i++)assert.ok(m.getZ(part.start+face*part.sectionCount*2+i*2)>m.getZ(part.start+face*part.sectionCount*2+(i-1)*2),'metric texture phase increases through every shared section');
  }
  const barriers=city.features.filter(f=>f.type==='barrier'&&f.side),setbacks=new Set(barriers.map(f=>f.clearance));assert.equal(setbacks.size,1,'one safe roadside offset at all graph-node joins');
  let joins=0;
  for(const a of barriers)for(const b of barriers){if(a===b||a.edgeId===b.edgeId||a.side!==b.side||Math.abs(a.progressTo-b.progressFrom)>1e-7)continue;
   const ae=NETWORK_EDGES.find(e=>e.id===a.edgeId),be=NETWORK_EDGES.find(e=>e.id===b.edgeId);if(ae.to!==be.from)continue;
   for(const [u,v]of [[a.footprint[3],b.footprint[0]],[a.footprint[2],b.footprint[1]]])assert.ok(Math.hypot(u.x-v.x,u.y-v.y)<1e-7,'shared graph-node offset endpoints');joins++;
  }
  assert.ok(joins>=12);
 }finally{city.dispose();}
});

test('all continuous biome-wall triangles stay outside the road and dispose once',()=>{
 const city=buildCity(THREE),index=createRoadFootprintIndex(ROAD_MESH),mesh=city.group.getObjectByName('Massive biome barriers'),g=mesh.geometry,p=g.getAttribute('position'),ix=g.index;let tested=0;
 try{for(const part of g.userData.parts.filter(p=>p.continuous))for(let i=part.indexStart;i<part.indexStart+part.indexCount;i+=3){const tri=[0,1,2].map(j=>({x:p.getX(ix.getX(i+j)),z:p.getZ(ix.getX(i+j))}));assert.ok(!index.intersects(tri,.001),'continuous wall enters asphalt');tested++;}assert.ok(tested>30000);}
 finally{city.dispose();}
 const scene=createCanyonScene(THREE),rail=scene.group.getObjectByName('Canyon steel guardrails');let disposed=0;rail.geometry.addEventListener('dispose',()=>disposed++);scene.dispose();scene.dispose();assert.equal(disposed,1);
});
