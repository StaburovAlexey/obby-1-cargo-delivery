import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {initializeRapier} from '../dist/rapier-runtime.js';
import {createPhysicsWorld} from '../dist/physics-world.js';
import {createGameplay} from '../dist/gameplay.js';
import {isAdvertisingSafe} from '../dist/advertising.js';
await initializeRapier();

test('pit floor, walls and real ramp meshes enter the shared static physics world with proper tags',()=>{
 const group=new THREE.Group();
 for(const [name,y] of [['Road pit floors',-20],['Road jump ramps',2],['Road pit walls',-10]]){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-5,y,-5,5,y,-5,5,y,5,-5,y,5],3));geometry.setIndex([0,2,1,0,3,2]);const m=new THREE.Mesh(geometry);m.name=name;group.add(m);
 }
 const physics=createPhysicsWorld({THREE,city:{group}});
 try{
  assert.equal(physics.stats.staticTriangles,6);
  const tags=new Set();physics.world.colliders.forEach(c=>tags.add(c.userData.tag));assert.deepEqual([...tags].sort(),['ground','road','wall']);
 }finally{physics.dispose();}
});
test('walking support guard blocks void without changing route membership or existing default walking',()=>{
 for(const blocked of [true,false]){
  const game=createGameplay(blocked?{walkable:()=>false}:{}),before={...game.state.player};
  game.walk(.05,{x:1,z:0});assert.equal(game.state.player.x===before.x,blocked);
 }
});

test('pits and their full launch/landing reservations defer ads even when not airborne',()=>{
 const params={position:[0,0,0],heading:0,speed:0,footprint:{radius:.5}};
 const pit={cutFootprint:[{x:-4,z:-6},{x:4,z:-6},{x:4,z:6},{x:-4,z:6}],reservationFootprint:[{x:-15,z:-100},{x:15,z:-100},{x:15,z:60},{x:-15,z:60}]};
 assert.equal(isAdvertisingSafe({...params,roadPits:[pit]}),false);
 assert.equal(isAdvertisingSafe({...params,position:[0,0,-70],roadPits:[pit]}),false,'landing safety area');
 assert.equal(isAdvertisingSafe({...params,position:[500,0,500],roadPits:[pit]}),true);
});
