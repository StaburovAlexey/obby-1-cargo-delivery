import assert from 'node:assert/strict';
import { createGameplay, GAMEPLAY, resolveFreeClassroomSeat } from '../dist/gameplay.js';
import { freshCareer, sanitizeCareer, createCareerStore } from '../dist/career-save.js';
import { ECONOMY_CONFIG, VEHICLE_CONFIG } from '../dist/economy-config.js';
import { CHARACTER_CATALOG } from '../dist/character-catalog.js';
import { CLASSROOM_ENTRIES, CLASSROOM_DESKS, CHARACTER_STANDS } from '../dist/garage-scene.js';
import { SCHOOL_CONFIG, SKIN_CONFIG, PROGRESSION_CONFIG } from '../dist/progression-config.js';
import { UPGRADE_STATS, getUpgradeOffer } from '../dist/vehicle-upgrades.js';

let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const near=(actual,expected,epsilon=1e-6)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);
const vehicles=VEHICLE_CONFIG.map((v,index)=>({...v,park:{x:24,z:30+index*4.4,heading:Math.PI/2}}));
const make=(options={})=>createGameplay({vehicles,desks:CLASSROOM_DESKS,stands:CHARACTER_STANDS,solids:CLASSROOM_DESKS.map(d=>d.bounds),...options});
const storage=(raw=null)=>({raw,writes:0,getItem(key){assert.equal(key,'urban-route-career-v1');return this.raw;},setItem(key,value){assert.equal(key,'urban-route-career-v1');this.raw=value;this.writes++;}});
const tick=(g,seconds,{fps=60,distance=.1,active=true}={})=>{for(let i=0;i<seconds*fps;i++)g.tickProgress(1/fps,{distance,active});};
const approachSchool=(g,index)=>{
  const entry=CLASSROOM_ENTRIES[index];g.state.player={x:entry.x,z:entry.z+.2,heading:0};
  g.state.walked=1;g.state.interactionCooldown=0;g.state.cooldown=0;g.state.classroomArmed=true;
  g.walk(1/60,{x:0,z:-1});return entry;
};
const approachSkin=(g,index)=>{
  const stand=CHARACTER_STANDS[index];g.state.player={x:stand.trigger.x,z:stand.trigger.z-.2,heading:0};
  g.state.walked=1;g.state.interactionCooldown=0;g.state.cooldown=0;g.state.blockedStand=null;
  g.walk(1/60,{x:0,z:1});return stand;
};
const moneyCareer=money=>({...freshCareer(),money});

