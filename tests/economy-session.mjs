#!/usr/bin/env node


import assert from 'node:assert/strict';
import { createGameplay, GAMEPLAY, resolveFreeClassroomSeat } from '../dist/gameplay.js';
import { ECONOMY_CONFIG, VEHICLE_CONFIG, DELIVERY_CHECKPOINTS, vehicleConfig } from '../dist/economy-config.js';
import { createCareerStore, freshCareer, sanitizeCareer } from '../dist/career-save.js';
import { createDrivingModel } from '../dist/driving-model.js';
import { CLASSROOM_DESKS, CLASSROOM_ENTRY, CLASSROOM_ENTRIES, CHARACTER_STANDS } from '../dist/garage-scene.js';
import { CHARACTER_CATALOG } from '../dist/character-catalog.js';
import { SCHOOL_CONFIG } from '../dist/progression-config.js';

let passed=0;
const check=(name,fn)=>{fn();passed++;console.log(`PASS ${name}`);};
const near=(a,b,tolerance=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const vehicles=()=>VEHICLE_CONFIG.map((spec,index)=>({id:spec.id,park:{x:24,z:44+index*11,heading:Math.PI/2}}));
const deliveries=DELIVERY_CHECKPOINTS.map((spec,index)=>({...spec,x:8,z:-spec.distance,radius:4.4}));
const stations=[{id:'fuel-a',x:-8,z:-80,radius:4},{id:'fuel-b',x:-8,z:-320,radius:4}];

const allOwned=(money=0)=>({...freshCareer(),money,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),ownedSkinIds:CHARACTER_CATALOG.map(s=>s.id),ownedSchoolIds:SCHOOL_CONFIG.map(s=>s.id)});
const make=(options={})=>createGameplay({vehicles:vehicles(),stations,deliveries,...options});
const ready=g=>{g.state.cooldown=0;g.state.interactionCooldown=0;};
const approach=(g,id)=>{const vehicle=vehicles().find(v=>v.id===id);g.state.player={x:vehicle.park.x-5,z:vehicle.park.z,heading:0};ready(g);g.state.walked=1;g.walk(1/60,{});};
const memoryStorage=(initial=null)=>{
  let value=initial,writes=0;
  return {getItem(){return value;},setItem(key,next){value=next;writes++;},get value(){return value;},get writes(){return writes;}};
};
const eventTypes=g=>g.events().map(e=>e.type);

check('new career starts on foot with only free pickup, zero money and real full capacities',()=>{
  const g=make();assert.equal(g.state.mode,'walking');assert.equal(g.state.selectedId,null);
  assert.equal(g.state.money,0);assert.deepEqual(g.state.ownedVehicleIds,['pickup']);assert.equal(g.state.run,null);
  assert.deepEqual(g.state.player,GAMEPLAY.spawn);assert.equal(g.state.characterId,'bacon');
  for(const spec of VEHICLE_CONFIG)near(g.state.fuels[spec.id],spec.capacity);
  assert.deepEqual(VEHICLE_CONFIG.slice(0,3).map(v=>[v.id,v.price,v.capacity,v.range,v.maxSpeed]),[['pickup',0,100,520,11],['citycourier',900,125,700,12.5],['rover',1200,140,1000,14.2]]);
  assert.deepEqual(g.state.ownedSkinIds,['bacon']);assert.deepEqual(g.state.ownedSchoolIds,['school-1']);
  assert.deepEqual(DELIVERY_CHECKPOINTS.map(d=>d.progress),[180,440,780,1220,1800,2580,3480,4730,6170,7870,9870]);
  assert.ok(DELIVERY_CHECKPOINTS.every(d=>d.reward===Math.round(d.distance*.6/10)*10));
});

check('locked vehicles never board or drain; walking approach prompts once without spending',()=>{
  for(const id of ['rover','van']){
    const g=make();assert.equal(g.enter(id),false);assert.equal(g.state.mode,'walking');assert.equal(g.state.run,null);
    const fuel=g.state.fuels[id];g.drive(100,0,-100);near(g.state.fuels[id],fuel);
    approach(g,id);assert.equal(g.state.purchaseCandidateId,id);assert.equal(g.state.mode,'walking');assert.equal(g.state.money,0);
    const prompts=g.events().filter(e=>e.type==='purchase-prompt');assert.equal(prompts.length,1);assert.equal(prompts[0].affordable,false);
    for(let frame=0;frame<100;frame++)g.walk(1/60,{});
    assert.equal(g.events().filter(e=>e.type==='purchase-prompt').length,0);assert.equal(g.state.money,0);
  }
});

