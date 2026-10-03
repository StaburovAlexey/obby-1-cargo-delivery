import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameplay } from '../dist/gameplay.js';
import { freshCareer, sanitizeCareer, createCareerStore } from '../dist/career-save.js';
import { ECONOMY_CONFIG, VEHICLE_CONFIG, BIOME_SEQUENCE } from '../dist/economy-config.js';
import { SCHOOL_CONFIG, SKIN_CONFIG } from '../dist/progression-config.js';
import { UPGRADE_STATS, getUpgradeOffer, getVehiclePerformance } from '../dist/vehicle-upgrades.js';
import { CLASSROOM_DESKS, CLASSROOM_ENTRIES, CHARACTER_STANDS, GARAGE_LAYOUT } from '../dist/garage-scene.js';
import { createDrivingModel } from '../dist/driving-model.js';
import { surfaceForBiome } from '../dist/biome-surfaces.js';
const results=[];
const check=(name,fn)=>{try {const details=fn(); results.push({name,status:'PASS',details});console.log('PASS',name,details===undefined?'':JSON.stringify(details));}catch(e){results.push({name,status:'FAIL',error:e.message});console.log('FAIL',name,e.message);}};
const near=(a,b,tol=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tol,`${a} != ${b} within ${tol}`);
const vehicles=VEHICLE_CONFIG.map((v,i)=>({id:v.id,park:{...GARAGE_LAYOUT.bays[i]}}));
const make=(options={})=>createGameplay({vehicles,desks:CLASSROOM_DESKS,stands:CHARACTER_STANDS,...options});
const storage=(career)=>{let value=career?JSON.stringify(career):null;return{getItem:()=>value,setItem:(key,v)=>{value=v;},get value(){return value;}};};
const schoolApproach=(g,id)=>{const entry=CLASSROOM_ENTRIES.find(x=>x.id===id);g.state.player={x:entry.x,z:entry.z,heading:0};g.state.cooldown=0;g.state.interactionCooldown=0;};
const skinApproach=(g,id)=>{const i=SKIN_CONFIG.findIndex(x=>x.id===id);g.state.player={...CHARACTER_STANDS[i].trigger,heading:0};};
const vehicleApproach=(g,id)=>{const v=vehicles.find(x=>x.id===id);g.state.player={x:v.park.x-4.8,z:v.park.z,heading:0};};
const run=(m,seconds,fps=120)=>{for(let i=0;i<seconds*fps;i++)m.step(1/fps);};
const mkModel=(v,biome,levels={})=>createDrivingModel({x:0,z:0,maxSpeed:v.maxSpeed,vehicleId:v.id,groundSurface:()=>surfaceForBiome(biome,v.id),getUpgrades:()=>levels});
check('fresh career and old-save migration preserve owned vehicles, money and selected paid skin',()=>{
 const start=freshCareer();assert.equal(start.money,0);assert.equal(start.brains,0);assert.deepEqual(start.ownedSkinIds,['bacon']);assert.equal(start.vehicleGrantClaimed,false);
 for(const skin of SKIN_CONFIG){const old={version:1,money:654321,ownedVehicleIds:['pickup','rover','van'],characterId:skin.id,completedRuns:37}; const next=sanitizeCareer(old);
 assert.equal(next.money,old.money);assert.deepEqual(next.ownedVehicleIds,['pickup','rover','van']);assert.equal(next.characterId,skin.id);assert.ok(next.ownedSkinIds.includes(skin.id));assert.deepEqual(sanitizeCareer(next),next);}
 return {skins:SKIN_CONFIG.length};
});
check('one-time grant equals only missing fleet deficit, survives all buys and reloads',()=>{
 let cases=0;
 for(let mask=0;mask<1024;mask+=17)for(const money of [0,777,50000]){
  const owned=VEHICLE_CONFIG.filter((v,i)=>i===0||(mask&(1<<i))).map(v=>v.id),career={...freshCareer(),money,ownedVehicleIds:owned}; const st=storage(career),g=make({persistence:createCareerStore({storage:st})});
  const needed=VEHICLE_CONFIG.filter(v=>!owned.includes(v.id)).reduce((n,v)=>n+v.price,0);
  assert.equal(g.state.money,money,'grant must not auto-run on initialization');assert.ok(g.claimVehicleFunds());assert.equal(g.state.money,Math.max(money,needed));const granted=g.state.money;assert.equal(g.claimVehicleFunds(),false);assert.equal(g.state.money,granted);
  for(const v of VEHICLE_CONFIG)if(!g.isOwned(v.id)){vehicleApproach(g,v.id);assert.ok(g.buy(v.id));assert.equal(g.buy(v.id),false);}
  const remaining=Math.max(money-needed,0);assert.equal(g.state.money,remaining);
  const re=make({persistence:createCareerStore({storage:st})});assert.equal(re.state.money,remaining);assert.equal(re.claimVehicleFunds(),false);assert.equal(re.state.money,remaining);assert.equal(re.state.ownedVehicleIds.length,10);cases++;
 }return {cases};
});
check('all paid school purchases reject duplicates, enforce proximity and funds, retain access after reload',()=>{
 assert.deepEqual(SCHOOL_CONFIG.map(s=>s.price),[0,500,1500,3500,7000]);assert.deepEqual(SCHOOL_CONFIG.map(s=>s.rate),[1.5,2,3,4.5,6]);
 const st=storage({...freshCareer(),money:20000}),g=make({persistence:createCareerStore({storage:st})});let spent=0;
 for(const s of SCHOOL_CONFIG.slice(1)){
  assert.equal(g.buySchool(s.id),false);schoolApproach(g,s.id);const balance=g.state.money;g.state.money=s.price-1;assert.equal(g.buySchool(s.id),false);g.state.money=balance;
  assert.ok(g.buySchool(s.id));assert.equal(g.buySchool(s.id),false);spent+=s.price;assert.equal(g.state.money,20000-spent);assert.equal(g.state.seatedId,null);
  g.state.player={x:0,z:60,heading:0};
 }
 const re=make({persistence:createCareerStore({storage:st})});assert.equal(re.state.ownedSchoolIds.length,5);return {spent};
});
check('all sixteen paid skins remain locked until proximity purchase; old selection and reload retained',()=>{
 assert.equal(SKIN_CONFIG.length,17);assert.equal(SKIN_CONFIG[0].id,'bacon');assert.equal(SKIN_CONFIG[0].price,0);
 const st=storage({...freshCareer(),money:1000000}),g=make({persistence:createCareerStore({storage:st})});let spent=0;
 for(let i=1;i<SKIN_CONFIG.length;i++){
  const s=SKIN_CONFIG[i];assert.ok(s.price>SKIN_CONFIG[i-1].price);assert.equal(g.setCharacter(s.id),false);assert.equal(g.buySkin(s.id),false);skinApproach(g,s.id);
  const balance=g.state.money;g.state.money=s.price-1;assert.equal(g.buySkin(s.id),false);g.state.money=balance;
  assert.ok(g.buySkin(s.id));assert.equal(g.buySkin(s.id),false);spent+=s.price;assert.equal(g.state.money,1000000-spent);assert.ok(g.setCharacter(s.id));
  const re=make({persistence:createCareerStore({storage:st})});assert.equal(re.state.characterId,s.id);assert.ok(re.isSkinOwned(s.id));g.state.player={x:0,z:60,heading:0};
 }return {spent};
});
check('study rates follow all five entrances across shared seats, pauses, standing and a full room',()=>{
 const g=make({career:{...freshCareer(),money:100000,ownedSchoolIds:SCHOOL_CONFIG.map(x=>x.id)}});
 for(const [index,s] of SCHOOL_CONFIG.entries()){
  const occupied=CLASSROOM_DESKS.filter(desk=>desk.column===index+1).map(desk=>desk.id),expected=CLASSROOM_DESKS.find(desk=>!occupied.includes(desk.id));
  g.setOccupiedSeatIds(occupied);schoolApproach(g,s.id);const before=g.state.brains;assert.equal(g.tickProgress(.1,{active:true,distance:1}),0);assert.ok(g.sitAtSchool(s.id));
  assert.equal(g.state.seatedId,expected.id);assert.equal(g.state.seatedSchoolId,s.id);assert.notEqual(expected.column,index+1);
  for(let i=0;i<100;i++)g.tickProgress(.1,{active:true,distance:1});near(g.state.brains-before,s.rate*10);assert.equal(g.state.money,100000);
  for(const dt of [0,-1,Infinity,NaN,3600,.101,'0.1'])assert.equal(g.tickProgress(dt,{active:true,distance:1}),0);
  assert.equal(g.tickProgress(.1,{active:false,distance:1}),0);assert.equal(g.state.seatedSchoolId,s.id);
  assert.ok(g.stand());assert.equal(g.state.seatedId,null);assert.equal(g.state.seatedSchoolId,null);assert.equal(g.tickProgress(.1,{active:true,distance:1}),0);
  g.setOccupiedSeatIds(CLASSROOM_DESKS.map(x=>x.id));schoolApproach(g,s.id);const saved=g.snapshot();assert.equal(g.sitAtSchool(s.id),false);assert.equal(g.state.seatedId,null);assert.equal(g.state.seatedSchoolId,null);assert.deepEqual(g.snapshot(),saved);g.setOccupiedSeatIds([]);
 }
});
check('upgrade purchases are bounded, recalculate prices, spend only brains, and preserve per-car levels on reload',()=>{
 const st=storage({...freshCareer(),money:987654,brains:100000,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)}),g=make({persistence:createCareerStore({storage:st})});let spent=0;
 assert.equal(g.buyUpgrade('speed'),false);
 for(const v of VEHICLE_CONFIG){g.state.cooldown=0;assert.ok(g.enter(v.id));for(const stat of UPGRADE_STATS){for(let level=0;level<3;level++){const offer=getUpgradeOffer(v.id,stat.id,g.state.upgrades[v.id]);spent+=offer.price;assert.ok(g.buyUpgrade(stat.id));assert.equal(g.state.upgrades[v.id][stat.id],level+1);}assert.equal(g.buyUpgrade(stat.id),false);}g.returnToGarage();}
 assert.equal(g.state.money,987654);assert.equal(g.state.brains,100000-spent);const re=make({persistence:createCareerStore({storage:st})});assert.deepEqual(re.state.upgrades,g.state.upgrades);assert.equal(re.state.brains,g.state.brains);return {spent};
});
check('actual motion earns exactly one brain per second across low, normal and high-refresh frame rates',()=>{
 const rows=[];
 for(const fps of [30,60,90,120,144,165,240]){const g=make();g.enter('pickup');const m=mkModel(VEHICLE_CONFIG[0],'city');m.setInput({active:true});run(m,3,fps);for(let i=0;i<fps*10;i++){m.step(1/fps);g.tickProgress(m.state.movingSeconds,{active:true,distance:m.state.pathDistance});}rows.push({fps,brains:g.state.brains});}
 fs.writeFileSync(new URL('../qa/learning/frame-rate-earning.json',import.meta.url),JSON.stringify(rows,null,2));for(const row of rows)near(row.brains,10,1e-8);return rows;
});
check('idle, stationary wall pressure, rejected long frames and unrealistic teleport distances cannot earn',()=>{
 const g=make();g.enter('pickup');for(let i=0;i<300;i++)g.tickProgress(1/60,{distance:0,active:true});assert.equal(g.state.brains,0);
 for(const distance of [Infinity,NaN,'1',800,-800])assert.equal(g.tickProgress(.05,{distance,active:true}),0);
 const m=createDrivingModel({x:0,z:3,contact:(x,z)=>z<2.88?{depth:2.88-z,normalX:0,normalZ:1}:undefined});m.setInput({active:true});run(m,2);
 const before=g.state.brains;for(let i=0;i<1200;i++){m.step(1/120);g.tickProgress(1/120,{active:true,distance:m.state.pathDistance});}near(g.state.brains,before);
});
check('each isolated upgrade causes a measured physical effect for all cars on supported biomes',()=>{
 const rows=[];
 for(const v of VEHICLE_CONFIG)for(const b of BIOME_SEQUENCE.filter(b=>BIOME_SEQUENCE.findIndex(x=>x.id===b.id)<=BIOME_SEQUENCE.findIndex(x=>x.id===v.specialty))){
  const base=mkModel(v,b.id),speed=mkModel(v,b.id,{speed:3});base.setInput({active:true});speed.setInput({active:true});run(base,.5);run(speed,.5);assert.ok(speed.state.speed>base.state.speed,`${v.id}/${b.id} engine`);run(base,40);run(speed,40);near(speed.state.speed/base.state.speed,1.06,1e-5);
  const response=levels=>{const m=mkModel(v,b.id,levels);m.state.velocityZ=-1.5;m.setInput({active:true,steering:.6});run(m,.1);return {rack:Math.abs(m.state.frontWheelAngle),yaw:Math.abs(m.state.angularVelocity)};};const rb=response({}),ru=response({handling:3});assert.ok(ru.rack>rb.rack,`${v.id}/${b.id} rack`);assert.ok(ru.yaw>rb.yaw,`${v.id}/${b.id} yaw`);
  const slide=levels=>{const m=mkModel(v,b.id,levels);m.state.velocityX=.6;m.state.velocityZ=-1.5;run(m,5);return Math.abs(m.state.x);};const sb=slide({}),su=slide({grip:3});assert.ok(su<sb,`${v.id}/${b.id} lateral`);
  const brake=levels=>{const m=mkModel(v,b.id,levels);m.state.velocityZ=-1.5;m.setInput({active:true});m.setGear('R');let distance=0;for(let i=0;i<1200&&m.state.velocityZ<0;i++){m.step(1/120);distance+=m.state.pathDistance;}return distance;};const bb=brake({}),bu=brake({grip:3});assert.ok(bu<bb,`${v.id}/${b.id} braking`);
  rows.push({car:v.id,biome:b.id,stockTop:base.state.speed,maxTop:speed.state.speed,rackGain:ru.rack/rb.rack,yawGain:ru.yaw/rb.yaw,slideReduction:1-su/sb,brakeReduction:1-bu/bb});
 }
 fs.writeFileSync(new URL('../qa/learning/upgrade-measurements.json',import.meta.url),JSON.stringify(rows,null,2));return {combinations:rows.length};
});
check('next stock car stays above maxed previous car on supported terrain across actual acceleration, top speed, rack, yaw, grip and brakes',()=>{
 const rows=[];
 for(let i=0;i<9;i++)for(const b of BIOME_SEQUENCE){const a=VEHICLE_CONFIG[i],v=VEHICLE_CONFIG[i+1],max={speed:3,handling:3,grip:3,fuel:3};if(BIOME_SEQUENCE.findIndex(x=>x.id===b.id)>BIOME_SEQUENCE.findIndex(x=>x.id===v.specialty))continue;
  assert.ok(getVehiclePerformance(v.id,{}).range>getVehiclePerformance(a.id,max).range);
  const prev=mkModel(a,b.id,max),next=mkModel(v,b.id);prev.setInput({active:true});next.setInput({active:true});run(prev,.5);run(next,.5);const accelA=prev.state.speed,accelB=next.state.speed;assert.ok(accelB>accelA,`${a.id}->${v.id}/${b.id} acceleration ${accelA}->${accelB}`);run(prev,40);run(next,40);assert.ok(next.state.speed>prev.state.speed,`${a.id}->${v.id}/${b.id} top`);
  const turn=(car,levels)=>{const m=mkModel(car,b.id,levels);m.state.velocityZ=-1.5;m.setInput({active:true,steering:.6});run(m,.1);return {rack:Math.abs(m.state.frontWheelAngle),yaw:Math.abs(m.state.angularVelocity)};};const ta=turn(a,max),tb=turn(v,{});assert.ok(tb.rack>ta.rack,`${a.id}->${v.id}/${b.id} rack ${ta.rack}->${tb.rack}`);assert.ok(tb.yaw>ta.yaw,`${a.id}->${v.id}/${b.id} yaw ${ta.yaw}->${tb.yaw}`);
  const slide=(car,levels)=>{const m=mkModel(car,b.id,levels);m.state.velocityX=.6;m.state.velocityZ=-1.5;run(m,5);return Math.abs(m.state.x);};const sa=slide(a,max),sb=slide(v,{});assert.ok(sb<sa,`${a.id}->${v.id}/${b.id} slide ${sa}->${sb}`);
  const brake=(car,levels)=>{const m=mkModel(car,b.id,levels);m.state.velocityZ=-1.5;m.setInput({active:true});m.setGear('R');let distance=0;for(let i=0;i<1200&&m.state.velocityZ<0;i++){m.step(1/120);distance+=m.state.pathDistance;}return distance;};const ba=brake(a,max),bb=brake(v,{});assert.ok(bb<ba,`${a.id}->${v.id}/${b.id} brake ${ba}->${bb}`);
  rows.push({previous:a.id,next:v.id,biome:b.id,accelerationRatio:accelB/accelA,topRatio:next.state.speed/prev.state.speed,rackRatio:tb.rack/ta.rack,yawRatio:tb.yaw/ta.yaw,lateralDistanceRatio:sb/sa,brakeDistanceRatio:bb/ba});
 }fs.writeFileSync(new URL('../qa/learning/adjacent-car-measurements.json',import.meta.url),JSON.stringify(rows,null,2));return {comparisons:rows.length};
});
check('persistent storage failure retries are bounded while recovery flush retains all earned brains',()=>{
 const rows=[];for(const failure of ['false','throw']){let attempts=0,recover=false,saved;const persistence={save(snapshot){attempts++;if(recover){saved=snapshot;return true;}if(failure==='throw')throw Error('blocked storage');return false;}};const g=make({persistence});g.enter('pickup');for(let i=0;i<600;i++)g.tickProgress(1/60,{distance:.1,active:true});near(g.state.brains,10);assert.ok(attempts<=6,`${failure}: ${attempts} attempts in10s`);assert.equal(g.events().filter(e=>e.type==='save-warning').length,1);recover=true;assert.equal(g.flushProgress(),true);near(saved.brains,10);assert.equal(g.state.saveFailed,false);rows.push({failure,attempts});}return rows;
});
fs.writeFileSync(new URL('../qa/learning/audit-results.json',import.meta.url),JSON.stringify(results,null,2));
console.log(`${results.filter(x=>x.status==='PASS').length}/${results.length} groups passed`);if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
