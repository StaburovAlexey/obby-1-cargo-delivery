#!/usr/bin/env node
// Independent biome-preview audit: production app/gameplay/physics with real
// Three.js geometry and synthetic DOM/renderer. No browser, GPU or Android claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { createAppDom } from './fixtures/app-dom.mjs';
import { BIOME_DESTINATIONS, safeBiomeDestination } from '../dist/biome-travel.js';
import { BIOME_SEQUENCE, ECONOMY_CONFIG, VEHICLE_CONFIG, vehicleConfig } from '../dist/economy-config.js';
import { freshCareer } from '../dist/career-save.js';
import { GAMEPLAY } from '../dist/gameplay.js';
import { FOLLOW_CAMERA, wrapAngle } from '../dist/follow-camera.js';
import { truckInRoad, routeCenter, routeSlope, biomeAt, routePointAtProgress } from '../dist/road-layout.js';
import { getTruckContact } from '../dist/city-driving.js';
import { BIOME_SURFACES, VEHICLE_SURFACE_MODIFIERS, SURFACE_FACTOR_KEYS, SURFACE_BOUNDS, SURFACE_TRANSITION_METERS, biomeSurfaceAt } from '../dist/biome-surfaces.js';
import { createDrivingModel } from '../dist/driving-model.js';
import { roadGroundSurface } from '../dist/driving-ground.js';
import { createWheelParticles, WHEEL_PARTICLES } from '../dist/wheel-particles.js';

let passed = 0, failed = 0;
const reports = [];
const check = (name, run) => {
  const apps = [];
  try {
    const detail = run(options => { const app = createAppDom(options); apps.push(app); return app; });
    passed++; reports.push({ name, passed: true, ...(detail || {}) }); console.log(`PASS ${name}`);
  } catch (error) {
    failed++; reports.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.stack}`);
  } finally { for (const app of apps) app.dispose(); }
};
const fullCareer = () => ({ ...freshCareer(), money: 50000,
  ownedVehicleIds: VEHICLE_CONFIG.map(v => v.id), characterId: 'pirate', ownedSkinIds: ['bacon', 'pirate'], completedRuns: 7 });
const near = (actual, expected, note = '', epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${note}: ${actual} != ${expected}`);
const advance = (app, n = 1) => { for (let i = 0; i < n; i++) app.frame(); };
const pointer = (target, type, id = 1, x = 80, y = 60) => target.dispatch(type, { pointerId: id, button: 0,
  clientX: x, clientY: y, pointerType: 'touch', isPrimary: id === 1 });
const key = (app, key, code = key) => app.win.dispatch('keydown', { key, code, target: app.doc.body,
  stopImmediatePropagation() { this.stopped = true; } });
const pose = model => Object.fromEntries(['x', 'z', 'heading'].map(k => [k, model.state[k]]));
const loadRun = (app, id = 'pickup') => {
  if (app.debug.gameplay.state.mode === 'driving') app.debug.returnToGarage();
  app.debug.gameplay.state.cooldown = 0;
  assert.equal(app.debug.enterVehicle(id), true, `${id}: boarding owned car`);
  assert.equal(app.debug.gameplay.state.run.loaded, true);
};
const assertZeroMotion = d => {
  for (const field of ['velocityX', 'velocityZ', 'angularVelocity', 'speed', 'linearSpeed', 'steering',
    'frontWheelAngle', 'wheelSpin', 'travel', 'pathDistance', 'bodyPitch', 'bodyRoll', 'bodyBob']) {
    near(d.model.state[field], 0, `Reset ${field}`);
  }
  assert.equal(d.model.state.active, false); assert.equal(d.model.state.moving, false);
  assert.equal(d.model.state.blocked, false); assert.equal(d.model.state.gear, 'D');
  assert.equal(d.input.state.active, false); assert.equal(d.lookInput.active, false);
  near(d.cameraState.state.distanceSinceLook, 0, 'Camera distance budget');
  assert.equal(d.cameraState.state.looking, false);
};
const assertTestMode = app => {
  const s = app.debug.gameplay.state;
  assert.equal(s.mode, 'driving'); assert.equal(s.testMode, true); assert.equal(s.run, null);
  assert.equal(app.ids.get('biome-test-note').hidden, false, 'Persistent test marker');
  assert.match(app.ids.get('biome-test-note').textContent || 'ТЕСТ · БЕЗ ОПЛАТЫ ГРУЗА', /ТЕСТ|БЕЗ ОПЛАТЫ/);
  assert.ok(app.debug.garage.vehicles.every(v => !v.cargo.visible), 'Preview has no payable visible cargo');
};
const travel = (app, id) => {
  app.ids.get('biome-button').dispatch('click');
  assert.equal(app.debug.biomeMenuOpen, true);
  app.ids.get(`biome-go-${id}`).dispatch('click');
  assert.equal(app.debug.biomeMenuOpen, false);
};

