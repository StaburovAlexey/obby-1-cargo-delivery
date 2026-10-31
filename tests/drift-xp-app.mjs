import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {nitroCareer} from './fixtures/nitro-career.mjs';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {canyonPointAt} from '../dist/canyon-track.js';

test('actual HUD hides garage in hangar, shows 16 XP income and accrues drift XP on both tracks',()=>{
 const f=createAppDom({startDriving:false,career:nitroCareer()});
 try{
  const d=f.debug,g=d.gameplay,el=id=>f.doc.getElementById(id);f.frame();
  assert.equal(el('garage-button').hidden,true,'garage action is unnecessary inside hangar');
  VEHICLE_CONFIG.forEach((spec,i)=>{if(spec.rewardDrift)assert.equal(el(`vehicle-income-value-${i+1}`).textContent,'16');});
  g.state.cooldown=0;assert.equal(d.enterVehicle('bmwreward'),true);f.frame();assert.equal(el('garage-button').hidden,false);
  let seconds=0,earned=0;const tick=g.tickProgress;
  g.tickProgress=(dt,input)=>{const amount=tick(dt,input);if(amount>0){seconds+=dt;earned+=amount;}return amount;};
  const move=()=>{f.pointer(f.pedal,'pointerdown',0,2);d.model.body.setLinvel({x:0,y:0,z:-20},true);for(let i=0;i<30;i++)f.frame();f.pointer(f.pedal,'pointerup',0,2);};
  move();assert.ok(earned>0);assert.ok(Math.abs(earned-seconds*16)<1e-6);
  const p=canyonPointAt(20);d.model.setPose({x:p.x,y:p.height+1,z:p.z,heading:p.heading});
  assert.equal(d.canyon.enter(),true);seconds=earned=0;
  f.pointer(f.pedal,'pointerdown',0,2);d.model.body.setLinvel({x:-Math.sin(p.heading)*20,y:0,z:-Math.cos(p.heading)*20},true);
  for(let i=0;i<45;i++)f.frame();
  assert.ok(earned>0,'canyon advances the same XP clock');assert.ok(Math.abs(earned-seconds*16)<1e-6);
  d.pauseState.set('xp-test',true);const stopped=g.state.brains;f.frame();assert.equal(g.state.brains,stopped);d.pauseState.set('xp-test',false);
  d.returnToGarage();f.frame();assert.equal(el('garage-button').hidden,true);
 }finally{f.dispose();}
});