check('purchase checks exact funds, proximity, ownership and explicit action for each paid vehicle',()=>{
  const budget=vehicleConfig('rover').price+vehicleConfig('van').price;
  const g=make({career:{...freshCareer(),money:budget}});
  assert.equal(g.buy('van'),false);assert.equal(g.state.money,budget);assert.equal(g.buy('missing'),false);
  for(const id of ['rover','van']){
    approach(g,id);const before=g.state.money,spec=vehicleConfig(id);
    assert.equal(g.buy(id),true);assert.equal(g.state.money,before-spec.price);assert.ok(g.isOwned(id));
    assert.equal(g.state.mode,'walking');assert.equal(g.state.run,null);assert.equal(g.state.purchaseCandidateId,null);
    assert.equal(g.buy(id),false);assert.equal(g.state.money,before-spec.price);
    g.state.walked=10;for(let frame=0;frame<100;frame++)g.walk(1/60,{});
    assert.equal(g.state.mode,'walking','purchase cannot instantly auto-board');
    assert.equal(g.enter(id),true,'a separate explicit boarding remains available');assert.equal(g.state.run.vehicleId,id);
    g.returnToGarage();ready(g);
  }
  assert.equal(g.state.money,0);assert.deepEqual(g.state.ownedVehicleIds,['pickup','rover','van']);
  assert.equal(g.buy('pickup'),false);assert.equal(g.state.money,0);
});

check('insufficient money, seated, jumping and driving cannot purchase',()=>{
  for(const id of ['rover','van']){
    const g=make({career:{...freshCareer(),money:vehicleConfig(id).price-1}});approach(g,id);
    assert.equal(g.buy(id),false);assert.equal(g.events().at(-1).reason,'funds');assert.ok(!g.isOwned(id));
    g.state.money=10000;g.state.seatedId='desk-01';assert.equal(g.buy(id),false);assert.equal(g.state.purchaseCandidateId,null);
    g.state.seatedId=null;g.state.jump.airborne=true;g.state.jump.height=1;assert.equal(g.buy(id),false);
    g.state.jump.airborne=false;g.state.jump.height=0;assert.equal(g.enter('pickup'),true);assert.equal(g.buy(id),false);
    assert.equal(g.state.money,10000);assert.ok(!g.isOwned(id));
  }
});

check('purchase candidate clears on departure, jump, sit, driving and garage teleport',()=>{
  const g=make();approach(g,'rover');assert.equal(g.state.purchaseCandidateId,'rover');
  g.state.player={...GAMEPLAY.spawn};g.walk(0,{});assert.equal(g.state.purchaseCandidateId,null);
  approach(g,'rover');assert.ok(g.jump());assert.equal(g.state.purchaseCandidateId,null);
  g.returnToGarage();approach(g,'rover');g.state.seatedId='desk-01';g.walk(0,{});assert.equal(g.state.purchaseCandidateId,null);
  g.returnToGarage();approach(g,'rover');assert.ok(g.enter('pickup'));assert.equal(g.state.purchaseCandidateId,null);
  g.returnToGarage();approach(g,'rover');g.returnToGarage('abort');assert.equal(g.state.purchaseCandidateId,null);
});

check('owned cars still auto-board after approach and create unique stable loaded runs',()=>{
  const g=make({career:allOwned()}),runIds=new Set();
  for(let cycle=0;cycle<3;cycle++)for(const spec of VEHICLE_CONFIG){
    g.returnToGarage();approach(g,spec.id);assert.equal(g.state.mode,'driving');assert.equal(g.state.selectedId,spec.id);
    const run=g.state.run;assert.equal(run.loaded,true);assert.equal(run.vehicleId,spec.id);assert.ok(!runIds.has(run.id));runIds.add(run.id);
    assert.equal(g.enter(spec.id),false);assert.equal(g.state.run,run);g.drive(0,0,-40);assert.equal(g.state.run.id,run.id);
  }
  assert.equal(runIds.size,VEHICLE_CONFIG.length*3);
});

