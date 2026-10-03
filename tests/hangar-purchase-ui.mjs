import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {SCHOOL_CONFIG,SKIN_CONFIG} from '../dist/progression-config.js';
import {updateProgressionHud} from '../dist/progression-hud.js';
const css=fs.readFileSync(new URL('../dist/progression-ui.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
let labels=0;
for(const kind of ['vehicle','skin','school']){
 const f=createAppDom({startDriving:false,career:{...freshCareer(),money:500000}}),d=f.debug,g=d.gameplay;
 try{
  d.returnToGarage();const specs=kind==='vehicle'?VEHICLE_CONFIG:kind==='skin'?SKIN_CONFIG:SCHOOL_CONFIG;
  for(let i=1;i<specs.length;i++){
   const spec=specs[i],point=kind==='vehicle'?d.garage.vehicles.find(v=>v.id===spec.id).park:kind==='skin'?d.garage.stands[i].trigger:d.garage.classroomEntries[i];
   Object.assign(g.state.player,{x:point.x,z:point.z,heading:0});g.state.cooldown=0;g.state.interactionCooldown=0;
   const key=kind==='vehicle'?'purchaseCandidateId':kind+'PurchaseCandidateId';g.state[key]=spec.id;
   const label=f.ids.get(kind==='vehicle'?'buy-label':'buy-'+kind+'-label');
   for(let frame=0;frame<3;frame++){f.frame();assert.equal(label.textContent,`Купить ${spec.price}`,kind+'/'+spec.id);labels++;}
   const button=f.ids.get('buy-'+kind);assert.equal(button.hidden,false);assert.match(button.getAttribute('aria-label'),new RegExp(String(spec.price)));
   const before=g.state.money;g.state.money=0;f.frame();assert.equal(label.textContent,`Купить ${spec.price}`);button.dispatch('click');assert.equal(g.state.money,0);assert.equal(kind==='vehicle'?g.isOwned(spec.id):kind==='skin'?g.isSkinOwned(spec.id):g.isSchoolOwned(spec.id),false);g.state.money=before;
  }
  const spec=specs[1],point=kind==='vehicle'?d.garage.vehicles.find(v=>v.id===spec.id).park:kind==='skin'?d.garage.stands[1].trigger:d.garage.classroomEntries[1];Object.assign(g.state.player,{x:point.x,z:point.z,heading:0});g.state.cooldown=0;g.state.interactionCooldown=0;g.state[kind==='vehicle'?'purchaseCandidateId':kind+'PurchaseCandidateId']=spec.id;f.frame();
  const before=g.state.money;f.ids.get('buy-'+kind).dispatch('click');assert.equal(g.state.money,before-spec.price);assert(kind==='vehicle'?g.isOwned(spec.id):kind==='skin'?g.isSkinOwned(spec.id):g.isSchoolOwned(spec.id));
 }finally{f.dispose()}
}
const ownedFixture=createAppDom({startDriving:false,career:{...freshCareer(),money:500000}});
try{
 const g=ownedFixture.debug.gameplay;ownedFixture.debug.returnToGarage();
 for(const skin of SKIN_CONFIG){
  if(!g.isSkinOwned(skin.id))g.state.ownedSkinIds.push(skin.id);
  g.state.skinPurchaseCandidateId=skin.id;
  for(let frame=0;frame<3;frame++){
   updateProgressionHud(ownedFixture.doc,{gameplay:g,playing:true,driving:false,upgradeMenuOpen:false});
   assert.equal(ownedFixture.ids.get('buy-skin-label').textContent,'Выбрать');
   assert.equal(ownedFixture.ids.get('buy-skin').dataset.owned,'true');
   assert.equal(ownedFixture.ids.get('buy-skin').getAttribute('aria-label'),'Выбрать');
  }
 }
}finally{ownedFixture.dispose()}
assert.match(css,/#buy-skin\[data-owned="true"\] \.hud-art\{display:none\}/);
assert.match(html,/<div id="loading" role="status">\s*<div class="spinner"><\/div>\s*<strong>Загрузка мира и сервера<\/strong>\s*<\/div>/);
assert.match(css,/\.is-walking \.top-actions\{[^}]*flex-direction:column/);
assert.match(css,/\.is-walking \.top-actions \.hud-menu-button\{[^}]*height:var\(--top-icon-size\)/);
assert.match(css,/@media\(max-height:420px\)\{\s*\.is-walking \.top-actions/);
assert.match(css,/\.is-driving \.top-actions[^}]*gap:6px/);
const viewports=[[320,568],[390,844],[844,390],[568,320],[1440,900]];
for(const [w,h] of viewports)for(const safe of [0,20]){
 const size=h<=420?Math.max(28,Math.min(44,(h-180-2*safe)/4)):w<=600?44:w<=760?65:82;
 const gap=h<=420?4:6,top=Math.max(w<=760?9:15,safe+8),columnBottom=top+4*size+3*gap;
 const stickSize=h<=420&&w>501?112:w<=480?132:142;
 const stickBottom=h<=420&&w>501?Math.max(23,safe+10):Math.max(45,safe+28);
 assert(columnBottom<h-stickBottom-stickSize,`${w}x${h} inset${safe}: column${columnBottom} vs joystick${h-stickBottom-stickSize}`);
}
for(const id of ['buy-skin-label','buy-school-label'])assert.match(html,new RegExp(`id="${id}">Купить<`));
console.log(JSON.stringify({passed:true,labels,flows:3,viewports:viewports.length,safeInsets:[0,20],scope:'Actual application handlers and structural CSS arithmetic, not browser layout/GPU'}));
