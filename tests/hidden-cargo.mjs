import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
const f=createAppDom({startDriving:false,career:{...freshCareer(),ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)}});
try{
 const d=f.debug;
 for(const v of VEHICLE_CONFIG){
  d.gameplay.state.cooldown=0;assert(d.enterVehicle(v.id));f.frame();
  assert.equal(d.gameplay.state.run.loaded,true);assert(d.garage.vehicles.every(v=>!v.cargo.visible));
  d.returnToGarage();
 }
 d.gameplay.state.cooldown=0;assert(d.enterVehicle('pickup'));
 const stop=d.garage.deliveries[0],before=d.gameplay.state.money;

 d.gameplay.drive(0,stop.x,stop.z);f.frame();
 assert(d.gameplay.state.money>before);const after=d.gameplay.state.money;
 for(let i=0;i<5;i++)f.frame();assert.equal(d.gameplay.state.money,after);assert(d.garage.vehicles.every(v=>!v.cargo.visible));
}finally{f.dispose()}
console.log('PASS all ten cars retain loaded cargo without a visible box; successful delivery still pays once.');
