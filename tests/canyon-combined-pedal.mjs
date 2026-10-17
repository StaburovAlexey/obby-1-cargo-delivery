import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createVehicleInput} from '../dist/vehicle-input.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
import {createAppDom} from './fixtures/app-dom.mjs';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';

function setup(drift=true) {
 const f=createInputDom(),reverse=f.root.append(new f.pedal.constructor(['reverse-pedal']));
 const telemetry={linearSpeed:12},inputs=[],gears=[];
 const c=createVehicleInput({root:f.root,getTelemetry:()=>telemetry,onInput:i=>inputs.push(i),onGear:g=>gears.push(g)});
 c.setDriftEnabled(drift);
 return {...f,reverse,telemetry,inputs,gears,c,get input(){return inputs.at(-1);},
  down:(element,id)=>f.pointer(element,'pointerdown',0,id),up:(element,id)=>f.pointer(element,'pointerup',0,id),
  key:(code,type='keydown',extra={})=>f.win.dispatch(type,{code,...extra})};
}
test('moving BMW pedal is a latched handbrake, releasing and repressing at rest selects reverse',()=>{
 const h=setup();try{
  h.down(h.reverse,2);assert.equal(h.input.handbrake,1);assert.equal(h.input.active,false);assert.equal(h.gears.length,0);
  assert.equal(h.reverse.getAttribute('aria-pressed'),'true');
  h.telemetry.linearSpeed=0;h.key('KeyD');assert.equal(h.input.handbrake,1);assert.equal(h.input.active,false);
  h.up(h.reverse,2);assert.equal(h.input.handbrake,0);
  h.down(h.reverse,2);assert.equal(h.input.handbrake,0);assert.equal(h.input.active,true);assert.equal(h.gears.at(-1),'R');
  h.telemetry.linearSpeed=8;h.key('KeyA');assert.equal(h.input.handbrake,0);assert.equal(h.gears.at(-1),'R','reverse latch survives acceleration');
 }finally{h.c.destroy();}
});
test('gas plus combined pedal preserves gas with either input order, touch or keyboard',()=>{
 for(const first of ['gas','reverse'])for(const keyboard of [false,true]){
  const h=setup();try{
   const gas=()=>keyboard?h.key('KeyW'):h.down(h.pedal,1),brake=()=>h.down(h.reverse,2);
   if(first==='gas'){gas();brake();}else{brake();gas();}
   assert.equal(h.input.active,true);assert.equal(h.input.handbrake,1);assert.equal(h.input.brake,0);assert.equal(h.gears.at(-1),'D');
   assert.equal(h.pedal.getAttribute('aria-pressed'),'true');assert.equal(h.reverse.getAttribute('aria-pressed'),'true');
   h.up(h.reverse,2);assert.equal(h.input.handbrake,0);assert.equal(h.input.active,true);
  }finally{h.c.destroy();}
 }
});
test('S, down and touch share the latch until all combined sources release; Shift is independent',()=>{
 const h=setup();try{
  h.key('KeyS');h.telemetry.linearSpeed=0;h.key('ArrowDown');h.down(h.reverse,2);
  h.key('KeyS','keyup');h.key('ArrowDown','keyup');assert.equal(h.input.handbrake,1);
  h.up(h.reverse,2);h.key('ArrowDown');assert.equal(h.gears.at(-1),'R');assert.equal(h.input.handbrake,0);
  h.key('ShiftLeft');assert.equal(h.input.handbrake,1);h.key('ShiftLeft','keyup');assert.equal(h.input.handbrake,0);
  h.key('ArrowDown','keyup');h.telemetry.linearSpeed=12;h.key(undefined,'keydown',{key:'s'});assert.equal(h.input.handbrake,1);
 }finally{h.c.destroy();}
});
test('speed decision uses sideways velocity and a low-speed hysteresis band',()=>{
 const h=setup();try{
  Object.assign(h.telemetry,{linearSpeed:0,velocityX:3,velocityZ:0});h.down(h.reverse,2);assert.equal(h.input.handbrake,1);h.up(h.reverse,2);
  h.telemetry.velocityX=.5;h.down(h.reverse,2);assert.equal(h.input.handbrake,1);h.up(h.reverse,2);
  h.telemetry.velocityX=.3;h.down(h.reverse,2);assert.equal(h.input.handbrake,0);assert.equal(h.gears.at(-1),'R');
 }finally{h.c.destroy();}
});
test('pointer ownership rejects control theft and releases only the captured combined pointer',()=>{
 const h=setup();try{
  h.down(h.wheel,1);h.down(h.pedal,2);h.down(h.reverse,1);h.down(h.reverse,2);assert.equal(h.input.handbrake,0);
  h.down(h.reverse,3);h.down(h.reverse,4);assert.equal(h.c.state.reversePointerId,3);
  h.up(h.win,4);assert.equal(h.input.handbrake,1);
  h.pointer(h.win,'pointercancel',0,3);assert.equal(h.input.handbrake,0);assert.equal(h.c.state.wheelPointerId,1);assert.equal(h.input.active,true);
  assert.equal(h.reverse.captures.size,0);
 }finally{h.c.destroy();}
});
test('cancel, capture loss, blur, pause, hidden page and vehicle changes clear the latch',()=>{
 for(const reset of [h=>h.pointer(h.win,'pointercancel',0,3),h=>h.pointer(h.win,'lostpointercapture',0,3),h=>h.win.dispatch('blur'),h=>h.c.reset(),h=>{h.c.setEnabled(false);h.c.setEnabled(true);},h=>{h.doc.hidden=true;h.doc.dispatch('visibilitychange');},h=>{h.c.setDriftEnabled(false);h.c.setDriftEnabled(true); }]){
  const h=setup();try{
   h.down(h.reverse,3);assert.equal(h.input.handbrake,1);reset(h);assert.equal(h.input.handbrake,0);assert.equal(h.c.state.reversePointerId,undefined);assert.equal(h.reverse.captures.size,0);
   h.telemetry.linearSpeed=0;h.down(h.reverse,3);assert.equal(h.gears.at(-1),'R');assert.equal(h.input.handbrake,0);
  }finally{h.c.destroy();}
 }
});
test('combined keys respect focus/modifiers and repeat cannot change a held mode',()=>{
 const h=setup();try{
  h.key('KeyS','keydown',{ctrlKey:true});assert.equal(h.input.handbrake,0);
  h.key('ArrowDown','keydown',{target:{tagName:'INPUT'}});assert.equal(h.input.handbrake,0);
  h.key('KeyS');h.telemetry.linearSpeed=0;h.key('KeyS','keydown',{repeat:true});assert.equal(h.input.handbrake,1);
  h.key('KeyS','keyup');h.key('KeyS');assert.equal(h.input.handbrake,0);assert.equal(h.gears.at(-1),'R');
 }finally{h.c.destroy();}
});
test('BMW capture failure still releases via window and destruction clears all channels',()=>{
 const h=setup();try{
  h.reverse.setPointerCapture=()=>{throw Error('capture unavailable');};
  h.down(h.reverse,3);h.key('KeyW');assert.equal(h.input.handbrake,1);assert.equal(h.input.active,true);
  h.up(h.win,3);assert.equal(h.input.handbrake,0);assert.equal(h.input.active,true);
  h.down(h.reverse,3);h.c.destroy();assert.equal(h.input.handbrake,0);assert.equal(h.input.active,false);
  h.down(h.reverse,3);assert.equal(h.input.handbrake,0);
 }finally{h.c.destroy();}
});
test('ordinary vehicle reverse behavior and ignored S/Shift remain unchanged',()=>{
 const h=setup(false);try{
  h.key('KeyS');h.key('ShiftLeft');assert.deepEqual(h.input,{steering:0,active:false});
  h.down(h.reverse,2);assert.equal(h.gears.at(-1),'R');assert.deepEqual(h.input,{steering:0,active:true});
  h.down(h.pedal,1);assert.equal(h.gears.at(-1),'R');h.up(h.reverse,2);assert.equal(h.gears.at(-1),'D');
 }finally{h.c.destroy();}
});
test('production app reads current BMW telemetry and has only gas and reverse pedals',()=>{
 const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="(?:brake|handbrake)-pedal"/);
 const f=createAppDom({startDriving:false,career:earnedRewardCareer()});try{
  const d=f.debug;d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('bmwreward'),true);
  const reverse=f.ids.get('reverse-pedal'),press=()=>reverse.dispatch('pointerdown',{pointerId:9,button:0}),release=()=>reverse.dispatch('pointerup',{pointerId:9});
  Object.assign(d.model.state,{velocityX:9,velocityZ:0});press();assert.equal(d.model.state.handbrake,1);assert.equal(d.model.state.gear,'D');
  Object.assign(d.model.state,{velocityX:0,velocityZ:0});release();press();assert.equal(d.model.state.handbrake,0);assert.equal(d.model.state.gear,'R');assert.equal(d.model.state.active,true);
  d.setUpgradeMenu(true);assert.equal(d.model.state.active,false);assert.equal(d.model.state.handbrake,0);assert.equal(d.input.state.reversePointerId,undefined);
  press();assert.equal(d.model.state.active,false);d.setUpgradeMenu(false);press();assert.equal(d.model.state.gear,'R');
 }finally{f.dispose();}
});