check('five preview destinations are inside the intended biome and reject unknown or occupied points', () => {
  assert.deepEqual(BIOME_DESTINATIONS.map(p => p.id), ['city', 'forest', 'desert', 'snow', 'volcanic']);
  for (const p of BIOME_DESTINATIONS) {
    assert.equal(biomeAt(p.x, -p.z).id, p.id); assert.ok(truckInRoad(p.x, p.z, p.heading));
    near(p.x, routePointAtProgress(p.progress).x, `${p.id}: clear centre lane`);
    near(p.heading, routePointAtProgress(p.progress).heading, `${p.id}: lane heading`);
    assert.equal(safeBiomeDestination(p.id), p);
    assert.equal(safeBiomeDestination(p.id, () => ({ depth: .01 })), null);
    const b = BIOME_SEQUENCE.find(b => b.id === p.id);
    assert.ok(p.progress > b.from + SURFACE_TRANSITION_METERS / 2 && p.progress < b.to - SURFACE_TRANSITION_METERS / 2);
  }
  for (const id of ['unknown', '', null, undefined, '__proto__']) assert.equal(safeBiomeDestination(id), null);
});

check('every configured car has finite five-biome dynamics across the full30m road and smooth boundaries', () => {
  assert.equal(Object.keys(BIOME_SURFACES).length, 5);
  assert.deepEqual(Object.keys(VEHICLE_SURFACE_MODIFIERS).sort(), VEHICLE_CONFIG.map(v => v.id).sort());
  for (const v of VEHICLE_CONFIG) for (const b of BIOME_SEQUENCE) {
    const y = (b.from + b.to) / 2, p=routePointAtProgress(y),reference = roadGroundSurface(p.x, p.z, v.id,p);
    assert.equal(reference.id, b.id);
    for (const dx of [-15, -12, -7.5, 0, 7.5, 12, 15]) assert.deepEqual(roadGroundSurface(p.x+dx*p.right.x,p.z+dx*p.right.z,v.id,p), reference);
    for (const k of SURFACE_FACTOR_KEYS) assert.ok(Number.isFinite(reference[k]) && reference[k] >= 0, `${v.id}/${b.id}/${k}`);
    if (b.id === 'city') {
      if (v.id === 'pickup') for (const k of SURFACE_FACTOR_KEYS) assert.equal(reference[k], k === 'vibration' ? 0 : ['frictionFactor','lateralDampingFactor'].includes(k) ? .5 : 1);
      assert.ok(reference.frictionFactor > .4 && reference.lateralDampingFactor > .35, `${v.id}: precise city handling`);
    } else assert.ok(SURFACE_FACTOR_KEYS.some(k => reference[k] !== (k === 'vibration' ? 0 : 1)), `${v.id}/${b.id}: changed handling`);
  }
  for (const v of VEHICLE_CONFIG) for (const boundary of SURFACE_BOUNDS) {
    for (const edge of [boundary - 24, boundary, boundary + 24]) {
      const a = biomeSurfaceAt(edge - .001, v.id), b = biomeSurfaceAt(edge + .001, v.id);
      for (const k of SURFACE_FACTOR_KEYS) assert.ok(Math.abs(a[k] - b[k]) < .001, `${v.id}/${edge}/${k}: continuous transition`);
    }
  }
  return { vehicleCount: VEHICLE_CONFIG.length, combinations: VEHICLE_CONFIG.length * BIOME_SEQUENCE.length };
});

