import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {COSMO_VEHICLES,loadCosmoVehicle} from '../dist/cosmo-vehicles.js';
import {vehicleFootprint} from '../dist/vehicle-contact.js';
import {FOLLOW_CAMERA,computeFollowOffset,drivingCameraScale} from '../dist/follow-camera.js';
import {TOW_DRIVING} from '../dist/driving-model.js';
const originalFetch=globalThis.fetch;globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}}};globalThis.fetch=async request=>{const u=typeof request==='string'?request:request.url;return u.startsWith('blob:')?originalFetch(request):new Response(fs.readFileSync(new URL(u)));};
let wheelChecks=0,maxX=0,maxY=0;const out={};
for(const spec of COSMO_VEHICLES){const a=await loadCosmoVehicle(THREE,spec.id);
 for(const steer of [-.65,0,.65])for(const spin of [-2,0,2]){
  const footprint=vehicleFootprint(a.metadata,steer,out);assert.equal(out,footprint);a.update({steerAngle:steer,wheelSpin:spin});
  const box=new THREE.Box3().setFromObject(a.group,true);assert(box.min.x>=-footprint.halfWidth-1e-6&&box.max.x<=footprint.halfWidth+1e-6);assert(box.min.z>=-footprint.halfLength-1e-6&&box.max.z<=footprint.halfLength+1e-6);wheelChecks++;
 }
 a.reset();const box=new THREE.Box3().setFromObject(a.group,true);
 for(const [width,height]of [[320,844],[390,844],[320,568],[844,390]])for(const pitch of [FOLLOW_CAMERA.minPitch,FOLLOW_CAMERA.driving.pitch,FOLLOW_CAMERA.maxPitch])for(let i=0;i<12;i++){
  const camera=new THREE.PerspectiveCamera(TOW_DRIVING.cameraFov,width/height,.1,1000),target=new THREE.Vector3(0,1.7,0),o=computeFollowOffset({yaw:i*Math.PI/6,pitch,radius:FOLLOW_CAMERA.driving.radius}),scale=drivingCameraScale(width/height);
  camera.position.set(o.x*scale,o.y*scale,o.z*scale).add(target);camera.lookAt(target);camera.updateMatrixWorld();
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const v=new THREE.Vector3(x,y,z).project(camera);maxX=Math.max(maxX,Math.abs(v.x));maxY=Math.max(maxY,Math.abs(v.y));}
 }
 a.dispose();
}
assert(maxX<.98);assert(maxY<.98);assert.equal(vehicleFootprint(null),undefined);console.log(JSON.stringify({wheelChecks,maxCameraX:maxX,maxCameraY:maxY,scope:'Conservative full bounding-box CPU projections; not rendered screenshot'}));
