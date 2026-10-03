import assert from 'node:assert/strict';
import fs from 'node:fs';
import {VEHICLE_CONFIG,vehicleConfig} from '../dist/economy-config.js';
import {getVehiclePerformance,UPGRADE_MAX_LEVEL} from '../dist/vehicle-upgrades.js';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {createLocalization} from '../dist/localization.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
import {createAppDom} from './fixtures/app-dom.mjs';

const appSource=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const start=appSource.indexOf('function updateFuelHud(){'),end=appSource.indexOf('\nfunction updateEconomyHud()',start);
assert.ok(start>=0&&end>start);
const updateSource=appSource.slice(start,end);
let count=0;
const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
const integer=n=>n>0?Math.max(1,Math.ceil(Number(n.toFixed(7)))):0;

function fuelFixture(){
 const {root,doc}=createInputDom(),Element=root.constructor,ids=new Map();doc.body=root;
 for(const id of ['fuel-meter','fuel-fill','fuel-value','fuel-current','fuel-capacity']){
  const node=new Element();node.id=id;node.textContent='';ids.set(id,node);root.append(node);
 }
 doc.getElementById=id=>ids.get(id);const meter=ids.get('fuel-meter');meter.setAttribute('aria-label','Запас топлива');
 const gameplay=createGameplay({vehicles:VEHICLE_CONFIG.map(v=>({id:v.id,park:{x:0,z:0,heading:0}})),career:{...freshCareer(),money:1234,brains:5678,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)}});
 const update=new Function('gameplay','getVehiclePerformance','vehicleConfig','document',`${updateSource};return updateFuelHud;`)(gameplay,getVehiclePerformance,vehicleConfig,doc);
 return{gameplay,update,ids,root,localization:createLocalization(doc)};
}

check('All 121 stock/upgraded tanks show integer current/max in RU and EN without mutating fuel or career',()=>{
 const f=fuelFixture();let cases=0,fractional=0;
 try{
  for(const language of ['ru','en']){
   f.localization.setLanguage(language);
   for(const vehicle of VEHICLE_CONFIG)for(let level=0;level<=UPGRADE_MAX_LEVEL;level++){
    const state=f.gameplay.state,id=vehicle.id;state.selectedId=id;state.upgrades[id].fuel=level;
    const capacity=getVehiclePerformance(id,state.upgrades[id]).capacity,max=integer(capacity),digits=Math.max(3,String(max).length);
    if(Math.abs(capacity-Math.round(capacity))>1e-7)fractional++;
    for(const raw of [capacity,capacity/2,100,99.1,99,10,9,1,.9,.0001,0,-1,capacity+10]){
     state.fuels[id]=raw;const before=structuredClone(state),value=Math.max(0,Math.min(capacity,raw));
     f.update();f.localization.refresh();
     const current=f.ids.get('fuel-current').textContent,maximum=f.ids.get('fuel-capacity').textContent,meter=f.ids.get('fuel-meter'),readout=f.ids.get('fuel-value');
     assert.match(current,/^\d+$/);assert.match(maximum,/^\d+$/);
     assert.equal(current,String(integer(value)));assert.equal(maximum,String(max));
     assert(Number(current)<=Number(maximum));if(value===capacity)assert.equal(current,maximum);if(value>0)assert(Number(current)>0);
     assert.equal(meter.getAttribute('aria-valuetext'),`${current} ${language==='en'?'of':'из'} ${maximum}`);
     assert.equal(meter.getAttribute('aria-valuemax'),String(capacity));assert.equal(meter.getAttribute('aria-valuenow'),String(value));
     assert.equal(f.ids.get('fuel-fill').style.width,`${100*value/capacity}%`);assert.equal(meter.classList.contains('low-fuel'),value<capacity*.2);
     assert.equal(readout.dataset.digits,String(digits));assert.equal(readout.style.getPropertyValue('--fuel-digits'),String(digits));assert.equal(readout.style.getPropertyValue('--fuel-characters'),String(digits*2+1));
     assert.equal(f.root.dataset.fuel,value.toFixed(3));assert.deepEqual(state,before,'HUD must never round gameplay state');cases++;
    }
   }
  }
  assert(fractional>0);console.log(`  ${cases} presentation cases, including ${fractional} fractional capacity/language combinations`);
 }finally{f.localization.dispose();}
});

check('100 → 99 → 9 preserves the same nodes and slot widths; identical integers avoid text rewrites',()=>{
 const f=fuelFixture(),readout=f.ids.get('fuel-value'),current=f.ids.get('fuel-current'),capacity=f.ids.get('fuel-capacity');
 let text='',writes=0;Object.defineProperty(current,'textContent',{get:()=>text,set:value=>{text=value;writes++;}});
 try{
  f.gameplay.state.selectedId='pickup';
  for(const value of [100,99,9,.9,.1]){
   f.gameplay.state.fuels.pickup=value;f.update();
   assert.equal(f.ids.get('fuel-current'),current);assert.equal(f.ids.get('fuel-capacity'),capacity);
   assert.equal(readout.style.getPropertyValue('--fuel-digits'),'3');assert.equal(readout.style.getPropertyValue('--fuel-characters'),'7');
  }
  assert.equal(writes,4,'fractions in the same integer bucket must not rewrite the text node');
  f.gameplay.state.upgrades.pickup.fuel=3;f.gameplay.state.fuels.pickup=getVehiclePerformance('pickup',{fuel:3}).capacity;f.update();
  assert.equal(current.textContent,'109');assert.equal(capacity.textContent,'109','floating-point noise must not add a unit');
 }finally{f.localization.dispose();}
});