check('forward and reverse both consume per-car fuel; idle, invalid distance and zero travel do not',()=>{
  for(const spec of VEHICLE_CONFIG){
    const g=make({career:allOwned()});assert.ok(g.enter(spec.id));
    g.drive(10,0,-40);near(g.state.fuels[spec.id],spec.capacity-10*spec.consumption);
    g.drive(-15,0,-40);near(g.state.fuels[spec.id],spec.capacity-25*spec.consumption);
    const before=g.state.fuels[spec.id];for(const distance of [0,0,NaN,Infinity,-Infinity,'100',undefined])g.drive(distance,0,-40);
    near(g.state.fuels[spec.id],before);assert.equal(g.state.run.loaded,true);
  }
});

check('real driving model actual D/R displacement drains fuel and parked collision does not',()=>{
  for(const spec of VEHICLE_CONFIG){
    const g=make({career:allOwned(),stations:[],deliveries:[]});g.enter(spec.id);
    const model=createDrivingModel({maxSpeed:spec.maxSpeed,x:0,z:0});
    let total=0;
    for(const gear of ['D','R']){
      model.pause();model.setGear(gear);model.setInput({active:true});let phaseDistance=0;
      for(let frame=0;frame<120;frame++){
        const before={x:model.state.x,z:model.state.z};model.step(1/60);
        const actual=Math.hypot(model.state.x-before.x,model.state.z-before.z);phaseDistance+=actual;total+=actual;
        g.drive(actual*(gear==='D'?1:-1),model.state.x,model.state.z);
      }
      assert.ok(phaseDistance>5);
    }
    near(g.state.fuels[spec.id],spec.capacity-total*spec.consumption);
    model.pause();const fuel=g.state.fuels[spec.id];for(let frame=0;frame<100;frame++){model.step(1/60);g.drive(model.state.travel,model.state.x,model.state.z);}near(g.state.fuels[spec.id],fuel);
  }
  const g=make({stations:[],deliveries:[]});g.enter('pickup');
  const blocked=createDrivingModel({contact:()=>({normalX:0,normalZ:1,depth:10})});blocked.setInput({active:true});
  const beforeFuel=g.state.fuels.pickup;
  for(let frame=0;frame<120;frame++){
    const before={x:blocked.state.x,z:blocked.state.z};blocked.step(1/60);
    const actual=Math.hypot(blocked.state.x-before.x,blocked.state.z-before.z);near(actual,0);g.drive(actual,blocked.state.x,blocked.state.z);
  }
  near(g.state.fuels.pickup,beforeFuel);assert.equal(g.state.mode,'driving');
});

check('all eleven delivery rewards pay exactly once per loaded run then reset on foot',()=>{
  const g=make({career:allOwned()});let expected=0;
  for(const delivery of deliveries){
    ready(g);assert.ok(g.enter('pickup'));const run=g.state.run;g.events();
    g.drive(0,delivery.x,delivery.z);expected+=delivery.reward;
    assert.equal(run.loaded,false);assert.equal(g.state.money,expected);assert.equal(g.state.run,null);assert.equal(g.state.mode,'walking');
    assert.deepEqual(g.state.player,GAMEPLAY.spawn);assert.equal(g.state.selectedId,null);assert.equal(g.state.seatedId,null);
    assert.deepEqual(eventTypes(g),['delivery','garage']);
    for(const spec of VEHICLE_CONFIG)near(g.state.fuels[spec.id],spec.capacity);
    for(let frame=0;frame<100;frame++)g.drive(0,delivery.x,delivery.z);
    assert.equal(g.state.money,expected);assert.deepEqual(g.events(),[]);
  }
  assert.equal(g.state.completedRuns,DELIVERY_CHECKPOINTS.length);
});

check('overlapping deliveries and same-circle repeated frames never double-credit',()=>{
  const delivery=deliveries[0],g=make({deliveries:[delivery,{...delivery,id:'overlap',reward:99999}]});g.enter('pickup');g.events();
  g.drive(0,delivery.x,delivery.z);g.drive(0,delivery.x,delivery.z);
  assert.equal(g.state.money,delivery.reward);assert.equal(g.state.completedRuns,1);
  const events=g.events();assert.equal(events.filter(e=>e.type==='delivery').length,1);assert.equal(events[0].id,delivery.id);
  ready(g);g.enter('pickup');g.drive(0,delivery.x,delivery.z);assert.equal(g.state.money,delivery.reward*2,'new loaded runs can legitimately deliver again');
});

