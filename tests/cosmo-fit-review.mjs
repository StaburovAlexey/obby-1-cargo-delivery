#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PASSENGER_MODELS, PASSENGER_TRIANGLES, passengerInventory, sha256, textureHash, sourceOpticsPolarity} from './fixtures/passenger-assets.mjs';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {COSMO_VEHICLES,createCosmoVehicleAdapter} from '../dist/cosmo-vehicles.js';
import {fitTruckToGround,groundHeight} from '../dist/city-driving.js';
import {routePointAtProgress} from '../dist/road-layout.js';
import {GARAGE_LAYOUT} from '../dist/garage-scene.js';
const {manifest,assets}=passengerInventory();
const nativeFetch=globalThis.fetch;
const old={self:globalThis.self,createImageBitmap:globalThis.createImageBitmap};
let decoded=0,closed=0;
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a');decoded++;return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),hash:sha256(b),closed:false,close(){assert(!this.closed,'bitmap closed twice');this.closed=true;closed++;}};};
globalThis.fetch=async request=>{const u=typeof request==='string'?request:request.url;assert(u.startsWith('blob:'),'CPU parse must never access network');return nativeFetch(request);};
const near=(a,b,t=2e-5,label='value')=>assert(Math.abs(a-b)<=t,`${label}: ${a} vs ${b}`);
const vectorNear=(a,b,t=2e-5,label='vector')=>a.forEach((x,i)=>near(x,b[i],t,`${label}[${i}]`));
function vertices(root){root.updateWorldMatrix(true,true);const out=[];root.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)out.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).toArray());});return out;}
function stats(root){let triangles=0,meshes=0;const geometries=new Set(),materials=new Set(),textures=new Set(),sources=new Set();root.traverse(mesh=>{if(!mesh.isMesh)return;meshes++;geometries.add(mesh.geometry);triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;for(const m of [].concat(mesh.material)){materials.add(m);for(const t of Object.values(m))if(t?.isTexture){textures.add(t);sources.add(t.source);}}});return {triangles,meshes,geometries,materials,textures,sources};}
function sourceGeometry(root){const out=[];root.traverse(mesh=>{if(!mesh.isMesh)return;const geometry=mesh.geometry,index=geometry.index,count=index?.count??geometry.attributes.position.count;out.push({mesh,world:vertices(mesh),attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([key,value])=>[key,Array.from(value.array)])),faces:Array.from({length:count/3},(_,i)=>[0,1,2].map(k=>index?index.getX(i*3+k):i*3+k).join(',')).sort()});});return out;}
const report=[],issues=[];
try{
 assert.deepEqual(Object.fromEntries(COSMO_VEHICLES.map(s=>[s.id,s.model])),PASSENGER_MODELS);
 for(const spec of COSMO_VEHICLES){
  const before=assets.get(spec.model),bytes=fs.readFileSync(new URL(spec.url));
  assert.deepEqual(bytes,before.bytes,`${spec.id}: active asset is the audited passenger import`);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const sourceStats=stats(gltf.scene),originalGeometry=sourceGeometry(gltf.scene),sourceBounds=new THREE.Box3().setFromObject(gltf.scene,true);
  const originalSize=sourceBounds.getSize(new THREE.Vector3()).toArray();
  near(sourceBounds.min.y,0);near(sourceBounds.getCenter(new THREE.Vector3()).x,0);near(sourceBounds.getCenter(new THREE.Vector3()).z,0);
  const optics=sourceOpticsPolarity(THREE,gltf.scene,before);
  const adapter=createCosmoVehicleAdapter(THREE,spec.id,gltf),s=stats(adapter.group);
  assert.equal(s.triangles,PASSENGER_TRIANGLES[spec.model]);assert.equal(s.meshes,before.primitives);assert.equal(s.geometries.size,sourceStats.geometries.size);
  for(const original of originalGeometry){const after=sourceGeometry(original.mesh)[0];assert.deepEqual(after.attributes,original.attributes,`${spec.id} all source vertex data preserved`);assert.deepEqual(after.faces,original.faces,`${spec.id} all source faces retained`);}
  assert.equal(adapter.wheels.length,4);assert.equal(new Set(adapter.wheels.map(w=>w.name)).size,4);
  const rest=vertices(adapter.group),bounds=new THREE.Box3().setFromPoints(rest.map(v=>new THREE.Vector3(...v))),size=bounds.getSize(new THREE.Vector3());
  near(bounds.min.y,.05,2e-5,`${spec.id} rest tire bottom`);near(bounds.getCenter(new THREE.Vector3()).x,0);near(bounds.getCenter(new THREE.Vector3()).z,0);
  assert(size.x<=4.10002 && size.z<=8.64002,`${spec.id} collision envelope`);
  const scale=Math.min(4.1/originalSize[0],8.64/originalSize[2]);
  vectorNear(size.toArray(),originalSize.map(n=>n*scale),3e-5,`${spec.id} uniform proportions`);
  const sourceCenter=sourceBounds.getCenter(new THREE.Vector3());
  for(const original of originalGeometry)vertices(original.mesh).forEach((point,i)=>{const [x,y,z]=original.world[i];vectorNear(point,[(sourceCenter.x-x)*scale,(y-sourceBounds.min.y)*scale+.05,(sourceCenter.z-z)*scale],3e-5,`${spec.id} exact source geometry and +Z to -Z transform`);});
  near(adapter.metadata.uniformScale,scale);assert.equal(adapter.metadata.sourceForward,'+Z');assert.equal(adapter.metadata.forward,'-Z');
  const tireCenters=adapter.wheels.map(w=>w.localPosition.toArray());
  for(const w of adapter.wheels){
   assert.equal(w.front,w.localPosition.z<0);assert.equal(w.side,w.localPosition.x<0?'left':'right');
   const points=vertices(w.node),center=new THREE.Box3().setFromPoints(points.map(v=>new THREE.Vector3(...v))).getCenter(new THREE.Vector3());vectorNear(center.toArray(),w.localPosition.toArray());
   const r=Math.max(...points.map(v=>Math.hypot(v[1]-center.y,v[2]-center.z)));near(w.radius,r,1e-5,'actual tire radius');
  }
  assert.equal(adapter.metadata.assetFamily,'passenger');
  assert.equal(spec.paint.length,0,'preserve imported body palette');
  for(const m of s.materials){
   assert(!m.userData.cosmoPaintSwatches,'no legacy palette remapping applied');
   if(m.name==='Passenger Body'){assert(m.metalness<=.22);assert(m.roughness>=.32);}
   if(m.map){assert.equal(m.map.colorSpace,THREE.SRGBColorSpace);assert.equal(m.map.flipY,false);}
   for(const texture of Object.values(m).filter(value=>value?.isTexture)){
    const image=before.images.find(image=>image.hash===textureHash(texture));assert(image,'all maps retain audited PNG content');
    assert.equal(texture.source.data.hash,image.hash);assert.equal(texture.image.width,image.width);assert.equal(texture.image.height,image.height);
   }
   if(m.name==='Passenger Optics')assert(m.emissiveIntensity<=.65);
  }
  adapter.update({wheelSpin:2.3,steerAngle:.48});
  for(const w of adapter.wheels){near(w.pivot.rotation.y,w.front?.48:0);near(w.spin.rotation.x,-(2.3*.68/w.radius%(2*Math.PI)));}
  const wheelPose=adapter.wheels.map(w=>vertices(w.node));adapter.update({bodyPitch:.0375,bodyRoll:-.1,bodyBob:.03});
  adapter.wheels.forEach((w,i)=>vertices(w.node).forEach((v,j)=>vectorNear(v,wheelPose[i][j],0,'wheel independent of body suspension')));
  for(let i=0;i<20;i++){adapter.update({bodyPitch:.02,bodyRoll:.08,bodyBob:-.02});adapter.update({bodyPitch:.0375,bodyRoll:-.1,bodyBob:.03});}
  const posed=vertices(adapter.group);assert.throws(()=>adapter.update({wheelSpin:7,bodyBob:Infinity}),TypeError);assert.deepEqual(vertices(adapter.group),posed,'invalid update atomic');
  adapter.reset();vertices(adapter.group).forEach((v,i)=>vectorNear(v,rest[i],1e-6,'repeated/reset preserves geometry'));

  const cargo=adapter.cargoPosition,ray=new THREE.Raycaster();let peak=-Infinity,hits=0;
  for(let xi=0;xi<=8;xi++)for(let zi=0;zi<=8;zi++){
   ray.set(new THREE.Vector3(-.59+1.18*xi/8,bounds.max.y+1,cargo.z-.59+1.18*zi/8),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(adapter.body,true)[0];if(hit){peak=Math.max(peak,hit.point.y);hits++;}
  }
  assert.equal(hits,81,`${spec.id} crate footprint supported`);if(cargo.y-.55<peak-.003)issues.push(`${spec.id} crate intersects roof by ${peak-(cargo.y-.55)}`);
  let minSpinY=Infinity,maxSteeredWidth=0;
  for(let i=0;i<24;i++){adapter.update({wheelSpin:i/24*Math.PI*2/.68*adapter.wheels[0].radius,steerAngle:.48});const b=new THREE.Box3().setFromObject(adapter.group,true);minSpinY=Math.min(minSpinY,b.min.y);maxSteeredWidth=Math.max(maxSteeredWidth,b.max.x-b.min.x);}
  adapter.reset();
  let roadMinimum=Infinity,roadMaximumLowest=-Infinity,roadPoses=0;
  const host=new THREE.Group();host.add(adapter.group);
  for(const q of [40,3900,9400])for(const yaw of [0,.12])for(const [steer,spin] of [[.48,.3],[-.48,1.9],[0,4.7]]){
   const road=routePointAtProgress(q),pose=fitTruckToGround(THREE,road.x,road.z,road.heading+yaw,road,adapter.metadata);
   host.position.copy(pose.position);host.quaternion.copy(pose.quaternion);adapter.update({steerAngle:steer,wheelSpin:spin});host.updateMatrixWorld(true);
   let low=Infinity;for(const wheel of adapter.wheels)for(const p of vertices(wheel.node)){const clearance=p[1]-groundHeight(p[0],p[2],road);low=Math.min(low,clearance);}
   roadMinimum=Math.min(roadMinimum,low);roadMaximumLowest=Math.max(roadMaximumLowest,low);roadPoses++;
   if(low<-.008||low>.09)issues.push(`${spec.id} actual spun/steered ground clearance ${low} at progress ${q}`);
  }
  host.remove(adapter.group);adapter.reset();
  const bay=GARAGE_LAYOUT.bays[COSMO_VEHICLES.indexOf(spec)],parkHost=new THREE.Group();parkHost.position.set(bay.x,0,bay.z);parkHost.rotation.y=bay.heading;parkHost.add(adapter.group);parkHost.updateMatrixWorld(true);
  const parkedBounds=new THREE.Box3().setFromObject(adapter.group,true);
  const parkingMargins=[parkedBounds.min.x-(bay.x-bay.halfWidth),bay.x+bay.halfWidth-parkedBounds.max.x,parkedBounds.min.z-(bay.z-bay.halfLength),bay.z+bay.halfLength-parkedBounds.max.z];
  assert(parkingMargins.every(v=>v>.03),`${spec.id} fits painted parking bay`);assert(parkedBounds.max.y<GARAGE_LAYOUT.roofHeight);parkHost.remove(adapter.group);adapter.reset();

  const cargoGeometry=new THREE.BoxGeometry(),cargoMaterial=new THREE.MeshBasicMaterial(),externalCargo=new THREE.Mesh(cargoGeometry,cargoMaterial);adapter.body.add(externalCargo);let externalDisposals=0;cargoGeometry.addEventListener('dispose',()=>externalDisposals++);cargoMaterial.addEventListener('dispose',()=>externalDisposals++);
  const disposalCounts=new Map();for(const resource of [...s.geometries,...s.materials,...s.textures])resource.addEventListener('dispose',()=>disposalCounts.set(resource,(disposalCounts.get(resource)??0)+1));
  adapter.dispose();adapter.dispose();assert(adapter.disposed);assert.equal(externalDisposals,0,'shared cargo resources not disposed');for(const resource of [...s.geometries,...s.materials,...s.textures])assert.equal(disposalCounts.get(resource),1,'owned resource disposed once');cargoGeometry.dispose();cargoMaterial.dispose();
  report.push({id:spec.id,model:spec.model,bytes:bytes.length,triangles:s.triangles,primitives:s.meshes,width:size.x,length:size.z,height:size.y,wheelCenters:tireCenters,cargoPosition:cargo.toArray(),cargoSupportSamples:hits,cargoClearance:cargo.y-.55-peak,parkingMargins,roadMinimum,roadMaximumLowest,roadPoses,minSpinY,maxSteeredWidth,materialCount:s.materials.size,textureCount:s.textures.size,textureSources:s.sources.size,optics});
  console.log(`PASS ${spec.id}: exact GLB, uniform fit, source optics/axles, source textures, articulation, cargo support, owned disposal`);
 }

 const pooled=[];for(const spec of [COSMO_VEHICLES[0],COSMO_VEHICLES[0],COSMO_VEHICLES[2],COSMO_VEHICLES[9]]){
  const bytes=fs.readFileSync(new URL(spec.url));const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');pooled.push(createCosmoVehicleAdapter(THREE,spec.id,gltf));
 }
 const pooledStats=pooled.map(a=>stats(a.group)),sharedTextures=new Set(pooledStats.flatMap(s=>[...s.textures])),sharedSources=new Set([...sharedTextures].map(t=>t.source));
 const uniqueHashes=new Set([COSMO_VEHICLES[0],COSMO_VEHICLES[2],COSMO_VEHICLES[9]].flatMap(spec=>assets.get(spec.model).images.map(image=>image.hash)));
 assert.equal(sharedSources.size,uniqueHashes.size,'one decoded source per PNG across mixed and duplicate models');
 for(const texture of pooledStats[0].textures)assert(pooledStats[1].textures.has(texture),'duplicate models share textures');
 const sourcesByHash=new Map();for(const texture of sharedTextures){const hash=textureHash(texture);assert.equal(texture.source.data.hash,hash);if(sourcesByHash.has(hash))assert.equal(texture.source,sourcesByHash.get(hash));else sourcesByHash.set(hash,texture.source);}
 const disposalCounts=new Map();for(const texture of sharedTextures)texture.addEventListener('dispose',()=>disposalCounts.set(texture,(disposalCounts.get(texture)??0)+1));
 for(let i=0;i<pooled.length;i++){
  pooled[i].update({wheelSpin:2});pooled[i].dispose();pooled[i].dispose();
  const remainingTextures=new Set(pooledStats.slice(i+1).flatMap(s=>[...s.textures])),remainingSources=new Set([...remainingTextures].map(texture=>texture.source));
  for(const texture of sharedTextures)assert.equal(disposalCounts.get(texture)??0,remainingTextures.has(texture)?0:1,'texture released exactly after its final adapter');
  for(const source of sharedSources)assert.equal(source.data.closed,!remainingSources.has(source),'bitmap retained exactly while a sampler still uses it');
 }
 const pooling={simultaneousCars:4,sharedTextures:sharedTextures.size,sharedImageSources:sharedSources.size,disposalAfterLastUser:true};
 const totals=report.reduce((sum,r)=>({bytes:sum.bytes+r.bytes,triangles:sum.triangles+r.triangles,primitives:sum.primitives+r.primitives}),{bytes:0,triangles:0,primitives:0});
 assert.deepEqual(totals,{bytes:manifest.totalBytes,triangles:69280,primitives:74});assert.equal(decoded,closed,'all decoded bitmaps released');
 assert.deepEqual(issues,[],'independent exact-model review failures');console.log('PASS all ten actual imports; totals '+JSON.stringify(totals));
}finally{globalThis.fetch=nativeFetch;for(const [k,v] of Object.entries(old))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
