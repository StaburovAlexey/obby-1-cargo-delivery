import assert from 'node:assert/strict';
import test from 'node:test';
import {createAppDom} from './fixtures/app-dom.mjs';
import {canyonPointAt} from '../dist/canyon-track.js';

test('real app uses one shared world, free track session and local recovery',()=>{
 const app=createAppDom(),d=app.debug,m=d.model,g=d.gameplay;
 let time=1000;const frame=()=>app.frame(time+=1000/60);
 try{
  const money=g.state.money,brains=g.state.brains;g.state.fuels.pickup=37;
  m.setPose({x:-185,y:0,z:-220,heading:Math.PI/2});m.setInput({active:true});
  const steps=d.physics.stats.steps;app.frame(time);for(let i=0;i<30;i++)frame();
  assert.equal(d.physics.stats.steps-steps,30);assert.equal(g.state.eventMode,'physics-test');
  assert.equal(g.state.run,null);assert.equal(g.state.fuels.pickup,37);assert.equal(g.state.money,money);assert.equal(g.state.brains,brains);
  assert.equal(app.ids.get('physics-recover').hidden,false);
  // The last rear wheels can still touch the pad after the centre crosses its
  // edge. Such partial support must not replace this exercise's safe checkpoint.
  m.setPose({x:-366,y:0,z:-220,heading:Math.PI/2});for(let i=0;i<3;i++)frame();
  m.setPose({x:-368,y:-5,z:-220,heading:Math.PI/2});
  for(let i=0;i<60;i++)frame();
  assert.equal(d.model,m);assert.equal(g.state.eventMode,'physics-test');assert.ok(m.state.y>-.5);
  assert.ok(Math.abs(m.state.x+185)<1,'restored before the small ramp');assert.ok(m.state.linearSpeed<.1);
  assert.equal(g.state.fuels.pickup,37);
  m.setPose({x:0,y:0,z:-70,heading:0});for(let i=0;i<15;i++)frame();
  assert.equal(g.state.eventMode,null);assert.equal(g.state.testMode,true);assert.equal(g.state.run,null);
  assert.equal(app.ids.get('physics-recover').hidden,true);
  d.returnToGarage();assert.equal(m.enabled,false);assert.equal(g.state.testMode,false);
  g.state.cooldown=0;assert.equal(d.enterVehicle('pickup'),true);assert.equal(g.state.run.loaded,true);
 }finally{app.dispose();}
});

test('canyon scoring uses the full simulated time of a valid 100ms frame',()=>{
 const app=createAppDom({startDriving:false,search:'?dev=1'}),d=app.debug;
 let time=1000;
 try{
  d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('bmwreward'),true);
  const p=canyonPointAt(12);d.model.setPose({...p,y:p.height,heading:p.heading+.3});
  app.frame(time);for(let i=0;i<15;i++)app.frame(time+=1000/60);
  assert.equal(d.canyon.active,true);assert.equal(d.canyon.score.valid,true);
  const before=d.canyon.score.elapsed;
  d.model.body.setLinvel({x:-Math.sin(p.heading)*40,y:0,z:-Math.cos(p.heading)*40},true);
  app.frame(time+=100);
  assert.equal(d.canyon.score.valid,true,'fast valid motion must not be mistaken for a teleport');
  assert.ok(Math.abs(d.canyon.score.elapsed-before-.1)<1e-8,'score clock follows all six simulated ticks');
 }finally{app.dispose();}
});
