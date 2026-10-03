import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAppDom} from './fixtures/app-dom.mjs';
import {attachCosmoGarage} from '../dist/cosmo-garage.js';
import {freshCareer} from '../dist/career-save.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
const originalFetch=globalThis.fetch;globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}}};
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;return url.startsWith('blob:')?originalFetch(request):new Response(fs.readFileSync(new URL(url)));};
const f=createAppDom({startDriving:false,attachVehicleVisuals:attachCosmoGarage,career:{...freshCareer(),ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)}});
try{
 const d=f.debug;await d.garage.vehicleVisuals.ready;f.frame();
 for(const v of d.garage.vehicles)assert.equal(v.visual.group.scale.x,1);
 for(const v of d.garage.vehicles){
  const bounds=JSON.stringify(v.visual.metadata.bounds),radius=v.visual.wheels[0].radius;
  d.gameplay.state.cooldown=0;assert(d.enterVehicle(v.id));f.frame();
  assert.equal(v.visual.group.scale.x,1);assert.equal(JSON.stringify(v.visual.metadata.bounds),bounds);assert.equal(v.visual.wheels[0].radius,radius);
  assert(d.gameplay.state.run.loaded);assert(d.garage.vehicles.every(x=>!x.cargo.visible));
  assert(d.garage.vehicles.filter(x=>x!==v).every(x=>x.visual.group.scale.x===1));
  d.returnToGarage();assert(d.garage.vehicles.every(x=>x.visual.group.scale.x===1));
 }
 d.rebuild(43);await d.garage.vehicleVisuals.ready;f.frame();assert(d.garage.vehicles.every(x=>x.visual.group.scale.x===1));
}finally{f.dispose()}
console.log('PASS actual application: all ten cars keep the same enlarged geometry in garage and on road, unchanged wheel metadata, hidden box with loaded cargo, return/rebuild restore display scale.');
