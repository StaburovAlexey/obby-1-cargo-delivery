#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ECONOMY_CONFIG, VEHICLE_CONFIG } from '../dist/economy-config.js';
import { PROGRESSION_CONFIG, SCHOOL_CONFIG } from '../dist/progression-config.js';
import { UPGRADE_STATS, UPGRADE_MAX_LEVEL, getUpgradeOffer, getVehiclePerformance } from '../dist/vehicle-upgrades.js';
import { createGameplay } from '../dist/gameplay.js';
import { freshCareer, createCareerStore } from '../dist/career-save.js';
import { CLASSROOM_ENTRIES, CLASSROOM_DESKS } from '../dist/garage-scene.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const prices=[0,1300,3200,6500,10000,16000,25000,45000,78000,100000];
const schoolPrices=[0,1000,4000,12000,30000],schoolRates=[1.5,1.8,2.2,2.6,3];
assert.deepEqual(VEHICLE_CONFIG.map(v=>v.price),prices);
assert.deepEqual(SCHOOL_CONFIG.map(s=>s.price),schoolPrices);
assert.deepEqual(SCHOOL_CONFIG.map(s=>s.rate),schoolRates);
assert.equal(PROGRESSION_CONFIG.drivingRate,3);
assert.equal(ECONOMY_CONFIG.saveKey,'urban-route-career-v1');
assert.equal(ECONOMY_CONFIG.saveVersion,2);
assert.equal(UPGRADE_MAX_LEVEL,10);

const contract=JSON.parse(fs.readFileSync(new URL('../qa/economy-seven-hour/calibration-physics-contract.json',import.meta.url)));
assert.deepEqual(VEHICLE_CONFIG.map(({price,...v})=>v),contract.vehicles,'No base stats, handling, fuel range or consumption change');
for(const row of contract.performances)assert.deepEqual(contract.levels.map(l=>getVehiclePerformance(row.id,l)),row.values,'No upgrade benefit change');

const vehicles=VEHICLE_CONFIG.map((v,i)=>({...v,park:{x:24,z:30+i*4.4,heading:Math.PI/2}}));
const make=career=>createGameplay({vehicles,desks:CLASSROOM_DESKS,career});
let total=0,offers=0;
for(const [i,v] of VEHICLE_CONFIG.entries()){
  const game=make({...freshCareer(),ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),brains:1e6});
  assert.equal(game.enter(v.id),true);
  const fuel=game.state.fuels[v.id];
  for(const stat of UPGRADE_STATS){let previous=0;
    for(let l=0;l<10;l++){
      const beforeLevels={...game.state.upgrades[v.id]},offer=getUpgradeOffer(v.id,stat.id,beforeLevels);
      const expected=5*Math.round(40*1.35**l*1.2**i/5);
      assert.equal(offer.price,expected);assert.ok(offer.price>previous);previous=offer.price;
      assert.deepEqual(offer.currentPerformance,getVehiclePerformance(v.id,beforeLevels));
      assert.deepEqual(offer.nextPerformance,getVehiclePerformance(v.id,{...beforeLevels,[stat.id]:l+1}));
      const val=p=>stat.id==='speed'?p.maxSpeed:stat.id==='fuel'?p.capacity:p[stat.id]*100;
      near(offer.current,val(offer.currentPerformance));near(offer.next,val(offer.nextPerformance));
      assert.ok(offer.next>offer.current);
      game.state.brains=expected-.01;assert.equal(game.buyUpgrade(stat.id),false);
      assert.deepEqual(game.state.upgrades[v.id],beforeLevels);
      game.state.brains=expected;assert.equal(game.buyUpgrade(stat.id),true);
      assert.equal(game.state.brains,0);assert.equal(game.state.upgrades[v.id][stat.id],l+1);
      assert.deepEqual(getVehiclePerformance(v.id,game.state.upgrades[v.id]),offer.nextPerformance);
      assert.equal(game.state.fuels[v.id],fuel,'Purchasing tank never creates fuel');
      assert.equal(game.state.money,0);total+=offer.price;offers++;
    }
    const max=getUpgradeOffer(v.id,stat.id,game.state.upgrades[v.id]);
    assert.equal(max.price,null);assert.equal(max.current,max.next);assert.equal(max.maxed,true);
    assert.equal(game.buyUpgrade(stat.id),false);
  }
}
assert.equal(offers,400);assert.equal(total,226780);
assert.equal(VEHICLE_CONFIG.reduce((s,v)=>s+v.price,0),285000);
assert.equal(SCHOOL_CONFIG.reduce((s,v)=>s+v.price,0),47000);