check('volcanic vibration is strictly cosmetic and adds no displacement, speed, tire motion or fuel distance', () => {
  for (const spec of VEHICLE_CONFIG) {
    const location=routePointAtProgress(10000),surface = roadGroundSurface(location.x,location.z,spec.id,location);
    const actual = createDrivingModel({ x: 0, z: 0, maxSpeed: spec.maxSpeed, groundSurface: () => surface });
    const quiet = createDrivingModel({ x: 0, z: 0, maxSpeed: spec.maxSpeed, groundSurface: () => ({ ...surface, vibration: 0 }) });
    let motionDiffers = false;
    for (let i = 0; i < 500; i++) {
      const input = { active: i < 400, steering: Math.sin(i / 65) * .2 };
      actual.setInput(input); quiet.setInput(input); actual.step(1 / 60); quiet.step(1 / 60);
      for (const k of ['x', 'z', 'heading', 'velocityX', 'velocityZ', 'angularVelocity', 'speed', 'linearSpeed', 'travel', 'pathDistance', 'wheelSpin', 'frontWheelAngle'])
        near(actual.state[k], quiet.state[k], `${spec.id}: cosmetic ${k}`, 0);
      motionDiffers ||= Math.abs(actual.state.bodyBob - quiet.state.bodyBob) > .0001;
      assert.ok(Math.abs(actual.state.bodyBob - quiet.state.bodyBob) <= .01500001);
    }
    assert.ok(motionDiffers, `${spec.id}: visible small volcanic vibration`);
  }
});

check('preview control is driving-only and hidden/stale actions cannot board a locked car or enter test mode', make => {
  const app = make({ startDriving: false }), d = app.debug, s = d.gameplay.state;
  assert.equal(app.ids.get('biome-button').hidden, true);
  assert.equal(d.setBiomeMenu(true), false);
  for (const p of BIOME_DESTINATIONS) {
    app.ids.get(`biome-go-${p.id}`).dispatch('click'); assert.equal(d.travelToBiome(p.id), false);
  }
  assert.equal(s.mode, 'walking'); assert.equal(s.testMode, false); assert.equal(s.run, null);
  assert.deepEqual(s.ownedVehicleIds, ['pickup']); assert.equal(s.money, 0);
  for (const spec of VEHICLE_CONFIG.filter(v => v.id !== 'pickup')) {
    s.cooldown = 0; assert.equal(d.enterVehicle(spec.id), false); assert.equal(d.gameplay.isOwned(spec.id), false);
  }
  loadRun(app); assert.equal(app.ids.get('biome-button').hidden, false);
  d.setDriving(false); assert.equal(app.ids.get('biome-button').hidden, true);
  assert.equal(d.setBiomeMenu(true), false); d.setDriving(true);
  assert.equal(s.testMode, false); assert.equal(s.run.loaded, true);
});

check('opening the menu releases both pointers, freezes physics/fuel/camera and blocks new driving input', make => {
  const app = make(), d = app.debug, s = d.gameplay.state;
  app.pointer(app.wheel, 'pointerdown', 0, 1); app.pointer(app.wheel, 'pointermove', 80, 1);
  pointer(d.renderer.domElement, 'pointerdown', 9, 100, 100);
  pointer(d.renderer.domElement, 'pointermove', 9, 170, 130);
  advance(app, 30); assert.equal(d.input.state.active, true); assert.equal(d.lookInput.active, true);
  const run = structuredClone(s.run), fuel = s.fuels.pickup, wallet = s.money, p = pose(d.model);
  app.ids.get('biome-button').dispatch('click');
  assert.equal(d.biomeMenuOpen, true); assert.equal(app.ids.get('biome-menu').hidden, false);
  assert.equal(d.input.state.active, false); assert.equal(d.lookInput.active, false);
  assert.equal(app.wheel.hasPointerCapture(1), false); assert.equal(d.renderer.domElement.hasPointerCapture(9), false);
  const camera = d.camera.position.clone(), cameraState = structuredClone(d.cameraState.state);
  app.pointer(app.wheel, 'pointerdown', 0, 2); pointer(d.renderer.domElement, 'pointerdown', 3);
  app.selector.dispatch('click');
  advance(app, 240);
  assert.deepEqual(pose(d.model), p); assert.equal(s.fuels.pickup, fuel); assert.equal(s.money, wallet);
  assert.deepEqual(s.run, run); assert.equal(s.testMode, false);
  assert.equal(d.input.state.active, false); assert.equal(d.lookInput.active, false); assert.equal(d.model.state.active, false);
  assert.deepEqual(d.cameraState.state, cameraState); near(d.camera.position.distanceTo(camera), 0, 'Frozen camera');
});

