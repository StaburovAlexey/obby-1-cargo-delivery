#!/usr/bin/env node
// Production gameplay + actual four-wheel movement, without a browser/GPU.
import assert from 'node:assert/strict';
import { VEHICLE_CONFIG, BIOME_SEQUENCE, ECONOMY_CONFIG } from '../dist/economy-config.js';
import { UPGRADE_STATS, getUpgradeOffer, getUpgradeModifiers, getVehiclePerformance, sanitizeUpgradeLevels } from '../dist/vehicle-upgrades.js';
import { freshCareer, sanitizeCareer, createCareerStore } from '../dist/career-save.js';
import { createGameplay, GAMEPLAY } from '../dist/gameplay.js';
import { createDrivingModel } from '../dist/driving-model.js';
import { surfaceForBiome } from '../dist/biome-surfaces.js';

let groups=0;
const check=(name,fn)=>{const result=fn();groups++;console.log(`PASS ${name}${result?`: ${JSON.stringify(result)}`:''}`);};
const near=(actual,expected,tolerance=1e-8)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const vehicles=VEHICLE_CONFIG.map((v,index)=>({id:v.id,park:{x:24,z:30+index*4.4,heading:Math.PI/2}}));
const allIds=VEHICLE_CONFIG.map(v=>v.id);
const fleetCareer=(fuel=0)=>({...freshCareer(),money:123456,brains:100000,ownedVehicleIds:allIds,
  upgrades:Object.fromEntries(VEHICLE_CONFIG.map(v=>[v.id,{speed:0,handling:0,grip:0,fuel}]))});
const make=(fuel=0,extra={})=>createGameplay({vehicles,career:fleetCareer(fuel),...extra});
const enter=(game,id)=>{game.state.cooldown=0;assert.ok(game.enter(id));game.events();};
const storage=(career)=>({raw:JSON.stringify(career),writes:0,getItem(key){assert.equal(key,ECONOMY_CONFIG.saveKey);return this.raw;},setItem(key,value){assert.equal(key,ECONOMY_CONFIG.saveKey);this.raw=value;this.writes++;}});
const model=(vehicle,biome,fuel=0)=>createDrivingModel({x:0,z:0,vehicleId:vehicle.id,maxSpeed:vehicle.maxSpeed,
  groundSurface:()=>surfaceForBiome(biome,vehicle.id),getUpgrades:()=>({fuel})});

check('Tank is a fourth capped +2% stat; all forty capacities and ranges preserve base consumption',()=>{
  assert.deepEqual(UPGRADE_STATS.map(s=>s.id),['speed','handling','grip','fuel']);
  const tank=UPGRADE_STATS.find(s=>s.id==='fuel');assert.equal(tank.name,'Бак');assert.equal(tank.maxLevel,3);assert.equal(tank.step,.02);assert.equal(tank.unit,'ед.');
  let offers=0;
  for(const v of VEHICLE_CONFIG)for(let level=0;level<=3;level++){
    const performance=getVehiclePerformance(v.id,{fuel:level}),offer=getUpgradeOffer(v.id,'fuel',{fuel:level});
    near(getUpgradeModifiers({fuel:level}).fuel,1+.02*level);
    near(performance.capacity,v.capacity*(1+.02*level));near(performance.range,v.range*(1+.02*level));
    assert.equal(performance.consumption,v.capacity/v.range);near(performance.capacity/performance.consumption,performance.range);
    assert.equal(offer.current,performance.capacity);assert.equal(offer.next,offer.nextPerformance.capacity);
    assert.equal(offer.level,level);assert.equal(offer.nextLevel,Math.min(level+1,3));assert.equal(offer.maxed,level===3);
    assert.equal(offer.price,level===3?null:[20,35,50][level]+(v.progressionOrder-1)*[5,10,15][level]);
    for(const key of ['maxSpeed','acceleration','handling','steeringResponseSeconds','grip'])assert.equal(performance[key],getVehiclePerformance(v.id,{})[key]);
    offers++;
  }
  for(let index=1;index<VEHICLE_CONFIG.length;index++){
    const previous=VEHICLE_CONFIG[index-1],next=VEHICLE_CONFIG[index];assert.ok(next.price>previous.price);
    assert.ok(getVehiclePerformance(next.id,{}).range>getVehiclePerformance(previous.id,{fuel:3}).range,`${next.id} stock must beat ${previous.id} max tank`);
  }
  return {offers,adjacentRangeComparisons:9};
});