check('five schools and sixteen paid skins have finite strictly increasing prices/rates',()=>{
  assert.equal(SCHOOL_CONFIG.length,5);assert.deepEqual(SCHOOL_CONFIG.map(s=>s.rate),[1.5,2,3,4.5,6]);
  assert.deepEqual(SCHOOL_CONFIG.map(s=>s.price),[0,500,1500,3500,7000]);
  assert.equal(SKIN_CONFIG.length,17);assert.equal(SKIN_CONFIG[0].id,'bacon');assert.equal(SKIN_CONFIG[0].price,0);
  for(let i=1;i<SKIN_CONFIG.length;i++)assert.ok(SKIN_CONFIG[i].price>SKIN_CONFIG[i-1].price);
  assert.deepEqual(CLASSROOM_ENTRIES.map(entry=>entry.id),SCHOOL_CONFIG.map(school=>school.id));
  assert.equal(CLASSROOM_DESKS.length,20);assert.ok(CLASSROOM_DESKS.every(desk=>!Object.hasOwn(desk,'schoolId')));
});
check('new careers receive only free items and no automatic grant',()=>{
  const g=make();assert.equal(ECONOMY_CONFIG.saveVersion,2);assert.equal(g.state.money,0);assert.equal(g.state.brains,0);
  assert.deepEqual(g.state.ownedSkinIds,['bacon']);assert.deepEqual(g.state.ownedSchoolIds,['school-1']);assert.deepEqual(g.state.ownedVehicleIds,['pickup']);
  assert.equal(g.state.vehicleGrantClaimed,false);assert.equal(g.setCharacter('pack1'),false);assert.equal(g.setCharacter('bacon'),true);
});
check('schema 1 migrates old money, vehicles, selected skin and deliveries without free paid items',()=>{
  const old={version:1,money:23456.9,ownedVehicleIds:['van','rover','citycourier','rover','unknown'],characterId:'jandel',completedRuns:14.9};
  const s=sanitizeCareer(old);assert.equal(s.version,2);assert.equal(s.money,23456);assert.equal(s.completedRuns,14);
  assert.deepEqual(s.ownedVehicleIds,VEHICLE_CONFIG.filter(v=>['pickup','rover','van','citycourier'].includes(v.id)).map(v=>v.id));assert.equal(s.characterId,'jandel');assert.deepEqual(s.ownedSkinIds,['bacon','jandel']);
  assert.equal(s.brains,0);assert.equal(s.vehicleGrantClaimed,false);assert.deepEqual(s.ownedSchoolIds,['school-1']);
  const mem=storage(JSON.stringify(old)),store=createCareerStore({storage:mem});assert.deepEqual(store.load(),s);assert.equal(store.status.failed,false);
  store.save(s);assert.equal(JSON.parse(mem.raw).version,2);assert.equal(ECONOMY_CONFIG.saveKey,'urban-route-career-v1');
});
check('version 2 whitelists and bounds all progression fields without unlocking unowned cars or skins',()=>{
  const s=sanitizeCareer({...freshCareer(),money:Infinity,brains:1.23456789,ownedVehicleIds:['pickup','rover'],characterId:'jandel',
    ownedSkinIds:['pack1','pack1','unknown','__proto__'],ownedSchoolIds:['school-5','school-2','missing','school-2'],vehicleGrantClaimed:'yes',
    upgrades:{pickup:{speed:999,handling:-8,grip:2.8},rover:{speed:1,handling:'3',grip:NaN},van:{speed:3,handling:3,grip:3},missing:{speed:3}}});
  assert.equal(s.money,0);near(s.brains,1.234568);assert.deepEqual(s.ownedSkinIds,['bacon','pack1']);assert.equal(s.characterId,'bacon');
  assert.deepEqual(s.ownedSchoolIds,['school-1','school-2','school-5']);assert.equal(s.vehicleGrantClaimed,false);
  assert.deepEqual(s.upgrades.pickup,{speed:3,handling:0,grip:2,fuel:0});assert.deepEqual(s.upgrades.rover,{speed:1,handling:0,grip:0,fuel:0});assert.deepEqual(s.upgrades.van,{speed:0,handling:0,grip:0,fuel:0});
  assert.deepEqual(sanitizeCareer(s),s);
  for(const value of ['999',null,{},[],NaN,Infinity,-Infinity,-100])assert.equal(sanitizeCareer({...freshCareer(),brains:value}).brains,0);
  assert.equal(sanitizeCareer({...freshCareer(),brains:Number.MAX_VALUE}).brains,PROGRESSION_CONFIG.maxBrains);
});
check('root and nested accessors, inherited values and prototype keys never execute or pollute',()=>{
  let calls=0;
  for(const key of ['version','money','brains','ownedSkinIds','ownedSchoolIds','upgrades','vehicleGrantClaimed']){
    const hostile={...freshCareer()};Object.defineProperty(hostile,key,{get(){calls++;throw Error('getter ran');}});
    assert.deepEqual(sanitizeCareer(hostile),freshCareer());
  }
  const ids=['pack1'];Object.defineProperty(ids,'0',{get(){calls++;return 'pack1';}});
  assert.deepEqual(sanitizeCareer({...freshCareer(),ownedSkinIds:ids}).ownedSkinIds,['bacon']);
  const nested={speed:2};Object.defineProperty(nested,'grip',{get(){calls++;return 3;}});
  assert.deepEqual(sanitizeCareer({...freshCareer(),upgrades:{pickup:nested}}).upgrades.pickup,{speed:0,handling:0,grip:0,fuel:0});
  const vehicleGetter={};Object.defineProperty(vehicleGetter,'pickup',{get(){calls++;return {speed:3};}});
  assert.deepEqual(sanitizeCareer({...freshCareer(),upgrades:vehicleGetter}).upgrades.pickup,{speed:0,handling:0,grip:0,fuel:0});
  assert.deepEqual(sanitizeCareer(Object.assign(Object.create({money:999}),{version:2})),freshCareer());
  assert.deepEqual(sanitizeCareer(JSON.parse('{"version":2,"__proto__":{"polluted":true},"brains":999}')),freshCareer());
  assert.deepEqual(sanitizeCareer({...freshCareer(),ownedSkinIds:new Array(1000000)}).ownedSkinIds,['bacon']);
  const poisoned=JSON.parse('{"pickup":{"constructor":{"prototype":{"polluted":true}},"speed":3}}');
  assert.deepEqual(sanitizeCareer({...freshCareer(),upgrades:poisoned}).upgrades.pickup,{speed:0,handling:0,grip:0,fuel:0});
  assert.equal(calls,0);assert.equal({}.polluted,undefined);
});
check('unknown future versions and corrupt storage reset safely without partial restoration',()=>{
  for(const raw of ['{broken','null','[]','"hello"','{"version":3,"money":999,"brains":999}','{"version":"2","money":999}']){
    const store=createCareerStore({storage:storage(raw)});assert.deepEqual(store.load(),freshCareer());assert.equal(store.status.failed,true);
  }
  assert.deepEqual(sanitizeCareer({version:99,money:500}),freshCareer());
});
check('one brain per real moving second is frame-rate independent in forward and reverse',()=>{
  for(const fps of [30,60,120])for(const direction of [-1,1]){
    const g=make();assert.ok(g.enter('pickup'));tick(g,10,{fps,distance:direction*6/fps});near(g.state.brains,10);
  }
});
check('idle, contact jitter, hidden/inactive, invalid, teleported and offline time award zero',()=>{
  const g=make();g.enter('pickup');
  tick(g,5,{distance:0});tick(g,5,{distance:.001});tick(g,5,{active:false});
  for(const dt of [-1,0,.101,1,3600,NaN,Infinity,'1'])g.tickProgress(dt,{distance:1,active:true});
  for(const distance of [100,NaN,Infinity,'1',null])g.tickProgress(1/60,{distance,active:true});
  g.tickProgress(1/60,{distance:.1});assert.equal(g.state.brains,0);
  g.beginBiomeTest('volcanic');g.tickProgress(1/60,{distance:5200,active:true});assert.equal(g.state.brains,0);
  g.returnToGarage();tick(g,5,{distance:.1});assert.equal(g.state.brains,0);
});
check('learning starts only when seated, uses every school rate and stops on stand immediately',()=>{
  for(let i=0;i<SCHOOL_CONFIG.length;i++){
    const g=make({career:moneyCareer(20000)}),school=SCHOOL_CONFIG[i];
    tick(g,1);assert.equal(g.state.brains,0);approachSchool(g,i);
    if(i>0){assert.equal(g.state.seatedId,null);assert.equal(g.state.schoolPurchaseCandidateId,school.id);assert.ok(g.buySchool(school.id));assert.equal(g.state.seatedId,null);assert.ok(g.sitAtSchool(school.id));}
    assert.equal(g.state.seatedSchoolId,school.id);assert.equal(g.state.seatedId,'desk-01','every entrance can use the same first free desk');
    tick(g,4,{distance:0});near(g.state.brains,4*school.rate);
    tick(g,2,{active:false,distance:0});near(g.state.brains,4*school.rate);
    assert.equal(g.enter('pickup'),false);assert.equal(g.jump(),false);assert.ok(g.stand());assert.equal(g.state.seatedSchoolId,null);
    tick(g,2,{distance:0});near(g.state.brains,4*school.rate);assert.equal(g.state.classroomArmed,false);
  }
});
check('movement-to-stand clears seated earnings before the same frame tick',()=>{
  const g=make();approachSchool(g,0);tick(g,1,{distance:0});const before=g.state.brains;
  g.walk(1/60,{x:1,z:0});assert.equal(g.state.seatedId,null);assert.equal(g.state.seatedSchoolId,null);assert.equal(g.tickProgress(1/60,{active:true}),0);assert.equal(g.state.brains,before);
});
check('all five paid rates follow the entrance even when every former seat in its column is occupied',()=>{
  for(const [index,school] of SCHOOL_CONFIG.entries()){
    const occupied=CLASSROOM_DESKS.filter(d=>d.column===index+1).map(d=>d.id),expected=CLASSROOM_DESKS.find(d=>!occupied.includes(d.id));
    assert.equal(resolveFreeClassroomSeat(CLASSROOM_DESKS,occupied),expected);
    const g=make({occupiedSeatIds:occupied,career:{...freshCareer(),money:12345,brains:12.25,ownedSchoolIds:SCHOOL_CONFIG.map(s=>s.id)}});
    approachSchool(g,index);assert.equal(g.state.seatedId,expected.id);assert.notEqual(expected.column,index+1);
    assert.equal(g.state.seatedSchoolId,school.id);tick(g,2,{distance:0});near(g.state.brains,12.25+2*school.rate);assert.equal(g.state.money,12345);
    const events=g.events(),event=events.find(e=>e.type==='sit');assert.equal(event.schoolId,school.id);assert.equal(event.rate,school.rate);
    assert.equal(events.filter(e=>e.type==='classroom-full').length,0);
  }
});
check('only twenty occupied desks make an owned entrance full, and failed seating earns or spends nothing',()=>{
  const occupied=CLASSROOM_DESKS.map(d=>d.id);assert.equal(resolveFreeClassroomSeat(CLASSROOM_DESKS,occupied),null);
  for(const [index,school] of SCHOOL_CONFIG.entries()){
    const g=make({occupiedSeatIds:occupied,career:{...freshCareer(),money:12345,brains:12.25,ownedSchoolIds:SCHOOL_CONFIG.map(s=>s.id)}});
    const before=g.snapshot();approachSchool(g,index);assert.equal(g.state.seatedId,null);assert.equal(g.state.seatedSchoolId,null);
    const events=g.events().filter(e=>e.type==='classroom-full');assert.equal(events.length,1);assert.equal(events[0].schoolId,school.id);
    tick(g,5);assert.deepEqual(g.snapshot(),before);
  }
});
check('locked entrance requires a separate purchase even when its original column is occupied',()=>{
  for(const [index,school] of SCHOOL_CONFIG.entries())if(index>0){
    const occupied=CLASSROOM_DESKS.filter(d=>d.column===index+1).map(d=>d.id);
    const g=make({occupiedSeatIds:occupied,career:{...freshCareer(),money:20000,brains:7.25}});
    approachSchool(g,index);assert.equal(g.state.schoolPurchaseCandidateId,school.id);assert.equal(g.state.seatedId,null);assert.equal(g.state.seatedSchoolId,null);
    assert.equal(g.sitAtSchool(school.id),false);assert.equal(g.state.money,20000);assert.equal(g.state.brains,7.25);
    assert.ok(g.buySchool(school.id));assert.equal(g.state.money,20000-school.price);assert.equal(g.state.brains,7.25);assert.equal(g.state.seatedId,null);assert.equal(g.state.seatedSchoolId,null);
    assert.equal(g.buySchool(school.id),false);assert.ok(g.sitAtSchool(school.id));assert.equal(g.state.seatedId,'desk-01');assert.equal(g.state.seatedSchoolId,school.id);
    assert.equal(g.sitAtSchool(school.id),false);tick(g,1,{distance:0});near(g.state.brains,7.25+school.rate);assert.equal(g.state.money,20000-school.price);
  }
});
check('study requires an existing desk and an owned valid entrance independently',()=>{
  const g=make();approachSchool(g,0);const before=g.state.brains;
  for(const [desk,school] of [['missing','school-1'],['desk-01',null],['desk-01','school-5'],['desk-01','missing']]){
    g.state.seatedId=desk;g.state.seatedSchoolId=school;assert.equal(g.tickProgress(.1,{active:true}),0);assert.equal(g.state.brains,before);
  }
  g.state.seatedId='desk-20';g.state.seatedSchoolId='school-1';near(g.tickProgress(.1,{active:true}),.15);
});
check('standing, movement, garage return and fuel-empty clear entrance state while keeping all earned currency and purchases',()=>{
  for(const [index,school] of SCHOOL_CONFIG.entries())for(const reset of ['stand','movement','garage','fuel-empty']){
    const g=make({career:{...freshCareer(),money:12345,brains:7.25,ownedSchoolIds:SCHOOL_CONFIG.map(s=>s.id)}});
    approachSchool(g,index);tick(g,1,{distance:0});near(g.state.brains,7.25+school.rate);const before=g.snapshot();
    if(reset==='stand')assert.ok(g.stand());
    if(reset==='movement')g.walk(1/60,{x:1,z:0});
    if(reset==='garage')g.returnToGarage();
    if(reset==='fuel-empty'){assert.ok(g.stand());g.state.cooldown=0;assert.ok(g.enter('pickup'));g.state.fuels.pickup=.001;g.drive(1,0,-40);assert.equal(g.state.mode,'walking');}
    assert.equal(g.state.seatedId,null);assert.equal(g.state.seatedSchoolId,null);tick(g,2,{distance:0});assert.deepEqual(g.snapshot(),before,`${school.id}/${reset}`);
    const reloaded=make({career:g.snapshot()});assert.equal(reloaded.state.seatedId,null);assert.equal(reloaded.state.seatedSchoolId,null);assert.deepEqual(reloaded.snapshot(),before);
  }
});
check('school access purchases are explicit, money-only, atomic, permanent and proximity guarded',()=>{
  const g=make({career:moneyCareer(1000)});assert.equal(g.buySchool('school-2'),false);assert.equal(g.state.money,1000);
  approachSchool(g,1);assert.equal(g.state.money,1000);assert.equal(g.isSchoolOwned('school-2'),false);assert.equal(g.sitAtSchool('school-2'),false);
  assert.ok(g.buySchool('school-2'));assert.equal(g.state.money,500);assert.equal(g.state.brains,0);assert.equal(g.buySchool('school-2'),false);assert.equal(g.state.money,500);
  const next=make({career:g.snapshot()});assert.ok(next.isSchoolOwned('school-2'));assert.equal(next.state.seatedId,null);
  approachSchool(next,2);assert.equal(next.buySchool('school-3'),false);assert.equal(next.state.money,500);assert.equal(next.buySchool('unknown'),false);
  assert.equal(next.buySchool('school-1'),false);
});
check('all paid skins require Buy then Select; locked stands never spend or emit character selection',()=>{
  const g=make({career:moneyCareer(200000)});
  for(let i=1;i<CHARACTER_CATALOG.length;i++){
    const skin=SKIN_CONFIG[i],before=g.state.money,previous=g.state.characterId;g.events();approachSkin(g,i);
    const events=g.events();assert.equal(events.filter(e=>e.type==='skin-purchase-prompt').length,1);assert.equal(events.filter(e=>e.type==='character').length,0);
    assert.equal(g.state.money,before);assert.equal(g.setCharacter(skin.id),false);assert.ok(g.buySkin(skin.id));
    assert.equal(g.state.money,before-skin.price);assert.equal(g.state.characterId,previous);assert.equal(g.buySkin(skin.id),false);
    assert.ok(g.setCharacter(skin.id));assert.equal(g.state.characterId,skin.id);assert.equal(g.state.brains,0);
    const reloaded=make({career:g.snapshot()});assert.ok(reloaded.isSkinOwned(skin.id));assert.equal(reloaded.state.characterId,skin.id);
  }
  g.events();approachSkin(g,1);assert.equal(g.events().filter(e=>e.type==='character').length,1);
});
check('insufficient, remote, airborne and seated skin/school buys preserve currency',()=>{
  const g=make({career:moneyCareer(100)});approachSkin(g,1);assert.equal(g.buySkin('pack1'),false);assert.equal(g.buySkin('unknown'),false);
  assert.equal(g.state.money,100);g.state.money=5000;g.state.jump.airborne=true;assert.equal(g.buySkin('pack1'),false);
  g.state.jump.airborne=false;g.state.player={...GAMEPLAY.spawn};assert.equal(g.buySkin('pack1'),false);
  approachSchool(g,0);assert.equal(g.buySkin('pack1'),false);assert.equal(g.buySchool('school-2'),false);assert.equal(g.state.money,5000);
});
check('per-car upgrades spend brains only, enforce driving/ownership and respect caps',()=>{
  const g=make({career:{...freshCareer(),money:999,brains:1000,ownedVehicleIds:['pickup','rover']}});
  assert.equal(g.buyUpgrade('speed'),false);assert.ok(g.enter('pickup'));
  for(const stat of UPGRADE_STATS)for(let level=0;level<stat.maxLevel;level++){
    const before=g.state.brains,offer=getUpgradeOffer('pickup',stat.id,g.state.upgrades.pickup);assert.ok(g.buyUpgrade(stat.id));
    assert.equal(g.state.brains,before-offer.price);assert.equal(g.state.upgrades.pickup[stat.id],level+1);
  }
  const remaining=g.state.brains;for(const stat of UPGRADE_STATS)assert.equal(g.buyUpgrade(stat.id),false);
  assert.equal(g.buyUpgrade('unknown'),false);assert.equal(g.state.brains,remaining);assert.equal(g.state.money,999);
  assert.deepEqual(g.state.upgrades.rover,{speed:0,handling:0,grip:0,fuel:0});assert.deepEqual(make({career:g.snapshot()}).state.upgrades.pickup,{speed:3,handling:3,grip:3,fuel:3});
  g.returnToGarage();g.state.cooldown=0;g.enter('rover');assert.ok(g.buyUpgrade('speed'));assert.equal(g.state.upgrades.rover.speed,1);
  g.state.brains=0;assert.equal(g.buyUpgrade('grip'),false);g.state.selectedId='van';assert.equal(g.buyUpgrade('speed'),false);
});
check('exact earned upgrade price remains buyable without one extra frame at high refresh rates',()=>{
  for(const fps of [30,60,120,144]){
    const g=make();g.enter('pickup');const price=getUpgradeOffer('pickup','speed',g.state.upgrades.pickup).price;
    tick(g,price,{fps,distance:6/fps});assert.equal(g.state.brains,price);assert.ok(g.buyUpgrade('speed'));assert.equal(g.state.brains,0);
  }
});
check('one-time vehicle grant is exact, only explicit, respects old ownership/money and persists',()=>{
  const original={...freshCareer(),money:2300,ownedVehicleIds:['pickup','rover','van']},mem=storage(),store=createCareerStore({storage:mem}),g=make({career:original,persistence:store});
  const target=VEHICLE_CONFIG.filter(v=>!original.ownedVehicleIds.includes(v.id)).reduce((sum,v)=>sum+v.price,0);
  assert.equal(g.state.money,2300);assert.equal(mem.writes,0);assert.ok(g.claimVehicleFunds());assert.equal(g.state.money,target);
  const grant=g.events().find(e=>e.type==='vehicle-funds');assert.equal(grant.amount,target-2300);assert.equal(g.state.brains,0);assert.deepEqual(g.state.ownedVehicleIds,original.ownedVehicleIds);
  assert.equal(g.claimVehicleFunds(),false);assert.equal(g.state.money,target);
  const reloaded=make({persistence:createCareerStore({storage:mem})});assert.equal(reloaded.state.vehicleGrantClaimed,true);assert.equal(reloaded.claimVehicleFunds(),false);assert.equal(reloaded.state.money,target);
});
check('grant never removes money and a zero grant still consumes the one-time claim',()=>{
  for(const career of [{...freshCareer(),money:999999},{...freshCareer(),ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)}]){
    const g=make({career});assert.ok(g.claimVehicleFunds());assert.equal(g.state.money,career.money);assert.equal(g.events().find(e=>e.type==='vehicle-funds').amount,0);assert.equal(g.claimVehicleFunds(),false);
  }
});
check('fractional brains save in batches and flush, reload creates no offline/position/cargo reward',()=>{
  const mem=storage(),store=createCareerStore({storage:mem}),g=make({persistence:store});g.enter('pickup');tick(g,3);
  assert.ok(mem.writes>=1&&mem.writes<=2);g.tickProgress(1/60,{active:true,distance:.1});assert.ok(g.flushProgress());
  const saved=JSON.parse(mem.raw);near(saved.brains,3+1/60);assert.equal(saved.version,2);
  assert.deepEqual(Object.keys(saved).sort(),['brains','characterId','completedRuns','money','ownedSchoolIds','ownedSkinIds','ownedVehicleIds','upgrades','vehicleGrantClaimed','version'].sort());
  const reloaded=make({persistence:createCareerStore({storage:mem})});near(reloaded.state.brains,g.state.brains);assert.equal(reloaded.state.mode,'walking');assert.deepEqual(reloaded.state.player,GAMEPLAY.spawn);assert.equal(reloaded.state.run,null);
  assert.equal(reloaded.state.seatedId,null);reloaded.tickProgress(86400,{active:true,distance:5000});near(reloaded.state.brains,g.state.brains);
});
check('storage failures do not rollback or double-spend purchases, and warn only once',()=>{
  const broken={load(){return freshCareer();},save(){throw Error('blocked');}},g=make({career:moneyCareer(2000),persistence:broken});
  approachSkin(g,1);assert.ok(g.buySkin('pack1'));assert.equal(g.buySkin('pack1'),false);assert.equal(g.state.money,1750);
  approachSchool(g,1);assert.ok(g.buySchool('school-2'));assert.equal(g.buySchool('school-2'),false);assert.equal(g.state.money,1250);
  assert.ok(g.claimVehicleFunds());const funds=g.state.money;assert.equal(g.claimVehicleFunds(),false);assert.equal(g.state.money,funds);
  assert.equal(g.events().filter(e=>e.type==='save-warning').length,1);assert.equal(g.state.saveFailed,true);
});
check('brain upper bound remains finite with capped saving and no overrun',()=>{
  const g=make({career:{...freshCareer(),brains:PROGRESSION_CONFIG.maxBrains-.01}});g.enter('pickup');tick(g,1);
  assert.equal(g.state.brains,PROGRESSION_CONFIG.maxBrains);assert.equal(g.tickProgress(.1,{active:true,distance:1}),0);
});
console.log(`Learning career: ${passed} checks passed; renderer-free.`);