check('no payout on foot, missing cargo, top garage abort, or rebuilt session',()=>{
  const delivery=deliveries[0],g=make();g.drive(0,delivery.x,delivery.z);assert.equal(g.state.money,0);
  g.enter('pickup');g.state.run.loaded=false;g.drive(0,delivery.x,delivery.z);assert.equal(g.state.money,0);
  g.returnToGarage('garage');ready(g);g.enter('pickup');const snapshot=g.snapshot();
  g.returnToGarage('abort');g.drive(0,delivery.x,delivery.z);assert.equal(g.state.money,0);assert.equal(g.state.run,null);
  const rebuilt=make({career:snapshot});assert.equal(rebuilt.state.run,null);assert.equal(rebuilt.state.mode,'walking');rebuilt.drive(0,delivery.x,delivery.z);assert.equal(rebuilt.state.money,0);
});

check('empty fuel beats coincident delivery and refuel atomically for every car',()=>{
  const delivery=deliveries[0];
  for(const spec of VEHICLE_CONFIG){
    const g=make({career:allOwned(42),stations:[{...delivery,id:'coincident-fuel'}]});g.enter(spec.id);g.events();g.state.fuels[spec.id]=spec.consumption;
    g.drive(1,delivery.x,delivery.z);assert.equal(g.state.money,42);assert.equal(g.state.completedRuns,0);assert.equal(g.state.run,null);
    assert.deepEqual(g.events(),[{type:'garage',reason:'empty'}]);assert.equal(g.state.mode,'walking');
    for(const other of VEHICLE_CONFIG)near(g.state.fuels[other.id],other.capacity);
  }
});

check('refuel fills true capacity, preserves loaded cargo and guards events until departure',()=>{
  for(const spec of VEHICLE_CONFIG){
    const g=make({career:allOwned()}),station=stations[0];g.enter(spec.id);const run=g.state.run;g.events();g.state.fuels[spec.id]=1;
    g.drive(0,station.x,station.z);near(g.state.fuels[spec.id],spec.capacity);assert.deepEqual(eventTypes(g),['refuel']);
    assert.equal(g.state.run,run);assert.equal(run.loaded,true);assert.equal(g.state.money,0);
    for(let frame=0;frame<100;frame++)g.drive(.01,station.x,station.z);
    near(g.state.fuels[spec.id],spec.capacity);assert.deepEqual(g.events(),[]);
    g.drive(0,station.x+station.radius+2,station.z);g.state.fuels[spec.id]=spec.capacity/2;
    g.drive(0,station.x,station.z);assert.deepEqual(eventTypes(g),['refuel']);near(g.state.fuels[spec.id],spec.capacity);
  }
});

check('garage reset clears session interaction state and preserves every chosen character and career',()=>{
  for(const character of CHARACTER_CATALOG){
    const g=make({career:allOwned(321)});assert.ok(g.setCharacter(character.id));g.enter('van');
    g.state.walked=8;g.state.stationId='fuel-a';g.state.purchaseCandidateId='rover';g.state.blockedStand=3;g.state.doorNotified=true;
    g.returnToGarage();assert.equal(g.state.characterId,character.id);assert.equal(g.state.money,321);assert.deepEqual(g.state.ownedVehicleIds,allOwned().ownedVehicleIds);
    assert.equal(g.state.walked,0);assert.equal(g.state.stationId,null);assert.equal(g.state.blockedStand,null);assert.equal(g.state.purchaseCandidateId,null);assert.equal(g.state.run,null);
    assert.deepEqual(g.state.jump,{height:0,velocity:0,elapsed:0,airborne:false});assert.equal(g.state.doorNotified,false);assert.ok(g.state.cooldown>0);
  }
  const g=make();assert.equal(g.setCharacter('__proto__'),false);assert.equal(g.state.characterId,'bacon');
});

check('valid local save restores career only, never pending cargo, fuel, position or payout',()=>{
  const storage=memoryStorage(),store=createCareerStore({storage});const g=make({career:{...freshCareer(),money:6000,ownedSkinIds:['bacon','jandel']},persistence:store});
  approach(g,'rover');assert.ok(g.buy('rover'));assert.ok(g.setCharacter('jandel'));g.enter('rover');g.drive(10,0,-40);
  store.save(g.snapshot());const raw=JSON.parse(storage.value);assert.deepEqual(Object.keys(raw).sort(),['brains','characterId','completedRuns','money','ownedSchoolIds','ownedSkinIds','ownedVehicleIds','upgrades','vehicleGrantClaimed','version']);assert.equal(raw.version,2);
  const loaded=make({persistence:createCareerStore({storage})});assert.equal(loaded.state.money,4800);assert.ok(loaded.isOwned('rover'));assert.equal(loaded.state.characterId,'jandel');
  assert.equal(loaded.state.run,null);assert.equal(loaded.state.mode,'walking');assert.deepEqual(loaded.state.player,GAMEPLAY.spawn);
  for(const spec of VEHICLE_CONFIG)near(loaded.state.fuels[spec.id],spec.capacity);
  loaded.drive(0,deliveries[0].x,deliveries[0].z);assert.equal(loaded.state.money,4800);
  ready(g);g.drive(0,deliveries[0].x,deliveries[0].z);const after=make({persistence:createCareerStore({storage})});
  assert.equal(after.state.money,4800+deliveries[0].reward);assert.equal(after.state.completedRuns,1);assert.equal(after.state.run,null);
});

