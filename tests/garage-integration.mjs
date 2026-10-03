#!/usr/bin/env node
// Real application/state/geometry in a deliberately renderer-free DOM fixture.
// This is not a browser, WebGL, touchscreen, or character GLB rendering test.
import assert from 'node:assert/strict';
import { createAppDom } from './fixtures/app-dom.mjs';
import { createGameplay, GAMEPLAY, garageRoadContact, parkedVehicleContact, walkPointAllowed, isInGarage } from '../dist/gameplay.js';
import { corridorContact, truckInRoad } from '../dist/road-layout.js';
import { GARAGE_LAYOUT } from '../dist/garage-scene.js';

let passed = 0, failed = 0;
const check = (name, run) => {
  try { run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack}`); }
};
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const app = createAppDom({startDriving:false});
const advance = count => { for (let i = 0; i < count; i++) app.frame(); };
const key = (code, down = true) => app.win.dispatch(down ? 'keydown' : 'keyup', {code, stopImmediatePropagation(){ this.stopped = true; }});
const reset = () => { app.debug.returnToGarage(); advance(70); };

check('first load starts on foot in the garage with three cars and full fuel', () => {
  const {gameplay, garage, characterReady, character, driving, playing} = app.debug;
  assert.equal(characterReady, true); assert.equal(driving, false); assert.equal(playing, true);
  assert.equal(gameplay.state.mode, 'walking'); assert.equal(gameplay.state.selectedId, null);
  assert.deepEqual(gameplay.state.player, {...GAMEPLAY.spawn});
  assert.equal(character.group.visible, true);
  assert.equal(garage.vehicles.length, 3);
  assert.equal(app.ids.get('walk-ui').hidden, false); assert.equal(app.ids.get('fuel-hud').hidden, true);
  assert.ok(Object.values(gameplay.state.fuels).every(value => value === 100));
  advance(180);
  assert.equal(gameplay.state.mode, 'walking', 'idle must not enter a car');
});

check('all three parked cars auto-enter after a real walking approach', () => {
  for (const id of ['pickup', 'rover', 'van']) {
    reset();
    const car = app.debug.garage.vehicles.find(car => car.id === id);
    // Walk up the clear right aisle, then toward the right-wall car nose.
    key('KeyD');for(let i=0;i<134;i++)app.frame();key('KeyD',false);
    const dz=car.park.z-app.debug.gameplay.state.player.z;
    const direction=dz<0?'KeyW':'KeyS'; key(direction);
    for(let i=0;i<500&&Math.abs(app.debug.gameplay.state.player.z-car.park.z)>GAMEPLAY.walkSpeed/120;i++)app.frame();
    key(direction,false);near(app.debug.gameplay.state.player.z,car.park.z,GAMEPLAY.walkSpeed/120);
    key('KeyD');for(let i=0;i<500&&!app.debug.driving;i++)app.frame();key('KeyD',false);
    assert.equal(app.debug.gameplay.state.selectedId, id);
    assert.equal(app.debug.gameplay.state.mode, 'driving'); assert.equal(app.debug.driving, true);
    assert.equal(app.debug.rig, car.rig); assert.equal(app.debug.model, car.model);
    assert.equal(app.debug.character.group.visible, false);
    assert.equal(app.ids.get('walk-ui').hidden, true); assert.equal(app.ids.get('fuel-hud').hidden, false);
    assert.equal(app.debug.model.state.gear, 'D');
    near(app.debug.model.state.speed, 0);
    near(car.model.state.x, GAMEPLAY.roadSpawn.x); near(car.model.state.z, GAMEPLAY.roadSpawn.z);
    near(car.model.state.heading, GAMEPLAY.roadSpawn.heading);
    near(car.rig.root.position.x, GAMEPLAY.roadSpawn.x); near(car.rig.root.position.z, GAMEPLAY.roadSpawn.z);
    assert.ok(truckInRoad(car.model.state.x, car.model.state.z, car.model.state.heading));
    assert.ok(!isInGarage(car.model.state.x, car.model.state.z));
    for (const other of app.debug.garage.vehicles.filter(other => other !== car)) {
      near(other.model.state.x, other.park.x); near(other.model.state.z, other.park.z);
      near(other.rig.root.position.x, other.park.x); near(other.rig.root.position.z, other.park.z);
    }
    assert.equal(app.debug.walkInput.sample().active, false);
  }
});

check('forward, reverse, coasting and idle fuel follow actual model travel', () => {
  reset(); app.debug.gameplay.state.cooldown = 0; app.debug.enterVehicle('rover');
  const {model, gameplay} = app.debug;
  const station = app.debug.garage.stations[0];
  Object.assign(model.state, {x:0,z:-40,heading:0});
  const initial = gameplay.state.fuels.rover;
  advance(60); near(gameplay.state.fuels.rover, initial);
  model.setInput({active:true, steering:0});
  let sum = 0;
  for (let i = 0; i < 65; i++) { app.frame(); sum += Math.abs(model.state.travel); }
  near(gameplay.state.fuels.rover, initial - sum * 100 / GAMEPLAY.fuelRange);
  assert.ok(sum > 1); assert.ok(model.state.z < -40);
  model.pause(); model.setGear('R'); model.setInput({active:true, steering:0});
  const beforeReverse = gameplay.state.fuels.rover, reverseZ = model.state.z;
  sum = 0;
  for (let i = 0; i < 35; i++) { app.frame(); sum += Math.abs(model.state.travel); }
  assert.ok(model.state.z > reverseZ); assert.ok(sum > 0);
  near(gameplay.state.fuels.rover, beforeReverse - sum * 100 / GAMEPLAY.fuelRange);
  model.pause(); const paused = gameplay.state.fuels.rover; advance(30); near(gameplay.state.fuels.rover, paused);
  assert.ok(Math.hypot(model.state.x - station.x, model.state.z - station.z) > station.radius);
});

check('an empty tank returns atomically, resets all cars, and prevents instant re-entry', () => {
  reset(); app.debug.gameplay.state.cooldown = 0; app.debug.enterVehicle('van');
  const oldModel = app.debug.model;
  Object.assign(oldModel.state,{x:5,z:10,speed:8,heading:0});
  app.debug.gameplay.state.fuels.van = 0.00001;
  oldModel.setInput({active:true}); advance(2);
  assert.equal(app.debug.gameplay.state.mode, 'walking'); assert.equal(app.debug.gameplay.state.selectedId, null);
  assert.equal(app.debug.driving, false); assert.equal(app.debug.character.group.visible, true);
  assert.deepEqual(app.debug.gameplay.state.player, {...GAMEPLAY.spawn});
  assert.equal(app.debug.gameplay.state.lastEvent, 'garage');
  assert.equal(app.debug.input.sample?.()?.active ?? app.debug.model.state.active, false);
  for (const car of app.debug.garage.vehicles) {
    near(car.model.state.x, car.park.x); near(car.model.state.z, car.park.z);
    near(car.model.state.speed, 0); assert.equal(car.model.state.active, false);
    assert.equal(app.debug.gameplay.state.fuels[car.id], 100);
  }
  advance(180); assert.equal(app.debug.gameplay.state.mode, 'walking');
  const pure = createGameplay({vehicles: app.debug.garage.vehicles,stations:app.debug.garage.stations});
  pure.enter('pickup'); pure.events(); pure.state.fuels.pickup = 0.001;
  const station = app.debug.garage.stations[0]; pure.drive(1,station.x,station.z);
  assert.deepEqual(pure.events().map(event => event.type), ['garage'], 'empty fuel must win over a coincident refuel circle');
});

check('fuel-circle refill is automatic, fills the tank, and does not spam events', () => {
  reset(); app.debug.gameplay.state.cooldown = 0; app.debug.enterVehicle('pickup');
  const station = app.debug.garage.stations[0], state = app.debug.gameplay.state;
  Object.assign(app.debug.model.state, {x:station.x,z:station.z,heading:0});
  state.fuels.pickup = 12; app.frame();
  assert.equal(state.fuels.pickup, 100); assert.equal(state.stationId, station.id);
  assert.equal(app.ids.get('fuel-value').textContent, '100/100');
  const pure = createGameplay({vehicles:app.debug.garage.vehicles,stations:app.debug.garage.stations});
  pure.enter('pickup'); pure.events(); pure.state.fuels.pickup = 14;
  pure.drive(0, station.x, station.z);
  assert.deepEqual(pure.events().map(event => event.type), ['refuel']);
  for (let i = 0; i < 100; i++) pure.drive(0.01, station.x, station.z);
  assert.equal(pure.state.fuels.pickup, 100); assert.deepEqual(pure.events(), []);
  pure.drive(0, station.x + station.radius + 2, station.z);
  pure.state.fuels.pickup = 75; pure.drive(0, station.x, station.z);
  assert.deepEqual(pure.events().map(event => event.type), ['refuel']);
});

check('denied exit, overview/resume and top garage action preserve consistent control modes', () => {
  reset(); app.debug.gameplay.state.cooldown = 0; app.debug.enterVehicle('pickup');
  const {gameplay, model} = app.debug;
  assert.equal(app.debug.exitVehicle, undefined, 'No application exit action is exposed');
  gameplay.events(); const snapshot = structuredClone(gameplay.state);
  assert.equal(gameplay.exit(model.state, model.state.heading), false);
  assert.deepEqual(gameplay.state, snapshot); assert.deepEqual(gameplay.events(), []);
  assert.equal(app.debug.driving, true); assert.equal(app.debug.character.group.visible, false);
  const pose = {...gameplay.state.player};
  app.debug.setDriving(false); key('KeyW'); advance(30); key('KeyW', false);
  assert.deepEqual(gameplay.state.player, pose); assert.equal(gameplay.state.mode, 'driving');
  assert.equal(app.debug.controls.enabled, true);
  app.debug.setDriving(true); assert.equal(app.debug.controls.enabled, false);
  assert.equal(app.ids.get('walk-ui').hidden, true); assert.equal(app.ids.get('fuel-hud').hidden, false);
  app.ids.get('garage-button').dispatch('click');
  assert.deepEqual(gameplay.state.player, {...GAMEPLAY.spawn});
  assert.equal(gameplay.state.mode, 'walking'); assert.equal(gameplay.state.selectedId, null);
  assert.equal(app.debug.character.group.visible, true); assert.equal(app.ids.get('fuel-hud').hidden, true);
});

check('road-edge exits and interaction keys cannot disembark or mutate the session', () => {
  reset(); app.debug.gameplay.state.cooldown = 0; app.debug.enterVehicle('rover');
  Object.assign(app.debug.model.state, {x:12,z:6,heading:0});
  assert.ok(!parkedVehicleContact(12,6,0,app.debug.garage.vehicles,'rover'));
  const {gameplay, model} = app.debug;
  gameplay.events(); const snapshot = structuredClone(gameplay.state);
  for (let attempt = 0; attempt < 20; attempt++) {
    assert.equal(gameplay.exit(model.state, model.state.heading), false);
    assert.deepEqual(gameplay.state, snapshot); assert.deepEqual(gameplay.events(), []);
  }
  for (const [code, value] of [['KeyE','e'],['KeyF','f'],['Escape','Escape'],['Space',' ']]) {
    app.win.dispatch('keydown', {code, key:value}); advance(2);
    app.win.dispatch('keyup', {code, key:value});
    assert.equal(gameplay.state.mode, 'driving'); assert.equal(gameplay.state.selectedId, 'rover');
    assert.deepEqual(gameplay.state.player, snapshot.player); assert.equal(app.debug.character.group.visible, false);
  }
  app.ids.get('garage-button').dispatch('click');
  assert.equal(gameplay.state.mode, 'walking'); assert.ok(isInGarage(gameplay.state.player.x,gameplay.state.player.z));
  const before = gameplay.state.player.z;
  key('KeyS'); advance(20); key('KeyS', false);
  assert.ok(gameplay.state.player.z > before + 0.5, 'Returning to the garage must restore walking controls');
});

check('seed rebuild releases the old garage and starts a clean on-foot session', () => {
  const oldGarage = app.debug.garage, oldModels = oldGarage.vehicles.map(car => car.model);
  let disposed = 0; const originalDispose = oldGarage.dispose;
  oldGarage.dispose = () => { disposed++; return originalDispose(); };
  app.debug.rebuild(815);
  assert.equal(disposed, 1); assert.notEqual(app.debug.garage, oldGarage);
  assert.equal(oldGarage.group.parent, null);
  assert.equal(app.debug.city.stats.seed, 815);
  assert.equal(app.debug.gameplay.state.mode, 'walking');
  assert.deepEqual(app.debug.gameplay.state.player, {...GAMEPLAY.spawn});
  assert.ok(app.debug.garage.vehicles.every(car => !oldModels.includes(car.model)));
  advance(90); assert.equal(app.debug.gameplay.state.mode, 'walking');
});

check('selected cars stay on the finite road with no physical hangar connection', () => {
  for (const id of ['pickup', 'rover', 'van']) {
    reset(); app.debug.gameplay.state.cooldown = 0; app.debug.enterVehicle(id);
    const {model, garage} = app.debug;
    model.setInput({active:true,steering:0});
    advance(210);
    assert.ok(model.state.z < GAMEPLAY.roadSpawn.z - 10, `Selected car did not drive: ${model.state.z}`);
    assert.ok(truckInRoad(model.state.x,model.state.z,model.state.heading));
    assert.ok(!garageRoadContact(model.state.x,model.state.z,model.state.heading,corridorContact));
    assert.ok(garageRoadContact(0,30,0,corridorContact), 'Old road/hangar seam must be blocked');
    assert.ok(garageRoadContact(0,GARAGE_LAYOUT.spawn.z,0,corridorContact), 'Hangar is never part of the drivable road');
    for (const other of garage.vehicles.filter(car => car.id !== id)) {
      near(other.position.x, other.park.x); near(other.position.z, other.park.z);
      assert.ok(!truckInRoad(other.position.x,other.position.z,other.position.heading));
    }
  }
});

check('repeated boarding, denied exits and garage returns never stack cars or retain motion', () => {
  for (let cycle = 0; cycle < 3; cycle++) for (const id of ['pickup', 'rover', 'van']) {
    reset(); app.debug.gameplay.state.cooldown = 0;
    assert.equal(app.debug.enterVehicle(id), true);
    const {model, garage, gameplay} = app.debug;
    assert.equal(garage.vehicles.filter(car => truckInRoad(car.position.x,car.position.z,car.position.heading)).length, 1);
    model.setInput({active:true,steering:0.2}); advance(30);
    assert.equal(gameplay.exit(model.state, model.state.heading), false); assert.equal(gameplay.state.mode, 'driving');
    app.ids.get('garage-button').dispatch('click');
    advance(90); assert.equal(gameplay.state.mode, 'walking');
    // Boarding after a garage return still uses the checked launch.
    gameplay.state.cooldown = 0;
    assert.equal(app.debug.enterVehicle(id), true);
    near(model.state.x, GAMEPLAY.roadSpawn.x); near(model.state.z, GAMEPLAY.roadSpawn.z);
    for (const field of ['speed','frontWheelAngle','wheelSpin','bodyPitch','bodyRoll','bodyBob','travel']) near(model.state[field], 0);
    assert.equal(model.state.active, false); assert.equal(model.state.gear, 'D');
    app.debug.returnToGarage();
    assert.equal(gameplay.state.mode, 'walking'); assert.deepEqual(gameplay.state.player, {...GAMEPLAY.spawn});
    assert.equal(garage.vehicles.filter(car => truckInRoad(car.position.x,car.position.z,car.position.heading)).length, 0);
    assert.ok(Object.values(gameplay.state.fuels).every(fuel => fuel === 100));
  }
});

check('road launch validation fails safely before moving any car', () => {
  reset(); app.debug.gameplay.state.cooldown = 0;
  const blocker = {name:'QA launch obstruction',minX:-2,maxX:2,minZ:3,maxZ:9,minY:0,maxY:4};
  app.debug.obstacles.push(blocker);
  try {
    assert.equal(app.debug.enterVehicle('van'), false);
    assert.equal(app.debug.gameplay.state.mode, 'walking');
    assert.deepEqual(app.debug.gameplay.state.player, {...GAMEPLAY.spawn});
    for (const car of app.debug.garage.vehicles) {
      near(car.position.x, car.park.x); near(car.position.z, car.park.z);
    }
  } finally { app.debug.obstacles.splice(app.debug.obstacles.indexOf(blocker), 1); }
});

check('walking spaces are disjoint and the open doorway threshold cannot be crossed on foot', () => {
  assert.ok(walkPointAllowed(GAMEPLAY.spawn.x,GAMEPLAY.spawn.z));
  assert.ok(walkPointAllowed(GAMEPLAY.roadSpawn.x,GAMEPLAY.roadSpawn.z));
  for (let z = 23.1; z < GARAGE_LAYOUT.frontZ + 1.6; z += 0.25)
    assert.ok(!walkPointAllowed(0,z), `Unintended walking connection at z=${z}`);
  const pure = createGameplay({vehicles:[],stations:[]});
  pure.state.player = {x:0,z:GARAGE_LAYOUT.frontZ+2,heading:0};
  for (let i = 0; i < 1000; i++) pure.walk(1/60,{x:0,z:-1,running:true});
  assert.ok(pure.state.player.z >= GARAGE_LAYOUT.frontZ+1.6);
  assert.ok(isInGarage(pure.state.player.x,pure.state.player.z));
});

app.dispose();
console.log(`\nGarage app integration: ${passed} passed, ${failed} failed. Renderer-free only.`);
if (failed) process.exitCode = 1;
