import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import {canyonPointAt} from '../dist/canyon-track.js';
import {polygonIntersectionArea} from '../dist/network-scene.js';

test('the actual game always shows a closed entrance and developer BMW does not bypass it',()=>{
 const f=createAppDom({startDriving:false,search:'?dev=1'});
 try{
  assert.ok(f.debug.canyon,'canyon controller is integrated');assert.equal(f.debug.canyon.entrance.group.visible,true);assert.equal(f.debug.canyon.entrance.unlocked,false);assert.equal(f.debug.canyon.enter(),false);assert.equal(f.debug.gameplay.state.eventMode,null);
  const approach=[{x:14,z:-78},{x:112,z:-78},{x:112,z:-52},{x:14,z:-52}];
  for(const feature of f.debug.city.features.filter(f=>f.type==='building'))assert.equal(polygonIntersectionArea(approach,feature.footprint.map(p=>({x:p.x,z:-p.y}))),0,'the entrance cannot run through a house');
 }finally{f.dispose();}
});
test('earned BMW enters a fixed canyon setup, suspends deliveries and restores the hangar',()=>{
 const f=createAppDom({startDriving:false,career:earnedRewardCareer()});
 try{
  const d=f.debug,g=d.gameplay,before=g.snapshot();g.state.cooldown=0;
  assert.equal(d.canyon.entrance.unlocked,true);assert.equal(d.canyon.enter(),true);assert.equal(g.state.eventMode,'canyon');assert.equal(g.state.run,null);assert.equal(d.canyon.phase,'countdown');assert.equal(d.city.group.visible,false);
  assert.equal(d.model,d.canyon.model);assert.equal(d.input.state.enabled,false);
  const checkpoint=d.garage.deliveries[0];g.drive(0,checkpoint.x,checkpoint.z);g.tickProgress(10,{distance:100,active:true});assert.equal(g.state.money,before.money);assert.equal(g.state.brains,before.brains);
  for(let i=0;i<190;i++)f.frame();assert.equal(d.canyon.phase,'running');assert.equal(d.input.state.enabled,true);
  const p=canyonPointAt(12);assert.ok(Math.hypot(d.model.state.x-p.x,d.model.state.z-p.z)<1);assert.equal(f.ids.get('canyon-hud').hidden,false);
  f.ids.get('canyon-exit').dispatch('click');assert.equal(d.canyon.active,false);assert.equal(d.city.group.visible,true);assert.equal(g.state.mode,'walking');assert.equal(g.state.eventMode,null);assert.equal(f.ids.get('canyon-overlay').hidden,true);
  assert.equal(d.canyon.enter(),true);const old=d.canyon;d.rebuild(42);assert.equal(old.entrance.group.parent,null);assert.equal(old.effects.group.parent,null);assert.notEqual(f.debug.canyon,old);assert.equal(f.debug.canyon.active,false);assert.equal(f.debug.gameplay.state.eventMode,null);
 }finally{f.dispose();}
});
