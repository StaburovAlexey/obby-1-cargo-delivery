import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAppDom} from './fixtures/app-dom.mjs';
import {attachCosmoGarage} from '../dist/cosmo-garage.js';
import {COSMO_VEHICLES} from '../dist/cosmo-vehicles.js';
import {BRIDGES,bridgeSupport} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/road-layout.js';
const originalFetch=globalThis.fetch;globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}}};
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;return url.startsWith('blob:')?originalFetch(request):new Response(fs.readFileSync(new URL(url)));};
const f=createAppDom({startDriving:false,attachVehicleVisuals:attachCosmoGarage});
try{
 const d=f.debug;assert.deepEqual(await d.garage.vehicleVisuals.ready,{loaded:11,total:11});
 const saved=d.gameplay.snapshot(),vehicleIds=d.garage.vehicles.map(v=>v.id);
 for(const spec of COSMO_VEHICLES){
  const v=d.garage.vehicles.find(v=>v.id===spec.id);assert(v);
  if(!d.gameplay.isOwned(v.id))d.gameplay.state.ownedVehicleIds.push(v.id);
  d.gameplay.state.cooldown=0;assert(d.enterVehicle(v.id));d.model.state.frontWheelAngle=.35;d.model.state.wheelSpin=2;d.applyTruckPose();
  assert.equal(v.visual.wheels.filter(w=>w.front).every(w=>w.steerAngle===.35),true);
  assert(v.visual.group.parent===v.root);d.returnToGarage();
 }
 assert.equal(d.gameplay.state.money,saved.money);assert.equal(d.gameplay.state.brains,saved.brains);
 d.gameplay.state.cooldown=0;assert(d.enterVehicle('citycourier'));
 const b=BRIDGES[0],q=(b.from+b.to)/2,p=routePointAtProgress(q),v=d.garage.vehicles.find(v=>v.id==='citycourier');
 function position(offset){Object.assign(d.model.state,{x:p.x+p.right.x*(b.offset+offset),z:p.z+p.right.z*(b.offset+offset),heading:p.heading,speed:0,vx:0,vz:0,frontWheelAngle:0});v.routeContext=null;d.model.state.routeContext=null;}
 const extent=Math.max(...v.visual.metadata.wheels.map(w=>Math.abs(w.center[0])+w.halfWidth));
 const supportedOffset=b.halfWidth-extent-.1,fallingOffset=b.halfWidth-extent+.1;
 position(supportedOffset);assert(!bridgeSupport(d.model.state,null,v.visual.metadata).fall);
 for(let i=0;i<120;i++)f.frame();assert(d.driving,'real app supports the imported tires inside the bridge edge');
 position(fallingOffset);assert(bridgeSupport(d.model.state,null,v.visual.metadata).fall);assert(!bridgeSupport(d.model.state).fall,'legacy contacts incorrectly fit where the actual compact tires overhang');
 const money=d.gameplay.state.money,brains=d.gameplay.state.brains,owned=[...d.gameplay.state.ownedVehicleIds];
 for(let i=0;i<130;i++)f.frame();assert(!d.driving);assert.equal(d.gameplay.state.money,money);assert.equal(d.gameplay.state.brains,brains);
 assert.equal(d.gameplay.state.mode,'walking');assert(d.gameplay.isOwned('citycourier'));
 assert.deepEqual(d.gameplay.state.ownedVehicleIds,owned);assert.deepEqual(d.garage.vehicles.map(v=>v.id),vehicleIds);
 for(const car of d.garage.vehicles){assert(car.visual.group.parent===car.root);assert(car.visual.wheels.every(w=>w.wheelSpin===0));}
}finally{f.dispose()}
console.log('PASS actual app + ten parsed GLBs: enter/park/articulation, actual tire bridge support, once-only falling return without income, ownership and reset. CPU/mock DOM only.');
