#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {COSMO_VEHICLES,COSMO_VEHICLE_SCALE,createCosmoVehicleAdapter} from '../dist/cosmo-vehicles.js';
import {attachCosmoGarage,PARKED_COSMO_SCALE} from '../dist/cosmo-garage.js';
import {GARAGE_LAYOUT} from '../dist/garage-scene.js';

const original={fetch:globalThis.fetch,self:globalThis.self,createImageBitmap:globalThis.createImageBitmap};
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const png=Buffer.from(await blob.arrayBuffer());return {width:png.readUInt32BE(16),height:png.readUInt32BE(20),close(){}};};
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;assert(url.startsWith('blob:'),'source parser must not access network');return original.fetch(request);};
const near=(a,b,label,tolerance=1e-6)=>assert(Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
const vectorNear=(a,b,label)=>a.forEach((value,i)=>near(value,b[i],`${label}/${i}`));
function meshVertices(root){
  root.updateWorldMatrix(true,true);
  const result=new Map(),point=new THREE.Vector3();
  root.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position,vertices=[];
    for(let i=0;i<positions.count;i++)vertices.push(point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).toArray());
    result.set(mesh.uuid,vertices);
  });
  return result;
}
const report={scope:'CPU exact GLBs, source-derived full-size geometry/contact checks; no browser/GPU claim',vehicles:[],meshVertices:0,tireVertices:0,displaySwitches:0};
const adapters=[];
let garage;
try{
  assert.equal(COSMO_VEHICLE_SCALE,1.5);assert.equal(PARKED_COSMO_SCALE,1);
  for(const spec of COSMO_VEHICLES){
    const bytes=fs.readFileSync(new URL(spec.url)),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const raw=meshVertices(gltf.scene),sourceBounds=new THREE.Box3().setFromObject(gltf.scene,true),size=sourceBounds.getSize(new THREE.Vector3()),center=sourceBounds.getCenter(new THREE.Vector3());


    const scale=Math.min(4.1/size.x,8.64/size.z),priorScale=scale/1.5;
    const normalize=([x,y,z])=>[-(x-center.x)*scale,(y-sourceBounds.min.y)*scale+.05,-(z-center.z)*scale];
    const adapter=createCosmoVehicleAdapter(THREE,spec.id,gltf),metadata=adapter.metadata;adapters.push(adapter);
    vectorNear(adapter.group.scale.toArray(),[1,1,1],`${spec.id} identity render scale`);
    near(metadata.uniformScale,scale,`${spec.id} actual normalized scale`);
    vectorNear(metadata.dimensions,size.toArray().map(value=>value*scale),`${spec.id} uniform dimensions`);
    near(metadata.footprint.width,4.1,'normalization cap width');near(metadata.footprint.length,8.64,'normalization cap length');
    near(metadata.bounds.min[1],.05,`${spec.id} tire-bottom anchor`);
    assert.equal(metadata.sourceWheelRadius,.68,'unchanged physics-distance conversion radius');
    const actual=meshVertices(adapter.group);
    for(const [id,vertices] of raw){const transformed=actual.get(id);assert.equal(transformed.length,vertices.length);
      vertices.forEach((point,i)=>{vectorNear(transformed[i],normalize(point),`${spec.id} source vertex ${i}`);report.meshVertices++;});
    }
    for(const wheel of adapter.wheels){
      const points=[...meshVertices(wheel.node).values()].flat(),box=new THREE.Box3().setFromPoints(points.map(point=>new THREE.Vector3(...point))),wheelCenter=box.getCenter(new THREE.Vector3());
      const contact=metadata.wheels.find(item=>item.name===wheel.name),relative=points.map(point=>point.map((value,i)=>value-wheelCenter.getComponent(i)));
      vectorNear(contact.center,wheelCenter.toArray(),`${spec.id}/${wheel.name} center`);
      near(contact.radius,Math.max(...relative.map(([,y,z])=>Math.hypot(y,z))),`${spec.id}/${wheel.name} true radius`);
      near(contact.halfWidth,Math.max(...relative.map(([x])=>Math.abs(x))),`${spec.id}/${wheel.name} true half-width`);
      for(const vertex of contact.vertices){assert(relative.some(point=>point.every((value,i)=>Math.abs(value-vertex[i])<1e-6)),'contact vertex belongs to actual normalized tire');report.tireVertices++;}
      for(const vertex of relative)assert(contact.vertices.some(point=>point.every((value,i)=>Math.abs(value-vertex[i])<1e-6)),'all actual tire vertices have contact coverage');
    }
    for(const spin of [-9,-.4,0,.4,9]){
      adapter.update({wheelSpin:spin,steerAngle:.32,bodyPitch:.06,bodyRoll:-.08,bodyBob:.03});
      near(adapter.body.position.y,.03,'body bob remains in unchanged simulation units');
      near(adapter.body.rotation.x,.06,'body pitch unchanged');near(adapter.body.rotation.z,-.08,'body roll unchanged');
      for(const wheel of adapter.wheels){near(wheel.wheelSpin*wheel.radius,spin*.68,'wheel rotation preserves traveled distance');near(wheel.pivot.rotation.y,wheel.front?.32:0,'front-only steering');vectorNear(wheel.pivot.position.toArray(),wheel.localPosition.toArray(),'suspension never moves wheel center');}
    }
    adapter.reset();
    const reset=meshVertices(adapter.group);
    for(const [id,vertices] of raw)vertices.forEach((point,i)=>vectorNear(reset.get(id)[i],normalize(point),'reset restores enlarged geometry'));
    report.vehicles.push({id:spec.id,priorScale,scale,width:metadata.dimensions[0],length:metadata.dimensions[2],height:metadata.dimensions[1],wheelRadii:metadata.wheelRadii});
  }
  const boxes=[];
  garage={vehicles:COSMO_VEHICLES.map((spec,i)=>{const root=new THREE.Group(),park={...GARAGE_LAYOUT.bays[i]};root.position.set(park.x,0,park.z);root.rotation.y=park.heading;
    return {id:spec.id,root,park,cargo:new THREE.Group(),rig:{update(){return this;},dispose(){root.removeFromParent();}}};}),dispose(){for(const vehicle of this.vehicles)vehicle.rig.dispose();}};
  let release;const gate=new Promise(resolve=>release=resolve);
  const controller=attachCosmoGarage(THREE,garage,{load:async(T,id)=>{await gate;return adapters[COSMO_VEHICLES.findIndex(spec=>spec.id===id)];}});
  for(const vehicle of garage.vehicles){assert.deepEqual(vehicle.parkedFootprint,{halfWidth:2.25,halfLength:4.32});near(Math.hypot(vehicle.approach.x-vehicle.park.x,vehicle.approach.z-vehicle.park.z),6.55,'existing approach preserved');}

  garage.setVehicleDisplayMode('pickup');release();assert.deepEqual(await controller.ready,{loaded:10,total:10});
  for(const vehicle of garage.vehicles){
    const adapter=vehicle.visual,box=new THREE.Box3().setFromObject(adapter.group,true),bay=vehicle.park;
    vectorNear(adapter.group.scale.toArray(),[1,1,1],'loaded identity scale');
    near(box.min.y,.05,'parked geometry retains tire-bottom anchor');
    assert(box.min.x>bay.x-bay.halfWidth&&box.max.x<bay.x+bay.halfWidth&&box.min.z>bay.z-bay.halfLength&&box.max.z<bay.z+bay.halfLength,`${vehicle.id} stays in unchanged bay`);
    for(const other of boxes)assert(!box.intersectsBox(other.box),`${vehicle.id} overlaps ${other.id}`);boxes.push({id:vehicle.id,box});
    near(vehicle.parkedFootprint.halfWidth,adapter.metadata.dimensions[0]/2,'parked contact width matches full-size geometry');near(vehicle.parkedFootprint.halfLength,adapter.metadata.dimensions[2]/2,'parked contact length matches full-size geometry');
    for(const mode of [vehicle.id,null,vehicle.id,null,null]){
      garage.setVehicleDisplayMode(mode);report.displaySwitches++;
      vectorNear(adapter.group.scale.toArray(),[1,1,1],'all modes use identical scale');
      vectorNear(adapter.group.position.toArray(),[0,0,0],'all modes use identical local origin');
      const after=new THREE.Box3().setFromObject(adapter.group,true);vectorNear(after.min.toArray(),box.min.toArray(),'switch preserves bounds minimum');vectorNear(after.max.toArray(),box.max.toArray(),'switch preserves bounds maximum');
    }
  }
  boxes.sort((a,b)=>a.box.min.z-b.box.min.z);report.smallestParkingGap=Math.min(...boxes.slice(1).map((item,i)=>item.box.min.z-boxes[i].box.max.z));assert(report.smallestParkingGap>.6,'existing clear walking gap remains');
  garage.dispose();garage.dispose();assert(adapters.every(adapter=>adapter.disposed),'all enlarged adapters dispose idempotently');
  console.log(JSON.stringify({passed:true,...report},null,2));
}finally{garage?.dispose();adapters.forEach(adapter=>adapter.dispose());Object.assign(globalThis,original);}
