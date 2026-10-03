import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {COSMO_VEHICLES,loadCosmoVehicle} from '../dist/cosmo-vehicles.js';
import {fitTruckToGround,groundHeight} from '../dist/city-driving.js';
import {routePointAtProgress} from '../dist/road-layout.js';
const originalFetch=globalThis.fetch;globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}}};
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;return url.startsWith('blob:')?originalFetch(request):new Response(fs.readFileSync(new URL(url)));};
let poses=0,minimum=Infinity,maximumMinimum=-Infinity;
for(const spec of COSMO_VEHICLES){
 const a=await loadCosmoVehicle(THREE,spec.id);
 assert.equal(a.metadata.sizeMultiplier,1.5,'ground fit uses full-size contact geometry');
 for(const q of [40,290,830,2800,3900,6300,9400,11200,14800])for(const reverse of [0,Math.PI])for(const yaw of [-.12,0,.12]){
  const road=routePointAtProgress(q),pose=fitTruckToGround(THREE,road.x,road.z,road.heading+reverse+yaw,road,a.metadata);
  assert(pose.clearances.every(v=>v>=.011999));
  let low=Infinity;
  for(const wheel of a.metadata.wheelContacts)for(const p of wheel.vertices){
   const v=new THREE.Vector3(...p).add(new THREE.Vector3(...wheel.center)).applyQuaternion(pose.quaternion).add(pose.position);
   const clearance=v.y-groundHeight(v.x,v.z,road);minimum=Math.min(minimum,clearance);low=Math.min(low,clearance);
  }
  assert(low>=-.008,`${spec.id} q${q} clips ground ${low}`);
  assert(low<.09,`${spec.id} q${q} floats ${low}`);maximumMinimum=Math.max(maximumMinimum,low);poses++;
 }
 a.dispose();
}
console.log(JSON.stringify({passed:true,poses,minimumClearance:minimum,largestLowestTireClearance:maximumMinimum,scope:'Actual GLB vertices and road math; no GPU'}));
