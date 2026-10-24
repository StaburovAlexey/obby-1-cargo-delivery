import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';

test('dev overlay defaults on only in developer sessions and can be explicitly disabled',()=>{
 for(const [devServer,search,expected] of [[true,'',true],[true,'?dev=1&perf=0',false],[true,'?dev=0',false],[false,'?dev=1&perf=1',false]]){
  const f=createAppDom({devServer,search,startDriving:false});
  try{assert.equal(!!f.debug.renderProfiler,expected);}finally{f.dispose();}
 }
});
test('zones hide distant garage decorations and restore them when camera returns, without moving physics',()=>{
 const f=createAppDom({startDriving:false});
 try{
  const d=f.debug,zones=d.renderZones;assert.ok(zones);
  const position={...d.gameplay.state.player},count=d.physics.world.colliders.len();
  // Isolate camera culling; shadow-frustum retention is covered separately.
  d.renderer.shadowMap.enabled=false;
  d.camera.position.set(0,8,10);d.camera.lookAt(0,8,60);d.renderScene();
  assert.equal(zones.isVisible(d.garage.hangar),true);
  const station=d.garage.stations.at(-1);assert.equal(zones.isVisible(station.group),false);
  d.camera.position.set(0,8,-8000);d.camera.lookAt(0,8,-8100);d.renderScene();
  assert.equal(zones.isVisible(d.garage.hangar),false);
  assert.deepEqual(d.gameplay.state.player,position);assert.equal(d.physics.world.colliders.len(),count);
  d.camera.position.set(0,8,10);d.camera.lookAt(0,8,60);d.renderScene();
  assert.equal(zones.isVisible(d.garage.hangar),true);
  const old=zones;d.rebuild(43);assert.notEqual(d.renderZones,old);
 }finally{f.dispose();}
});
test('actual profiled frames include measured stages and step counts without changing physics cadence',()=>{
 const f=createAppDom({devServer:true,search:'?dev=1'});
 try{
  f.frame(1017);f.frame(1034);
  const r=f.debug.renderProfiler.report();assert.ok(r.samples>0);
  for(const stage of ['physics','logic','ui','network','culling','render','frame'])assert.ok(Number.isFinite(r.timingsMeanMs[stage]));
  assert.ok(r.physicsSteps.last>=1);assert.equal(r.pixelRatio,1.6);
 }finally{f.dispose();}
});
