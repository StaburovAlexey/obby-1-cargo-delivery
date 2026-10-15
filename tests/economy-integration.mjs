#!/usr/bin/env node



import assert from 'node:assert/strict';
import { createAppDom } from './fixtures/app-dom.mjs';
import { ECONOMY_CONFIG, VEHICLE_CONFIG, vehicleConfig } from '../dist/economy-config.js';
import { roadGroundSurface } from '../dist/driving-ground.js';
import { GAMEPLAY } from '../dist/gameplay.js';

let passed = 0, failed = 0;
const check = (name, run) => {
  const apps = [];
  try {
    run(options => { const app = createAppDom(options); apps.push(app); return app; });
    passed++; console.log(`PASS ${name}`);
  } catch (error) {
    failed++; console.error(`FAIL ${name}: ${error.stack}`);
  } finally { for (const app of apps) app.dispose(); }
};
const seededCareer = { version: 1, money: 7000, ownedVehicleIds: ['pickup'], characterId: 'bacon', completedRuns: 2 };
const advance = (app, frames = 1) => { for (let i = 0; i < frames; i++) app.frame(); };
const key = (app, code, down = true) => app.win.dispatch(down ? 'keydown' : 'keyup', {
  code, target: app.doc.body, stopImmediatePropagation() { this.stopped = true; },
});
const placeNearCar = (app, id) => {
  const g = app.debug.gameplay, v = app.debug.garage.vehicles.find(v => v.id === id);
  Object.assign(g.state.player, { x: v.park.x - 4.8, z: v.park.z });
  Object.assign(g.state, { cooldown: 0, interactionCooldown: 0, walked: 0 });
  app.frame(); return v;
};
const assertSaveBadge = app => {
  assert.equal(app.debug.gameplay.state.saveFailed, true);
  assert.equal(app.ids.get('save-notice').hidden, false);
  assert.match(app.ids.get('save-notice').getAttribute('aria-label'), /сохранение недоступно/i);
};

check('fresh career starts walking with zero money, only the free pickup, and no cargo', make => {
  const app = make({ startDriving: false }), d = app.debug, s = d.gameplay.state;
  assert.equal(s.money, 0); assert.equal(s.completedRuns, 0);
  assert.equal(s.mode, 'walking'); assert.equal(s.run, null);
  assert.deepEqual(s.ownedVehicleIds, ['pickup']);
  assert.equal(app.ids.get('wallet-value').textContent, '0');
  assert.equal(app.ids.get('save-notice').hidden, true);
  assert.equal(app.ids.get('vehicle-price-1').hidden, true);
  assert.equal(app.ids.get('vehicle-price-value-2').textContent, '1200');
  assert.equal(app.ids.get('vehicle-price-value-3').textContent, String(vehicleConfig('van').price));
  assert.ok(d.garage.vehicles.every(v => !v.cargo.visible));
  s.cooldown = 0;
  assert.equal(d.enterVehicle('rover'), false); assert.equal(d.enterVehicle('van'), false);
  assert.equal(s.mode, 'walking');
  advance(app, 90); assert.equal(s.mode, 'walking');
});

check('walking to locked car shows its price and cannot buy or board automatically', make => {
  const app = make({ startDriving: false, career: seededCareer });
  const v = placeNearCar(app, 'rover'), s = app.debug.gameplay.state;
  assert.equal(s.money, 7000); assert.deepEqual(s.ownedVehicleIds, ['pickup']);
  assert.equal(app.ids.get('buy-vehicle').hidden, false);
  assert.equal(app.ids.get('buy-label').textContent, 'Купить 1200');
  assert.equal(app.ids.get('buy-vehicle').dataset.affordable, 'true');
  key(app, 'KeyD'); advance(app, 90); key(app, 'KeyD', false);
  assert.equal(s.mode, 'walking'); assert.equal(s.money, 7000);
  assert.ok(Math.hypot(s.player.x - v.park.x, s.player.z - v.park.z) < GAMEPLAY.entryRadius);
});

