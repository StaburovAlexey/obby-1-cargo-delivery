import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {pointInRoad,routePointAtProgress} from '../dist/route-network.js';
import {bridgeAtProgress} from '../dist/road-bridges.js';

test('application shares all fifteen pits with cut city and ninety reserved movers',()=>{
 const app=createAppDom({startDriving:false});
 try{
  const d=app.debug;assert.equal(d.roadPits?.length,15);
  assert.equal(d.city.roadPits,d.roadPits);
  assert.equal(d.roadHazards.hazards.length,90);
  for(const pit of d.roadPits){
   assert.equal(pointInRoad(pit.x,pit.z),true,'logical route stays continuous');
   assert.ok(d.city.group.getObjectByName('Road pit floors'));
  }
  const old=d.roadPits;d.rebuild(43);assert.equal(d.roadPits.length,15);assert.notEqual(d.roadPits,old);
 }finally{app.dispose();}
});

test('car resting at the deep pit bottom returns to garage against original road reference height',()=>{
 const app=createAppDom();
 try{
  const d=app.debug,pit=d.roadPits?.find(p=>p.type==='pit');assert.ok(pit);
  d.model.setPose({x:pit.x,y:pit.height-19.5,z:pit.z,heading:pit.heading});d.applyTruckPose();
  let now=1000;app.frame(now);
  for(let i=0;i<90&&d.driving;i++)app.frame(now+=1000/60);
  assert.equal(d.driving,false);assert.equal(d.gameplay.state.mode,'walking');assert.equal(d.gameplay.state.completedRuns,0);
 }finally{app.dispose();}
});


test('legitimate route telemetry through a jump keeps the loaded delivery valid',()=>{
 const app=createAppDom();
 try{
  const d=app.debug,g=d.gameplay,pit=d.roadPits.find(p=>p.type==='jump'),runId=g.state.run.id;
  for(let q=0;q<=pit.progress+120;q++){
   const p=routePointAtProgress(q),bridge=bridgeAtProgress(q),offset=bridge?.offset??0;
   assert.equal(g.recordRouteSample({runId,x:p.x+p.right.x*offset,z:p.z+p.right.z*offset,dt:.1}),true,'route progress '+q);
  }
  assert.equal(g.state.run.id,runId);assert.equal(g.state.run.loaded,true);
  assert.equal(g.state.completedRuns,0);assert.equal(g.state.money,0);
 }finally{app.dispose();}
});
