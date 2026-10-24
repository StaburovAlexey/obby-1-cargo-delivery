import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCity} from '../dist/network-scene.js';
import {createTerrainCliffs} from '../dist/terrain-cliffs.js';
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
});
test.after(()=>city.dispose());


test('only bridge banks plus a ten-metre margin keep visual strata while all physical walls remain',()=>{
 assert.equal(cliffs.geometry.index.count/3,46102);
 assert.ok(cliffs.userData.physicsCliffEdges instanceof Float32Array);
 assert.equal(cliffs.userData.physicsCliffEdges.length/6,16163);
 assert.equal(cliffs.userData.physicsCliffEdges.length/6*14,226282);
});

test('bank margin includes its boundary and excludes unrelated perimeter without dropping collision edges',()=>{
 const surface=q=>({positions:[0,0,0,2,0,0,0,0,2],indices:[0,1,2],progress:[q,q,q]});
 for(const [q,visible] of [[0,true],[10,true],[11,false],[14,true],[100,false]]){
  const mesh=createTerrainCliffs(THREE,[surface(q)],{bridges:[{from:0,to:24}],bankMargin:10});
  try{
   assert.equal(mesh.geometry.index.count>0,visible,'progress '+q);
   assert.ok(mesh.userData.physicsCliffEdges instanceof Float32Array);
   assert.equal(mesh.userData.physicsCliffEdges.length/6,3);
  }finally{mesh.geometry.dispose();mesh.material.dispose();}
 }
});