check('explicit double purchase debits once; walking away and back boards the owned car', make => {
  const app = make({ startDriving: false, career: seededCareer });
  placeNearCar(app, 'rover');
  app.ids.get('buy-vehicle').dispatch('click'); app.ids.get('buy-vehicle').dispatch('click');
  const s = app.debug.gameplay.state;
  assert.equal(s.money, 5800); assert.equal(s.mode, 'walking');
  assert.deepEqual(s.ownedVehicleIds, ['pickup', 'rover']);
  assert.equal(app.ids.get('buy-vehicle').hidden, true);
  assert.equal(app.ids.get('vehicle-price-2').hidden, true);
  advance(app, 90); assert.equal(s.mode, 'walking');
  key(app, 'KeyA'); advance(app, 50); key(app, 'KeyA', false);
  assert.equal(s.blockedEntry, null);
  key(app, 'KeyD');
  for (let i = 0; i < 100 && s.mode === 'walking'; i++) app.frame();
  key(app, 'KeyD', false);
  assert.equal(s.mode, 'driving'); assert.equal(s.selectedId, 'rover');
  assert.equal(s.run.loaded, true); assert.equal(app.debug.walkInput.sample().active, false);
  const saved = JSON.parse(app.storage.getItem(ECONOMY_CONFIG.saveKey));
  assert.equal(saved.money, 5800); assert.deepEqual(saved.ownedVehicleIds, ['pickup', 'rover']);
});

check('both paid vehicles debit their configured prices once and persist separate ownership', make => {
  const app = make({ startDriving: false, career: seededCareer });
  let expectedMoney = seededCareer.money;
  for (const id of ['rover', 'van']) {
    placeNearCar(app, id);
    assert.equal(app.ids.get('buy-label').textContent, `Купить ${vehicleConfig(id).price}`);
    app.ids.get('buy-vehicle').dispatch('click'); app.ids.get('buy-vehicle').dispatch('click');
    expectedMoney -= vehicleConfig(id).price;
    assert.equal(app.debug.gameplay.state.money, expectedMoney);
    assert.equal(app.debug.gameplay.state.mode, 'walking');
    assert.equal(app.debug.gameplay.isOwned(id), true);
  }
  assert.equal(expectedMoney,seededCareer.money-vehicleConfig('rover').price-vehicleConfig('van').price);
  assert.deepEqual(app.debug.gameplay.state.ownedVehicleIds, ['pickup', 'rover', 'van']);
  const reloaded = make({ startDriving: false, storage: app.storage });
  assert.equal(reloaded.debug.gameplay.state.money,expectedMoney);
  assert.deepEqual(reloaded.debug.gameplay.state.ownedVehicleIds, ['pickup', 'rover', 'van']);
});

check('stale purchase click, insufficient money and airborne state cannot buy', make => {
  const app = make({ startDriving: false }), s = app.debug.gameplay.state;
  placeNearCar(app, 'rover'); app.ids.get('buy-vehicle').dispatch('click');
  assert.match(app.ids.get('session-note').textContent, /Недостаточно/);
  assert.equal(s.money, 0);
  s.money = 7000; Object.assign(s.player, { x: 0, z: 60 });
  app.ids.get('buy-vehicle').dispatch('click');
  assert.equal(s.money, 7000); assert.equal(app.ids.get('buy-vehicle').hidden, true);
  placeNearCar(app, 'rover'); s.jump.airborne = true;
  app.ids.get('buy-vehicle').dispatch('click');
  assert.deepEqual(s.ownedVehicleIds, ['pickup']); assert.equal(s.money, 7000);
});

check('each owned car shows fuel and speed while cargo remains logical only', make => {
  const app = make({ startDriving: false, career: { ...seededCareer, ownedVehicleIds: VEHICLE_CONFIG.map(v=>v.id) } });
  for (const spec of VEHICLE_CONFIG) {
    app.debug.gameplay.state.cooldown = 0; assert.equal(app.debug.enterVehicle(spec.id), true);
    assert.equal(app.ids.get('fuel-value').textContent, `${spec.capacity}/${spec.capacity}`);
    assert.equal(app.ids.get('fuel-meter').getAttribute('aria-valuemax'), String(spec.capacity));
    assert.equal(app.debug.garage.vehicles.filter(v => v.cargo.visible).length, 0);
    assert.equal(app.debug.garage.vehicles.find(v => v.id === spec.id).cargo.visible, false);
    for (const fuel of [spec.capacity * .5, .001]) {
      app.debug.gameplay.state.fuels[spec.id] = fuel; app.frame();
      assert.equal(app.ids.get('fuel-value').textContent, `${Math.ceil(fuel)}/${spec.capacity}`);
      assert.equal(app.ids.get('fuel-fill').style.width, `${100 * fuel / spec.capacity}%`);
      assert.equal(Number(app.ids.get('fuel-meter').getAttribute('aria-valuenow')), fuel);
    }
    app.debug.gameplay.state.fuels[spec.id] = spec.capacity;
    app.debug.model.setInput({ active: true, steering: 0 }); advance(app, 360);
    const actual=app.debug.model.state,expected=spec.maxSpeed*roadGroundSurface(actual.x,actual.z,spec.id).speedFactor;
    assert.ok(Math.abs(actual.speed - expected) < .35,`${spec.id}: current terrain speed`);
    assert.equal(app.ids.get('speed-value').textContent, String(Math.round(app.debug.model.state.linearSpeed * 3.6)));
    app.ids.get('garage-button').dispatch('click');
    assert.equal(app.debug.gameplay.state.run, null); assert.equal(app.debug.gameplay.state.money, 7000);
    assert.ok(app.debug.garage.vehicles.every(v => !v.cargo.visible));
    assert.equal(app.debug.input.state.active, false);
  }
});

