import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAppDom} from './fixtures/app-dom.mjs';
import {attachCosmoGarage} from '../dist/cosmo-garage.js';
import {BRIDGES,bridgeSupport} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/road-layout.js';
const originalFetch=globalThis.fetch;globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}}};
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;return url.startsWith('blob:')?originalFetch(request):new Response(fs.readFileSync(new URL(url)));};
let f=createAppDom({startDriving:false,attachVehicleVisuals:attachCosmoGarage});
try{
 let d=f.debug;assert.equal((await d.garage.vehicleVisuals.ready).loaded,11);
 let reward=d.garage.vehicles.find(v=>v.id==='bmwreward');assert(reward?.visual);assert(!d.gameplay.isOwned('bmwreward'));
 assert.equal(d.enterVehicle('bmwreward'),false);assert.equal(d.gameplay.buy('bmwreward'),false);
 f.frame();const start=reward.root.quaternion.clone();for(let i=0;i<120;i++)f.frame();assert(start.angleTo(reward.root.quaternion)>.1,'parked trophy rotates');
 assert.equal(f.ids.get('vehicle-price-value-11').textContent,'Заблокировано');
 f.dispose();f=createAppDom({startDriving:false,attachVehicleVisuals:attachCosmoGarage,career:earnedRewardCareer()});d=f.debug;await d.garage.vehicleVisuals.ready;reward=d.garage.vehicles.find(v=>v.id==='bmwreward');
 // The new fixture earned the reward through the real route validator.
 for(const v of d.garage.vehicles){if(!d.gameplay.isOwned(v.id))d.gameplay.state.ownedVehicleIds.push(v.id);d.gameplay.state.cooldown=0;assert(d.enterVehicle(v.id));d.applyTruckPose();assert(v.visual.group.parent===v.root);assert(!v.cargo.visible);d.returnToGarage();}
 d.gameplay.state.cooldown=0;assert(d.enterVehicle('bmwreward'));
 for(const bridge of BRIDGES)for(const direction of [0,Math.PI]){
  const p=routePointAtProgress((bridge.from+bridge.to)/2),state={x:p.x+p.right.x*bridge.offset,z:p.z+p.right.z*bridge.offset,heading:p.heading+direction,frontWheelAngle:0};
  assert(!bridgeSupport(state,null,reward.visual.metadata).fall,'BMW centered bridge safe');
 }
 const b=BRIDGES[0],p=routePointAtProgress((b.from+b.to)/2);
 Object.assign(d.model.state,{x:p.x+p.right.x*(b.offset+2.5),z:p.z+p.right.z*(b.offset+2.5),heading:p.heading,frontWheelAngle:0});reward.routeContext=null;
 const cash=d.gameplay.state.money,brains=d.gameplay.state.brains;for(let i=0;i<150;i++)f.frame();assert(!d.driving);assert.equal(d.gameplay.state.money,cash);assert.equal(d.gameplay.state.brains,brains);
 assert(reward.root.position.y>reward.pedestal.pose.y-.01,'returns to pedestal');
 assert(d.city.group.parent.getObjectByName('Final delivery finish line'),'finish rendered in actual app');
 console.log('PASS actual 11 GLBs + app: reward locked, rotation, all car enter/reset, 25 bridges both directions, failed fall no payout, finish attached. CPU/mock DOM.');
}finally{f.dispose();globalThis.fetch=originalFetch;}
