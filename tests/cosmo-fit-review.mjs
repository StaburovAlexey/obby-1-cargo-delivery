#!/usr/bin/env node
// Independent CPU review of every actual packaged Cosmo GLB. No renderer,
// browser, socket, GPU-performance or screenshot claim is made by this test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {COSMO_VEHICLES,createCosmoVehicleAdapter} from '../dist/cosmo-vehicles.js';
import {fitTruckToGround,groundHeight} from '../dist/city-driving.js';
import {routePointAtProgress} from '../dist/road-layout.js';
import {GARAGE_LAYOUT} from '../dist/garage-scene.js';
const baseline=JSON.parse(fs.readFileSync(new URL('../qa/cosmo-fit/source-review.json',import.meta.url)));
const expected={pickup:'coupe',citycourier:'police',rover:'jeep',foresthauler:'van',van:'kamaro',desertscout:'ghini',snowgrip:'rally',snowrunner:'armor',lavacrawler:'lamb',ashhauler:'fenyr'};
const nativeFetch=globalThis.fetch;
const old={self:globalThis.self,createImageBitmap:globalThis.createImageBitmap};
let decoded=0,closed=0;
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a');decoded++;return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),closed:false,close(){assert(!this.closed,'bitmap closed twice');this.closed=true;closed++;}};};
globalThis.fetch=async request=>{const u=typeof request==='string'?request:request.url;assert(u.startsWith('blob:'),'CPU parse must never access network');return nativeFetch(request);};
const near=(a,b,t=2e-5,label='value')=>assert(Math.abs(a-b)<=t,`${label}: ${a} vs ${b}`);
const vectorNear=(a,b,t=2e-5,label='vector')=>a.forEach((x,i)=>near(x,b[i],t,`${label}[${i}]`));
function vertices(root){root.updateWorldMatrix(true,true);const out=[];root.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)out.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).toArray());});return out;}
function stats(root){let triangles=0,meshes=0;const geometries=new Set(),materials=new Set(),textures=new Set(),sources=new Set();root.traverse(mesh=>{if(!mesh.isMesh)return;meshes++;geometries.add(mesh.geometry);triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;for(const m of [].concat(mesh.material)){materials.add(m);for(const t of Object.values(m))if(t?.isTexture){textures.add(t);sources.add(t.source);}}});return {triangles,meshes,geometries,materials,textures,sources};}
const report=[],issues=[];
try{
 assert.deepEqual(Object.fromEntries(COSMO_VEHICLES.map(s=>[s.id,s.model])),expected);
 for(const spec of COSMO_VEHICLES){
  const before=baseline.find(x=>x.model===spec.model),bytes=fs.readFileSync(new URL(spec.url));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),before.sha256,`${spec.id}: original GLB bytes preserved`);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const sourceStats=stats(gltf.scene);
  const adapter=createCosmoVehicleAdapter(THREE,spec.id,gltf),s=stats(adapter.group);
  assert.equal(s.triangles,before.triangles);assert.equal(s.meshes,before.primitives);assert.equal(s.geometries.size,sourceStats.geometries.size);
  assert.equal(adapter.wheels.length,4);assert.equal(new Set(adapter.wheels.map(w=>w.name)).size,4);
  const rest=vertices(adapter.group),bounds=new THREE.Box3().setFromPoints(rest.map(v=>new THREE.Vector3(...v))),size=bounds.getSize(new THREE.Vector3());
  near(bounds.min.y,.05,2e-5,`${spec.id} rest tire bottom`);near(bounds.getCenter(new THREE.Vector3()).x,0);near(bounds.getCenter(new THREE.Vector3()).z,0);
  assert(size.x<=4.65002 && size.z<=8.64002,`${spec.id} collision envelope`);
  const originalSize=before.bounds[0].map((v,i)=>before.bounds[1][i]-v),scale=Math.min(4.65/originalSize[0],8.64/originalSize[2]);
  vectorNear(size.toArray(),originalSize.map(n=>n*scale),3e-5,`${spec.id} uniform proportions`);
  near(adapter.metadata.uniformScale,scale);assert.equal(adapter.metadata.sourceForward,'+Z');assert.equal(adapter.metadata.forward,'-Z');
  const tireCenters=adapter.wheels.map(w=>w.localPosition.toArray());
  for(const w of adapter.wheels){
   assert.equal(w.front,w.localPosition.z<0);assert.equal(w.side,w.localPosition.x<0?'left':'right');
   const points=vertices(w.node),center=new THREE.Box3().setFromPoints(points.map(v=>new THREE.Vector3(...v))).getCenter(new THREE.Vector3());vectorNear(center.toArray(),w.localPosition.toArray());
   const r=Math.max(...points.map(v=>Math.hypot(v[1]-center.y,v[2]-center.z)));near(w.radius,r,1e-5,'actual tire radius');
  }
  const white=before.lights['255,255,255'];assert(white && white.max[2]>0,`${spec.id} source headlamp forward`);
  // Shader replacement must only affect body paint. Wheels, glass and lamps retain source colors/maps.
  const paintMaterials=new Set();adapter.body.traverse(mesh=>{if(!mesh.material)return;for(const m of [].concat(mesh.material)){if(m.userData.cosmoPaintSwatches){paintMaterials.add(m);assert(['metallic','texture'].includes(m.name));assert.equal(m.color.getHex(),0xffffff);const shader={uniforms:{},fragmentShader:'#include <map_fragment>'};m.onBeforeCompile(shader);assert(!shader.fragmentShader.includes('#include <map_fragment>'));assert(shader.fragmentShader.includes('sampledDiffuseColor.rgb = mix'));assert.equal(Object.keys(shader.uniforms).length,spec.paint.length*2);for(let i=0;i<spec.paint.length;i++){vectorNear(shader.uniforms[`cosmoPaintSource${i}`].value.toArray(),new THREE.Color(spec.paint[i][0]).toArray(),0);vectorNear(shader.uniforms[`cosmoPaintTarget${i}`].value.toArray(),new THREE.Color(spec.paint[i][1]).toArray(),0);}}}});
  assert.equal(paintMaterials.size>0,spec.paint.length>0);
  for(const w of adapter.wheels)w.node.traverse(mesh=>{for(const m of [].concat(mesh.material??[]))assert(!m.userData.cosmoPaintSwatches,'wheel palette must not be recolored');});
  adapter.body.traverse(mesh=>{for(const m of [].concat(mesh.material??[]))if(['light','glass'].includes(m.name))assert(!m.userData.cosmoPaintSwatches,'lamp/glass palette must not be recolored');});
  for(const m of s.materials){if(m.map){assert.equal(m.map.colorSpace,THREE.SRGBColorSpace);assert.equal(m.map.flipY,false);assert.equal(m.map.image.width,1000);assert.equal(m.map.image.height,720);}if(m.name==='light')assert(m.emissiveIntensity<=.65);}
  adapter.update({wheelSpin:2.3,steerAngle:.48});
  for(const w of adapter.wheels){near(w.pivot.rotation.y,w.front?.48:0);near(w.spin.rotation.x,-(2.3*.68/w.radius%(2*Math.PI)));}
  const wheelPose=adapter.wheels.map(w=>vertices(w.node));adapter.update({bodyPitch:.0375,bodyRoll:-.1,bodyBob:.03});
  adapter.wheels.forEach((w,i)=>vertices(w.node).forEach((v,j)=>vectorNear(v,wheelPose[i][j],0,'wheel independent of body suspension')));
  for(let i=0;i<20;i++){adapter.update({bodyPitch:.02,bodyRoll:.08,bodyBob:-.02});adapter.update({bodyPitch:.0375,bodyRoll:-.1,bodyBob:.03});}
  const posed=vertices(adapter.group);assert.throws(()=>adapter.update({wheelSpin:7,bodyBob:Infinity}),TypeError);assert.deepEqual(vertices(adapter.group),posed,'invalid update atomic');
  adapter.reset();vertices(adapter.group).forEach((v,i)=>vectorNear(v,rest[i],1e-6,'repeated/reset preserves geometry'));
  // Dense footprint rays keep crate off body rather than relying on full-car maximum (antenna/lightbar).
  const cargo=adapter.cargoPosition,ray=new THREE.Raycaster();let peak=-Infinity,hits=0;
  for(let xi=0;xi<=8;xi++)for(let zi=0;zi<=8;zi++){
   ray.set(new THREE.Vector3(-.59+1.18*xi/8,bounds.max.y+1,cargo.z-.59+1.18*zi/8),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(adapter.body,true)[0];if(hit){peak=Math.max(peak,hit.point.y);hits++;}
  }
  assert.equal(hits,81,`${spec.id} crate footprint supported`);if(cargo.y-.55<peak-.003)issues.push(`${spec.id} crate intersects roof by ${peak-(cargo.y-.55)}`);
  if(spec.model==='police')assert(cargo.z-.59>.259*1.5,'police crate clear of enlarged siren');
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
  // Verify injected/shared cargo is not captured in adapter ownership/disposal.
  const cargoGeometry=new THREE.BoxGeometry(),cargoMaterial=new THREE.MeshBasicMaterial(),externalCargo=new THREE.Mesh(cargoGeometry,cargoMaterial);adapter.body.add(externalCargo);let externalDisposals=0;cargoGeometry.addEventListener('dispose',()=>externalDisposals++);cargoMaterial.addEventListener('dispose',()=>externalDisposals++);
  const disposalCounts=new Map();for(const resource of [...s.geometries,...s.materials,...s.textures])resource.addEventListener('dispose',()=>disposalCounts.set(resource,(disposalCounts.get(resource)??0)+1));
  adapter.dispose();adapter.dispose();assert(adapter.disposed);assert.equal(externalDisposals,0,'shared cargo resources not disposed');for(const resource of [...s.geometries,...s.materials,...s.textures])assert.equal(disposalCounts.get(resource),1,'owned resource disposed once');cargoGeometry.dispose();cargoMaterial.dispose();
  report.push({id:spec.id,model:spec.model,bytes:bytes.length,triangles:s.triangles,primitives:s.meshes,width:size.x,length:size.z,height:size.y,wheelCenters:tireCenters,cargoPosition:cargo.toArray(),cargoSupportSamples:hits,cargoClearance:cargo.y-.55-peak,parkingMargins,roadMinimum,roadMaximumLowest,roadPoses,minSpinY,maxSteeredWidth,materialCount:s.materials.size,textureCount:s.textures.size,textureSources:s.sources.size});
  console.log(`PASS ${spec.id}: exact GLB, uniform fit, forward/axles, palette scope, articulation, cargo support, owned disposal`);
 }
 // Keep distinct cars alive together to test immutable-palette reference counts.
 const pooled=[];for(const spec of [COSMO_VEHICLES[0],COSMO_VEHICLES[2],COSMO_VEHICLES[9]]){
  const bytes=fs.readFileSync(new URL(spec.url));const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');pooled.push(createCosmoVehicleAdapter(THREE,spec.id,gltf));
 }
 const pooledStats=pooled.map(a=>stats(a.group)),sharedTextures=new Set(pooledStats.flatMap(s=>[...s.textures])),sharedSources=new Set([...sharedTextures].map(t=>t.source));assert.equal(sharedTextures.size,2);assert.equal(sharedSources.size,1);
 let sharedTextureDisposals=0;for(const t of sharedTextures)t.addEventListener('dispose',()=>sharedTextureDisposals++);
 const bitmap=[...sharedSources][0].data;assert(!bitmap.closed);pooled[0].dispose();assert(!bitmap.closed);assert.equal(sharedTextureDisposals,0);pooled[1].dispose();assert(!bitmap.closed);assert.equal(sharedTextureDisposals,0);pooled[2].update({wheelSpin:2});pooled[2].dispose();assert(bitmap.closed);assert.equal(sharedTextureDisposals,2);
 const pooling={simultaneousCars:3,sharedTextures:2,sharedImageSources:1,disposalAfterLastUser:true};
 const totals=report.reduce((sum,r)=>({bytes:sum.bytes+r.bytes,triangles:sum.triangles+r.triangles,primitives:sum.primitives+r.primitives}),{bytes:0,triangles:0,primitives:0});
 assert.deepEqual(totals,{bytes:1751496,triangles:23207,primitives:109});assert.equal(decoded,closed,'all decoded bitmaps released');
 fs.writeFileSync(new URL('../qa/cosmo-fit/adapter-review.json',import.meta.url),JSON.stringify({scope:'CPU parse/geometry/source-shader checks only; actual shader compilation, lighting, rendering and GPU performance not tested.',totals,decoded,closed,issues,pooling,vehicles:report},null,2)+'\n');
 assert.deepEqual(issues,[],'independent exact-model review failures');console.log('PASS all ten actual imports; totals '+JSON.stringify(totals));
}finally{globalThis.fetch=nativeFetch;for(const [k,v] of Object.entries(old))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
