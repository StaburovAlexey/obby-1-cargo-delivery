import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {nitroCareer} from './fixtures/nitro-career.mjs';

test('nitro screen and audio follow real thrust, pause, cancellation and garage lifecycle',()=>{
 const updates=[];
 const audio={muted:false,setMuted(){},setVolume(){},stop(){},unlock(){return Promise.resolve(true);},update(dt,state){updates.push(state);}};
 const f=createAppDom({startDriving:false,career:{...nitroCareer(),nitroLevel:5},createAudio:()=>audio});
 try{
  const d=f.debug,g=d.gameplay,el=id=>f.doc.getElementById(id),screen=el('nitro-screen-effect');
  assert.ok(screen,'screen feedback is installed');
  assert.equal(screen.hidden,true);assert.equal(screen.getAttribute('aria-hidden'),'true');
  assert.equal(screen.children.length,8,'fixed small number of speed streaks');
  assert.ok(f.doc.body.children.includes(screen));
  g.state.cooldown=0;assert.equal(d.enterVehicle('bmwreward'),true);
  const move=()=>{f.pointer(f.pedal,'pointerdown',0,2);d.model.body.setLinvel({x:0,y:0,z:-20},true);for(let i=0;i<20;i++)f.frame();f.pointer(f.pedal,'pointerup',0,2);f.frame();};
  move();
  const activate=()=>{assert.equal(el('nitro-button').disabled,false);el('nitro-button').dispatch('click');f.frame();assert.equal(screen.hidden,false);assert.equal(updates.at(-1).nitroActive,true);assert.ok(updates.at(-1).nitroRemaining>0);};
  activate();
  const remaining=g.nitro.state.remaining;
  d.pauseState.set('nitro-effects-test',true);
  assert.equal(screen.hidden,true,'pause clears feedback immediately, before another frame');
  f.frame();assert.equal(updates.at(-1).nitroActive,false);assert.equal(g.nitro.state.remaining,remaining);
  d.pauseState.set('nitro-effects-test',false);f.frame();f.frame();assert.equal(screen.hidden,false);
  d.setUpgradeMenu(true);assert.equal(screen.hidden,true);f.frame();assert.equal(updates.at(-1).nitroActive,false);
  d.setUpgradeMenu(false);f.frame();f.frame();assert.equal(screen.hidden,false);
  f.pointer(el('reverse-pedal'),'pointerdown',0,3);f.frame();
  assert.equal(g.nitro.state.remaining,0);assert.equal(screen.hidden,true);assert.equal(updates.at(-1).nitroActive,false);
  f.pointer(el('reverse-pedal'),'pointerup',0,3);move();activate();
  f.win.dispatch('blur');assert.equal(screen.hidden,true);f.win.dispatch('focus');f.frame();f.frame();
  assert.equal(screen.hidden,false);
  f.doc.hidden=true;f.doc.dispatch('visibilitychange');assert.equal(screen.hidden,true);
  f.doc.hidden=false;f.doc.dispatch('visibilitychange');f.win.dispatch('focus');f.frame();f.frame();
  assert.equal(screen.hidden,false);
  g.nitro.cancel();f.frame();assert.equal(screen.hidden,true);
  move();activate();g.state.fuels.bmwreward=0;f.frame();assert.equal(screen.hidden,true);assert.equal(updates.at(-1).nitroActive,false);
  d.returnToGarage();f.frame();assert.equal(screen.hidden,true);
 }finally{f.dispose();}
});

test('unavailable nitro activation never starts screen feedback or sound',()=>{
 const states=[];
 const f=createAppDom({createAudio:()=>({muted:false,setMuted(){},setVolume(){},stop(){},unlock(){},update(dt,s){states.push(s);}})});
 try{
  const screen=f.doc.getElementById('nitro-screen-effect');assert.ok(screen);
  f.win.dispatch('keydown',{code:'KeyN'});f.frame();
  assert.equal(screen.hidden,true);assert.equal(states.at(-1).nitroActive,false);
 }finally{f.dispose();}
});
