import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCity} from '../dist/network-scene.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {routePointAtProgress,ROAD_SURFACE_OFFSET} from '../dist/route-network.js';

const city=buildCity(THREE),cliffs=city.group.getObjectByName('Layered earth and rock cliffs');
test('Each bridge has visible rock below both banks, while the gap stays open',()=>{
 assert.ok(cliffs,'Terrain needs solid cliff faces');
 cliffs.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();
 for(const bridge of BRIDGES)for(const [q,direction] of [[bridge.from,1],[bridge.to,-1]]){
  const p=routePointAtProgress(q),forward=new THREE.Vector3(-Math.sin(p.heading),0,-Math.cos(p.heading));
  for(const depth of [1,5,15,30]){
   const origin=new THREE.Vector3(p.x,p.height+ROAD_SURFACE_OFFSET-depth,p.z).addScaledVector(forward,direction*5);
   ray.set(origin,forward.clone().multiplyScalar(-direction));ray.far=10;
   const hits=ray.intersectObject(cliffs);
   assert.ok(hits.length,`${bridge.id} bank ${q} depth ${depth}`);
   if(depth===5){
    const colors=cliffs.geometry.attributes.color,index=hits[0].face.a;
    if(bridge.biome==='desert')assert.ok(colors.getX(index)>colors.getY(index)*1.3,'Desert rock should be warm sandstone');
    if(bridge.biome==='snow')assert.ok(colors.getX(index)<colors.getY(index)&&colors.getY(index)<colors.getZ(index),'Snow rock should be cool grey');
   }
  }
  const mid=routePointAtProgress((bridge.from+bridge.to)/2);
  ray.set(new THREE.Vector3(mid.x,mid.height+10,mid.z),new THREE.Vector3(0,-1,0));ray.far=55;
  assert.equal(ray.intersectObject(cliffs).length,0,`${bridge.id} gap must remain open`);
 }
});
test('Cliffs use finite, bounded geometry and participate in spatial culling',()=>{
 assert.ok(cliffs);
 assert.equal(cliffs.userData.spatialStatic,true);
 assert.ok(cliffs.geometry.index.count/3<250000);
 for(const value of cliffs.geometry.attributes.position.array)assert.ok(Number.isFinite(value));
 assert.ok(cliffs.material.vertexColors);
 city.dispose();
});
