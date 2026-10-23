import assert from 'node:assert/strict';
import test from 'node:test';
import {createAppDom} from './fixtures/app-dom.mjs';
import {canyonPointAt} from '../dist/canyon-track.js';

test('real app uses normal off-road rules on the restored west terrain and returns falls to the garage',()=>{
 const app=createAppDom(),d=app.debug,m=d.model,g=d.gameplay;
 let time=1000;const frame=()=>app.frame(time+=1000/60);
 try{
  const money=g.state.money,run=g.state.run;g.state.fuels.pickup=37;
  m.setPose({x:-69,y:0,z:-147,heading:Math.PI/2});m.setInput({active:true});
  const steps=d.physics.stats.steps;app.frame(time);for(let i=0;i<30;i++)frame();
  assert.equal(d.physics.stats.steps-steps,30);assert.equal(g.state.eventMode,null);
  assert.equal(g.state.run,null);assert.equal(run.loaded,false);assert.equal(g.state.testMode,false);
  assert.ok(g.state.fuels.pickup<37);assert.equal(g.state.money,money);
  assert.ok(m.state.grounded,'restored terrain supports the vehicle');
  assert.equal(d.scene.getObjectByName('Physics test track'),undefined);
  m.setPose({x:-368,y:-30,z:-220,heading:Math.PI/2});
  for(let i=0;i<60;i++)frame();
  assert.equal(g.state.mode,'walking');assert.equal(g.state.run,null);
  assert.equal(m.enabled,false);assert.equal(g.state.testMode,false);
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