check('save whitelist drops unknown IDs, duplicates, extra runtime fields and malformed numeric types',()=>{
  const safe=sanitizeCareer({version:1,money:12.99,ownedVehicleIds:['van','missing','rover','rover','__proto__'],characterId:'pack2',completedRuns:3.9,run:{loaded:true},fuels:{pickup:1},position:{x:999}});
  assert.deepEqual(safe,{...freshCareer('pack2'),money:12,ownedVehicleIds:['pickup','rover','van'],completedRuns:3});
  for(const value of ['99999',true,null,{},[],NaN,Infinity,-Infinity])assert.equal(sanitizeCareer({...freshCareer(),money:value}).money,0);
  assert.equal(sanitizeCareer({...freshCareer(),money:-20}).money,0);assert.equal(sanitizeCareer({...freshCareer(),money:Number.MAX_VALUE}).money,ECONOMY_CONFIG.maxSavedMoney);
  assert.deepEqual(sanitizeCareer({version:1,money:10,ownedVehicleIds:'van',characterId:'missing',completedRuns:'99'}),{...freshCareer(),money:10});
  assert.deepEqual(sanitizeCareer({...freshCareer(),ownedVehicleIds:[{id:'van'},true,null]}).ownedVehicleIds,['pickup']);
});

check('corrupt, wrong-version and hostile prototype records safely start fresh without pollution',()=>{
  for(const raw of ['{broken','null','[]','123','"hello"','{"version":3,"money":999}', '{"version":1,"money":999,"__proto__":{"polluted":true}}', '{"version":1,"constructor":{"prototype":{"polluted":true}},"money":999}']){
    const store=createCareerStore({storage:memoryStorage(raw)});assert.deepEqual(store.load(),freshCareer());assert.equal(store.status.failed,true);assert.equal({}.polluted,undefined);
  }
  assert.deepEqual(sanitizeCareer(Object.assign(Object.create({money:99999}),{version:1})),freshCareer());
  assert.deepEqual(sanitizeCareer({version:'1',money:999}),freshCareer());
  let getterInvoked=false;const accessor={money:999};Object.defineProperty(accessor,'version',{get(){getterInvoked=true;return 1;}});
  assert.deepEqual(sanitizeCareer(accessor),freshCareer());assert.equal(getterInvoked,false);
  const array=['van'];Object.defineProperty(array,'0',{get(){getterInvoked=true;return 'van';}});
  assert.deepEqual(sanitizeCareer({...freshCareer(),ownedVehicleIds:array}).ownedVehicleIds,['pickup']);assert.equal(getterInvoked,false);
  assert.deepEqual(sanitizeCareer({...freshCareer(),ownedVehicleIds:new Array(1000000)}).ownedVehicleIds,['pickup']);
});

check('blocked reads/writes and throwing localStorage getter never crash and warn once',()=>{
  const broken={getItem(){throw new Error('blocked');},setItem(){throw new Error('quota');}},store=createCareerStore({storage:broken});
  assert.deepEqual(store.load(),freshCareer());
  const g=make({career:allOwned(),persistence:store});assert.equal(g.state.saveFailed,true);assert.deepEqual(eventTypes(g),['save-warning']);
  g.setCharacter('pack1');g.setCharacter('pack2');assert.equal(g.state.characterId,'pack2');assert.equal(g.state.saveFailed,true);assert.deepEqual(g.events(),[]);
  g.enter('pickup');g.events();g.drive(0,deliveries[0].x,deliveries[0].z);assert.equal(g.state.money,deliveries[0].reward);assert.deepEqual(eventTypes(g),['delivery','garage']);
  const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  try{Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('SecurityError');}});const blocked=createCareerStore();assert.deepEqual(blocked.load(),freshCareer());assert.equal(blocked.save(freshCareer()),false);}
  finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage;}
  const throwing=make({persistence:{load(){throw new Error('read');},save(){throw new Error('write');}}});assert.equal(throwing.state.saveFailed,true);throwing.enter('pickup');throwing.drive(0,deliveries[0].x,deliveries[0].z);assert.equal(throwing.state.saveFailed,true);
});