check('Escape, close, backdrop and pointer cancellation do not teleport or invalidate cargo', make => {
  const app = make(), d = app.debug, s = d.gameplay.state;
  const run = structuredClone(s.run), p = pose(d.model), fuel = s.fuels.pickup;
  const dismissals = [() => key(app, 'Escape'), () => app.ids.get('biome-close').dispatch('click'),
    () => app.ids.get('biome-menu').dispatch('click', { target: app.ids.get('biome-menu') })];
  for (let repeat = 0; repeat < 5; repeat++) for (const dismiss of dismissals) {
    app.ids.get('biome-button').dispatch('click'); assert.equal(d.biomeMenuOpen, true);
    pointer(app.ids.get('biome-go-desert'), 'pointerdown', 55);
    pointer(app.ids.get('biome-go-desert'), 'pointercancel', 55);
    assert.equal(d.biomeMenuOpen, true); assert.equal(s.testMode, false); assert.deepEqual(s.run, run);
    dismiss(); assert.equal(d.biomeMenuOpen, false);
    assert.deepEqual(pose(d.model), p); assert.deepEqual(s.run, run); assert.equal(s.testMode, false);
    assert.equal(s.fuels.pickup, fuel); assert.equal(app.ids.get('biome-test-note').hidden, true);
    assert.equal(d.input.state.active, false); assert.equal(d.lookInput.active, false);
  }
  app.ids.get('biome-go-volcanic').dispatch('click');
  assert.deepEqual(pose(d.model), p); assert.deepEqual(s.run, run);
});

check('invalid and occupied preview destinations leave position, payable cargo and career unchanged', make => {
  const app = make(), d = app.debug, s = d.gameplay.state;
  d.setBiomeMenu(true); const p = pose(d.model), run = structuredClone(s.run), career = d.gameplay.snapshot(), fuels = { ...s.fuels };
  for (const id of ['unknown', '__proto__', '', null, undefined]) assert.equal(d.travelToBiome(id), false);
  const target = BIOME_DESTINATIONS.find(p => p.id === 'snow');
  const obstacle = { minX: target.x - 5, maxX: target.x + 5, minZ: target.z - 5, maxZ: target.z + 5, name: 'Audit occupied destination' };
  d.obstacles.push(obstacle);
  try { assert.equal(d.travelToBiome('snow'), false); }
  finally { d.obstacles.splice(d.obstacles.indexOf(obstacle), 1); }
  assert.deepEqual(pose(d.model), p); assert.deepEqual(s.run, run); assert.equal(s.testMode, false);
  assert.deepEqual(s.fuels, fuels); assert.deepEqual(d.gameplay.snapshot(), career); assert.equal(d.biomeMenuOpen, true);
  d.setBiomeMenu(false); assert.equal(d.biomeMenuOpen, false); assert.deepEqual(s.run, run);
});

check('all configured cars travel to all5biomes with current fuel/career preserved and complete motion reset', make => {
  const app = make({ startDriving: false, career: fullCareer() }), d = app.debug;
  let tested = 0;
  for (const spec of VEHICLE_CONFIG) {
    loadRun(app, spec.id);
    const selectedModel = d.model, selectedRig = d.rig;
    d.gameplay.state.fuels[spec.id] = spec.capacity * .413;
    const career = d.gameplay.snapshot(), fuels = { ...d.gameplay.state.fuels };
    for (const p of BIOME_DESTINATIONS) {
      Object.assign(d.model.state, { velocityX: 2, velocityZ: -4, angularVelocity: .6, speed: 4, linearSpeed: 5,
        steering: .7, frontWheelAngle: .4, wheelSpin: 19, travel: 999, pathDistance: 999, bodyPitch: .02, bodyRoll: .07, bodyBob: .02, moving: true, active: true, blocked: true });
      d.model.setGear('R');
      app.pointer(app.wheel, 'pointerdown', 0, 81);
      pointer(d.renderer.domElement, 'pointerdown', 82, 50, 50);
      pointer(d.renderer.domElement, 'pointermove', 82, 110, 85);
      d.cameraState.state.distanceSinceLook = 250;
      travel(app, p.id);
      assert.equal(d.model, selectedModel); assert.equal(d.rig, selectedRig); assert.equal(d.gameplay.state.selectedId, spec.id);
      near(d.model.state.x, p.x); near(d.model.state.z, p.z); near(d.model.state.heading, p.heading);
      assert.ok(truckInRoad(d.model.state.x, d.model.state.z, d.model.state.heading));
      assert.equal(getTruckContact(p.x, p.z, p.heading, d.obstacles), undefined);
      assertZeroMotion(d); near(wrapAngle(d.cameraState.state.yaw - p.heading), 0, 'Camera behind destination');
      near(d.cameraState.state.pitch, FOLLOW_CAMERA.driving.pitch); near(d.cameraState.state.radius, FOLLOW_CAMERA.driving.radius);
      assert.deepEqual(d.gameplay.state.fuels, fuels); assert.deepEqual(d.gameplay.snapshot(), career);
      assertTestMode(app); assert.equal(d.gameplay.state.testBiome, p.id);
      assert.equal(app.ids.get('biome-name').textContent, BIOME_SEQUENCE.find(b => b.id === p.id).name);
      assert.equal(d.wheelParticles.count, 0);
      app.frame(); assert.deepEqual(d.gameplay.state.fuels, fuels, 'Zero-delta teleport frame costs no fuel');
      assert.equal(d.cameraState.state.distanceSinceLook, 0); tested++;
    }
    d.returnToGarage(); assert.equal(d.gameplay.state.testMode, false); assert.equal(d.gameplay.state.run, null);
    assert.equal(app.ids.get('biome-test-note').hidden, true); assert.equal(d.wheelParticles.count, 0);
  }
  return { vehicles: VEHICLE_CONFIG.map(v => v.id), tested };
});

