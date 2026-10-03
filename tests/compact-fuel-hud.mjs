import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAppDom} from './fixtures/app-dom.mjs';
import {GAMEPLAY} from '../dist/gameplay.js';
import {vehicleConfig} from '../dist/economy-config.js';
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name)};
const app=createAppDom();let time=2000;const tick=()=>app.frame(time+=1000/60);
try{
 check('only top icon can return to the garage; removed controls have no fixture nodes',()=>{
  for(const id of ['info-toggle','info-panel','info-close','exit-car','reset-truck'])assert.equal(app.ids.get(id),undefined);
  assert.equal(app.debug.showInfo,undefined);assert.equal(app.debug.exitVehicle,undefined);
  assert.equal(app.debug.gameplay.state.mode,'driving');assert.equal(app.ids.get('fuel-hud').hidden,false);
 });
 check('fuel HUD is integer current/capacity from the real remaining state with no false zero',()=>{
  const d=app.debug;for(const fuel of [100,65.1,65,19.2,1.01,.9,.0001]){
   d.gameplay.state.fuels[d.gameplay.state.selectedId]=fuel;tick();
   assert.equal(app.ids.get('fuel-value').textContent,`${Math.ceil(fuel)}/${GAMEPLAY.fuelCapacity}`);
   assert.equal(app.ids.get('fuel-meter').getAttribute('aria-valuemax'),String(GAMEPLAY.fuelCapacity));
   assert.ok(Math.abs(Number(app.ids.get('fuel-meter').getAttribute('aria-valuenow'))-fuel)<1e-7);
   assert.equal(app.ids.get('fuel-meter').classList.contains('low-fuel'),fuel<GAMEPLAY.fuelCapacity*.2);
   assert.equal(app.ids.get('fuel-fill').style.width,`${100*fuel/GAMEPLAY.fuelCapacity}%`);
  }
 });
 check('mouse/touch canvas interactions, E/F/Escape/Space and direct exit requests cannot disembark',()=>{
  const d=app.debug;d.gameplay.state.fuels[d.gameplay.state.selectedId]=50;
  for(const key of ['e','E','f','Escape',' ']){app.win.dispatch('keydown',{key,code:key===' '?'Space':'Key'+key.toUpperCase(),target:app.doc.body,repeat:false});tick();app.win.dispatch('keyup',{key,code:key===' '?'Space':'Key'+key.toUpperCase(),target:app.doc.body});assert.equal(d.gameplay.state.mode,'driving');}
  for(const pointerType of ['mouse','touch'])for(const type of ['pointerdown','pointerup','click','dblclick','interact']){d.renderer.domElement.dispatch(type,{pointerId:70,pointerType,clientX:220,clientY:250,button:0,target:d.renderer.domElement});tick();assert.equal(d.gameplay.state.mode,'driving');}
  app.ids.get('mode-toggle').dispatch('click');const city=d.city;assert.equal(app.ids.get('regenerate').disabled,true);assert.equal(app.ids.get('seed').disabled,true);app.ids.get('regenerate').dispatch('click');app.ids.get('seed').dispatch('change',{target:{value:87}});assert.equal(d.city,city);assert.equal(d.gameplay.state.mode,'driving');app.ids.get('mode-toggle').dispatch('click');
  const before=structuredClone(d.gameplay.state);for(let i=0;i<20;i++)assert.equal(d.gameplay.exit(d.model.state,d.model.state.heading),false);assert.deepEqual(d.gameplay.state,before);
 });
 check('real D/R travel drains the same capacity while idle does not; refill restores current/max',()=>{
  const d=app.debug,id=d.gameplay.state.selectedId;d.gameplay.state.fuels[id]=80;d.gameplay.drive(10,0,6);const forward=d.gameplay.state.fuels[id];d.gameplay.drive(-10,0,6);assert.ok(Math.abs(d.gameplay.state.fuels[id]-(80-20*vehicleConfig(id).consumption))<1e-8);assert.ok(forward<80);
  const after=d.gameplay.state.fuels[id];d.gameplay.drive(0,0,6);assert.equal(d.gameplay.state.fuels[id],after);
  const station=d.garage.stations[3];d.gameplay.drive(0,station.x,station.z);tick();assert.equal(app.ids.get('fuel-value').textContent,`${GAMEPLAY.fuelCapacity}/${GAMEPLAY.fuelCapacity}`);assert.equal(d.gameplay.state.mode,'driving');
 });
 check('empty tank and sole top Garage atomically restore walking in the hangar with full tanks',()=>{
  const d=app.debug;d.gameplay.state.fuels[d.gameplay.state.selectedId]=0;tick();assert.equal(d.gameplay.state.mode,'walking');assert.equal(app.ids.get('fuel-hud').hidden,true);assert.deepEqual(d.gameplay.state.player,{...GAMEPLAY.spawn});assert.equal(d.model.state.speed,0);
  d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('pickup'),true);app.ids.get('garage-button').dispatch('click');assert.equal(d.gameplay.state.mode,'walking');assert.equal(app.ids.get('fuel-hud').hidden,true);assert.ok(Object.entries(d.gameplay.state.fuels).every(([id,v])=>v===vehicleConfig(id).capacity));
 });
}finally{app.dispose();}
check('fuel left and live speed right share one nowrap row with identical 44px centers',()=>{
 const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8'),controls=fs.readFileSync(new URL('../dist/vehicle-controls.css',import.meta.url),'utf8');
 assert.match(html,/<div class="drive-bottom-row">\s*<section id="fuel-hud"[\s\S]*?<\/section>\s*<div class="drive-speed">/);
 assert.match(controls,/\.drive-bottom-row \{[^}]*flex-wrap: nowrap;[^}]*align-items: center;[^}]*height: 44px/);
 assert.match(css,/#fuel-hud \{[^}]*min-width: 100px;[^}]*height: 44px;[^}]*background: transparent/s);
 assert.match(controls,/\.drive-bottom-row \.drive-speed \{[^}]*height: 44px/);
 assert.match(controls,/flex-basis: 100px/);assert.match(controls,/max-width: 424px/);
});
check('shared bottom row clears wheel and D/R across portrait, landscape and asymmetric safe areas',()=>{
 const reports=[];const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 for(const[w,h]of[[320,480],[320,568],[360,640],[390,600],[390,844],[540,960],[760,1024],[501,320],[568,320],[844,390],[1366,768]])for(const[bottom,left,right]of[[0,0,0],[34,0,0],[34,44,44],[21,44,0],[21,0,44]]){
  const landscape=h<=500&&w>=501;
  let controlBottom=Math.max(108,.1*h+18),steering=Math.min(185,Math.max(120,Math.min(.35*w,.40*h))),gear=Math.min(104,Math.max(86,Math.min(.23*w,.26*h)));
  if(w<=500)controlBottom=158;if(h<=650&&w<=500)controlBottom=150;if(h<=540&&w<=500){controlBottom=128;steering=120;gear=86;}if(landscape){controlBottom=96;steering=Math.min(133,.35*h);gear=86;}if(h>=501&&w>=501&&w<=760)controlBottom=158;if(h<=420&&w>=501){controlBottom=82;steering=Math.min(112,.2875*h);}
  controlBottom+=bottom;
  const wheel={x:Math.max(19,left+10),y:h-controlBottom-steering,w:steering,h:steering};
  const gears={x:w-Math.max(22,right+12)-gear,y:h-controlBottom-gear*148/104,w:gear,h:gear*148/104};
  const available=w-left-right-24,rowWidth=Math.min(424,available),rowX=left+12+(available-rowWidth)/2,small=w<=540,gap=small?8:12,speedWidth=small?100:128;
  const fuel={x:rowX,y:h-bottom-56,w:rowWidth-gap-speedWidth,h:44},speed={x:rowX+rowWidth-speedWidth,y:fuel.y,w:speedWidth,h:44};
  const rotationPad=steering*(Math.SQRT2-1)/2;const rotatedWheel={x:wheel.x-rotationPad,y:wheel.y-rotationPad,w:steering+2*rotationPad,h:steering+2*rotationPad};
  assert.ok(fuel.w>=100,`${w}x${h}: fuel width ${fuel.w}`);assert.equal(fuel.y+fuel.h/2,speed.y+speed.h/2);assert.equal(speed.x-(fuel.x+fuel.w),gap);assert.ok(fuel.x>=left&&speed.x+speed.w<=w-right);assert.ok(fuel.y+44<=h-bottom);
  const numberArea=fuel.w-6-(small?34:57);assert.ok(numberArea>=(small?58:90),'current/max has adequate width');
  for(const item of [fuel,speed]){assert.ok(!intersects(item,rotatedWheel),`${w}x${h}: row/wheel`);assert.ok(!intersects(item,gears),`${w}x${h}: row/gears`);}
  if(landscape){const safeTop=21,top={x:Math.max(13,left+8),y:Math.max(9,safeTop+4),w:61,h:h<=420?64:78};assert.ok(!intersects(rotatedWheel,top),`${w}x${h}: wheel/top action`);}
  reports.push({w,h,bottom,left,right,fuel,speed,wheel,rotatedWheel,gears});
 }
 fs.writeFileSync(new URL('./latest-compact-fuel-layout.json',import.meta.url),JSON.stringify({browser:false,staticCssArithmetic:true,cases:reports},null,2));
});
console.log(`Compact fuel/no-exit: ${count} checks passed; Node and static layout arithmetic, not browser rendering.`);
