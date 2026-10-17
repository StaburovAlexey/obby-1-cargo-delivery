import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {freshCareer} from '../dist/career-save.js';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import {CANYON_TRACK,canyonPointAt,projectCanyon,canyonHeight,canyonContact,canyonPose} from '../dist/canyon-track.js';
import {createCanyonEntrance,canEnterCanyon} from '../dist/canyon-entrance.js';
import {createCanyonScene} from '../dist/canyon-scene.js';

test('the canyon is continuous, downhill and wide enough for the reward car',()=>{
 let previous=canyonPointAt(0);const first=previous;
 for(let s=2;s<=CANYON_TRACK.length;s+=2){const p=canyonPointAt(s),d=Math.hypot(p.x-previous.x,p.z-previous.z);assert.ok(d>1.99&&d<2.01);assert.ok(p.height<=previous.height+1e-8);assert.ok(Math.hypot(p.gradient.x,p.gradient.z)<.105);assert.ok(Math.abs(p.heading-previous.heading)<.06);if(s>=6&&s<=CANYON_TRACK.length-6)assert.ok(!canyonContact(p.x,p.z,p.heading,{halfWidth:1.7,halfLength:4.05}));previous=p;}
 assert.ok(first.height-previous.height>=80);assert.ok(CANYON_TRACK.length>=1600);assert.ok(first.x>1500);
});

test('projection, tire support and contact follow the same sloping road',()=>{
 for(const s of [25,250,550,850,1150,1500,1800]){
  const p=canyonPointAt(s),q=projectCanyon(p.x+p.right.x*3,p.z+p.right.z*3);
  assert.ok(Math.abs(q.progress-s)<.03);assert.ok(Math.abs(q.offset-3)<.03);assert.ok(Math.abs(canyonHeight(p.x,p.z)-p.height)<.01);
  const edge=canyonContact(p.x+p.right.x*9,p.z+p.right.z*9,p.heading,{halfWidth:1.7,halfLength:4});assert.ok(edge&&edge.depth>0);
  const pose=canyonPose(THREE,{x:p.x,z:p.z,heading:p.heading});assert.ok(Number.isFinite(pose.position.y));assert.ok(pose.normal.y>.98);
 }
});

test('the visible entrance physically blocks uncompleted careers and developer preview',()=>{
 const gate=createCanyonEntrance(THREE),fresh=freshCareer();
 try{
  assert.equal(canEnterCanyon({...fresh,ownedVehicleIds:['pickup','bmwreward'],completedRuns:100,developerMode:true},'bmwreward'),false);
  gate.updateAccess(fresh);assert.ok(gate.group.visible);assert.equal(gate.unlocked,false);
  assert.ok(gate.contact(30,-65,-Math.PI/2,{halfWidth:1.7,halfLength:4}));
  const completed=earnedRewardCareer();assert.equal(canEnterCanyon(completed,'bmwreward'),true);assert.equal(canEnterCanyon(completed,'pickup'),false);
  gate.updateAccess(completed);assert.equal(gate.unlocked,true);assert.equal(gate.contact(32,-65,-Math.PI/2,{halfWidth:1.7,halfLength:4}),undefined);
  assert.equal(gate.shouldEnter({x:85,z:-65},'bmwreward'),true);
  assert.equal(gate.shouldEnter({x:85,z:-65},'pickup'),false);
 }finally{gate.dispose();}
});

test('canyon scene owns its road and releases shared render resources once',()=>{
 const scene=createCanyonScene(THREE);let meshes=0;scene.group.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes>=5);assert.ok(scene.group.getObjectByName('Canyon asphalt'));
 const geometry=scene.group.getObjectByName('Canyon asphalt').geometry;let disposed=0;geometry.addEventListener('dispose',()=>disposed++);scene.dispose();scene.dispose();assert.equal(disposed,1);
});
