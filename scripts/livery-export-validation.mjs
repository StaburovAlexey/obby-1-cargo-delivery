import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../dist/vendor/three.module.js';
import { COSMO_VEHICLES, loadCosmoVehicle } from '../dist/cosmo-vehicles.js';
import { loadBMWVehicle } from '../dist/bmw-vehicle.js';
import { createVehicleLiveryController, VEHICLE_LIVERY_IDS } from '../dist/vehicle-livery-materials.js';
const destination=path.resolve(process.argv[2]??'/tmp/livery-render');fs.mkdirSync(destination,{recursive:true});
const nativeFetch=globalThis.fetch;globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}}};
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;return url.startsWith('blob:')?nativeFetch(request):new Response(fs.readFileSync(new URL(url)),{status:200})};
const select=process.argv[3]?.split(',')??VEHICLE_LIVERY_IDS;
for(const id of select){
 const adapter=id==='bmwreward'?await loadBMWVehicle(THREE):await loadCosmoVehicle(THREE,id);
 const controller=createVehicleLiveryController(THREE,adapter,id,{textureLoader:async()=>new THREE.Texture({width:1024,height:1024})});
 await controller.preview('anime');adapter.group.updateWorldMatrix(true,true);
 const output={vehicleId:id,root:path.resolve(new URL('..',import.meta.url).pathname),audit:controller.audit,meshes:[]};
 adapter.group.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData?.brakeLightOverlay)return;
  const geometry=mesh.geometry,position=geometry.attributes.position,normal=geometry.attributes.normal;
  const uv=geometry.attributes.uv,luv=geometry.attributes.liveryUv,mask=geometry.attributes.liveryMask;
  const matrices=mesh.matrixWorld,normalMatrix=new THREE.Matrix3().getNormalMatrix(matrices);
  const vertices=[],normals=[],uvs=[],liveryUVs=[],masks=[];const p=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
   vertices.push(p.fromBufferAttribute(position,i).applyMatrix4(matrices).toArray());
   normals.push(normal?p.fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize().toArray():[0,1,0]);
   uvs.push(uv?[uv.getX(i),uv.getY(i)]:[0,0]);liveryUVs.push(luv?[luv.getX(i),luv.getY(i)]:[0,0]);masks.push(mask?mask.getX(i):0);
  }
  const materialList=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const materials=materialList.map(material=>({name:material.name,color:material.color?.toArray()??[1,1,1],metalness:material.metalness??0,roughness:material.roughness??.5,emissive:material.emissive?.toArray()??[0,0,0],emissiveIntensity:material.emissiveIntensity??0,palette:material.map?.name==='texture-palette',emissivePalette:material.emissiveMap?.name==='texture-palette',remap:material.userData.cosmoPaintSwatches??[]}));
  const faces=[];const count=geometry.index?.count??position.count;
  for(let i=0;i<count;i+=3){const ix=[0,1,2].map(n=>geometry.index?geometry.index.getX(i+n):i+n);const group=geometry.groups.find(group=>i>=group.start&&i<group.start+group.count);faces.push({vertices:ix,material:group?.materialIndex??0,livery:ix.every(i=>masks[i]===1)});}
  output.meshes.push({name:mesh.name,vertices,normals,uvs,liveryUVs,faces,materials});
 });
 fs.writeFileSync(path.join(destination,`${id}.json`),JSON.stringify(output));
 controller.dispose();adapter.dispose();
}
console.log(`Exported actual runtime geometry/UVs for ${select.length} cars to ${destination}`);
