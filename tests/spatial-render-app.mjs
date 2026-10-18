import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';

test('actual game registers city and canyon batches while retaining original quality and canonical data',()=>{
 const f=createAppDom({startDriving:false});
 try{
  const d=f.debug;assert.ok(d.spatialRenderer,'game owns the spatial renderer');f.frame(1017);
  const road=d.city.group.getObjectByName('Continuous 30m-wide road');
  assert.equal(road.visible,false);assert.ok(road.geometry.index.count>1000);
  assert.equal(d.canyon.environment.group.getObjectByName('Canyon asphalt').visible,false);
  assert.ok(d.spatialRenderer.stats.sourceBatches>=12);
  assert.equal(d.renderer.pixelRatio,1.6);assert.equal(d.renderer.shadowMap.enabled,true);
  assert.equal(d.camera.far,1800);assert.equal(d.scene.fog.far,1600);
  assert.ok(d.spatialRenderer.stats.submittedTriangles<d.spatialRenderer.stats.sourceTriangles*.3);
 }finally{f.dispose();}
});
test('development baseline comparison cannot grant developer ownership and production ignores diagnostic flags',()=>{
 for(const development of [true,false]){
  const f=createAppDom({startDriving:false,devServer:development,search:'?dev=0&perf=1&render=baseline',services:{development,settings:{}}});
  try{
   assert.equal(f.debug.developerMode,false);assert.equal(f.debug.gameplay.isOwned('bmwreward'),false);
   assert.equal(!!f.debug.spatialRenderer,!development);
   assert.equal(!!f.debug.renderProfiler,development);
  }finally{f.dispose();}
 }
});
test('rebuild disposes rendering proxies before canonical geometries and registers the new scene',()=>{
 const f=createAppDom({startDriving:false,search:'?dev=1'});
 try{
  const old=f.debug.spatialRenderer,source=f.debug.city.group.getObjectByName('Continuous 30m-wide road');
  let disposed=0;source.geometry.addEventListener('dispose',()=>disposed++);
  f.debug.rebuild(43);assert.notEqual(f.debug.spatialRenderer,old);assert.equal(old.stats.activeBatches,0);
  assert.equal(disposed,1);f.frame(1017);assert.ok(f.debug.spatialRenderer.stats.sourceBatches>=12);
 }finally{f.dispose();}
});
test('bfcache preserves proxies while terminal pagehide disposes proxies and diagnostics',()=>{
 const f=createAppDom({startDriving:false,devServer:true,search:'?perf=1'});
 let geometryDisposals=0;
 try{
  const d=f.debug,spatial=d.spatialRenderer,profiler=d.renderProfiler;
  d.city.group.getObjectByName('Continuous 30m-wide road').geometry.addEventListener('dispose',()=>geometryDisposals++);
  f.frame(1017);assert.ok(spatial.stats.activeBatches>0);
  f.win.dispatch('pagehide',{persisted:true});assert.ok(spatial.stats.activeBatches>0);assert.equal(geometryDisposals,0);
  f.win.dispatch('pageshow',{persisted:true});f.frame(100000);f.frame(100017);
  assert.equal(f.debug.spatialRenderer,spatial);assert.ok(spatial.stats.activeBatches>0);
  f.win.dispatch('pagehide',{persisted:false});assert.equal(spatial.stats.activeBatches,0);
  const samples=profiler.report().samples;profiler.record({now:100034,active:true});assert.equal(profiler.report().samples,samples);
 }finally{f.dispose();}
 assert.equal(geometryDisposals,1);
});