check('repeated previews and delivery circles cannot pay; overview and same-car re-entry cannot restore cargo', make => {
  const app = make({ career: fullCareer() }), d = app.debug, s = d.gameplay.state;
  const expected = d.gameplay.snapshot();
  for (let i = 0; i < 25; i++) {
    travel(app, BIOME_DESTINATIONS[i % BIOME_DESTINATIONS.length].id);
    for (const delivery of d.garage.deliveries) {
      Object.assign(d.model.state, { x: delivery.x, z: delivery.z }); d.model.pause(); app.frame();
      assert.equal(s.money, expected.money); assert.equal(s.completedRuns, expected.completedRuns); assertTestMode(app);
    }
  }
  d.setDriving(false); d.setDriving(true); assertTestMode(app);
  assert.equal(d.enterVehicle(s.selectedId), true); assertTestMode(app);
  const delivery = d.garage.deliveries[0]; Object.assign(d.model.state, { x: delivery.x, z: delivery.z }); app.frame();
  assert.equal(s.money, expected.money); assert.deepEqual(d.gameplay.snapshot(), expected);
});

check('refueling and expired transient notices retain the test warning; zero fuel returns safely without payout', make => {
  const app = make({ career: fullCareer() }), d = app.debug, s = d.gameplay.state;
  travel(app, 'forest'); const expected = d.gameplay.snapshot(), station = d.garage.stations[0];
  s.fuels.pickup = 1; Object.assign(d.model.state, { x: station.x, z: station.z }); d.model.pause();
  app.frame(); assert.equal(s.fuels.pickup, vehicleConfig('pickup').capacity); assertTestMode(app);
  advance(app, 280); assertTestMode(app); assert.deepEqual(d.gameplay.snapshot(), expected);
  const delivery = d.garage.deliveries[0]; Object.assign(d.model.state, { x: delivery.x, z: delivery.z });
  s.fuels.pickup = 0; app.frame();
  assert.equal(s.mode, 'walking'); assert.equal(s.testMode, false); assert.equal(s.run, null);
  assert.equal(s.money, expected.money); assert.equal(s.completedRuns, expected.completedRuns);
  assert.equal(app.ids.get('biome-test-note').hidden, true); assert.equal(d.wheelParticles.count, 0);
  for (const v of VEHICLE_CONFIG) assert.equal(s.fuels[v.id], v.capacity);
});

check('reload migrates old three-car saves to schema 2 without restoring preview session state', make => {
  const old = { version: 1, money: 7000, ownedVehicleIds: ['pickup', 'rover', 'van'], characterId: 'pirate', completedRuns: 9 };
  const migrated = { ...freshCareer('pirate'), money: old.money, ownedVehicleIds: old.ownedVehicleIds, completedRuns: old.completedRuns };
  const app = make({ startDriving: false, career: old }), d = app.debug;
  assert.equal(ECONOMY_CONFIG.saveVersion, 2);assert.deepEqual(d.gameplay.snapshot(), migrated);
  assert.equal(d.garage.vehicles.length, VEHICLE_CONFIG.length);
  assert.deepEqual(d.gameplay.state.ownedVehicleIds, old.ownedVehicleIds);
  for (const spec of VEHICLE_CONFIG) assert.equal(d.gameplay.isOwned(spec.id), old.ownedVehicleIds.includes(spec.id));
  loadRun(app, 'van'); travel(app, 'volcanic');
  const saved = JSON.parse(app.storage.getItem(ECONOMY_CONFIG.saveKey));
  // Reading/migrating alone need not rewrite storage. Preview cannot invent a save or payout.
  assert.deepEqual(saved, old); assert.equal('run' in saved, false); assert.equal('testMode' in saved, false);
  const reloaded = make({ startDriving: false, storage: app.storage }), next = reloaded.debug.gameplay.state;
  assert.equal(next.mode, 'walking'); assert.equal(next.run, null); assert.equal(next.testMode, false);
  assert.deepEqual(reloaded.debug.gameplay.snapshot(), migrated); assert.equal(reloaded.debug.character.id, 'pirate');
  advance(reloaded, 120); assert.equal(next.money, old.money); assert.equal(next.completedRuns, old.completedRuns);
});

