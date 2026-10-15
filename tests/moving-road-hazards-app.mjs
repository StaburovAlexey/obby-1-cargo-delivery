#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {VEHICLE_CONFIG,ECONOMY_CONFIG} from '../dist/economy-config.js';
import {projectRoad} from '../dist/route-network.js';
const report={scope:'Actual app source, fixed-step model and instanced matrices; DOM, renderer and RAF mocked. No browser/GPU/mobile claim.',checks:[]};
const near=(a,b,e=1e-7)=>assert(Math.abs(a-b)<=e,`${a} != ${b}`),matrix=new THREE.Matrix4();
let app,time=1000;
function tick(seconds=.05){time+=seconds*1000;app.frame(time)}
function check(name,fn){const details=fn();report.checks.push({name,passed:true,...details});console.log('PASS '+name+(details?' '+JSON.stringify(details):''));}
function create(){time=1000;app=createAppDom({startDriving:false,career:{version:ECONOMY_CONFIG.saveVersion,money:7654,brains:321,characterId:'bacon',ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)}});app.frame(time);return app.debug;}
function enter(id='ashhauler'){const d=app.debug;d.returnToGarage();d.gameplay.state.cooldown=0;assert(d.enterVehicle(id));return d;}
function assertSynchronized(d){
 for(const mesh of d.roadHazardsScene.group.children.filter(m=>m.isInstancedMesh))for(let i=0;i<mesh.count;i++){
  const h=d.roadHazards.poseFor(mesh.userData.hazardIds[i]);if(!h?.motion)continue;mesh.getMatrixAt(i,matrix);near(matrix.elements[12],h.x,.002);near(matrix.elements[14],h.z,.002);
 }
}
try{
 create();
 check('Real app advances one shared mover clock before physics and renders the resulting pose',()=>{
  const d=enter();const system=d.roadHazards,initial=JSON.stringify(system.poses);tick();tick();assert(system.elapsed>0);for(let i=0;i<90;i++){tick();assertSynchronized(d)}assert.notEqual(JSON.stringify(system.poses),initial);assert.equal(d.roadHazardsScene.stats.movers,20);
  const before=system.elapsed;tick(3600);near(system.elapsed,before+.05);assertSynchronized(d);return {frames:93,appDeltaCap:.05};
 });
 check('Menus, overview, blur and hidden-tab time freeze motion; resume never fast-forwards',()=>{
  const d=app.debug,system=d.roadHazards;let cases=0;
  const pause=(begin,end)=>{const before=JSON.stringify(system.poses),clock=system.elapsed;begin();for(let i=0;i<6;i++)tick(60);assert.equal(system.elapsed,clock,`Pause mode ${cases} advanced clock`);assert.equal(JSON.stringify(system.poses),before);end();tick(.05);assert(system.elapsed<=clock+.05+1e-8);tick(.05);assert(system.elapsed>clock);assertSynchronized(d);cases++;};
  pause(()=>d.setUpgradeMenu(true),()=>d.setUpgradeMenu(false));
  pause(()=>d.setBiomeMenu(true),()=>d.setBiomeMenu(false));
  pause(()=>d.setDriving(false,false),()=>d.setDriving(true,false));
  pause(()=>app.win.dispatch('blur'),()=>app.win.dispatch('focus'));
  pause(()=>{app.doc.hidden=true;app.doc.dispatch('visibilitychange')},()=>{app.doc.hidden=false;app.doc.dispatch('visibilitychange')});
  return {pauseModes:cases};
 });
 check('Actual mover impacts in both gears invoke clean-run collision telemetry for all ten vehicles',()=>{
  const impacts=[];
  for(const car of VEHICLE_CONFIG)for(const sign of [1,-1]){
   const d=enter(car.id),h=d.roadHazards.movers.find(h=>h.biome==='city'&&h.motion.crossesCenter),s=d.model.state;
   const back=sign*(h.length/2+2.88+1.2),speed=10;
   Object.assign(s,{x:h.x+Math.sin(h.heading)*back,z:h.z+Math.cos(h.heading)*back,heading:h.heading,velocityX:-Math.sin(h.heading)*speed*sign,velocityZ:-Math.cos(h.heading)*speed*sign,speed:speed*sign,linearSpeed:speed});
   d.garage.vehicles.find(v=>v.id===car.id).routeContext=projectRoad(s.x,s.z,h);d.applyTruckPose();d.model.setGear(sign>0?'D':'R');d.model.setInput({active:true,steering:0});
   let collisions=0,blocked=false;const original=d.gameplay.recordRunCollision;
   d.gameplay.recordRunCollision=input=>{const accepted=original(input);if(accepted)collisions++;return accepted;};
   try{for(let i=0;i<60;i++){tick();assertSynchronized(d);assert(!d.roadHazards.contact(s.x,s.z,s.heading),'No residual penetration after model step');assert([s.x,s.z,s.heading,s.velocityX,s.velocityZ].every(Number.isFinite));if(s.blocked){blocked=true;break;}}}finally{d.gameplay.recordRunCollision=original;}
   assert(blocked,car.id+' impact must stop');assert(collisions>0,car.id+' impact must invalidate clean bonus');assert(d.gameplay.state.run?.loaded,'Fixture setup is before first telemetry frame, not an in-run teleport');


   const stop=d.garage.deliveries[0];d.gameplay.drive(0,stop.x,stop.z);const delivered=d.gameplay.events().find(e=>e.type==='delivery');assert(delivered);assert.equal(delivered.clean,false);assert.equal(delivered.breakdown.clean,0);assert.equal(delivered.breakdown.brains.clean,0);
   impacts.push({vehicle:car.id,gear:sign>0?'D':'R',collisionSignals:collisions,cleanBonus:delivered.breakdown.clean});
  }
  return {cases:impacts.length,impacts};
 });
 check('Garage, biome travel and regeneration reset movers without deleting grounded basalt or paying rewards',()=>{
  const d=enter(),initial=JSON.stringify(d.roadHazards.poses);tick();for(let i=0;i<70;i++)tick();assert.notEqual(JSON.stringify(d.roadHazards.poses),initial);
  const money=d.gameplay.state.money,completed=d.gameplay.state.completedRuns;
  assert(d.setBiomeMenu(true));assert(d.travelToBiome('volcanic'));near(d.roadHazards.elapsed,0);assert.equal(JSON.stringify(d.roadHazards.poses),initial);assert(d.gameplay.state.testMode);assert(d.roadHazards.rocks.every(r=>r.phase==='landed'&&r.altitude===0));assert.equal(d.roadHazardsScene.stats.visibleRocks,4);assertSynchronized(d);
  d.returnToGarage();near(d.roadHazards.elapsed,0);assert.equal(d.gameplay.state.money,money);assert.equal(d.gameplay.state.completedRuns,completed);assert.equal(d.roadHazardsScene.stats.visibleRocks,4);
  const old=d.roadHazardsScene;d.rebuild(17);assert(old.stats.disposed);assert.equal(d.roadHazards.hazards.length,30);assert.equal(d.roadHazards.movers.length,20);near(d.roadHazards.elapsed,0);assert.equal(d.gameplay.state.money,money);assertSynchronized(d);return {resets:['biome travel','garage','regenerate'],staticBasalt:4};
 });
 check('Graphics context loss freezes the live hazard pool',()=>{
  const d=enter();tick();for(let i=0;i<20;i++)tick();const before=JSON.stringify(d.roadHazards.poses),elapsed=d.roadHazards.elapsed;d.renderer.domElement.dispatch('webglcontextlost');for(let i=0;i<10;i++)tick(60);assert.equal(JSON.stringify(d.roadHazards.poses),before);near(d.roadHazards.elapsed,elapsed);return {simulatedHiddenSeconds:600};
 });
}finally{app?.dispose()}
report.generatedAt=new Date().toISOString();report.runtimeHashes=Object.fromEntries(['app.js','road-hazards.js','road-hazards-scene.js','road-bridges.js'].map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL('../dist/'+f,import.meta.url))).digest('hex')]));fs.mkdirSync(new URL('../qa/moving-road-hazards/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/moving-road-hazards/app.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`${report.checks.length} application moving-hazard groups passed.`);
