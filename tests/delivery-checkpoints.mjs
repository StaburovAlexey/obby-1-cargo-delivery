import assert from 'node:assert/strict';
import test from 'node:test';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {createCareerRouteTracker} from '../dist/career-route-tracker.js';
import {DELIVERY_CHECKPOINTS,ECONOMY_CONFIG,VEHICLE_CONFIG} from '../dist/economy-config.js';
import {routePointAtProgress} from '../dist/route-network.js';
import {rewardRoutePose} from './fixtures/reward-career.mjs';
import {createAppDom} from './fixtures/app-dom.mjs';

const vehicles=VEHICLE_CONFIG.map((v,i)=>({id:v.id,park:{x:40,z:40+i*20}}));
function checkpoint(index){
 const spec=DELIVERY_CHECKPOINTS[index-1],p=routePointAtProgress(spec.progress);
 return {delivery:{...spec,id:'delivery-'+spec.id,checkpointId:spec.id,x:p.x-8*p.right.x,z:p.z-8*p.right.z,radius:4.4},
  station:{id:'fuel-'+spec.id,checkpointId:spec.id,x:p.x+8*p.right.x,z:p.z+8*p.right.z,radius:4.4},point:p};
}
function reach(game,progress){
 const tracker=createCareerRouteTracker();
 for(let q=-6;q<=progress;q+=2){tracker.update(game,rewardRoutePose(q),.05);assert.ok(game.state.run?.loaded,'continuous cargo at '+q);}
 return tracker;
}

// Reinstating the vehicle-biome restriction strands a valid cargo after refuelling.
for(const [vehicleId,index,wantCash] of [['citycourier',8,3775],['foresthauler',12,10575],['desertscout',14,18125],['snowrunner',15,22500]]){
 test(vehicleId+' can refuel and deliver in the next biome',()=>{
  const {delivery,station,point}=checkpoint(index);let saved;
  const game=createGameplay({vehicles,deliveries:[delivery],stations:[station],career:{...freshCareer(),ownedVehicleIds:['pickup',vehicleId]},persistence:{save(value){saved=value;return true;}}});
  assert.ok(game.enter(vehicleId));const tracker=reach(game,delivery.progress),run=game.state.run;
  // Cross the real checkpoint from the fuel side into the delivery ring in small steps.
  for(let offset=0;offset<=8;offset+=.5){const pose={x:point.x+offset*point.right.x,z:point.z+offset*point.right.z};tracker.update(game,pose,.05);}
  game.events();game.state.fuels[vehicleId]=1;game.drive(0,station.x,station.z);
  assert.equal(game.state.fuels[vehicleId],VEHICLE_CONFIG.find(v=>v.id===vehicleId).capacity);
  assert.equal(game.state.run,run);assert.equal(run.loaded,true);assert.equal(game.state.money,0);
  assert.equal(game.events().filter(e=>e.type==='refuel').length,1);
  for(let offset=7.5;offset>=-8&&game.state.mode==='driving';offset-=.5){
   const pose={x:point.x+offset*point.right.x,z:point.z+offset*point.right.z};tracker.update(game,pose,.05);game.drive(0,pose.x,pose.z);
  }
  const events=game.events();assert.equal(events.filter(e=>e.type==='delivery').length,1);
  assert.equal(events.some(e=>e.type==='delivery-denied'),false);
  assert.equal(game.state.money,wantCash);assert.equal(game.state.completedRuns,1);
  assert.equal(game.state.mode,'walking');assert.equal(game.state.run,null);assert.equal(run.loaded,false);
  assert.equal(saved.money,wantCash);assert.ok(saved.retention.claimedCheckpointIds.includes(delivery.checkpointId));
  for(let i=0;i<10;i++)game.drive(0,delivery.x,delivery.z);
  assert.equal(game.state.money,wantCash);assert.equal(game.events().length,0);
 });
}

// Removing the biome gate must not let previews or lost cargo earn a delivery.
test('previews, invalidated cargo and empty tanks still cannot pay at a later checkpoint',()=>{
 const {delivery,station}=checkpoint(8);
 for(const mode of ['preview','invalidated','empty','walking']){
  const game=createGameplay({vehicles,deliveries:[delivery],stations:[station],career:{...freshCareer(),ownedVehicleIds:['pickup','citycourier']}});
  if(mode!=='walking')assert.ok(game.enter('citycourier'));
  if(mode==='preview')assert.ok(game.beginBiomeTest('forest'));
  if(mode==='invalidated'){
   const tracker=reach(game,100);tracker.update(game,{x:delivery.x,z:delivery.z},.05);
   assert.equal(game.state.run,null);
  }
  if(mode==='empty')game.state.fuels.citycourier=0;
  game.events();game.drive(0,delivery.x,delivery.z);
  assert.equal(game.state.money,0,mode);assert.equal(game.state.completedRuns,0,mode);
  assert.equal(game.events().some(e=>e.type==='delivery'),false,mode);
 }
});

// Actual app event handling must show the receipt and persist the next-biome payout.
test('the app completes an old-car delivery in the new biome and opens its receipt',()=>{
 const f=createAppDom({startDriving:false,career:{...freshCareer(),ownedVehicleIds:['pickup','citycourier']}});
 try{
  const d=f.debug,game=d.gameplay;game.state.cooldown=0;assert.ok(d.enterVehicle('citycourier'));f.frame();
  const target=d.garage.deliveries.find(v=>v.checkpointId==='checkpoint-08');
  assert.ok(target);reach(game,target.progress);
  game.drive(0,target.x,target.z);f.frame();
  assert.equal(d.driving,false);assert.equal(f.ids.get('delivery-receipt').hidden,false);
  assert.equal(f.ids.get('delivery-receipt-menu').hidden,false);assert.equal(game.state.money,3775);
  const saved=JSON.parse(f.storage.getItem(ECONOMY_CONFIG.saveKey));assert.equal(saved.money,3775);
  assert.equal(saved.completedRuns,1);assert.ok(saved.retention.claimedCheckpointIds.includes('checkpoint-08'));
 }finally{f.dispose();}
});