check('failed writes retain atomic purchase and delivery in this session and recover gracefully',()=>{
  const storage=memoryStorage();let blocked=true;const store=createCareerStore({storage:{getItem:()=>storage.getItem(),setItem(key,value){if(blocked)throw Error('quota');storage.setItem(key,value);}}});
  const g=make({career:{...freshCareer(),money:vehicleConfig('rover').price,ownedSkinIds:['bacon','pirate']},persistence:store});approach(g,'rover');g.events();assert.ok(g.buy('rover'));
  assert.equal(g.state.money,0);assert.ok(g.isOwned('rover'));assert.equal(g.state.saveFailed,true);assert.equal(g.buy('rover'),false);assert.equal(g.state.money,0);
  assert.equal(g.events().filter(e=>e.type==='save-warning').length,1);assert.ok(g.enter('rover'));g.drive(0,deliveries[0].x,deliveries[0].z);
  assert.equal(g.state.money,deliveries[0].reward);blocked=false;g.setCharacter('pirate');assert.equal(g.state.saveFailed,false);
  const loaded=make({persistence:createCareerStore({storage})});assert.equal(loaded.state.money,deliveries[0].reward);assert.ok(loaded.isOwned('rover'));assert.equal(loaded.state.characterId,'pirate');
});

check('free-seat occupancy, seated guard, standing and classroom rearm stay intact',()=>{
  const g=make({desks:CLASSROOM_DESKS,career:allOwned()}),entry=CLASSROOM_ENTRIES[4];assert.equal(resolveFreeClassroomSeat(CLASSROOM_DESKS,['desk-01']).id,'desk-02');
  g.setOccupiedSeatIds(CLASSROOM_DESKS.filter(d=>d.id!=='desk-07').map(d=>d.id));
  g.state.player={x:entry.x,z:entry.z+entry.radius-.05,heading:0};g.state.walked=1;g.walk(1/60,{x:0,z:-1});
  assert.equal(g.state.seatedId,'desk-07');assert.equal(g.state.seatedSchoolId,'school-5');assert.equal(g.enter('pickup'),false);assert.equal(g.jump(),false);
  assert.equal(g.stand(),true);assert.equal(g.state.seatedId,null);assert.deepEqual(g.state.player,entry.exit);assert.equal(g.state.classroomArmed,false);
  const full=make({desks:CLASSROOM_DESKS,occupiedSeatIds:CLASSROOM_DESKS.map(d=>d.id)});full.state.player={x:CLASSROOM_ENTRY.x,z:CLASSROOM_ENTRY.z+CLASSROOM_ENTRY.radius-.05,heading:0};full.state.walked=1;full.walk(1/60,{x:0,z:-1});assert.equal(full.state.seatedId,null);assert.deepEqual(eventTypes(full),['classroom-full']);
});

check('ballistic jump and grounded character-stand interactions stay intact',()=>{
  for(const fps of [30,60,120]){
    const g=make();assert.ok(g.jump());assert.equal(g.enter('pickup'),false);let peak=0;
    for(let frame=0;frame<fps*2;frame++){g.walk(1/fps,{});peak=Math.max(peak,g.state.jump.height);}
    near(peak,GAMEPLAY.jumpSpeed**2/(2*GAMEPLAY.gravity),.005);assert.equal(g.state.jump.airborne,false);assert.equal(g.events().filter(e=>e.type==='land').length,1);
  }
  const stand=CHARACTER_STANDS[0],g=make({stands:CHARACTER_STANDS});g.state.player={x:stand.trigger.x,z:stand.trigger.z-1,heading:0};g.state.walked=1;g.walk(1/60,{x:0,z:1});
  assert.deepEqual(eventTypes(g),['character']);assert.equal(g.state.blockedStand,stand.index);
  for(let frame=0;frame<100;frame++)g.walk(1/60,{});assert.deepEqual(g.events(),[]);
});

console.log(`Economy/session: ${passed} checks passed. Pure Node; no browser or real payments.`);