check('Real app buy/refill/empty/re-entry and language switching retain fractional accounting',()=>{
 const f=createAppDom({career:{...freshCareer(),money:1234,brains:100000,ownedVehicleIds:['pickup','citycourier']}});
 try{
  const d=f.debug,state=d.gameplay.state;d.returnToGarage();state.cooldown=0;assert(d.enterVehicle('citycourier'));
  state.fuels.citycourier=99.125;const brains=state.brains;assert(d.gameplay.buyUpgrade('fuel'));assert.equal(state.fuels.citycourier,99.125);assert(state.brains<brains);
  f.frame();assert.equal(f.ids.get('fuel-value').textContent,'100/145');assert.equal(state.fuels.citycourier,99.125);
  for(const language of ['en','ru','en','ru']){d.localization.setLanguage(language);f.frame();assert.equal(f.ids.get('fuel-value').textContent,'100/145');d.localization.refresh();assert.equal(f.ids.get('fuel-meter').getAttribute('aria-valuetext'),`100 ${language==='en'?'of':'из'} 145`);}
  const before=state.fuels.citycourier;d.gameplay.drive(1,0,6);assert(Math.abs(state.fuels.citycourier-(before-vehicleConfig('citycourier').consumption))<1e-9);
  const station=d.garage.stations[3];d.gameplay.drive(0,station.x,station.z);f.frame();
  assert.equal(state.fuels.citycourier,getVehiclePerformance('citycourier',{fuel:1}).capacity);assert.equal(f.ids.get('fuel-value').textContent,'145/145');
  state.fuels.citycourier=0;f.frame();assert.equal(state.mode,'walking');assert.equal(f.ids.get('fuel-hud').hidden,true);
  state.cooldown=0;assert(d.enterVehicle('citycourier'));f.frame();assert.equal(f.ids.get('fuel-value').textContent,'145/145');assert.equal(f.ids.get('fuel-hud').hidden,false);
 }finally{f.dispose();}
});

check('Stable grid slots, fixed canister and 3/4-digit text fit narrow portrait/landscape safe areas (static CSS arithmetic)',()=>{
 const css=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8'),controls=fs.readFileSync(new URL('../dist/vehicle-controls.css',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.match(html,/id="fuel-value"><span id="fuel-current">100<\/span><span class="fuel-separator" aria-hidden="true">\/<\/span><span id="fuel-capacity">100<\/span>/);
 assert.match(controls,/#fuel-hud \{ container-type: inline-size; \}/);
 assert.match(controls,/grid-template-columns: calc\(var\(--fuel-digits, 3\) \* 1ch\) 1ch calc\(var\(--fuel-digits, 3\) \* 1ch\)/);
 assert.match(controls,/#fuel-current, #fuel-capacity \{ width: 100%; min-width: 0; text-align: right; \}/);
 assert.match(controls,/font-family: ui-monospace,[^;]+monospace;/);assert.match(controls,/font-variant-numeric: tabular-nums;/);
 assert.match(controls,/font-size: min\(22px, calc\(\(100cqw - 63px\) \/ var\(--fuel-characters, 7\) \* 1\.55\)\)/);
 assert.match(controls,/font-size: min\(15px, calc\(\(100cqw - 40px\) \/ var\(--fuel-characters, 7\) \* 1\.55\)\)/);
 assert.match(css,/#fuel-meter \.fuel-icon \{ position: absolute; width: 34px; height: 34px; left: 8px; top: 2px; \}/);
 assert.match(css,/#fuel-meter \.fuel-icon \{ left: 3px; width: 25px; height: 25px; top: 6\.5px; \}/);
 let cases=0;
 for(const [width,height]of [[320,480],[320,568],[360,640],[390,844],[540,960],[541,320],[568,320],[760,1024],[844,390],[1366,768]])for(const [left,right]of [[0,0],[44,44],[44,0],[0,44]])for(const digits of [3,4]){
  const small=width<=540,row=Math.min(424,width-left-right-24),fuel=row-(small?8+100:12+128),area=fuel-(small?40:63);
  const font=Math.min(small?15:22,area/(digits*2+1)*1.55),glyph=.6*font,grid=(digits*2+1)*glyph;
  assert(fuel>=100);assert(font>=10);assert(grid+4<=area+1e-8,`${width}x${height}, ${digits} digits fit with a 2px outline margin`);
  const numberLeft=3+(small?32:47)+(area-grid)/2,iconRight=3+(small?3+25:8+34);
  assert(numberLeft-2>iconRight,'Text outline must clear the fixed canister');
  const currentRight=numberLeft+digits*glyph,slashLeft=currentRight,maxRight=numberLeft+grid;
  for(const value of [100,99,9,1,0]){const textLeft=currentRight-String(value).length*glyph;assert(textLeft>=numberLeft);assert.equal(currentRight,slashLeft);assert.equal(maxRight,numberLeft+grid);}
  cases++;
 }
 console.log(`  ${cases} viewport/safe-area/digit calculations; no browser rendering claim`);
});

console.log(`Integer fuel HUD: ${count} groups passed; CPU/DOM mocks and static CSS arithmetic only.`);