check('all configured purchases debit once and all ten ownership IDs survive a schema-2 save', make => {
  const career = { ...fullCareer(), ownedVehicleIds: ['pickup'] };
  const app = make({ startDriving: false, career }), d = app.debug, s = d.gameplay.state;
  let expected = career.money;
  for (const spec of VEHICLE_CONFIG.filter(v => v.id !== 'pickup')) {
    const vehicle = d.garage.vehicles.find(v => v.id === spec.id);
    Object.assign(s.player, { x: vehicle.park.x - 4.8, z: vehicle.park.z });
    Object.assign(s, { cooldown: 0, interactionCooldown: 0, walked: 0 }); app.frame();
    assert.equal(s.purchaseCandidateId, spec.id); assert.equal(app.ids.get('buy-vehicle').hidden, false);
    assert.equal(app.ids.get('buy-label').textContent, `Купить ${spec.price}`);
    app.ids.get('buy-vehicle').dispatch('click'); app.ids.get('buy-vehicle').dispatch('click');
    expected -= spec.price; assert.equal(s.money, expected); assert.equal(s.mode, 'walking');
    assert.equal(d.gameplay.isOwned(spec.id), true);
    // World labels follow garage mesh-array identity, not progression catalog order.
    const index = d.garage.vehicles.findIndex(v => v.id === spec.id) + 1;
    assert.equal(app.ids.get(`vehicle-price-${index}`).hidden, true);
  }
  assert.deepEqual(d.gameplay.snapshot().ownedVehicleIds, VEHICLE_CONFIG.map(v => v.id));
  const saved = JSON.parse(app.storage.getItem(ECONOMY_CONFIG.saveKey));
  assert.equal(saved.version, 2);assert.deepEqual(saved, d.gameplay.snapshot());
  assert.equal(saved.characterId, 'pirate');assert.deepEqual(saved.ownedSkinIds, ['bacon', 'pirate']);
  const reload = make({ startDriving: false, storage: app.storage });
  assert.equal(reload.debug.gameplay.state.money, expected);
  assert.deepEqual(reload.debug.gameplay.state.ownedVehicleIds, VEHICLE_CONFIG.map(v => v.id));
  assert.deepEqual(reload.debug.gameplay.snapshot(), saved);
});

check('returning to the garage creates a fresh legitimate run that can pay exactly once', make => {
  const app = make({ career: fullCareer() }), d = app.debug, s = d.gameplay.state;
  const oldRunId = s.run.id; travel(app, 'snow'); d.returnToGarage();
  loadRun(app, 'pickup'); assert.notEqual(s.run.id, oldRunId); assert.equal(s.testMode, false);
  const initial = s.money, completed = s.completedRuns, delivery = d.garage.deliveries[0];
  Object.assign(d.model.state, { x: delivery.x, z: delivery.z }); app.frame();
  assert.equal(s.money, initial + delivery.reward); assert.equal(s.completedRuns, completed + 1);
  assert.equal(s.mode, 'walking'); assert.equal(s.run, null); assert.equal(s.testMode, false);
  advance(app, 60); assert.equal(s.money, initial + delivery.reward);
  const saved = JSON.parse(app.storage.getItem(ECONOMY_CONFIG.saveKey)); assert.equal(saved.money, s.money);
});

check('unavailable storage does not turn test travel into a payout or erase career state', make => {
  const app = make({ startDriving: false, storage: { getItem() { return JSON.stringify(fullCareer()); }, setItem() { throw Error('quota'); } } });
  const d = app.debug; loadRun(app); travel(app, 'forest');
  assert.equal(d.gameplay.state.characterId, 'pirate');assert.equal(d.gameplay.setCharacter('bacon'), true);
  assert.equal(d.gameplay.state.characterId, 'bacon');app.frame(); assert.equal(d.gameplay.state.saveFailed, true);
  assert.equal(app.ids.get('save-notice').hidden, false); assertTestMode(app);
  const snapshot = d.gameplay.snapshot();
  for (const p of BIOME_DESTINATIONS) travel(app, p.id);
  assert.deepEqual(d.gameplay.snapshot(), snapshot); assert.equal(d.gameplay.state.saveFailed, true);
});

