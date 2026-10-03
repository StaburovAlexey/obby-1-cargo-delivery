import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {createCosmoVehicleAdapter,COSMO_VEHICLES} from '../dist/cosmo-vehicles.js';
import {createGarageScene,REWARD_PEDESTAL} from '../dist/garage-scene.js';
globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}}};
const garage=createGarageScene(THREE,{group:new THREE.Group()});let visual;
try{const car=garage.vehicles.find(v=>v.id==='ashhauler'),bytes=fs.readFileSync(new URL(COSMO_VEHICLES.find(v=>v.id===car.id).url));visual=createCosmoVehicleAdapter(THREE,car.id,await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''));car.root.add(visual.group);car.root.updateWorldMatrix(true,true);const carBox=new THREE.Box3().setFromObject(visual.group,true),wall=garage.walls.find(w=>w.name==='Garage rear wall'),p=REWARD_PEDESTAL;const carGap=p.z-p.radius-carBox.max.z,wallGap=wall.minZ-p.z-p.radius;assert(Math.abs(carGap-wallGap)<1e-5);assert(carGap>2.5&&wallGap>2.5);const reward=garage.vehicles.find(v=>v.rewardDisplay);assert.equal(reward.priceAnchor.z,p.z);assert.equal(reward.park.z,p.z);assert.equal(reward.pedestal.pose.z,p.z);assert.equal(reward.approach.z,p.z-1.8);assert.equal(garage.pedestalSolids[0].minZ,p.z-p.radius);console.log(JSON.stringify({carEdge:carBox.max.z,rearWall:wall.minZ,centerZ:p.z,carGap,wallGap}));}finally{visual?.dispose();garage.dispose()}