check('Old three-stat saves migrate with tank level zero and preserve the other stats and currency',()=>{
  const old=fleetCareer();old.brains=198.234567;old.money=98765;
  for(const [index,v] of VEHICLE_CONFIG.entries())old.upgrades[v.id]={speed:index%4,handling:(index+1)%4,grip:(index+2)%4};
  const saved=JSON.parse(JSON.stringify(old)),migrated=sanitizeCareer(saved);
  assert.equal(migrated.brains,old.brains);assert.equal(migrated.money,old.money);assert.equal(migrated.version,2);
  for(const v of VEHICLE_CONFIG)assert.deepEqual(migrated.upgrades[v.id],{...old.upgrades[v.id],fuel:0});
  const mem=storage(saved),store=createCareerStore({storage:mem});assert.deepEqual(store.load(),migrated);assert.ok(store.save(migrated));assert.deepEqual(store.load(),migrated);
  for(const invalid of [undefined,null,'3',NaN,Infinity,-Infinity,{},[]])assert.equal(sanitizeCareer({...fleetCareer(),upgrades:{pickup:{speed:2,handling:1,grip:3,fuel:invalid}}}).upgrades.pickup.fuel,0);
  assert.equal(sanitizeUpgradeLevels({fuel:99}).fuel,3);assert.equal(sanitizeUpgradeLevels({fuel:-1}).fuel,0);assert.equal(sanitizeUpgradeLevels({fuel:2.9}).fuel,2);
  let invoked=0;const hostile={speed:2};Object.defineProperty(hostile,'fuel',{get(){invoked++;throw Error('getter must not run');}});
  assert.equal(sanitizeUpgradeLevels(hostile).fuel,0);assert.equal(sanitizeCareer({...fleetCareer(),upgrades:{pickup:hostile}}).upgrades.pickup.fuel,0);assert.equal(invoked,0);
  const unowned=sanitizeCareer({...freshCareer(),upgrades:{rover:{speed:3,handling:3,grip:3,fuel:3}}});assert.deepEqual(unowned.upgrades.rover,{speed:0,handling:0,grip:0,fuel:0});
});

check('Thirty purchases spend brains only, never grant fuel, retain live runs, reject repeats, and survive reload',()=>{
  const mem=storage(fleetCareer()),game=make(0,{career:undefined,persistence:createCareerStore({storage:mem})});
  assert.equal(game.buyUpgrade('fuel'),false);let spent=0;
  for(const v of VEHICLE_CONFIG){
    enter(game,v.id);game.drive(31,0,-1000);const fuel=game.state.fuels[v.id],run={...game.state.run},pose={...game.state.player};
    for(let level=0;level<3;level++){
      const price=getUpgradeOffer(v.id,'fuel',game.state.upgrades[v.id]).price,before=game.state.brains;
      game.state.brains=price-.001;assert.equal(game.buyUpgrade('fuel'),false);assert.equal(game.state.fuels[v.id],fuel);assert.equal(game.state.upgrades[v.id].fuel,level);
      game.state.brains=before;assert.ok(game.buyUpgrade('fuel'));spent+=price;
      assert.equal(game.state.brains,100000-spent);assert.equal(game.state.money,123456);assert.equal(game.state.fuels[v.id],fuel);
      assert.deepEqual(game.state.run,run);assert.deepEqual(game.state.player,pose);assert.equal(game.state.mode,'driving');
      assert.deepEqual(game.state.upgrades[v.id],{speed:0,handling:0,grip:0,fuel:level+1});
      const reloaded=make(0,{career:undefined,persistence:createCareerStore({storage:mem})});
      assert.deepEqual(reloaded.state.upgrades,game.state.upgrades);assert.equal(reloaded.state.brains,game.state.brains);
      assert.equal(reloaded.state.mode,'walking');assert.equal(reloaded.state.run,null);near(reloaded.state.fuels[v.id],getVehiclePerformance(v.id,reloaded.state.upgrades[v.id]).capacity);
    }
    const balance=game.state.brains;for(let repeat=0;repeat<8;repeat++)assert.equal(game.buyUpgrade('fuel'),false);
    assert.equal(game.state.brains,balance);assert.equal(game.state.fuels[v.id],fuel);game.returnToGarage();
  }
  const unowned=make(0,{career:freshCareer()});enter(unowned,'pickup');unowned.state.selectedId='rover';assert.equal(unowned.buyUpgrade('fuel'),false);
  assert.equal(Object.hasOwn(JSON.parse(mem.raw),'fuels'),false);return {purchases:30,totalBrains:spent};
});