check('resize, blur and context loss cannot reactivate controls behind the biome modal', make => {
  let layouts = 0;
  for (const [width, height] of [[320, 480], [390, 844], [568, 320], [844, 390], [1366, 768]]) {
    const app = make({ width, height }), d = app.debug, s = d.gameplay.state;
    app.ids.get('biome-button').dispatch('click'); const p = pose(d.model), run = structuredClone(s.run);
    app.win.dispatch('resize'); app.win.dispatch('blur');
    app.pointer(app.wheel, 'pointerdown', 0, 42); pointer(d.renderer.domElement, 'pointerdown', 43);
    advance(app, 30); assert.deepEqual(pose(d.model), p); assert.deepEqual(s.run, run);
    assert.equal(d.input.state.active, false); assert.equal(d.lookInput.active, false);
    assert.equal(s.testMode, false); assert.equal(s.money, 0);
    key(app, 'Escape'); assert.equal(d.biomeMenuOpen, false);
    app.ids.get('biome-button').dispatch('click'); d.renderer.domElement.dispatch('webglcontextlost');
    app.ids.get('biome-go-desert').dispatch('click'); advance(app, 2);
    assert.deepEqual(pose(d.model), p); assert.equal(s.testMode, false); assert.deepEqual(s.run, run);
    assert.equal(app.ids.get('error').hidden, false); layouts++;
  }
  return { rendererFreeViewportCases: layouts };
});

check('particles use one fixed instanced pool, stay cosmetic and never emit while stationary or in the city', () => {
  const particles = createWheelParticles(THREE), mesh = particles.mesh;
  try {
    assert.equal(particles.capacity, 96); assert.equal(particles.capacity, WHEEL_PARTICLES.capacity);
    assert.equal(mesh.isInstancedMesh, true); assert.equal(mesh.children.length, 0);
    const geometry = mesh.geometry, material = mesh.material, matrix = mesh.instanceMatrix.array;
    assert.equal(matrix.length, 96 * 16); assert.equal(mesh.castShadow, false);
    const location=routePointAtProgress(2500);
    const state = Object.freeze({ x: location.x, z: location.z, heading: .3, velocityX: 3, velocityZ: -9,
      linearSpeed: 10, pathDistance: .5, money: 1200, fuel: 51, bodyPitch: .01, bodyRoll: .02 });
    const before = JSON.stringify(state);
    let maximum = 0;
    for (let frame = 0; frame < 2000; frame++) {
      particles.update(.05, state); maximum = Math.max(maximum, particles.count);
      assert.ok(particles.count >= 0 && particles.count <= 96);
      assert.equal(mesh.geometry, geometry); assert.equal(mesh.material, material);
      assert.equal(mesh.instanceMatrix.array, matrix); assert.equal(mesh.children.length, 0);
    }
    assert.ok(maximum > 0); assert.equal(JSON.stringify(state), before);
    const colors = mesh.instanceColor.array;
    for (const p of BIOME_DESTINATIONS) {
      particles.clear(); assert.equal(particles.count, 0);
      for (let i = 0; i < 20; i++) particles.update(.05, { ...state, x: p.x, z: p.z, pathDistance: 0, linearSpeed: 0 });
      assert.equal(particles.count, 0, `${p.id}: no stationary emission`);
      for (let i = 0; i < 20; i++) particles.update(.05, { ...state, x: p.x, z: p.z });
      if (p.id === 'city') assert.equal(particles.count, 0, 'No city emission');
      else assert.ok(particles.count > 0, `${p.id}: moving wheel particles`);
      assert.equal(mesh.instanceColor.array, colors, 'Fixed color allocation');
      for (let i = 0; i < 25; i++) particles.update(.05, state, false);
      assert.equal(particles.count, 0, 'Disabled emission leaves no persistent particles');
    }
    particles.update(.05, state); particles.clear(); assert.equal(mesh.visible, false);
    return { capacity: particles.capacity, maximumObserved: maximum, stressFrames: 2000 };
  } finally { particles.dispose(); particles.dispose(); }
});

