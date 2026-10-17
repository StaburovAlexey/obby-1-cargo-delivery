import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {VEHICLE_CONFIG,ECONOMY_CONFIG} from '../dist/economy-config.js';
import {createAppDom} from './fixtures/app-dom.mjs';

const vehicles=VEHICLE_CONFIG.map((vehicle,index)=>({id:vehicle.id,park:{x:24,z:44+11*index}}));

test('developer vehicles are all selectable without buying or changing saved ownership',()=>{
 const career=freshCareer();let writes=0;
 const gameplay=createGameplay({vehicles,developerMode:true,career,persistence:{save(){writes++;}}});
 for(const vehicle of vehicles){
  gameplay.state.cooldown=0;
  assert.equal(gameplay.isOwned(vehicle.id),true,vehicle.id);
  assert.equal(gameplay.getVehicleAvailability(vehicle.id).status,'owned',vehicle.id);
  assert.equal(gameplay.getVehicleAvailability(vehicle.id).purchasable,false,vehicle.id);
  assert.equal(gameplay.enter(vehicle.id),true,vehicle.id);
  if(!career.ownedVehicleIds.includes(vehicle.id)){
   assert.equal(gameplay.state.testMode,true,vehicle.id);
   assert.equal(gameplay.state.run,null,vehicle.id);
   assert.equal(gameplay.tickProgress(.05,{active:true,distance:1}),0,vehicle.id);
   assert.equal(gameplay.recordRouteSample({runId:'fake',x:0,z:6,dt:.05}),false);
  }
  gameplay.returnToGarage();
  assert.deepEqual(gameplay.snapshot(),career);
 }
 assert.equal(gameplay.isOwned('unknown-vehicle'),false);
 assert.equal(gameplay.beginCanyonRun(),true);
 assert.equal(gameplay.state.eventMode,'canyon');
 assert.equal(gameplay.state.selectedId,'bmwreward');
 assert.equal(gameplay.state.run,null);
 assert.equal(gameplay.tickProgress(.05,{active:true,distance:1}),0);
 assert.equal(gameplay.recordDriftResult({version:1,trackId:'canyon-v1',score:1000,durationMs:100000,maxCombo:2,verified:false}),false);
 gameplay.returnToGarage();gameplay.flushProgress();
 assert.deepEqual(gameplay.snapshot(),career);
 assert.equal(writes,0);
});

test('ordinary and nonboolean developer settings retain all vehicle and canyon locks',()=>{
 const career=freshCareer();
 for(const developerMode of [undefined,false,0,1,'true','1']){
  const gameplay=createGameplay({vehicles,career,developerMode});
  for(const vehicle of vehicles)assert.equal(gameplay.isOwned(vehicle.id),career.ownedVehicleIds.includes(vehicle.id),vehicle.id);
  assert.equal(gameplay.beginCanyonRun(),false);
  assert.equal(gameplay.state.eventMode,null);
  assert.deepEqual(gameplay.snapshot(),career);
 }
});

test('developer app unlocks all cars and the canyon through repeated entry and rebuild without saving',()=>{
 const career=freshCareer(),raw=JSON.stringify(career);let writes=0;
 const storage={getItem:key=>key===ECONOMY_CONFIG.saveKey?raw:null,setItem(){writes++;}};
 const fixture=createAppDom({startDriving:false,search:'?dev=1',storage});
 try{
  let debug=fixture.debug;
  assert.equal(debug.developerMode,true);
  for(const vehicle of vehicles){
   debug.gameplay.state.cooldown=0;
   assert.equal(debug.enterVehicle(vehicle.id),true,vehicle.id);
   debug.returnToGarage();
  }
  for(let attempt=0;attempt<2;attempt++){
   assert.equal(debug.canyon.entrance.unlocked,true);
   assert.equal(debug.canyon.enter(),true);
   assert.equal(debug.canyon.enter(),false,'repeated entry cannot replace an active run');
   for(let frame=0;frame<190;frame++)fixture.frame();
   assert.equal(debug.canyon.phase,'running');
   assert.equal(debug.canyon.score.rankedEligible,false);
   assert.equal(debug.canyon.score.reason,'development');
   assert.equal(debug.canyon.retry(),true);
   fixture.ids.get('canyon-exit').dispatch('click');
   assert.equal(debug.canyon.active,false);
   assert.equal(debug.gameplay.state.eventMode,null);
   assert.deepEqual(debug.gameplay.snapshot(),career);
  }
  debug.rebuild(42);debug=fixture.debug;
  assert.equal(debug.canyon.entrance.unlocked,true);
  for(const vehicle of vehicles)assert.equal(debug.gameplay.isOwned(vehicle.id),true,vehicle.id);
  assert.deepEqual(debug.gameplay.snapshot(),career);
  assert.equal(writes,0);
 }finally{fixture.dispose();}
 assert.equal(writes,0,'pagehide cannot save developer unlocks');
});

test('production service rejects the dev query and preserves the canyon and vehicle locks',()=>{
 const career=freshCareer();
 const services={development:false,initialCareer:career,platform:{ready(){},gameplayStart(){},gameplayStop(){},showAd:async()=>({wasShown:false})}};
 const fixture=createAppDom({startDriving:false,search:'?dev=1',services});
 try{
  const debug=fixture.debug;
  assert.equal(debug.developerMode,false);
  for(const vehicle of vehicles)assert.equal(debug.gameplay.isOwned(vehicle.id),career.ownedVehicleIds.includes(vehicle.id),vehicle.id);
  assert.equal(debug.canyon.entrance.unlocked,false);
  assert.equal(debug.canyon.enter(),false);
  assert.deepEqual(debug.gameplay.snapshot(),career);
 }finally{fixture.dispose();}
});
