#!/usr/bin/env node
// Real app, Three.js scenegraph and fixed-step driving/economy. DOM, renderer
// and event delivery are mocked: these are not browser/Android/GPU checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAppDom} from './fixtures/app-dom.mjs';
import {VEHICLE_CONFIG,BIOME_SEQUENCE,ECONOMY_CONFIG} from '../dist/economy-config.js';
import {getVehiclePerformance} from '../dist/vehicle-upgrades.js';
import {roadGroundSurface} from '../dist/driving-ground.js';
import {routePointAtDistance,truckInRoad,projectRoad} from '../dist/road-layout.js';
import {ROAD_HAZARD_RULES} from '../dist/road-hazards.js';
const report={rendererFree:true,checks:[]},max={speed:3,handling:3,grip:3,fuel:3};
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
let current;
function create(levels={}){current=createAppDom({startDriving:false,career:{version:ECONOMY_CONFIG.saveVersion,money:7654,brains:321,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),characterId:'bacon',upgrades:Object.fromEntries(VEHICLE_CONFIG.map(v=>[v.id,{...levels}]))}});current.time=1000;current.frame(current.time);return current;}
function tick(app,seconds=1/60){app.time+=seconds*1000;app.frame(app.time);}
function setupAt(app,distance,offset=0,speed=0,branch='main'){const p=routePointAtDistance(distance,{branch}),d=app.debug,s=d.model.state;d.model.pause();Object.assign(s,{x:p.x+p.right.x*offset,z:p.z+p.right.z*offset,heading:p.heading,velocityX:-Math.sin(p.heading)*speed,velocityZ:-Math.cos(p.heading)*speed,speed,linearSpeed:Math.abs(speed)});d.garage.vehicles.find(v=>v.model===d.model).routeContext=p;d.applyTruckPose();d.followTruck(0,true);return s;}
function check(name,fn){try{const details=fn();report.checks.push({name,passed:true,details});console.log('PASS '+name)}catch(e){report.checks.push({name,passed:false,error:e.stack});console.error('FAIL '+name,e)}finally{current?.dispose();current=null}}
check('100 real app biome transitions preserve ownership, fuel and reward protection for stock/max cars',()=>{
 let cases=0;
 for(const levels of [{},max]){const app=create(levels),d=app.debug;
  for(const car of VEHICLE_CONFIG){d.returnToGarage();d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle(car.id),true);
   for(const biome of BIOME_SEQUENCE){const beforeFuel=d.gameplay.state.fuels[car.id],beforeMoney=d.gameplay.state.money;assert.equal(d.setBiomeMenu(true),true);assert.equal(d.travelToBiome(biome.id),true);assert.equal(d.travelToBiome(biome.id),false);
    const s=d.model.state;assert.equal(d.roadHazards.contact(s.x,s.z,s.heading),undefined);assert.ok(d.roadHazards.rocks.every(r=>r.phase==='dormant'));assert.equal(d.gameplay.state.testMode,true);assert.ok(!d.gameplay.state.run?.loaded);near(d.gameplay.state.fuels[car.id],beforeFuel);assert.equal(d.gameplay.state.money,beforeMoney);near(s.pathDistance,0);near(s.angularVelocity,0);near(s.linearSpeed,0);assert.equal(s.active,false);let roll=0;tick(app);roll+=s.pathDistance;tick(app);roll+=s.pathDistance;near(d.gameplay.state.fuels[car.id],beforeFuel-roll*car.consumption);cases++;
   }
  }
  app.dispose();current=null;
 }
 return{cases};
});
check('Hazard contact participates in actual swept solver, fuel and D/R for all ten cars',()=>{
 const app=create(max),d=app.debug,rows=[];
 for(const car of VEHICLE_CONFIG)for(const reverse of [false,true]){
  d.returnToGarage();d.gameplay.state.cooldown=0;d.enterVehicle(car.id);const h=d.roadHazards.hazards.find(h=>h.type==='repair'),sign=reverse?-1:1;
  const s=setupAt(app,h.distance-sign*14,h.offset,sign*getVehiclePerformance(car.id,max).maxSpeed);
  d.model.setGear(reverse?'R':'D');d.model.setInput({active:true,steering:0});
  let path=0,blocked=0,maxStep=0;const fuel=d.gameplay.state.fuels[car.id];
  for(let i=0;i<100;i++){const x=s.x,z=s.z;tick(app,.05);path+=s.pathDistance;blocked+=Number(s.blocked);maxStep=Math.max(maxStep,Math.hypot(s.x-x,s.z-z));assert.ok(!d.roadHazards.contact(s.x,s.z,s.heading),'No residual solid penetration');assert.ok(truckInRoad(s.x,s.z,s.heading));assert.equal(d.gameplay.state.mode,'driving');assert.equal(d.gameplay.state.money,7654);assert.ok([s.x,s.z,s.heading,s.velocityX,s.velocityZ,s.angularVelocity].every(Number.isFinite));}
  assert.ok(blocked>0,'A visible block must stop a direct hit');assert.ok(Math.abs(projectRoad(s.x,s.z).distance-h.distance)<14,'No tunnel through the block');assert.ok(maxStep<=getVehiclePerformance(car.id,max).maxSpeed*.05+.4);
  near(d.gameplay.state.fuels[car.id],fuel-path*car.consumption,1e-6);
  // Shift into the opposite direction and leave contact naturally; no pose edit.
  d.model.setGear(reverse?'D':'R');d.model.setInput({active:true,steering:0});const start=projectRoad(s.x,s.z).distance;
  for(let i=0;i<100;i++)tick(app,.05);
  assert.ok((projectRoad(s.x,s.z).distance-start)*sign< -3,'Vehicle can back away, not glue to hazard');
  rows.push({id:car.id,reverse,blocked,maxStep});
 }
 return rows;
});
check('Rock simulation pauses for menus, blur, hidden, overview and context loss; resets do not farm',()=>{
 const app=create(max),d=app.debug;d.gameplay.state.cooldown=0;d.enterVehicle('ashhauler');
 const h=d.roadHazards.hazards.find(h=>h.type==='rock');const s=setupAt(app,h.distance-170,0,5,h.branch);tick(app);tick(app);
 let rock=d.roadHazards.rocks.find(r=>r.id===h.id);assert.equal(rock.phase,'warning');assert.ok(d.roadHazardsScene.stats.visibleRocks>=1);
 const paused=fn=>{const snap=JSON.stringify(rock);fn();for(let i=0;i<20;i++)tick(app,.05);assert.equal(JSON.stringify(rock),snap)};
 paused(()=>d.setUpgradeMenu(true));d.setUpgradeMenu(false);
 paused(()=>d.setBiomeMenu(true));d.setBiomeMenu(false);
 paused(()=>app.win.dispatch('blur'));app.win.dispatch('focus');
 paused(()=>{app.doc.hidden=true;app.doc.dispatch('visibilitychange')});app.doc.hidden=false;app.doc.dispatch('visibilitychange');
 paused(()=>d.setDriving(false,false));d.setDriving(true,false);
 const fuel=d.gameplay.state.fuels.ashhauler,money=d.gameplay.state.money;
 assert.equal(d.setBiomeMenu(true),true);d.travelToBiome('volcanic');assert.ok(d.roadHazards.rocks.every(r=>r.phase==='dormant'));near(d.gameplay.state.fuels.ashhauler,fuel);assert.equal(d.gameplay.state.money,money);assert.equal(d.roadHazardsScene.stats.visibleRocks,0);
 setupAt(app,h.distance-170,0,5,h.branch);tick(app);tick(app);rock=d.roadHazards.rocks.find(r=>r.id===h.id);assert.equal(rock.phase,'warning');
 paused(()=>d.renderer.domElement.dispatch('webglcontextlost'));
 d.returnToGarage();assert.ok(d.roadHazards.rocks.every(r=>r.phase==='dormant'));assert.equal(d.gameplay.state.mode,'walking');assert.equal(d.gameplay.state.money,money);assert.equal(d.roadHazardsScene.stats.visibleRocks,0);
 return{warningSeconds:ROAD_HAZARD_RULES.warningSeconds,fallSeconds:ROAD_HAZARD_RULES.fallSeconds};
});
check('Soft patches modify only their finite footprints and are wired into all actual car models',()=>{
 const app=create(max),d=app.debug;const rows=[];
 for(const car of VEHICLE_CONFIG)for(const type of ['dune','ice']){const h=d.roadHazards.hazards.find(h=>h.type===type),base=roadGroundSurface(h.x,h.z,car.id),patch=d.roadHazards.surfaceAt(h.x,h.z,base);
  assert.ok(patch.frictionFactor<base.frictionFactor);if(type==='dune')assert.ok(patch.engineFactor<base.engineFactor);else assert.ok(patch.lateralDampingFactor<base.lateralDampingFactor);
  const far=d.roadHazards.surfaceAt(h.x+100,h.z,base);assert.equal(far,base);rows.push({id:car.id,type,gripRatio:patch.frictionFactor/base.frictionFactor});
 }
 assert.match(fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),/groundSurface:\(x,z,id\)=>roadHazards\.surfaceAt/);
 return rows;
});
check('Fuel zero, ordinary abort and regeneration clear pooled hazard state without payout',()=>{
 const app=create(),d=app.debug;
 for(const reason of ['fuel','abort']){d.gameplay.state.cooldown=0;d.enterVehicle('pickup');const h=d.roadHazards.hazards.find(h=>h.type==='rock');setupAt(app,h.distance-170,0,5,h.branch);tick(app);tick(app);assert.ok(d.roadHazards.rocks.some(r=>r.phase==='warning'));
  if(reason==='fuel'){d.gameplay.state.fuels.pickup=.001;d.model.setInput({active:true,steering:0});tick(app);tick(app)}else app.ids.get('garage-button').dispatch('click');
  assert.equal(d.gameplay.state.mode,'walking');assert.equal(d.gameplay.state.money,7654);assert.equal(d.gameplay.state.completedRuns,0);assert.ok(d.roadHazards.rocks.every(r=>r.phase==='dormant'));assert.equal(d.roadHazardsScene.stats.visibleRocks,0);
 }
 const previous=d.roadHazardsScene;d.rebuild(17);assert.equal(previous.stats.disposed,true);assert.equal(app.debug.roadHazards.hazards.length,ROAD_HAZARD_RULES.count);assert.equal(app.debug.gameplay.state.money,7654);assert.ok(app.debug.roadHazards.rocks.every(r=>r.phase==='dormant'));
});
fs.mkdirSync(new URL('../qa/road-hazards/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/road-hazards/app-integration.json',import.meta.url),JSON.stringify(report,null,2));
console.log(`Hazard app integration: ${report.checks.filter(c=>c.passed).length}/${report.checks.length} checks passed`);process.exitCode=report.checks.every(c=>c.passed)?0:1;