// Exact funds, denied insufficient funds and double-clicks. Any paid car and
// school remains directly purchasable without earlier purchases or new locks.
for(const v of vehicles.slice(1)){
  const g=make({...freshCareer(),money:v.price-1});g.state.player={...v.park};
  assert.equal(g.buy(v.id),false);assert.deepEqual(g.state.ownedVehicleIds,['pickup']);
  g.state.money=v.price;assert.equal(g.buy(v.id),true);assert.equal(g.state.money,0);
  assert.deepEqual(g.state.ownedVehicleIds,['pickup',v.id]);assert.equal(g.buy(v.id),false);
}
for(const school of SCHOOL_CONFIG){
  const g=make({...freshCareer(),money:Math.max(0,school.price-1)});
  const entry=CLASSROOM_ENTRIES.find(e=>e.id===school.id);g.state.player={x:entry.x,z:entry.z,heading:0};
  if(school.price){
    assert.equal(g.buySchool(school.id),false);g.state.money=school.price;
    assert.equal(g.buySchool(school.id),true);assert.equal(g.state.money,0);
    assert.deepEqual(g.state.ownedSchoolIds,['school-1',school.id]);
  }
  assert.equal(g.buySchool(school.id),false);
  assert.equal(g.sitAtSchool(school.id),true);
  for(let i=0;i<100;i++)g.tickProgress(.1,{active:true});near(g.state.brains,school.rate*10);
  const before=g.state.brains;g.tickProgress(.1,{active:false});g.tickProgress(10,{active:true});assert.equal(g.state.brains,before);
}
for(const fps of [30,60,120,144])for(const direction of [-1,1]){
  const g=make();assert.equal(g.enter('pickup'),true);
  for(let i=0;i<10*fps;i++)g.tickProgress(1/fps,{active:true,distance:direction*3/fps});
  near(g.state.brains,30);
  const before=g.state.brains;
  for(const args of [[.1,{active:true,distance:0}],[.1,{active:false,distance:1}],[100,{active:true,distance:100}]])g.tickProgress(...args);
  assert.equal(g.state.brains,before);
}
const old={...freshCareer(),money:123456,brains:987.654321,ownedVehicleIds:['pickup','ashhauler'],ownedSchoolIds:['school-1','school-5'],completedRuns:19};
old.upgrades.ashhauler={speed:3,handling:2,grip:1,fuel:10};
let raw=JSON.stringify(old);const keys=[];
const store=createCareerStore({storage:{getItem:key=>{keys.push(key);return raw;},setItem:(key,value)=>{keys.push(key);raw=value;}}});
const loaded=store.load();for(const key of ['money','brains','ownedVehicleIds','ownedSchoolIds','completedRuns','upgrades'])assert.deepEqual(loaded[key],old[key]);
assert.equal(store.save(loaded),true);assert.deepEqual(store.load(),loaded);assert.ok(keys.every(k=>k===ECONOMY_CONFIG.saveKey));
console.log(`PASS approved economy: ${offers} exact upgrade offers/transactions, all car/school prices and direct purchases, rates at four FPS, unchanged physical contract, legacy wallet/ownership/save key.`);