check('refuel preserves cargo, run, wallet and camera while filling the selected tank', make => {
  const app = make(), d = app.debug, s = d.gameplay.state;
  const station = d.garage.stations[0], runId = s.run.id;
  Object.assign(d.model.state, { x: station.x, z: station.z, heading: 0 });
  d.applyTruckPose(); d.followTruck(1, true); const camera = d.camera.position.clone();
  s.fuels.pickup = 1; app.frame();
  assert.equal(s.fuels.pickup, 100); assert.equal(s.run.id, runId); assert.equal(s.run.loaded, true);
  assert.equal(s.money, 0); assert.equal(d.driving, true);
  assert.equal(d.rig.root.getObjectByName('One loaded delivery crate').visible, true);
  assert.ok(d.camera.position.distanceTo(camera) < 1e-7);
  assert.match(app.ids.get('session-note').textContent, /Груз сохранён/);
  advance(app, 30); assert.equal(s.money, 0);
});

check('delivery pays exactly once, persists and returns walking with all controls released', make => {
  const app = make(), d = app.debug, s = d.gameplay.state, delivery = d.garage.deliveries[0];
  Object.assign(d.model.state, { x: delivery.x, z: delivery.z, heading: 0 });
  app.pointer(app.wheel, 'pointerdown', 0, 1);
  d.renderer.domElement.dispatch('pointerdown', { pointerId: 9, button: 0, clientX: 100, clientY: 100 });
  assert.equal(d.input.state.active, true); assert.equal(d.lookInput.active, true);
  app.frame();
  assert.equal(s.money, delivery.reward); assert.equal(s.completedRuns, 1);
  assert.equal(s.mode, 'walking'); assert.equal(s.run, null);
  assert.equal(d.input.state.active, false); assert.equal(d.lookInput.active, false);
  assert.equal(d.character.group.visible, true); assert.equal(app.ids.get('fuel-hud').hidden, true);
  assert.equal(app.ids.get('wallet-value').textContent, String(delivery.reward));
  assert.ok(d.garage.vehicles.every(v => !v.cargo.visible)); assert.deepEqual(s.player, { ...GAMEPLAY.spawn });
  assert.match(app.ids.get('session-note').textContent, /Груз доставлен/);
  advance(app, 100); assert.equal(s.money, delivery.reward);
  assert.equal(JSON.parse(app.storage.getItem(ECONOMY_CONFIG.saveKey)).money, delivery.reward);
});

check('fuel zero wins over coincident delivery and leaves no money or cargo', make => {
  const app = make(), d = app.debug, s = d.gameplay.state, p = d.garage.deliveries[0];
  Object.assign(d.model.state, { x: p.x, z: p.z }); s.fuels.pickup = 0; app.frame();
  assert.equal(s.mode, 'walking'); assert.equal(s.money, 0); assert.equal(s.completedRuns, 0);
  assert.equal(s.run, null); assert.ok(d.garage.vehicles.every(v => !v.cargo.visible));
  assert.match(app.ids.get('session-note').textContent, /Топливо закончилось/);
  for (const [id, fuel] of Object.entries(s.fuels)) assert.equal(fuel, vehicleConfig(id).capacity);
});

check('purchase button releases its walking/look controls without acquiring another pointer', make => {
  const app = make({ startDriving: false, career: seededCareer }), d = app.debug;
  placeNearCar(app, 'rover');
  const stick = app.ids.get('walk-stick');
  stick.dispatch('pointerdown', { pointerId: 3, button: 0, clientX: 85, clientY: 70 });
  d.renderer.domElement.dispatch('pointerdown', { pointerId: 8, button: 0, clientX: 100, clientY: 100 });
  assert.equal(d.walkInput.sample().active, true); assert.equal(d.lookInput.active, true);
  app.ids.get('buy-vehicle').dispatch('pointerdown', { pointerId: 10, button: 0, clientX: 200, clientY: 300 });
  assert.equal(d.lookInput.pointerId, 8);
  app.ids.get('buy-vehicle').dispatch('click');
  assert.equal(d.walkInput.sample().active, false); assert.equal(d.lookInput.active, false);
  assert.equal(stick.hasPointerCapture(3), false); assert.equal(d.renderer.domElement.hasPointerCapture(8), false);
  assert.equal(d.gameplay.state.money, 5800);
});

