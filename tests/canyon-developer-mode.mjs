import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {VEHICLE_CONFIG,ECONOMY_CONFIG} from '../dist/economy-config.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {CANYON_TRACK,canyonPointAt} from '../dist/canyon-track.js';

const vehicles=VEHICLE_CONFIG.map((vehicle,index)=>({id:vehicle.id,park:{x:24,z:44+11*index}}));

test('developer vehicles are all selectable without buying or changing saved ownership',()=>{
 const career=freshCareer();let writes=0;
 const gameplay=createGameplay({vehicles,developerMode:true,career,persistence:{save(){writes++;}}});
 assert.equal(vehicles.length,11,'all eleven vehicles are covered, including the reward BMW');
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
 gameplay.state.cooldown=0;assert.equal(gameplay.enter('bmwreward'),true);
 const player={...gameplay.state.player},fuels={...gameplay.state.fuels};
 assert.equal(gameplay.beginCanyonRun(),true);
 assert.deepEqual(gameplay.state.player,player);assert.deepEqual(gameplay.state.fuels,fuels);
 assert.equal(gameplay.state.eventMode,'canyon');
 assert.equal(gameplay.state.selectedId,'bmwreward');
 assert.equal(gameplay.state.run,null);
 assert.equal(gameplay.tickProgress(.05,{active:true,distance:1}),0);
 assert.equal(gameplay.recordDriftResult({version:1,trackId:'canyon-v1',score:1000,durationMs:100000,maxCombo:2,verified:false}),false);
 assert.equal(gameplay.endCanyonRun(),true);assert.equal(gameplay.state.eventMode,null);
 assert.equal(gameplay.state.mode,'driving');assert.equal(gameplay.state.selectedId,'bmwreward');assert.equal(gameplay.state.testMode,true);
 assert.deepEqual(gameplay.state.player,player);assert.deepEqual(gameplay.state.fuels,fuels);
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
   assert.equal(debug.model,debug.garage.vehicles.find(v=>v.id===vehicle.id).model,vehicle.id);
   assert.equal(debug.canyon.enter(),false,'unlocking does not start a distant event');
   debug.returnToGarage();
  }
  debug.gameplay.state.cooldown=0;assert.equal(debug.enterVehicle('bmwreward'),true);
  const model=debug.model,parent=debug.rig.root.parent;
  for(let attempt=0;attempt<2;attempt++){
   Object.assign(model.state,canyonPointAt(12));
   assert.equal(debug.canyon.entrance.unlocked,true);
   assert.equal(debug.canyon.enter(),true);
   assert.equal(debug.canyon.enter(),false,'repeated entry cannot replace an active run');
   assert.equal(debug.canyon.phase,'running','scoring begins immediately without a countdown');
   assert.equal(debug.canyon.score.elapsed,0);assert.equal(debug.input.state.enabled,true);assert.equal(debug.canyon.controlsLocked,false);
   assert.equal(debug.canyon.score.rankedEligible,false);
   assert.equal(debug.canyon.score.reason,'development');
   const before={...model.state};assert.equal(debug.canyon.retry(),true);
   assert.equal(debug.canyon.phase,'touring');assert.deepEqual(model.state,before);
   fixture.ids.get('canyon-exit').dispatch('click');
   assert.equal(debug.canyon.active,true,'the result exit button dismisses the UI without returning to the garage');
   assert.equal(fixture.ids.get('canyon-overlay').hidden,true);assert.equal(debug.model,model);assert.equal(debug.rig.root.parent,parent);
   Object.assign(model.state,{x:CANYON_TRACK.origin.x-5,z:CANYON_TRACK.origin.z});debug.canyon.step(0);
   assert.equal(debug.canyon.active,false);
   assert.equal(debug.gameplay.state.mode,'driving');assert.equal(debug.gameplay.state.selectedId,'bmwreward');assert.equal(debug.gameplay.state.testMode,true);
   assert.equal(debug.gameplay.state.eventMode,null);
   assert.deepEqual(debug.gameplay.snapshot(),career);
  }
  debug.rebuild(42);debug=fixture.debug;
  assert.equal(debug.canyon.entrance.unlocked,false,'rebuilding without a selected BMW closes the gate');
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


test('developer practice cannot replace a legitimate career drift record',async()=>{
 const {earnedRewardCareer}=await import('./fixtures/reward-career.mjs');
 const career=earnedRewardCareer();let writes=0;
 const gameplay=createGameplay({vehicles,career,developerMode:true,persistence:{save(){writes++;}}});
 const before=gameplay.snapshot();
 for(const verified of [false,true])assert.equal(gameplay.recordDriftResult({version:1,trackId:'canyon-v1',score:99999,durationMs:100000,maxCombo:5,verified}),false);
 assert.deepEqual(gameplay.snapshot(),before);assert.equal(writes,0);
});
