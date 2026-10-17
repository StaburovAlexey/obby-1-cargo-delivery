import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {freshCareer} from '../dist/career-save.js';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import {CANYON_TRACK,canyonPointAt,projectCanyon,canyonHeight,canyonContact,canyonPose,canyonContains,canyonSurface} from '../dist/canyon-track.js';
import {CANYON_GATE_DISTANCE,canyonApproachPoint,CANYON_APPROACH_LENGTH} from '../dist/canyon-approach.js';
import {createRoadFootprintIndex} from '../dist/network-scene.js';
import {ROAD_MESH,GROUND_MESH} from '../dist/route-network.js';
import {createCanyonEntrance,canEnterCanyon} from '../dist/canyon-entrance.js';
import {createCanyonScene} from '../dist/canyon-scene.js';

test('the canyon is continuous, downhill and wide enough for the reward car',()=>{
 let previous=canyonPointAt(0);const first=previous;
 for(let s=2;s<=CANYON_TRACK.length;s+=2){const p=canyonPointAt(s),d=Math.hypot(p.x-previous.x,p.z-previous.z);assert.ok(d>1.99&&d<2.01);assert.ok(p.height<=previous.height+1e-8);assert.ok(Math.hypot(p.gradient.x,p.gradient.z)<.105);assert.ok(Math.abs(p.heading-previous.heading)<.06);if(s>=6&&s<=CANYON_TRACK.length-6)assert.ok(!canyonContact(p.x,p.z,p.heading,{halfWidth:1.7,halfLength:4.05}));previous=p;}
 assert.ok(first.height-previous.height>=80);assert.ok(CANYON_TRACK.length>=1600);const join=canyonApproachPoint(CANYON_APPROACH_LENGTH);assert.equal(first.x,join.x);assert.equal(first.z,join.z);assert.equal(first.height,join.height);assert.equal(first.heading,join.heading);assert.equal(Math.hypot(first.gradient.x,first.gradient.z),0);
});

test('projection, tire support and contact follow the same sloping road',()=>{
 for(const s of [25,250,550,850,1150,1500,1800]){
  const p=canyonPointAt(s),q=projectCanyon(p.x+p.right.x*3,p.z+p.right.z*3);
  assert.ok(Math.abs(q.progress-s)<.03);assert.ok(Math.abs(q.offset-3)<.03);assert.ok(Math.abs(canyonHeight(p.x,p.z)-p.height)<.01);
  const edge=canyonContact(p.x+p.right.x*9,p.z+p.right.z*9,p.heading,{halfWidth:1.7,halfLength:4});assert.ok(edge&&edge.depth>0);
  const pose=canyonPose(THREE,{x:p.x,z:p.z,heading:p.heading});assert.ok(Number.isFinite(pose.position.y));assert.ok(pose.normal.y>.98);
 }
});

test('the visible entrance blocks uncompleted careers and a forged saved developer flag',()=>{
 const gate=createCanyonEntrance(THREE),fresh=freshCareer();
 try{
  assert.equal(canEnterCanyon({...fresh,ownedVehicleIds:['pickup','bmwreward'],completedRuns:100,developerMode:true},'bmwreward'),false);
  gate.updateAccess(fresh);assert.ok(gate.group.visible);assert.equal(gate.unlocked,false);
  const barrier=canyonApproachPoint(CANYON_GATE_DISTANCE);assert.ok(gate.contact(barrier.x,barrier.z,barrier.heading,{halfWidth:1.7,halfLength:4}));
  const completed=earnedRewardCareer();assert.equal(canEnterCanyon(completed,'bmwreward'),true);assert.equal(canEnterCanyon(completed,'pickup'),false);
  gate.updateAccess(completed);assert.equal(gate.unlocked,true);assert.equal(gate.contact(barrier.x,barrier.z,barrier.heading,{halfWidth:1.7,halfLength:4}),undefined);
  assert.equal(gate.shouldEnter(canyonPointAt(12),'bmwreward'),true);
  assert.equal(gate.shouldEnter(canyonPointAt(12),'pickup'),false);
 }finally{gate.dispose();}
});

test('canyon scene owns its road and releases shared render resources once',()=>{
 const scene=createCanyonScene(THREE);let meshes=0;scene.group.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes>=5);assert.ok(scene.group.getObjectByName('Canyon asphalt'));
 const geometry=scene.group.getObjectByName('Canyon asphalt').geometry;let disposed=0;geometry.addEventListener('dispose',()=>disposed++);scene.dispose();scene.dispose();assert.equal(disposed,1);
});


test('the canyon lookup is bounded and its shared approach seam has no wall in either direction',()=>{
 const gate=createCanyonEntrance(THREE);gate.updateAccess({}, {developerMode:true});
 try{
  const join=canyonPointAt(0),before=canyonApproachPoint(CANYON_APPROACH_LENGTH-1);
  assert.equal(canyonContains(0,-65),false);assert.equal(canyonContains(before.x,before.z),false);assert.equal(canyonSurface(join.x,join.z)?.progress,0);
  assert.equal(canyonContains(NaN,0),false);assert.equal(canyonContains(110,1000),false);
  const end=canyonPointAt(CANYON_TRACK.length);assert.equal(canyonContains(end.x-Math.sin(end.heading),end.z-Math.cos(end.heading)),false);
  for(let s=-10;s<=30;s+=.25){const p=s<0?canyonApproachPoint(CANYON_APPROACH_LENGTH+s):canyonPointAt(s);for(const heading of [p.heading,p.heading+Math.PI]){
   assert.equal(canyonContact(p.x,p.z,heading),undefined,`open canyon join s=${s}`);
   assert.equal(gate.contact(p.x,p.z,heading),undefined,`open approach join s=${s}`);
  }}
  for(let s=0;s<=CANYON_TRACK.length;s+=10){const p=canyonPointAt(s);assert.ok(canyonContains(p.x,p.z));assert.ok(canyonSurface(p.x+p.right.x*8,p.z+p.right.z*8));assert.equal(canyonContains(p.x+p.right.x*20,p.z+p.right.z*20),false);}
 }finally{gate.dispose();}
});

test('persistent canyon asphalt, basin and scenery stay outside all main-world surfaces',()=>{
 const scene=createCanyonScene(THREE),indices=[ROAD_MESH,GROUND_MESH].map(data=>createRoadFootprintIndex(data));
 const matrix=new THREE.Matrix4(),point=new THREE.Vector3();
 try{
  for(const name of ['Canyon asphalt','Canyon left shoulder','Canyon right shoulder','Canyon basin floor']){
   const mesh=scene.group.getObjectByName(name),p=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
   for(let i=0;i<index.count;i+=3){const tri=[0,1,2].map(j=>({x:p.getX(index.getX(i+j)),z:p.getZ(index.getX(i+j))}));for(const world of indices)assert.equal(world.intersects(tri),false,`${name} triangle ${i/3} intersects main world`);}
  }
  for(let layer=0;layer<3;layer++){
   const mesh=scene.group.getObjectByName('Canyon sandstone stratum '+layer),p=mesh.geometry.getAttribute('position');
   for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);const points=[];
    for(let j=0;j<p.count;j++){point.fromBufferAttribute(p,j).applyMatrix4(matrix);points.push({x:point.x,z:point.z});}
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z)),rect=[{x:minX,z:minZ},{x:maxX,z:minZ},{x:maxX,z:maxZ},{x:minX,z:maxZ}];
    for(const world of indices)assert.equal(world.intersects(rect),false,`stratum ${layer} outcrop ${i} overlaps main world`);
   }
  }
 }finally{scene.dispose();}
});
