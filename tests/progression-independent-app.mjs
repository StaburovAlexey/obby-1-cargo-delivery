import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { createAppDom } from '../tests/fixtures/app-dom.mjs';
import { freshCareer } from '../dist/career-save.js';
import { ECONOMY_CONFIG, VEHICLE_CONFIG } from '../dist/economy-config.js';
import { SCHOOL_CONFIG, SKIN_CONFIG } from '../dist/progression-config.js';
import { CLASSROOM_ENTRIES, CLASSROOM_DESKS } from '../dist/garage-scene.js';
import { UPGRADE_STATS, getUpgradeOffer } from '../dist/vehicle-upgrades.js';
const results=[];
const near=(a,b,tol=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tol,`${a} != ${b} within ${tol}`);
const check=(name,fn)=>{const apps=[];try{const details=fn(options=>{const app=createAppDom(options);apps.push(app);return app;});results.push({name,status:'PASS',details});console.log('PASS',name,JSON.stringify(details??''));}catch(e){results.push({name,status:'FAIL',error:e.stack});console.log('FAIL',name,e.message);}finally{for(const app of apps)app.dispose();}};
const advance=(app,n=1)=>{for(let i=0;i<n;i++)app.frame();};
const key=(app,key,extra={})=>app.win.dispatch('keydown',{key,code:key,target:app.doc.body,...extra});
const click=(app,id)=>app.ids.get(id).dispatch('click');
const pose=m=>Object.fromEntries(['x','z','heading','velocityX','velocityZ','angularVelocity'].map(k=>[k,m.state[k]]));
const allCareer=(extras={})=>({...freshCareer(),money:100000,brains:10000,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),ownedSchoolIds:SCHOOL_CONFIG.map(s=>s.id),...extras});
const sit=(app,id='school-1')=>{const g=app.debug.gameplay,e=CLASSROOM_ENTRIES.find(x=>x.id===id);g.state.player={x:e.x,z:e.z,heading:0};g.state.interactionCooldown=0;assert.ok(g.sitAtSchool(id));app.frame();};
check('fresh app never grants money automatically; explicit doubleclick grants exactly remaining fleet deficit once across reload',make=>{
 const app=make({startDriving:false}),s=app.debug.gameplay.state;advance(app,120);assert.equal(s.money,0);assert.equal(s.brains,0);assert.equal(s.vehicleGrantClaimed,false);assert.equal(app.ids.get('vehicle-funds-button').hidden,false);
 click(app,'vehicle-funds-button');click(app,'vehicle-funds-button');const total=VEHICLE_CONFIG.reduce((n,v)=>n+v.price,0);assert.equal(s.money,total);assert.equal(s.vehicleGrantClaimed,true);assert.equal(app.ids.get('vehicle-funds-button').hidden,true);
 const re=make({startDriving:false,storage:app.storage});advance(re,120);assert.equal(re.debug.gameplay.state.money,total);click(re,'vehicle-funds-button');assert.equal(re.debug.gameplay.state.money,total);return {granted:total};
});
check('actual app does not pay movement on idle, menu pauses, hidden, blur, overview, teleports or stale key input',make=>{
 const app=make(),d=app.debug,g=d.gameplay;advance(app,60);assert.equal(g.state.brains,0);d.model.setInput({active:true});advance(app,120);assert.ok(g.state.brains>1.8);
 const before=g.state.brains;click(app,'upgrade-button');const p=pose(d.model);app.pointer(app.wheel,'pointerdown',0,1);key(app,'ArrowUp');advance(app,120);assert.deepEqual(pose(d.model),p);near(g.state.brains,before);assert.equal(d.input.state.active,false);assert.equal(d.lookInput.active,false);
 click(app,'upgrade-close');advance(app,30);near(g.state.brains,before);d.model.setInput({active:true});advance(app,30);
 for(const condition of ['hidden','blur','overview','teleport']){
  if(condition==='hidden'){app.doc.hidden=true;app.doc.dispatch('visibilitychange');}
  if(condition==='blur')app.win.dispatch('blur');
  if(condition==='overview')d.setDriving(false);
  if(condition==='teleport'){d.setBiomeMenu(true);assert.ok(d.travelToBiome('volcanic'));}
  const b=g.state.brains;advance(app,120);near(g.state.brains,b);if(condition==='hidden'){app.doc.hidden=false;app.doc.dispatch('visibilitychange');}if(condition==='blur')app.win.dispatch('focus');if(condition==='overview')d.setDriving(true);
 }return {movingEarned:before};
});
check('actual app rejects visible long-frame stalls for seated study and driving',make=>{
 const seated=make({startDriving:false});sit(seated);seated.frame(2000);const sb=seated.debug.gameplay.state.brains;seated.frame(3602000);near(seated.debug.gameplay.state.brains,sb);
 const app=make(),d=app.debug;d.model.setInput({active:true});advance(app,120);const before=d.gameplay.state.brains;app.frame(3600000);near(d.gameplay.state.brains,before);
});
check('study in actual app uses all five rates and never earns hidden, blurred, overview or after standing',make=>{
 const app=make({startDriving:false,career:allCareer()}),d=app.debug,g=d.gameplay;
 for(const school of SCHOOL_CONFIG){sit(app,school.id);assert.equal(g.state.seatedId,'desk-01');assert.equal(g.state.seatedSchoolId,school.id);const money=g.state.money,before=g.state.brains;advance(app,120);near(g.state.brains-before,school.rate*2,1e-7);assert.equal(app.ids.get('study-status').hidden,false);
  for(const kind of ['blur','hidden','overview']){if(kind==='blur')app.win.dispatch('blur');if(kind==='hidden'){app.doc.hidden=true;app.doc.dispatch('visibilitychange');}if(kind==='overview')d.setDriving(false);const b=g.state.brains;advance(app,120);near(g.state.brains,b);if(kind==='blur')app.win.dispatch('focus');if(kind==='hidden'){app.doc.hidden=false;app.doc.dispatch('visibilitychange');}if(kind==='overview')d.setDriving(true);app.frame();assert.equal(g.state.seatedId,'desk-01');assert.equal(g.state.seatedSchoolId,school.id);assert.equal(g.state.money,money);}
  click(app,'stand-up');const b=g.state.brains;advance(app,120);near(g.state.brains,b);assert.equal(app.ids.get('study-status').hidden,true);assert.equal(g.state.seatedId,null);assert.equal(g.state.seatedSchoolId,null);assert.equal(g.state.money,money);
 }return {schools:5};
});
check('all five selected entrance rates remain exact at 15 FPS through high-refresh rendering',make=>{
 const rows=[];
 for(const fps of [15,20,30,60,120,144]){
  const app=make({startDriving:false,career:allCareer({brains:0})}),g=app.debug.gameplay;let time=2000;app.frame(time);
  for(const school of SCHOOL_CONFIG){
   const entry=CLASSROOM_ENTRIES.find(e=>e.id===school.id);g.state.player={x:entry.x,z:entry.z,heading:0};assert.ok(g.sitAtSchool(school.id));
   const before=g.state.brains,money=g.state.money;for(let i=0;i<10*fps;i++)app.frame(time+=1000/fps);
   near(g.state.brains-before,school.rate*10,1e-7);assert.equal(g.state.money,money);assert.equal(g.state.seatedSchoolId,school.id);assert.equal(g.state.seatedId,'desk-01');
   rows.push({fps,school:school.id,earned:g.state.brains-before});click(app,'stand-up');
  }
 }
 return {cases:rows.length,school5At15Fps:rows.find(row=>row.fps===15&&row.school==='school-5').earned};
});
check('all skin proximity buttons enforce ownership and doubleclick never duplicates spend; selected skin survives reload',make=>{
 const app=make({startDriving:false,career:allCareer()}),d=app.debug,g=d.gameplay;let total=0;
 for(let index=1;index<SKIN_CONFIG.length;index++){
  const skin=SKIN_CONFIG[index],stand=d.garage.stands[index];assert.equal(d.selectCharacter(skin.id) instanceof Promise,true);assert.equal(g.state.characterId,'bacon');
  g.state.player={...stand.trigger,heading:0};g.state.skinPurchaseCandidateId=skin.id;app.frame();assert.equal(app.ids.get('buy-skin').hidden,false);
  const before=g.state.money;click(app,'buy-skin');click(app,'buy-skin');assert.equal(g.state.money,before-skin.price);total+=skin.price;assert.equal(g.state.characterId,skin.id);assert.equal(d.character.id,skin.id);assert.ok(g.isSkinOwned(skin.id));
  assert.equal(g.setCharacter('bacon'),true);d.selectCharacter('bacon');
 }
 d.selectCharacter(SKIN_CONFIG.at(-1).id);const re=make({startDriving:false,storage:app.storage});assert.equal(re.debug.gameplay.state.characterId,SKIN_CONFIG.at(-1).id);assert.equal(re.debug.gameplay.state.ownedSkinIds.length,17);return {spent:total};
});
check('school purchase then sit uses distinct actions and preserves money/seat when clicked again',make=>{
 const app=make({startDriving:false,career:allCareer({ownedSchoolIds:['school-1']})}),g=app.debug.gameplay;
 for(const s of SCHOOL_CONFIG.slice(1)){const e=CLASSROOM_ENTRIES.find(e=>e.id===s.id);g.state.player={x:e.x,z:e.z,heading:0};g.state.schoolPurchaseCandidateId=s.id;app.frame();const money=g.state.money;click(app,'buy-school');assert.equal(g.state.seatedId,null);assert.equal(g.state.money,money-s.price);assert.equal(app.ids.get('buy-school-label').textContent.includes('Сесть'),true);click(app,'buy-school');const seat=g.state.seatedId;assert.equal(seat,'desk-01');assert.equal(g.state.seatedSchoolId,s.id);click(app,'buy-school');assert.equal(g.state.seatedId,seat);assert.equal(g.state.money,money-s.price);click(app,'stand-up');}
});
check('upgrade modal refreshes actual selected-car offer, maxes only paid levels and saves without resetting fuel or pose',make=>{
 const app=make({career:allCareer()}),d=app.debug,g=d.gameplay;g.state.fuels.pickup=36.25;d.model.setInput({active:true,steering:.7});advance(app,20);click(app,'upgrade-button');const p=pose(d.model),fuel=g.state.fuels.pickup,money=g.state.money,brains=g.state.brains;let spent=0;
 assert.equal(app.ids.get('upgrade-menu').hidden,false);assert.equal(d.upgradeMenuOpen,true);
 for(const stat of UPGRADE_STATS){for(let level=0;level<3;level++){const offer=getUpgradeOffer('pickup',stat.id,g.state.upgrades.pickup);assert.equal(app.ids.get('upgrade-'+stat.id+'-price').textContent,String(offer.price));spent+=offer.price;click(app,'upgrade-'+stat.id+'-buy');assert.equal(g.state.upgrades.pickup[stat.id],level+1);}assert.equal(app.ids.get('upgrade-'+stat.id+'-buy').disabled,true);click(app,'upgrade-'+stat.id+'-buy');assert.equal(g.state.upgrades.pickup[stat.id],3);}
 assert.equal(g.state.money,money);near(g.state.fuels.pickup,fuel);assert.deepEqual(pose(d.model),p);near(g.state.brains,brains-spent);
 const re=make({startDriving:false,storage:app.storage});assert.deepEqual(re.debug.gameplay.state.upgrades,g.state.upgrades);near(re.debug.gameplay.state.brains,g.state.brains,1e-6);return {spent};
});
check('upgrade modal repeated Escape/close/backdrop/tab and biome swaps remain isolated at five viewport sizes',make=>{
 for(const [width,height]of [[320,480],[390,844],[568,320],[844,390],[1366,768]]){
 const app=make({width,height,career:allCareer()}),d=app.debug;for(let repeat=0;repeat<3;repeat++){
 click(app,'upgrade-button');const p=pose(d.model),balance=d.gameplay.state.brains;for(const id of ['upgrade-button','upgrade-menu','upgrade-close','upgrade-speed-buy'])for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchmove'])assert.equal(app.ids.get(id).dispatch(type,{pointerId:2}).stopped,true);
 key(app,'Tab');assert.ok([...UPGRADE_STATS.map(s=>'upgrade-'+s.id+'-buy'),'upgrade-close'].includes(app.doc.activeElement?.id));advance(app,30);near(d.gameplay.state.brains,balance);assert.deepEqual(pose(d.model),p);key(app,'Escape');assert.equal(d.upgradeMenuOpen,false);
 click(app,'upgrade-button');click(app,'upgrade-menu');assert.equal(d.upgradeMenuOpen,false);click(app,'upgrade-button');click(app,'biome-button');assert.equal(d.upgradeMenuOpen,false);assert.equal(d.biomeMenuOpen,true);click(app,'upgrade-button');assert.equal(d.upgradeMenuOpen,true);assert.equal(d.biomeMenuOpen,false);click(app,'upgrade-close');
 }assert.equal(d.upgradeMenuOpen,false);}
 return {viewportCases:5,repeatedFlows:15};
});
check('all five shared-seat study rates and career data survive garage, fuel-empty, rebuild and reload without replay',make=>{
 const app=make({startDriving:false,career:allCareer({brains:12.345})});
 for(const [index,school] of SCHOOL_CONFIG.entries())for(const reset of ['garage','fuel-empty','rebuild']){
  const g=app.debug.gameplay;g.setOccupiedSeatIds(CLASSROOM_DESKS.filter(desk=>desk.column===index+1).map(desk=>desk.id));
  const expectedDesk=CLASSROOM_DESKS.find(desk=>desk.column!==index+1);sit(app,school.id);assert.equal(g.state.seatedId,expectedDesk.id);assert.equal(g.state.seatedSchoolId,school.id);
  const before=g.state.brains,money=g.state.money;advance(app,120);near(g.state.brains-before,school.rate*2,1e-7);assert.equal(g.state.money,money);
  const expected=g.snapshot();
  if(reset==='garage')app.debug.returnToGarage();
  if(reset==='fuel-empty'){click(app,'stand-up');g.state.cooldown=0;app.debug.enterVehicle('pickup');g.state.fuels.pickup=.001;g.drive(1,0,-40);app.frame();}
  if(reset==='rebuild')app.debug.rebuild(876+index);
  const current=app.debug.gameplay;assert.equal(current.state.mode,'walking');assert.equal(current.state.seatedId,null);assert.equal(current.state.seatedSchoolId,null);assert.deepEqual(current.snapshot(),expected);
  advance(app,120);assert.deepEqual(current.snapshot(),expected);assert.equal(app.ids.get('study-status').hidden,true);
  app.win.dispatch('pagehide');const re=make({startDriving:false,storage:app.storage});assert.deepEqual(re.debug.gameplay.snapshot(),expected);assert.equal(re.debug.gameplay.state.seatedId,null);assert.equal(re.debug.gameplay.state.seatedSchoolId,null);advance(re,120);assert.deepEqual(re.debug.gameplay.snapshot(),expected);app.win.dispatch('focus');
 }
 return {entrances:5,resetCases:15};
});
check('actual app pays steady motion equally at standard and high-refresh rates',make=>{
 const rows=[];for(const fps of [30,60,90,120,144,165,240]){const app=make(),d=app.debug;let time=2000;app.frame(time);d.model.setInput({active:true});for(let i=0;i<3*fps;i++)app.frame(time+=1000/fps);const before=d.gameplay.state.brains;for(let i=0;i<10*fps;i++)app.frame(time+=1000/fps);const earned=d.gameplay.state.brains-before;near(earned,10,1e-7);rows.push({fps,earned});}return rows;
});
check('zero-brain modal moves keyboard focus inside even when every purchase button is disabled',make=>{
 const app=make();for(const element of app.ids.values())element.focus=()=>{if(!element.disabled)app.doc.activeElement=element;};app.ids.get('upgrade-button').focus();click(app,'upgrade-button');assert.equal(app.debug.upgradeMenuOpen,true);assert.equal(app.doc.activeElement?.id,'upgrade-close');key(app,'Tab');assert.equal(app.doc.activeElement?.id,'upgrade-close');key(app,'Escape');assert.equal(app.doc.activeElement?.id,'upgrade-button');
});
check('five floating school labels keep exact rates, paid lock/price, affordability and owned-state updates',make=>{
 const app=make({startDriving:false}),g=app.debug.gameplay;app.frame();const expectedRates=['1,5','2','3','4,5','6'];
 for(let i=0;i<5;i++){assert.equal(app.ids.get('school-rate-'+(i+1)).textContent,expectedRates[i]);assert.equal(app.ids.get('school-lock-'+(i+1)).hidden,i===0);assert.equal(app.ids.get('school-dollar-'+(i+1)).hidden,i===0);assert.equal(app.ids.get('school-price-'+(i+1)).textContent,i===0?'':String(SCHOOL_CONFIG[i].price));assert.equal(app.ids.get('school-access-'+(i+1)).dataset.affordable,String(i===0));assert.equal(app.ids.get('school-access-'+(i+1)).hidden,i===0);}
 click(app,'vehicle-funds-button');app.frame();for(let i=1;i<5;i++){const e=CLASSROOM_ENTRIES[i];assert.equal(app.ids.get('school-access-'+(i+1)).dataset.affordable,'true');g.state.player={x:e.x,z:e.z,heading:0};g.state.schoolPurchaseCandidateId=e.id;app.frame();click(app,'buy-school');app.frame();assert.equal(app.ids.get('school-price-'+(i+1)).textContent,'');assert.equal(app.ids.get('school-access-'+(i+1)).hidden,true);assert.equal(app.ids.get('school-lock-'+(i+1)).hidden,true);assert.equal(app.ids.get('school-dollar-'+(i+1)).hidden,true);}
 g.state.cooldown=0;app.debug.enterVehicle('pickup');app.frame();for(let i=1;i<=5;i++)assert.equal(app.ids.get('school-label-'+i).hidden,true);
});
check('actual Three.js school projections retain viewport-fixed scale and exact world anchors across varied camera angles',make=>{
 let frames=0,visibleLabels=0,overlapPairs=0;
 for(const[width,height]of [[320,480],[390,844],[568,320],[844,390],[1366,768]]){
  const app=make({width,height,startDriving:false}),d=app.debug;
  for(const x of [-51,-41,-31,-15,0])for(const z of [65,72,82])for(const heading of [-1.2,-.6,0,.6,1.2]){
   d.gameplay.state.player={x,z,heading};d.followCharacter(0,true);app.frame();frames++;
   const labels=[];
   for(let i=0;i<5;i++){
    const el=app.ids.get('school-label-'+(i+1));if(el.hidden)continue;
    const a=d.garage.classroomEntries[i].labelAnchor,q=new THREE.Vector3(a.x,a.y-.4,a.z).project(d.camera),scale=Number(el.style.getPropertyValue('--school-scale'));
    near(scale,Math.max(.5,Math.min(1,(width-40)/600)));near(parseFloat(el.style.left),(q.x*.5+.5)*width);near(parseFloat(el.style.top),(-q.y*.5+.5)*height);
    labels.push({x:parseFloat(el.style.left),scale,depth:q.z,z:Number(el.style.zIndex)});
   }
   visibleLabels+=labels.length;labels.sort((a,b)=>a.depth-b.depth);
   for(let i=1;i<labels.length;i++)if(labels[i].depth>labels[i-1].depth)assert.ok(labels[i-1].z>labels[i].z,'Nearer school must cover farther school');
   for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)if(Math.abs(labels[i].x-labels[j].x)<60*(labels[i].scale+labels[j].scale))overlapPairs++;
  }
 }
 assert.ok(overlapPairs>0,'Side angles must permit natural overlap');return {projectionFrames:frames,visibleLabels,overlapPairs,scope:'Actual projection/stacking math; no browser layout assertion'};
});
fs.writeFileSync(new URL('../qa/learning/app-audit-results.json',import.meta.url),JSON.stringify(results,null,2));console.log(`${results.filter(x=>x.status==='PASS').length}/${results.length} groups passed. Node actual Three.js + mock DOM only.`);if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
