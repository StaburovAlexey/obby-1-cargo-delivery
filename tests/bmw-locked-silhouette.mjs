import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {MeshoptDecoder} from '../dist/vendor/meshopt_decoder.module.js';
import {BMW_VEHICLE,createBMWVehicleAdapter} from '../dist/bmw-vehicle.js';
import {createVehicleLiveryController,clearVehicleLiveryTextureCache} from '../dist/vehicle-livery-materials.js';
test('BMW lock is a reversible black silhouette, including lights and livery attempts',async()=>{
 const bytes=fs.readFileSync(new URL(BMW_VEHICLE.url));
 const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const a=createBMWVehicleAdapter(THREE,BMW_VEHICLE.id,gltf),original=new Map();
 a.group.traverse(n=>{if(n.isMesh)original.set(n,n.material);});
 try{
  assert.equal(typeof a.setLocked,'function');a.setLocked(true);assert.equal(a.locked,true);
  a.setBrakeLights(1);
  for(const mesh of original.keys()){assert.equal(mesh.material.isMeshBasicMaterial,true);assert.equal(mesh.material.color.getHex(),0);}
  const c=createVehicleLiveryController(THREE,a,'bmwreward',{textureLoader:()=>{throw Error('locked BMW must not load a texture');}});
  assert.equal((await c.preview('neon')).applied,false);c.dispose();
  for(const mesh of original.keys())assert.equal(mesh.material.color.getHex(),0);
  a.setLocked(false);assert.equal(a.locked,false);for(const [mesh,material]of original)assert.equal(mesh.material,material);
  let finish;
  const late=createVehicleLiveryController(THREE,a,'bmwreward',{textureLoader:()=>new Promise(resolve=>finish=resolve)});
  const loading=late.preview('anime');a.setLocked(true);finish(new THREE.Texture());
  assert.equal((await loading).applied,false);late.dispose();
  for(const mesh of original.keys())assert.equal(mesh.material.color.getHex(),0);
  a.setLocked(false);for(const [mesh,material]of original)assert.equal(mesh.material,material);
 }finally{a.dispose();clearVehicleLiveryTextureCache();}
});