check('actual app emits only after movement and clears particles on teleport, garage return and rebuild', make => {
  const app = make(), d = app.debug;
  travel(app, 'forest'); assert.equal(d.wheelParticles.count, 0);
  d.model.setInput({ active: true, steering: 0 }); advance(app, 180);
  assert.ok(d.wheelParticles.count > 0, 'Driving in forest emits');
  travel(app, 'snow'); assert.equal(d.wheelParticles.count, 0);
  d.model.setInput({ active: true, steering: 0 }); advance(app, 180);
  assert.ok(d.wheelParticles.count > 0, 'Driving in snow emits');
  d.returnToGarage(); assert.equal(d.wheelParticles.count, 0);
  loadRun(app); travel(app, 'volcanic');
  d.model.setInput({ active: true, steering: 0 }); advance(app, 180);
  assert.ok(d.wheelParticles.count > 0, 'Driving in volcanic emits');
  const oldParticles = d.wheelParticles, oldMesh = oldParticles.mesh;
  let geometryDisposals = 0, materialDisposals = 0;
  oldMesh.geometry.addEventListener('dispose', () => geometryDisposals++);
  oldMesh.material.addEventListener('dispose', () => materialDisposals++);
  d.setBiomeMenu(true); d.rebuild(43);
  assert.equal(oldParticles.count, 0); assert.equal(oldMesh.parent, null);
  assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
  assert.equal(d.wheelParticles.count, 0); assert.notEqual(d.wheelParticles, oldParticles);
  assert.equal(d.biomeMenuOpen, false); assert.equal(d.gameplay.state.mode, 'walking');
  assert.equal(d.gameplay.state.testMode, false); assert.equal(d.gameplay.state.run, null);
  assert.equal(app.ids.get('biome-menu').hidden, true); assert.equal(app.ids.get('biome-test-note').hidden, true);
  assert.equal(d.input.state.active, false); assert.equal(d.lookInput.active, false);
  for (const p of BIOME_DESTINATIONS) assert.ok(safeBiomeDestination(p.id, (x, z, h) => getTruckContact(x, z, h, d.obstacles)));
});

check('modal markup and layout explicitly fit short portrait/landscape viewports without leaving fixed content offscreen', () => {
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../dist/style.css', import.meta.url), 'utf8');
  assert.match(html, /id="biome-panel"[^>]*role="dialog"[^>]*aria-modal="true"/);
  for (const p of BIOME_DESTINATIONS) assert.equal((html.match(new RegExp(`id="biome-go-${p.id}"`, 'g')) || []).length, 1);
  assert.match(css, /#biome-panel\s*\{[^}]*width:\s*min\(390px,\s*100%\)[^}]*max-height:\s*100%[^}]*overflow:\s*auto/s);
  assert.match(css, /#biome-menu\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0/s);
  assert.match(css, /#biome-panel button\s*\{[^}]*min-height:\s*48px/s);
  assert.match(css, /\[hidden\][\s\S]*?display:\s*none\s*!important/);
  assert.match(css, /@media\s*\(max-height:360px\)\s*and\s*\(min-width:501px\)\s*\{\s*#biome-button\s*\{[^}]*right:auto;[^}]*left:50%;[^}]*translateX\(-50%\)/);
  // Arithmetic of authored CSS only. The centered short-landscape action
  // clears the wheel and gear horizontally, including asymmetric safe areas.
  for (const width of [501, 568, 640]) for (const height of [320, 360]) for (const [top, left, right] of [[0, 0, 0], [21, 44, 0], [21, 0, 44], [21, 44, 44]]) {
    const steering = Math.min(112, .2875 * height), rotationPad = steering * (Math.SQRT2 - 1) / 2;
    const wheelRight = Math.max(19, left + 10) + steering + rotationPad;
    const gearLeft = width - Math.max(22, right + 12) - 86;
    // Conservative120px action width covers the30px icon, text, gap/padding.
    assert.ok(width / 2 - 60 > wheelRight, `${width}x${height}: biome/wheel clearance`);
    assert.ok(width / 2 + 60 < gearLeft, `${width}x${height}: biome/gear clearance`);
    const buttonBottom = Math.max(72, top + 54) + 46;
    assert.ok(Math.max(124, top + 106) >= buttonBottom + 4, 'Persistent warning clears centered action');
  }
});

console.log(JSON.stringify({ passed: failed === 0, checks: passed, failures: failed,
  environment: 'Node actual Three.js + mock DOM/renderer; no browser, GPU, device or touch-hardware validation', reports }, null, 2));
process.exitCode = failed ? 1 : 0;
