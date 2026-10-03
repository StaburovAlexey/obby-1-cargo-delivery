#!/usr/bin/env node
// Current GLB-only fleet contract. CPU Three.js + mocked DOM, no GPU/browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createAppDom} from './fixtures/app-dom.mjs';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import {attachCosmoGarage} from '../dist/cosmo-garage.js';
import {COSMO_VEHICLES} from '../dist/cosmo-vehicles.js';
import {BMW_VEHICLE} from '../dist/bmw-vehicle.js';
import {vehicleFootprint} from '../dist/vehicle-contact.js';
const originalFetch=globalThis.fetch,originalSelf=globalThis.self,originalBitmap=globalThis.createImageBitmap;
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}}};
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;return url.startsWith('blob:')?originalFetch(request):new Response(fs.readFileSync(new URL(url)));};
const files=fs.readdirSync(new URL('../dist/assets/vehicles/cosmo/',import.meta.url)).filter(name=>name.endsWith('.glb')).sort();
assert.deepEqual(files,COSMO_VEHICLES.map(v=>v.model+'.glb').sort());
const manifest=JSON.parse(fs.readFileSync(new URL('../dist/assets/vehicles/cosmo/manifest.json',import.meta.url)));
for(const file of manifest.files){const bytes=fs.readFileSync(new URL('../dist/assets/vehicles/cosmo/'+file.file,import.meta.url));assert.equal(bytes.length,file.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256)}
assert(fs.existsSync(new URL(BMW_VEHICLE.url)));
let pendingRoots=0,completed=0;
const f=createAppDom({startDriving:false,career:earnedRewardCareer(),attachVehicleVisuals:(T,g)=>{
 for(const vehicle of g.vehicles){assert.equal(vehicle.root.children.length,1);assert.equal(vehicle.root.children[0],vehicle.cargo);assert(vehicle.cargo.isGroup);assert.equal(vehicle.cargo.visible,false);vehicle.root.traverse(node=>assert(!node.isMesh));pendingRoots++}
 return attachCosmoGarage(T,g);
}});
try{
 const d=f.debug,ids=d.garage.vehicles.map(v=>v.id),saved=d.gameplay.snapshot();
 assert.equal(ids.length,11);assert.equal(ids.at(-1),'bmwreward');assert.equal(d.city.features.some(f=>f.type==='truck'),false);assert.equal(d.city.group.getObjectByName('Orange delivery truck'),undefined);
 assert.deepEqual(await d.garage.vehicleVisuals.ready,{loaded:11,total:11});
 const roots=d.garage.vehicles.map(v=>v.root),configs=d.garage.vehicles.map(v=>v.config);
 for(const [index,v] of d.garage.vehicles.entries()){
  if(!d.gameplay.isOwned(v.id))d.gameplay.state.ownedVehicleIds.push(v.id);
  assert.equal(v.visual.group.parent,v.root);assert.equal(v.root.children.filter(n=>n.isInstancedMesh).length,0);assert.equal(v.visual.wheels.length,4);
  const footprint=vehicleFootprint(v.visual.metadata);assert(footprint.halfWidth>0&&footprint.halfLength>0);
  d.gameplay.state.cooldown=0;assert(d.enterVehicle(v.id));Object.assign(d.model.state,{frontWheelAngle:.35,wheelSpin:2,bodyPitch:.02,bodyRoll:-.04,bodyBob:.01});d.applyTruckPose();
  assert(v.visual.wheels.filter(w=>w.front).every(w=>Math.abs(w.steerAngle-.35)<1e-12));assert(v.visual.wheels.every(w=>Math.abs(w.wheelSpin-2*.68/w.radius)<1e-12));
  f.frame();assert(!v.cargo.visible);assert(d.garage.vehicles.every(car=>!car.cargo.visible));d.returnToGarage();
  assert.equal(v.root,roots[index]);assert.equal(v.config,configs[index]);assert(v.visual.wheels.every(w=>w.wheelSpin===0));completed++;
 }
 assert.equal(d.gameplay.state.money,saved.money);assert.equal(d.gameplay.state.brains,saved.brains);
 const oldVisuals=d.garage.vehicles.map(v=>v.visual.group);d.rebuild(43);assert(oldVisuals.every(group=>!group.parent));
 assert.deepEqual(await d.garage.vehicleVisuals.ready,{loaded:11,total:11});assert.deepEqual(d.garage.vehicles.map(v=>v.id),ids);
 assert.equal(pendingRoots,22);assert.equal(d.garage.vehicleVisuals.failed,0);
 console.log(`PASS ${completed} real GLB vehicles: audited asset inventory, empty loading roots, collision metadata, steering/spin/park, hidden logical cargo, stable configs/currency and rebuild disposal.`);
}finally{f.dispose();globalThis.fetch=originalFetch;globalThis.self=originalSelf;globalThis.createImageBitmap=originalBitmap;}
