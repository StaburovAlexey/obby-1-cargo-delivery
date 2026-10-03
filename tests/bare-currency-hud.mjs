import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Vector3} from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {VEHICLE_CONFIG,vehicleConfig} from '../dist/economy-config.js';
import {SKIN_CONFIG} from '../dist/progression-config.js';

const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../dist/style.css', import.meta.url), 'utf8');
const progressionCss = fs.readFileSync(new URL('../dist/progression-ui.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
let passed = 0;
const test = (name, check) => { check(); passed++; console.log('PASS ' + name); };
const div = id => {
  const result = html.match(new RegExp(`<div\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/div>`));
  assert.ok(result, id);
  return result[1];
};
const bareMoney = (content, amountId, initial='0') => {
  assert.match(content, new RegExp(`^\\s*<svg\\b[^>]*aria-hidden="true"[^>]*>\\s*<use href="#hud-money"\\s*\\/>\\s*<\\/svg>\\s*<strong id="${amountId}">${initial}<\\/strong>\\s*$`));
};
const rule = (selector,source=css) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const result = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(result, selector);
  return result[1];
};

test('Wallet and all eight delivery labels contain exactly the money icon and amount', () => {
  bareMoney(div('wallet-hud'), 'wallet-value');
  for (let i = 1; i <= 11; i++) bareMoney(div(`delivery-label-${i}`), `delivery-value-${i}`);
  assert.doesNotMatch(html, /ВЫГРУЗКА/);
});

test('Every unpaid car label contains only its currency icon and price',()=>{
  for(let i=1;i<=VEHICLE_CONFIG.length;i++)bareMoney(div(`vehicle-price-${i}`),`vehicle-price-value-${i}`);
  assert.doesNotMatch(html,/id="vehicle-spec-\d+"/);
  assert.doesNotMatch(app,/vehicle-spec-|textContent=owned\?'КУПЛЕНО'/);
  for(const property of ['padding','border','border-radius'])assert.match(rule('.vehicle-price'),new RegExp(`${property}:\\s*0(?:;|$)`));
  assert.match(rule('.vehicle-price'),/background:\s*transparent/);
  assert.match(rule('.vehicle-price'),/box-shadow:\s*none/);
});

test('Every unpaid skin label contains only its currency icon and price, without an owned caption',()=>{
  for(let i=1;i<=SKIN_CONFIG.length;i++)bareMoney(div(`skin-label-${i}`),`skin-price-${i}`,'');
  const declarations=body=>Object.fromEntries(body.split(';').filter(s=>s.trim()).map(s=>s.split(':').map(x=>x.trim())));
  assert.deepEqual(declarations(rule('.skin-price',progressionCss)),declarations(rule('.vehicle-price')),'Skin and car labels have identical transparent styling');
  assert.deepEqual(declarations(rule('.skin-price .hud-art',progressionCss)),declarations(rule('.world-price .hud-art')),'Skin and car icons use the same size');
  assert.doesNotMatch(progressionCss,/\.skin-price strong\s*\{/,'Skin amounts inherit the same world-price text size as cars');
});

test('A purchased skin label disappears immediately, stays hidden after projection and survives reload',()=>{
  const f=createAppDom({startDriving:false,career:{...freshCareer(),money:1000}});
  let reloaded;
  try{
    const g=f.debug.gameplay,stand=f.debug.garage.stands[1],skin=SKIN_CONFIG[1];
    Object.assign(g.state.player,{x:stand.trigger.x,z:stand.trigger.z,heading:0});
    Object.assign(g.state,{cooldown:0,interactionCooldown:0,walked:0,skinPurchaseCandidateId:skin.id});
    f.debug.followCharacter(1,true);f.frame();
    const label=f.ids.get('skin-label-2');
    assert.equal(label.hidden,false);assert.equal(f.ids.get('skin-price-2').textContent,String(skin.price));
    assert.equal(f.ids.get('skin-label-1').hidden,true,'The free Bacon skin never has a world price');
    f.ids.get('buy-skin').dispatch('click');
    assert.ok(g.isSkinOwned(skin.id));assert.equal(g.state.money,1000-skin.price);assert.equal(label.hidden,true);
    assert.equal(g.state.characterId,'bacon','Purchasing does not skip the explicit Select action');
    f.frame();assert.equal(label.hidden,true);assert.equal(f.ids.get('skin-price-2').textContent,String(skin.price));
    f.ids.get('buy-skin').dispatch('click');f.frame();
    assert.equal(g.state.money,1000-skin.price);assert.equal(g.state.characterId,skin.id);assert.equal(label.hidden,true);
    reloaded=createAppDom({startDriving:false,storage:f.storage});reloaded.frame();
    assert.ok(reloaded.debug.gameplay.isSkinOwned(skin.id));
    for(const id of ['skin-label-1','skin-label-2'])assert.equal(reloaded.ids.get(id).hidden,true);
    assert.equal(reloaded.debug.gameplay.state.money,1000-skin.price);
  }finally{reloaded?.dispose();f.dispose();}
});

test('Restored ownership suppresses all seventeen skin prices through walking, driving and garage reset',()=>{
  const f=createAppDom({startDriving:false,career:{...freshCareer(),ownedSkinIds:SKIN_CONFIG.map(s=>s.id)}});
  try{
    const hidden=()=>{for(let i=1;i<=SKIN_CONFIG.length;i++){assert.equal(f.ids.get(`skin-label-${i}`).hidden,true);assert.equal(f.ids.get(`skin-price-${i}`).textContent,String(SKIN_CONFIG[i-1].price));}};
    f.frame();hidden();f.debug.gameplay.state.cooldown=0;assert.ok(f.debug.enterVehicle('pickup'));
    f.frame();hidden();f.debug.returnToGarage();f.frame();hidden();
  }finally{f.dispose();}
});

test('A purchased car label disappears immediately and stays hidden through the next projection',()=>{
  const f=createAppDom({startDriving:false,career:{...freshCareer(),money:2000}});
  try{
    const g=f.debug.gameplay,v=f.debug.garage.vehicles.find(v=>v.id==='rover');
    Object.assign(g.state.player,{x:v.park.x-4.8,z:v.park.z,heading:Math.PI/2});
    Object.assign(g.state,{cooldown:0,interactionCooldown:0,walked:0});
    f.debug.followCharacter(1,true);f.frame();
    const label=f.ids.get('vehicle-price-2');
    assert.equal(label.hidden,false);assert.equal(f.ids.get('vehicle-price-value-2').textContent,String(vehicleConfig('rover').price));
    assert.equal(f.ids.get('vehicle-price-1').hidden,true);
    const projected=new Vector3(v.priceAnchor.x,v.priceAnchor.y-.4,v.priceAnchor.z).project(f.debug.camera);
    assert.ok(Math.abs(parseFloat(label.style.top)-(-projected.y*.5+.5)*844)<1e-7,'Car label anchor is lowered by 0.4 metres');
    f.ids.get('buy-vehicle').dispatch('click');
    assert.equal(g.isOwned('rover'),true);assert.equal(g.state.money,800);assert.equal(label.hidden,true);
    f.frame();assert.equal(label.hidden,true);
    assert.doesNotMatch(f.ids.get('vehicle-price-value-2').textContent,/КУПЛЕНО|ОТКРЫТО/);
    f.ids.get('buy-vehicle').dispatch('click');f.frame();
    assert.equal(g.state.money,800);assert.equal(label.hidden,true);
  }finally{f.dispose();}
});

test('Restored ownership suppresses all ten car labels in walking and driving modes',()=>{
  const f=createAppDom({startDriving:false,career:{...freshCareer(),ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)}});
  try{
    const hidden=()=>{for(let i=1;i<=VEHICLE_CONFIG.length;i++)assert.equal(f.ids.get(`vehicle-price-${i}`).hidden,true);};
    hidden();f.frame();hidden();
    f.debug.gameplay.state.cooldown=0;assert.ok(f.debug.enterVehicle('pickup'));
    f.frame();hidden();f.debug.returnToGarage();f.frame();hidden();
  }finally{f.dispose();}
});

test('Wallet and delivery currency have no card, padding, border, or box shadow', () => {
  for (const selector of ['#wallet-hud', '.delivery-price']) {
    const body = rule(selector);
    for (const property of ['padding: 0;', 'border: 0;', 'border-radius: 0;', 'background: transparent;', 'box-shadow: none;']) {
      assert.ok(body.includes(property), `${selector}: ${property}`);
    }
  }
  assert.ok(css.indexOf('.delivery-price {') > css.indexOf('.world-price {'), 'Delivery overrides shared vehicle-price card styles');
  assert.match(rule('.world-price'), /pointer-events: none/);
  assert.match(rule('#wallet-hud'), /pointer-events: none/);
});

test('Wallet icon and top-left circles share the same responsive height', () => {
  for(const selector of ['#wallet-hud .hud-art','.hud-circle']){
    assert.match(rule(selector), /width: var\(--top-icon-size\)/);
    assert.match(rule(selector), /height: var\(--top-icon-size\)/);
  }
  assert.match(css,/--top-icon-size: 82px/);assert.match(css,/--top-icon-size: 65px/);
  assert.match(css,/--top-icon-size: 56px/);assert.match(css,/--top-icon-size: 48px/);
  assert.match(css,/--top-icon-size: 52px/);assert.match(css,/--top-icon-size: 44px/);
  assert.ok(html.indexOf('id="wallet-hud"')<html.indexOf('</header>'));
});

test('Save failure remains functional in a separate initially hidden element', () => {
  assert.doesNotMatch(div('wallet-hud'), /save-notice/);
  assert.match(html, /<\/strong><\/div>\s*<\/header>/);
  assert.ok(html.indexOf('id="save-notice"')>html.indexOf('</header>'));
  assert.match(html, /<small id="save-notice" hidden>Не сохранено<\/small>/);
  assert.equal([...html.matchAll(/id="save-notice"/g)].length, 1);
  assert.match(rule('#save-notice'), /position: fixed;/);
  assert.match(app, /warning\.hidden=!state\.saveFailed/);
  assert.match(app, /document\.getElementById\('wallet-value'\)\.textContent=String\(state\.money\)/);
});

test('Full balances scale in the remaining safe header width without abbreviation', () => {
  assert.match(app, /style\.setProperty\('--wallet-digits',String\(String\(state\.money\)\.length\)\)/);
  assert.match(rule('#wallet-value'),/100cqw/);assert.match(rule('#wallet-value'),/var\(--wallet-digits, 1\)/);
  assert.match(css, /\.topbar \{ container-type: inline-size; \}/);
  assert.match(css,/--top-actions-width: 102px/);
  assert.match(rule('.topbar'),/env\(safe-area-inset-right\)/);
  let checked=0;
  for(const [w,h] of [[320,568],[360,740],[390,844],[430,932],[568,320],[844,390],[960,720],[1440,900]])for(const safe of[0,20])for(const digits of[1,4,7,10]){
    const margin=w<=760?Math.max(13,safe+8):Math.max(20,safe+12),cw=w-margin*2;
    let icon=w<=760?65:82,buttons=w<=760?149:185;
    if(h<=500&&w>=501){icon=56;buttons=130;}if(h<=420&&w>=501){icon=48;buttons=130;}
    if(w<=360){icon=52;buttons=120;}if(cw<=260){icon=44;buttons=102;}
    const gap=w<=360?4:w<=500?5:6;
    const font=Math.min(icon*.56,(cw-buttons-icon-gap-12)/(digits*.68));
    assert.ok(font>=11,`Unusable amount: ${w}x${h},safe${safe},${digits}digits =>${font}`);
    const wallet=icon+gap+font*digits*.68;assert.ok(wallet+buttons+12<=cw+1e-8);
    assert.ok(icon>=44);checked++;
  }
  console.log('Checked '+checked+' static width/digit combinations; actual glyph layout is not browser-tested.');
});

console.log(`Bare currency HUD: ${passed} source-contract and renderer-free app checks passed. No browser, Android, or WebGL layout verification.`);