check('Every car and tank level uses effective spawn, station refill and garage-reset capacity',()=>{
  const station={id:'fuel-stop',x:50,z:-50,radius:4};let combinations=0;
  for(const v of VEHICLE_CONFIG)for(let level=0;level<=3;level++){
    const game=make(level,{stations:[station]}),performance=getVehiclePerformance(v.id,{fuel:level});
    near(game.state.fuels[v.id],performance.capacity);enter(game,v.id);
    game.drive(10,0,0);game.drive(-15,0,0);near(game.state.fuels[v.id],performance.capacity-25*v.consumption);
    const before=game.state.fuels[v.id];for(const bad of [0,NaN,Infinity,-Infinity,'10',null,undefined])game.drive(bad,0,0);assert.equal(game.state.fuels[v.id],before);
    game.drive(0,station.x,station.z);near(game.state.fuels[v.id],performance.capacity);assert.equal(game.events().filter(e=>e.type==='refuel').length,1);
    for(let frame=0;frame<5;frame++)game.drive(.1,station.x,station.z);near(game.state.fuels[v.id],performance.capacity);assert.deepEqual(game.events(),[]);
    game.drive(0,0,0);game.drive(3,0,0);game.drive(0,station.x,station.z);assert.equal(game.events().filter(e=>e.type==='refuel').length,1);
    game.drive(100,0,0);game.returnToGarage();
    for(const car of VEHICLE_CONFIG)near(game.state.fuels[car.id],getVehiclePerformance(car.id,{fuel:level}).capacity);
    assert.deepEqual(game.state.player,GAMEPLAY.spawn);combinations++;
  }
  return {combinations};
});

check('Fuel zero wins before coincident refuelling and deliveries at all forty effective capacities',()=>{
  const circle={id:'overlap',x:0,z:0,radius:4,reward:100,distance:180};
  for(const v of VEHICLE_CONFIG)for(let level=0;level<=3;level++){
    const game=make(level,{stations:[circle],deliveries:[circle]}),performance=getVehiclePerformance(v.id,{fuel:level});enter(game,v.id);
    game.drive(performance.range,0,0);
    assert.equal(game.state.mode,'walking');assert.equal(game.state.selectedId,null);assert.equal(game.state.run,null);assert.equal(game.state.money,123456);assert.equal(game.state.completedRuns,0);
    assert.deepEqual(game.events().map(e=>[e.type,e.reason]),[['garage','empty']]);near(game.state.fuels[v.id],performance.capacity);
    enter(game,v.id);game.state.fuels[v.id]=0;game.drive(0,0,0);assert.equal(game.state.mode,'walking');assert.equal(game.state.money,123456);
  }
});

check('Two hundred biome previews preserve tank upgrades, consume normally, refill fully and never pay cargo',()=>{
  const station={id:'test-refill',x:50,z:-50,radius:4},delivery={id:'test-delivery',x:100,z:-100,radius:4,reward:100};let combinations=0;
  for(const v of VEHICLE_CONFIG)for(let level=0;level<=3;level++)for(const biome of BIOME_SEQUENCE){
    const game=make(level,{stations:[station],deliveries:[delivery]}),performance=getVehiclePerformance(v.id,{fuel:level});enter(game,v.id);game.drive(12,0,0);
    const before=game.state.fuels[v.id],brains=game.state.brains;assert.ok(game.beginBiomeTest(biome.id));assert.equal(game.state.fuels[v.id],before);assert.equal(game.state.run,null);
    assert.equal(game.state.testBiome,biome.id);assert.equal(game.state.upgrades[v.id].fuel,level);game.drive(-6,0,0);near(game.state.fuels[v.id],before-6*v.consumption);
    game.drive(0,delivery.x,delivery.z);assert.equal(game.state.money,123456);assert.equal(game.state.completedRuns,0);
    game.drive(0,station.x,station.z);near(game.state.fuels[v.id],performance.capacity);
    game.tickProgress(.1,{active:true,distance:.2});near(game.state.brains,brains+.1);game.returnToGarage();assert.equal(game.state.testMode,false);assert.equal(game.state.testBiome,null);combinations++;
  }
  return {combinations};
});

