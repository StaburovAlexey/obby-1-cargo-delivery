import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {CLASSROOM_ENTRIES,CLASSROOM_DESKS} from '../dist/garage-scene.js';
import {createAppDom} from './fixtures/app-dom.mjs';
const entry=CLASSROOM_ENTRIES[0];
test('approaching an owned school offers a seat without automatic seating',()=>{
 const g=createGameplay({desks:CLASSROOM_DESKS});g.state.player={x:entry.x,z:entry.z+.2,heading:0};g.state.walked=1;
 g.walk(1/60,{x:0,z:-1});assert.equal(g.state.seatedId,null);assert.equal(g.state.schoolPurchaseCandidateId,'school-1');
 assert.equal(g.sitAtSchool('school-1'),true);assert.ok(g.state.seatedId);
});
test('the seat prompt works while stationary and clears outside the entrance or in the air',()=>{
 const g=createGameplay({desks:CLASSROOM_DESKS});g.state.player={x:entry.x,z:entry.z,heading:0};g.walk(1/60,{});
 assert.equal(g.state.schoolPurchaseCandidateId,'school-1');g.state.player.x+=10;g.walk(1/60,{});assert.equal(g.state.schoolPurchaseCandidateId,null);
 g.state.player.x=entry.x;assert.equal(g.jump(),true);g.walk(1/60,{});assert.equal(g.state.schoolPurchaseCandidateId,null);
});
test('actual HUD shows Sit at the entrance and seats only on button click',()=>{
 const app=createAppDom({startDriving:false});try{
  const g=app.debug.gameplay;g.state.player={x:entry.x,z:entry.z,heading:0};app.frame(2000);app.frame(2016);
  assert.equal(g.state.seatedId,null);assert.equal(app.ids.get('buy-school').hidden,false);assert.match(app.ids.get('buy-school-label').textContent,/Сесть/);
  app.ids.get('buy-school').dispatch('click');assert.ok(g.state.seatedId);assert.equal(app.ids.get('buy-school').hidden,true);
 }finally{app.dispose();}
});
