import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createGarageScene} from '../dist/garage-scene.js';
import {driftUnlockScore} from '../dist/drift-unlocks.js';

const expectedIds=['bmwe30','cadillac75','koenigseggone1','phoenixinterceptor'];
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-5,`${label}: ${actual} != ${expected}`);
const create=()=>createGarageScene(THREE,{group:new THREE.Group()},{document:null});

test('physical drift displays progress from E30 to Phoenix when moving away from the first BMW',()=>{
 const garage=create();
 try{
  garage.group.updateMatrixWorld(true);
  const bmw=garage.vehicles.find(vehicle=>vehicle.id==='bmwreward');
  const origin=bmw.root.getWorldPosition(new THREE.Vector3());
  const cars=garage.vehicles.filter(vehicle=>expectedIds.includes(vehicle.id));
  const ordered=[...cars].sort((a,b)=>a.root.getWorldPosition(new THREE.Vector3()).distanceTo(origin)-b.root.getWorldPosition(new THREE.Vector3()).distanceTo(origin));
  assert.deepEqual(ordered.map(vehicle=>vehicle.id),expectedIds);
  assert.deepEqual(ordered.map(vehicle=>driftUnlockScore(vehicle.id)),[10000,25000,35000,45000]);
  assert.deepEqual(garage.vehicles.slice(8).map(vehicle=>vehicle.id),['bmwreward',...expectedIds],
   'catalog iteration and app indexes remain stable while physical positions change');
  for(const [index,vehicle] of ordered.entries()){
   assert.ok(vehicle.root.position.x<bmw.root.position.x,'display row extends away from the first BMW');
   near(vehicle.root.position.z,bmw.root.position.z,`${vehicle.id} row`);
   near(vehicle.root.position.distanceTo(bmw.root.position),[10.2,20.4,30.6,40.8][index],`${vehicle.id} distance from BMW`);
  }
 }finally{garage.dispose();}
});

test('every moved vehicle keeps its pedestal mesh, collider, approach marker and price anchor together',()=>{
 const garage=create();
 try{
  const mesh=garage.hangar.getObjectByName('Reward vehicle display pedestals');
  const matrix=new THREE.Matrix4(),foundation=new THREE.Vector3();
  for(const [index,pedestal] of garage.rewardPedestals.entries()){
   const id=pedestal.vehicleId??'bmwreward';
   const vehicle=garage.vehicles.find(vehicle=>vehicle.id===id);
   assert.equal(vehicle.pedestal,pedestal,`${id} uses its own pedestal`);
   mesh.getMatrixAt(index*3,matrix);foundation.setFromMatrixPosition(matrix);
   const solid=garage.pedestalSolids.find(solid=>solid.id===pedestal.id);
   const marker=garage.rewardMarkers.find(marker=>marker.userData.vehicleId===id);
   for(const axis of ['x','z']){
    near(vehicle.root.position[axis],pedestal[axis],`${id} root ${axis}`);
    near(vehicle.park[axis],pedestal[axis],`${id} park ${axis}`);
    near(vehicle.priceAnchor[axis],pedestal[axis],`${id} price ${axis}`);
    near(foundation[axis],pedestal[axis],`${id} rendered foundation ${axis}`);
   }
   near((solid.minX+solid.maxX)/2,pedestal.x,`${id} collider x`);
   near((solid.minZ+solid.maxZ)/2,pedestal.z,`${id} collider z`);
   assert.deepEqual(vehicle.approach,pedestal.approach,`${id} approach`);
   near(marker.position.x,vehicle.approach.x,`${id} approach marker x`);
   near(marker.position.z,vehicle.approach.z,`${id} approach marker z`);
   near(vehicle.approach.x,pedestal.x,`${id} approach aligns with pedestal`);
   near(pedestal.z-vehicle.approach.z,6.8,`${id} approach stays in front of pedestal`);
  }
 }finally{garage.dispose();}
});
