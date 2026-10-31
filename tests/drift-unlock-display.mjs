import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {nitroCareer} from './fixtures/nitro-career.mjs';
import {canyonPointAt} from '../dist/canyon-track.js';

const record=score=>({version:1,trackId:'canyon-v1',score,durationMs:100000,maxCombo:5});

test('hangar cars retain drift requirements above owned and locked vehicles',()=>{
 const f=createAppDom({startDriving:false,career:{...nitroCareer(),driftRecord:record(35000)}});
 try{
  f.frame();
  for(const [id,want] of [['bmwe30','10'],['cadillac75','25'],['koenigseggone1','35'],['phoenixinterceptor','45']]){
   const index=f.debug.garage.vehicles.findIndex(v=>v.id===id)+1;
   assert.equal(f.doc.getElementById(`vehicle-cost-${index}`).hidden,false,'drift target remains visible after unlock');
   assert.match(f.doc.getElementById(`vehicle-price-value-${index}`).textContent,new RegExp(want+'.?000'));
  }
 }finally{f.dispose();}
});

test('completed canyon opens a hangar result with all earned cars, without waiting for online rankings',async()=>{
 const f=createAppDom({startDriving:false,career:nitroCareer()});
 try{
  const d=f.debug,g=d.gameplay;g.state.cooldown=0;assert.equal(d.enterVehicle('bmwreward'),true);
  d.model.setPose(canyonPointAt(12));assert.equal(d.canyon.enter(),true);
  Object.assign(d.canyon.checkpoints,{active:false,finished:true});
  Object.assign(d.canyon.score,{valid:true,finished:true,score:45000,elapsed:100,maxCombo:5});
  await d.canyon.complete();
  for(let i=0;i<180;i++)f.frame();
  assert.equal(g.state.mode,'walking');
  assert.equal(f.doc.getElementById('hangar-drift-menu').hidden,false);
  assert.match(f.doc.getElementById('hangar-drift-result').textContent,/45.?000/);
  assert.match(f.doc.getElementById('hangar-drift-unlocks').textContent,/BMW E30/);
  assert.match(f.doc.getElementById('hangar-drift-unlocks').textContent,/Phoenix/);
  assert.match(f.doc.getElementById('hangar-drift-local-best').textContent,/45.?000/);
 }finally{f.dispose();}
});