check('pending enter event cannot replay entry or reset a newly rotated camera', make => {
  const app = make({ startDriving: false }), d = app.debug;
  d.gameplay.state.cooldown = 0; d.enterVehicle('pickup');
  const canvas = d.renderer.domElement;
  canvas.dispatch('pointerdown', { pointerId: 5, button: 0, clientX: 100, clientY: 100 });
  canvas.dispatch('pointermove', { pointerId: 5, clientX: 150, clientY: 120 });
  const yaw = d.cameraState.state.yaw; assert.ok(Number.isFinite(yaw) && Math.abs(yaw) > .1);
  app.frame(); assert.equal(d.cameraState.state.yaw, yaw); assert.equal(d.lookInput.active, true);
  assert.equal(d.gameplay.state.mode, 'driving'); assert.equal(d.gameplay.state.run.loaded, true);
});

check('reload preserves earned career and selected character without restoring or paying cargo', make => {
  const first = make({ startDriving: false, career: { ...seededCareer, characterId: 'pirate' } });
  placeNearCar(first, 'rover'); first.ids.get('buy-vehicle').dispatch('click');
  first.debug.gameplay.state.cooldown = 0; first.debug.enterVehicle('rover');
  const delivery = first.debug.garage.deliveries[1];
  Object.assign(first.debug.model.state, { x: delivery.x, z: delivery.z }); first.frame();
  const earnedMoney = 5800 + delivery.reward;
  first.debug.gameplay.state.cooldown = 0; first.debug.enterVehicle('rover');
  assert.equal(first.debug.gameplay.state.run.loaded, true);
  const second = make({ startDriving: false, storage: first.storage }), s = second.debug.gameplay.state;
  assert.equal(s.money, earnedMoney); assert.equal(s.completedRuns, 3);
  assert.deepEqual(s.ownedVehicleIds, ['pickup', 'rover']); assert.equal(s.characterId, 'pirate');
  assert.equal(second.debug.character.id, 'pirate'); assert.equal(s.mode, 'walking'); assert.equal(s.run, null);
  assert.ok(second.debug.garage.vehicles.every(v => !v.cargo.visible));
  advance(second, 120); assert.equal(s.money, earnedMoney);
  second.debug.rebuild(54); assert.equal(second.debug.gameplay.state.money, earnedMoney);
  assert.equal(second.debug.gameplay.state.characterId, 'pirate');
});

check('corrupt and wrong-version saves safely reset and show a persistent reset badge', make => {
  for (const raw of ['{broken', JSON.stringify({ ...seededCareer, version: 999 })]) {
    const app = make({ startDriving: false, storage: { getItem() { return raw; }, setItem() {} } });
    assert.equal(app.debug.gameplay.state.money, 0);
    assert.deepEqual(app.debug.gameplay.state.ownedVehicleIds, ['pickup']);
    assertSaveBadge(app); assert.equal(app.ids.get('save-notice').textContent, 'Сохранение сброшено');
  }
});

check('unavailable storage warning survives startup, ordinary frames and regeneration', make => {
  const app = make({ startDriving: false, storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
  assertSaveBadge(app); advance(app, 30); assertSaveBadge(app);
  app.ids.get('regenerate').dispatch('click'); assertSaveBadge(app);
});

check('write failure badge survives purchase/delivery toasts and preserves this-session state', make => {
  const app = make({ startDriving: false, storage: { getItem() { return JSON.stringify(seededCareer); }, setItem() { throw Error('quota'); } } });
  placeNearCar(app, 'rover'); app.ids.get('buy-vehicle').dispatch('click');
  assert.equal(app.debug.gameplay.state.money, 5800); assertSaveBadge(app);
  app.debug.gameplay.state.cooldown = 0; app.debug.enterVehicle('rover');
  const delivery = app.debug.garage.deliveries[0];
  Object.assign(app.debug.model.state, { x: delivery.x, z: delivery.z }); app.frame();
  assert.equal(app.debug.gameplay.state.money, 5800 + delivery.reward); assertSaveBadge(app);
  assert.match(app.ids.get('session-note').textContent, /Груз доставлен/);
  advance(app, 30); assertSaveBadge(app);
});

console.log(`Economy integration: ${passed}/${passed + failed} checks passed (renderer-free app fixture).`);
process.exitCode = failed ? 1 : 0;
