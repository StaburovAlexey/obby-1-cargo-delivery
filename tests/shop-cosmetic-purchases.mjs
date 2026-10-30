import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer,sanitizeCareer} from '../dist/career-save.js';
for(const [type,id,vehicleId]of [['livery','anime','pickup'],['smoke','coins'],['tracks','neon-green']]){
 test(`${type} costs 20000 once and survives career reload`,()=>{
  const g=createGameplay({career:{...freshCareer(),money:40000}});
  assert.equal(g.getCosmeticOffer(type,id,vehicleId).price,20000);
  assert.equal(g.buyCosmetic(type,id,vehicleId),true);assert.equal(g.state.money,20000);
  assert.equal(g.buyCosmetic(type,id,vehicleId),true);assert.equal(g.state.money,20000);
  const next=createGameplay({career:sanitizeCareer(g.snapshot())});
  assert.equal(next.getCosmeticOffer(type,id,vehicleId).owned,true);assert.equal(next.getCosmeticOffer(type,id,vehicleId).selected,true);
 });
}
test('unaffordable, unknown and unavailable vehicle purchases cannot spend money',()=>{
 const g=createGameplay({career:{...freshCareer(),money:19999}});
 assert.equal(g.buyCosmetic('smoke','hearts'),false);assert.equal(g.buyCosmetic('smoke','bad'),false);
 g.state.money=100000;assert.equal(g.buyCosmetic('livery','anime','rover'),false);assert.equal(g.state.money,100000);
 assert.equal(g.buyCosmetic('smoke','standard'),true);assert.equal(g.state.money,100000);
});
test('old saves get free defaults and forged selections are removed',()=>{
 assert.equal(sanitizeCareer({}).cosmetics.smoke,'standard');
 const s=sanitizeCareer({...freshCareer(),cosmetics:{owned:['bad'],smoke:'hearts',tracks:'rainbow',liveries:{pickup:'anime'}}});
 assert.deepEqual(s.cosmetics,{owned:[],premiumOwned:[],liveries:{},smoke:'standard',tracks:'standard'});
});

test('purchased cosmetics and selections survive an actual cloud save and reload',async()=>{
 const {createCloudCareer}=await import('../dist/cloud-career.js');let data=null;
 const platform={async loadSave(){return data;},async saveSave(value){data=JSON.parse(JSON.stringify(value));}};
 const make=()=>createCloudCareer({platform,legacyStorage:null,writeDelayMs:0});
 const first=make();await first.initialize();
 try{
  const g=createGameplay({career:{...freshCareer(),money:40000},persistence:first.store});
  assert.equal(g.buyCosmetic('smoke','coins'),true);assert.equal(g.buyCosmetic('tracks','neon-green'),true);
  await first.flush();
  const second=make();try{
   const loaded=await second.initialize();assert.equal(loaded.career.cosmetics.smoke,'coins');
   assert.equal(loaded.career.cosmetics.tracks,'neon-green');assert.equal(loaded.career.money,0);
  }finally{second.destroy();}
 }finally{first.destroy();}
});
