import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {nitroCareer} from './fixtures/nitro-career.mjs';
import {freshCareer} from '../dist/career-save.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {UPGRADE_STATS} from '../dist/vehicle-upgrades.js';
import {getAffordablePurchases} from '../dist/purchase-notifications.js';
function visuals(_,garage){
 for(const v of garage.vehicles){let locked=false;v.visual={group:v.root,get locked(){return locked;},setLocked(value){locked=!!value;}};}
 garage.vehicleVisuals={request(){},ensure:id=>Promise.resolve(garage.vehicles.find(v=>v.id===id)?.visual),status:()=> 'loaded'};
}
test('drift improvements contain only nitro; BMW appearance requires real route completion even in development',()=>{
 const f=createAppDom({startDriving:false,search:'?dev=1',career:{...freshCareer(),brains:20000},attachVehicleVisuals:visuals});
 try{
  const d=f.debug,g=d.gameplay,el=id=>f.doc.getElementById(id),bmw=d.garage.vehicles.find(v=>v.id==='bmwreward');f.frame();
  assert.equal(g.isOwned('bmwreward'),true);assert.equal(bmw.visual.locked,true);
  for(const spec of VEHICLE_CONFIG.filter(v=>v.rewardDrift)){
   g.state.cooldown=0;
   if(spec.devUnlock){g.state.player={...d.garage.vehicles.find(v=>v.id===spec.id).approach};assert.equal(g.unlockDeveloperVehicle(spec.id),true);}
   assert.equal(d.enterVehicle(spec.id),true);for(let i=0;i<20;i++)f.frame();d.setUpgradeMenu(true);
   assert.equal(el('upgrade-standard-cards').hidden,true);assert.equal(el('tyre-shop').hidden,true);
   for(const stat of UPGRADE_STATS)assert.equal(el(`upgrade-${stat.id}-buy`).disabled,true);
   assert.equal(el('nitro-upgrade-card').hidden,false);
   if(!g.state.nitroLevel)el('nitro-upgrade-buy').dispatch('click');
   assert.equal(g.state.nitroLevel,1);d.setUpgradeMenu(false);d.returnToGarage();
  }
  g.state.money=0;g.state.brains=100000;g.state.nitroLevel=5;assert.equal(getAffordablePurchases(g).upgrade,true,'ordinary improvements remain affordable while walking');
  g.state.cooldown=0;d.enterVehicle('bmwreward');assert.equal(getAffordablePurchases(g).upgrade,false,'old drift upgrades never create a notification');
  d.returnToGarage();const career=nitroCareer();g.state.routeCompletion=career.routeCompletion;g.state.ownedVehicleIds.push('bmwreward');f.frame();
  assert.equal(bmw.visual.locked,false);
  g.state.cooldown=0;d.enterVehicle('pickup');for(let i=0;i<20;i++)f.frame();d.setUpgradeMenu(true);assert.equal(el('upgrade-standard-cards').hidden,false);
 }finally{f.dispose();}
});