check('Four hundred actual D/R car-level-biome runs burn only displacement times base consumption',()=>{
  let combinations=0,totalMovement=0;
  for(const v of VEHICLE_CONFIG)for(let level=0;level<=3;level++)for(const biome of BIOME_SEQUENCE)for(const gear of ['D','R']){
    const game=make(level),moving=model(v,biome.id,level),stock=model(v,biome.id,0),performance=getVehiclePerformance(v.id,{fuel:level});enter(game,v.id);
    for(const m of [moving,stock]){m.setGear(gear);m.setInput({active:true,steering:.2});}
    let distance=0;
    for(let frame=0;frame<360;frame++){
      moving.step(1/120);stock.step(1/120);const travelled=moving.state.pathDistance;distance+=travelled;
      game.drive(gear==='R'?-travelled:travelled,moving.state.x,moving.state.z);
      near(game.state.fuels[v.id],performance.capacity-distance*v.consumption);
      assert.equal(game.state.mode,'driving');
    }
    assert.ok(distance>1);assert.deepEqual(moving.state,stock.state,'Tank-only upgrades must not alter forces, pose, speed, steering or grip');
    totalMovement+=distance;combinations++;
  }
  return {combinations,totalMovement};
});

check('Eighty real no-refill D/R journeys exhaust at the full advertised stock and upgraded range',()=>{
  let journeys=0,largestOvershoot=0;
  for(const v of VEHICLE_CONFIG)for(let level=0;level<=3;level++)for(const gear of ['D','R']){
    const game=make(level),moving=model(v,'city',level),performance=getVehiclePerformance(v.id,{fuel:level});enter(game,v.id);moving.setGear(gear);moving.setInput({active:true});
    let distance=0,previous=0,frames=0,lastStep=0;
    while(game.state.mode==='driving'&&frames<100000){
      moving.step(.05);previous=distance;lastStep=moving.state.pathDistance;distance+=lastStep;frames++;
      game.drive(gear==='R'?-lastStep:lastStep,moving.state.x,moving.state.z);
    }
    assert.ok(frames<100000,`${v.id}/${level}/${gear} must exhaust`);assert.ok(previous<=performance.range+1e-6);assert.ok(distance>=performance.range-1e-6);
    assert.ok(distance-performance.range<=lastStep+1e-6);assert.equal(game.state.mode,'walking');assert.equal(game.state.money,123456);
    assert.deepEqual(game.events().map(e=>[e.type,e.reason]),[['garage','empty']]);near(game.state.fuels[v.id],performance.capacity);
    largestOvershoot=Math.max(largestOvershoot,distance-performance.range);journeys++;
  }
  return {journeys,largestFrameOvershootM:largestOvershoot};
});

check('Failed persistence cannot double-spend the tank cap, refill fuel or erase existing upgrades',()=>{
  for(const failure of ['throw','false']){
    let attempts=0,recover=false,saved;
    const persistence={save(snapshot){attempts++;if(recover){saved=snapshot;return true;}if(failure==='throw')throw Error('storage blocked');return false;}};
    const career=fleetCareer();career.upgrades.pickup={speed:2,handling:1,grip:3,fuel:0};
    const game=make(0,{career,persistence});enter(game,'pickup');game.drive(10,0,0);const before=game.state.fuels.pickup;
    for(let level=1;level<=3;level++){assert.ok(game.buyUpgrade('fuel'));assert.equal(game.state.upgrades.pickup.fuel,level);assert.equal(game.state.fuels.pickup,before);}
    const brains=game.state.brains;for(let repeat=0;repeat<10;repeat++)assert.equal(game.buyUpgrade('fuel'),false);
    assert.equal(attempts,3);assert.equal(game.state.brains,brains);assert.equal(game.state.fuels.pickup,before);assert.equal(game.events().filter(e=>e.type==='save-warning').length,1);
    recover=true;game.tickProgress(.1,{active:true,distance:.2});assert.ok(game.flushProgress());assert.deepEqual(saved.upgrades.pickup,{speed:2,handling:1,grip:3,fuel:3});assert.equal(game.state.saveFailed,false);
  }
});

console.log(`Tank upgrades: ${groups} groups passed; 40 capacity variants, 200 biome previews, 400 real-motion accounting runs and 80 full-range D/R journeys. Renderer-free; no browser claim.`);
