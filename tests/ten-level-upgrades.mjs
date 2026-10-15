#!/usr/bin/env node


import assert from 'node:assert/strict';
import { VEHICLE_CONFIG, ECONOMY_CONFIG } from '../dist/economy-config.js';
import { PROGRESSION_CONFIG } from '../dist/progression-config.js';
import {
  UPGRADE_STATS, UPGRADE_MAX_LEVEL, sanitizeUpgradeLevels,
  sanitizeVehicleUpgrades, getUpgradeModifiers, getUpgradeOffer,
  getVehiclePerformance,
} from '../dist/vehicle-upgrades.js';
import { freshCareer, sanitizeCareer, createCareerStore } from '../dist/career-save.js';
import { createGameplay } from '../dist/gameplay.js';
import { brainDisplay, upgradeValuePresentation } from '../dist/progression-hud.js';
import { createAppDom } from './fixtures/app-dom.mjs';

const MAX = 10;
const STAT_IDS = ['speed', 'handling', 'grip', 'fuel'];
const ZERO = Object.fromEntries(STAT_IDS.map(id => [id, 0]));
const FULL = Object.fromEntries(STAT_IDS.map(id => [id, MAX]));
const allIds = VEHICLE_CONFIG.map(v => v.id);
const vehicles = VEHICLE_CONFIG.map((v, index) => ({
  id: v.id, park: { x: 24, z: 30 + index * 4.4, heading: Math.PI / 2 },
}));
const clone = value => structuredClone(value);
const near = (actual, expected, label = '') => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
  `${label}: ${actual} != ${expected}`,
);
const fleetCareer = (extra = {}) => ({
  ...freshCareer(), money: 345678, ownedVehicleIds: [...allIds], ...extra,
});
const storage = career => ({
  raw: JSON.stringify(career), writes: 0,
  getItem(key) { assert.equal(key, ECONOMY_CONFIG.saveKey); return this.raw; },
  setItem(key, value) { assert.equal(key, ECONOMY_CONFIG.saveKey); this.raw = value; this.writes++; },
});
const gameplay = options => createGameplay({ vehicles, ...options });
const enter = (game, id) => {
  game.state.cooldown = 0;
  assert.equal(game.enter(id), true, `enter ${id}`);
  game.events();
};
const transactionState = game => clone({
  career: game.snapshot(), fuels: game.state.fuels, run: game.state.run,
  player: game.state.player, mode: game.state.mode, selectedId: game.state.selectedId,
});
let groups = 0;
const check = (name, run) => {
  const details = run();
  groups++;
  console.log(`PASS ${name}${details ? ': ' + JSON.stringify(details) : ''}`);
};

check('All ten cars expose four ten-level stats with bounded, increasing offers', () => {
  assert.equal(VEHICLE_CONFIG.length, 10);
  assert.equal(UPGRADE_MAX_LEVEL, MAX);
  assert.deepEqual(UPGRADE_STATS.map(stat => stat.id), STAT_IDS);
  let offers = 0;
  for (const stat of UPGRADE_STATS) {
    assert.equal(stat.maxLevel, MAX);
    assert.equal(stat.step, stat.id === 'fuel' ? .03 : .01);
  }
  for (const v of VEHICLE_CONFIG) {
    for (const stat of UPGRADE_STATS) {
      let lastPrice = 0;
      for (let level = 0; level <= MAX; level++) {
        const levels = { ...ZERO, [stat.id]: level };
        const offer = getUpgradeOffer(v.id, stat.id, levels);
        const performance = getVehiclePerformance(v.id, levels);
        assert.equal(offer.level, level);
        assert.equal(offer.maxLevel, MAX);
        assert.equal(offer.nextLevel, Math.min(MAX, level + 1));
        assert.equal(offer.maxed, level === MAX);
        assert.deepEqual(offer.currentPerformance, performance);
        if (level < MAX) {
          assert.ok(Number.isSafeInteger(offer.price) && offer.price > lastPrice);
          assert.ok(offer.next > offer.current);
          lastPrice = offer.price;
        } else {
          assert.equal(offer.price, null);
          assert.equal(offer.next, offer.current);
          assert.deepEqual(offer.nextPerformance, performance);
        }
        const modifiers = getUpgradeModifiers(levels);
        near(modifiers.speed, 1 + (stat.id === 'speed' ? .01 * level : 0));
        near(modifiers.engine, modifiers.speed);
        near(modifiers.handling, 1 + (stat.id === 'handling' ? .01 * level : 0));
        near(modifiers.grip, 1 + (stat.id === 'grip' ? .01 * level : 0));
        near(modifiers.fuel, 1 + (stat.id === 'fuel' ? .03 * level : 0));
        near(performance.maxSpeed, v.maxSpeed * modifiers.speed);
        near(performance.acceleration, v.acceleration * modifiers.engine);
        near(performance.handling, v.handling * modifiers.handling);
        near(performance.grip, v.grip * modifiers.grip);
        near(performance.capacity, v.capacity * modifiers.fuel);
        near(performance.range, v.range * modifiers.fuel);
        assert.equal(performance.consumption, v.consumption);
        near(performance.capacity / performance.consumption, performance.range);
        offers++;
      }
    }
  }
  assert.equal(getUpgradeOffer('missing-car', 'speed', ZERO), null);
  assert.equal(getUpgradeOffer(allIds[0], 'missing-stat', ZERO), null);
  return { offers };
});

check('Old zero-to-three-level saves retain levels, ownership and currencies on the original key', () => {
  assert.equal(ECONOMY_CONFIG.saveVersion, 2);
  assert.equal(ECONOMY_CONFIG.saveKey, 'urban-route-career-v1');
  let variants = 0;
  for (const oldThreeStatSave of [false, true]) {
    for (let oldLevel = 0; oldLevel <= 3; oldLevel++) {
      const ids = oldThreeStatSave ? STAT_IDS.slice(0, 3) : STAT_IDS;
      const career = fleetCareer({
        version: 2, money: 98765, brains: 198.234567, completedRuns: 17,
        upgrades: Object.fromEntries(allIds.map(id => [id,
          Object.fromEntries(ids.map(stat => [stat, oldLevel])),
        ])),
      });
      const original = clone(career), mem = storage(career);
      const store = createCareerStore({ storage: mem });
      const loaded = store.load();
      assert.equal(loaded.version, ECONOMY_CONFIG.saveVersion);
      for (const key of ['money', 'brains', 'completedRuns']) assert.equal(loaded[key], career[key]);
      assert.deepEqual(loaded.ownedVehicleIds, allIds);
      for (const id of allIds) assert.deepEqual(loaded.upgrades[id], {
        speed: oldLevel, handling: oldLevel, grip: oldLevel,
        fuel: oldThreeStatSave ? 0 : oldLevel,
      });
      assert.equal(store.save(loaded), true);
      assert.deepEqual(store.load(), loaded);
      assert.deepEqual(gameplay({ persistence: store }).state.upgrades, loaded.upgrades);
      assert.deepEqual(career, original, 'Migration must not mutate its input');
      variants++;
    }
  }
  return { variants, vehiclesPerVariant: allIds.length };
});

check('Hostile and excessive save levels cannot exceed ten, invoke getters, or grant unowned upgrades', () => {
  const samples = [
    [11, 10], [99999, 10], [Number.MAX_VALUE, 10], [10.9, 10], [9.9, 9],
    [3, 3], [0, 0], [-1, 0], [-Infinity, 0], [Infinity, 0], [NaN, 0],
    ['10', 0], [true, 0], [null, 0], [undefined, 0], [{}, 0], [[], 0],
  ];
  for (const stat of STAT_IDS) for (const [value, expected] of samples) {
    const input = { ...ZERO, [stat]: value };
    assert.equal(sanitizeUpgradeLevels(input)[stat], expected);
    for (const id of allIds) {
      const clean = sanitizeCareer(fleetCareer({ upgrades: { [id]: input } }));
      assert.equal(clean.upgrades[id][stat], expected);
    }
  }
  let invoked = 0;
  for (const stat of STAT_IDS) {
    const levels = { ...FULL };
    Object.defineProperty(levels, stat, { get() { invoked++; throw Error('Getter must not run'); } });
    assert.equal(sanitizeUpgradeLevels(levels)[stat], 0);
    assert.deepEqual(sanitizeCareer(fleetCareer({ upgrades: { [allIds[0]]: levels } })).upgrades[allIds[0]], ZERO);
  }
  const inherited = Object.create(FULL);
  assert.deepEqual(sanitizeUpgradeLevels(inherited), ZERO);
  assert.deepEqual(sanitizeVehicleUpgrades(Object.create({ [allIds[0]]: FULL }))[allIds[0]], ZERO);
  const hostile = {};
  Object.defineProperty(hostile, allIds[0], { get() { invoked++; throw Error('Car getter must not run'); } });
  assert.deepEqual(sanitizeVehicleUpgrades(hostile)[allIds[0]], ZERO);
  assert.deepEqual(sanitizeCareer(fleetCareer({ upgrades: hostile })).upgrades, freshCareer().upgrades);
  const throwingProxy = new Proxy({}, { getOwnPropertyDescriptor() { throw Error('Hostile descriptor'); } });
  assert.deepEqual(sanitizeUpgradeLevels(throwingProxy), ZERO);
  assert.deepEqual(sanitizeVehicleUpgrades(throwingProxy), freshCareer().upgrades);
  assert.equal(invoked, 0);
  const unowned = sanitizeCareer({ ...freshCareer(), upgrades: Object.fromEntries(allIds.map(id => [id, FULL])) });
  assert.deepEqual(unowned.upgrades[allIds[0]], FULL);
  for (const id of allIds.slice(1)) assert.deepEqual(unowned.upgrades[id], ZERO);
  for (const value of [NaN, Infinity, -Infinity, '1000000', -1]) {
    const clean = sanitizeCareer(fleetCareer({ brains: value, money: value }));
    assert.equal(clean.brains, 0);
    assert.equal(clean.money, 0);
  }
  const capped = sanitizeCareer(fleetCareer({ brains: Number.MAX_VALUE, money: Number.MAX_VALUE }));
  assert.equal(capped.brains, PROGRESSION_CONFIG.maxBrains);
  assert.equal(capped.money, ECONOMY_CONFIG.maxSavedMoney);
});

const totalCost = VEHICLE_CONFIG.reduce((fleetTotal, v) => fleetTotal + UPGRADE_STATS.reduce(
  (carTotal, stat) => carTotal + Array.from({ length: MAX }, (_, level) =>
    getUpgradeOffer(v.id, stat.id, { [stat.id]: level }).price,
  ).reduce((sum, price) => sum + price, 0), 0,
), 0);
const initialBrains = totalCost + .125;
assert.ok(initialBrains < PROGRESSION_CONFIG.maxBrains);
let completedStorage;
const assertHud = (app, vehicle, stat) => {
  const game = app.debug.gameplay, levels = game.state.upgrades[vehicle.id];
  const offer = getUpgradeOffer(vehicle.id, stat.id, levels), prefix = 'upgrade-' + stat.id;
  const node = suffix => app.ids.get(prefix + suffix);
  assert.equal(node('-level').textContent, `${levels[stat.id]} / 10`);
  assert.equal(node('-price').textContent, offer.maxed ? 'МАКС' : String(offer.price));
  const presentation = upgradeValuePresentation(stat.id, offer);
  assert.equal(node('-value').textContent, presentation.value);
  assert.equal(node('-description').textContent, presentation.detail);
  assert.equal(node('-buy').disabled, offer.maxed || game.state.brains < offer.price);
  assert.equal(node('-buy').getAttribute('aria-label'), offer.maxed ? `${stat.name}: максимальный уровень`
    : `${stat.name}: уровень ${offer.nextLevel}, ${offer.price} мозгов. ${presentation.value}. ${presentation.detail}`);
};

check('All 400 app purchases deduct exact brains, refresh UI, preserve fuel and persist every level', () => {
  const mem = storage(fleetCareer({ brains: initialBrains }));
  const app = createAppDom({ startDriving: false, storage: mem });
  let purchases = 0, spent = 0, rejected = 0;
  try {
    const game = app.debug.gameplay, initialMoney = game.state.money;
    assert.equal(app.debug.setUpgradeMenu(true), false);
    for (const v of VEHICLE_CONFIG) {
      game.state.cooldown = 0;
      assert.equal(app.debug.enterVehicle(v.id), true);
      game.drive(v.range / 10, 0, -1000);
      game.events();
      const liveFuel = game.state.fuels[v.id], liveRun = clone(game.state.run), livePose = clone(game.state.player);
      assert.ok(liveFuel > 0 && liveFuel < v.capacity);
      app.ids.get('upgrade-button').dispatch('click');
      assert.equal(app.debug.upgradeMenuOpen, true);
      assert.equal(app.ids.get('upgrade-menu').hidden, false);
      assert.equal(app.ids.get('upgrade-car-name').textContent, v.name);
      for (const stat of UPGRADE_STATS) {
        for (let level = 0; level < MAX; level++) {
          assertHud(app, v, stat);
          const price = getUpgradeOffer(v.id, stat.id, game.state.upgrades[v.id]).price;
          const balance = game.state.brains;
          game.state.brains = price - .125;
          const deniedState = transactionState(game), writesBeforeDenial = mem.writes;
          app.ids.get('upgrade-' + stat.id + '-buy').dispatch('click');
          assert.deepEqual(transactionState(game), deniedState);
          assert.equal(mem.writes, writesBeforeDenial);
          assertHud(app, v, stat);
          rejected++;
          game.state.brains = balance;
          const beforeLevels = clone(game.state.upgrades), writesBeforePurchase = mem.writes;
          app.ids.get('upgrade-' + stat.id + '-buy').dispatch('click');
          spent += price;
          purchases++;
          beforeLevels[v.id][stat.id] = level + 1;
          assert.deepEqual(game.state.upgrades, beforeLevels, 'Only the chosen car and stat change');
          assert.equal(game.state.brains, initialBrains - spent);
          assert.equal(game.state.money, initialMoney);
          assert.equal(game.state.completedRuns, 0);
          assert.equal(game.state.fuels[v.id], liveFuel, 'Purchasing capacity never creates current fuel');
          assert.deepEqual(game.state.run, liveRun);
          assert.deepEqual(game.state.player, livePose);
          assert.equal(game.state.mode, 'driving');
          assert.equal(mem.writes, writesBeforePurchase + 1);
          assert.equal(app.ids.get('brain-value').textContent, brainDisplay(game.state.brains));
          for (const otherStat of UPGRADE_STATS) assertHud(app, v, otherStat);
          const reload = gameplay({ persistence: createCareerStore({ storage: mem }) });
          assert.deepEqual(reload.snapshot(), game.snapshot());
          assert.equal(reload.state.mode, 'walking');
          assert.equal(reload.state.run, null);
          near(reload.state.fuels[v.id], getVehiclePerformance(v.id, beforeLevels[v.id]).capacity);
          const stored = JSON.parse(mem.raw);
          for (const ephemeral of ['fuels', 'run', 'player', 'selectedId']) assert.equal(Object.hasOwn(stored, ephemeral), false);
        }
        const maxedState = transactionState(game), writesAtMax = mem.writes;
        for (let repeat = 0; repeat < 5; repeat++) {
          app.ids.get('upgrade-' + stat.id + '-buy').dispatch('click');
          rejected++;
        }
        assert.deepEqual(transactionState(game), maxedState, 'Eleventh and later purchases are inert');
        assert.equal(mem.writes, writesAtMax);
        assertHud(app, v, stat);
      }
      const pausedBrains = game.state.brains;
      for (let frame = 0; frame < 4; frame++) app.frame();
      assert.equal(game.state.brains, pausedBrains, 'An open upgrade menu cannot farm brains');
      assert.equal(game.state.fuels[v.id], liveFuel);
      app.debug.returnToGarage();
      assert.equal(app.ids.get('upgrade-button').hidden, true);
      assert.equal(app.debug.upgradeMenuOpen, false);
    }
    assert.equal(purchases, 400);
    assert.equal(spent, totalCost);
    assert.equal(game.state.brains, .125);
    completedStorage = mem;
  } finally { app.dispose(); }
  return { purchases, rejectedClicks: rejected, exactTotalBrains: spent };
});

check('A fresh app restores all forty maximums, exact balances and disabled maximum controls', () => {
  const saved = JSON.parse(completedStorage.raw);
  const app = createAppDom({ startDriving: false, storage: completedStorage });
  try {
    const game = app.debug.gameplay;
    assert.deepEqual(game.snapshot(), saved);
    assert.equal(game.state.brains, .125);
    for (const v of VEHICLE_CONFIG) {
      game.state.cooldown = 0;
      assert.equal(app.debug.enterVehicle(v.id), true);
      assert.equal(app.debug.setUpgradeMenu(true), true);
      assert.deepEqual(game.state.upgrades[v.id], FULL);
      near(game.state.fuels[v.id], v.capacity * 1.3);
      for (const stat of UPGRADE_STATS) assertHud(app, v, stat);
      assert.equal(app.doc.activeElement, app.ids.get('upgrade-close'));
      const before = transactionState(game), writes = completedStorage.writes;
      for (const stat of UPGRADE_STATS) app.ids.get('upgrade-' + stat.id + '-buy').dispatch('click');
      assert.deepEqual(transactionState(game), before);
      assert.equal(completedStorage.writes, writes);
      app.debug.returnToGarage();
    }
  } finally { app.dispose(); }
});

check('Walking, unowned, unknown and exact-balance purchases cannot exchange or create currencies', () => {
  for (const stat of UPGRADE_STATS) {
    const first = VEHICLE_CONFIG[0], price = getUpgradeOffer(first.id, stat.id, ZERO).price;
    const game = gameplay({ career: { ...freshCareer(), money: ECONOMY_CONFIG.maxSavedMoney, brains: price } });
    let before = transactionState(game);
    assert.equal(game.buyUpgrade(stat.id), false);
    assert.deepEqual(transactionState(game), before);
    enter(game, first.id);
    game.state.selectedId = allIds[1];
    before = transactionState(game);
    assert.equal(game.buyUpgrade(stat.id), false);
    assert.deepEqual(transactionState(game), before);
    game.state.selectedId = first.id;
    before = transactionState(game);
    for (const unknown of ['missing', '__proto__', 'constructor', '', null, undefined]) {
      assert.equal(game.buyUpgrade(unknown), false);
      assert.deepEqual(transactionState(game), before);
    }
    assert.equal(game.buyUpgrade(stat.id), true, 'Exact brain balance must suffice');
    assert.equal(game.state.brains, 0);
    assert.equal(game.state.money, ECONOMY_CONFIG.maxSavedMoney);
    assert.equal(game.state.upgrades[first.id][stat.id], 1);
    before = transactionState(game);
    assert.equal(game.buyUpgrade(stat.id), false, 'Money cannot substitute for brains');
    assert.deepEqual(transactionState(game), before);
    for (const dt of [0, -1, NaN, Infinity, PROGRESSION_CONFIG.maxFrameSeconds + 1]) {
      assert.equal(game.tickProgress(dt, { active: true, distance: 1 }), 0);
    }
    assert.equal(game.tickProgress(.1, { active: false, distance: 1 }), 0);
    assert.equal(game.tickProgress(.1, { active: true, distance: 0 }), 0);
    assert.deepEqual(transactionState(game), before);
  }
});

check('Failed writes never refund, double-purchase past ten, create fuel or duplicate save warnings', () => {
  for (const failure of ['throw', 'false']) {
    let attempts = 0, recovered = false, saved;
    const persistence = { save(value) {
      attempts++;
      if (recovered) { saved = clone(value); return true; }
      if (failure === 'throw') throw Error('Test storage failure');
      return false;
    } };
    const game = gameplay({ career: fleetCareer({ brains: initialBrains }), persistence });
    const v = VEHICLE_CONFIG[0];
    enter(game, v.id);
    game.drive(v.range / 10, 0, -1000);
    const fuel = game.state.fuels[v.id], money = game.state.money;
    let spent = 0;
    for (const stat of UPGRADE_STATS) {
      for (let level = 0; level < MAX; level++) {
        spent += getUpgradeOffer(v.id, stat.id, game.state.upgrades[v.id]).price;
        assert.equal(game.buyUpgrade(stat.id), true);
        assert.equal(game.state.upgrades[v.id][stat.id], level + 1);
        assert.equal(game.state.brains, initialBrains - spent);
        assert.equal(game.state.money, money);
        assert.equal(game.state.fuels[v.id], fuel);
      }
      const before = transactionState(game);
      for (let repeat = 0; repeat < 5; repeat++) assert.equal(game.buyUpgrade(stat.id), false);
      assert.deepEqual(transactionState(game), before);
    }
    assert.equal(attempts, 40);
    assert.equal(game.state.saveFailed, true);
    const events = game.events();
    assert.equal(events.filter(event => event.type === 'save-warning').length, 1);
    assert.equal(events.filter(event => event.type === 'upgrade-purchase').length, 40);
    recovered = true;
    game.tickProgress(.1, { active: true, distance: .2 });
    assert.equal(game.flushProgress(), true);
    assert.equal(game.state.saveFailed, false);
    assert.deepEqual(saved.upgrades[v.id], FULL);
    assert.equal(saved.money, money);
    near(saved.brains, initialBrains - spent + .1 * PROGRESSION_CONFIG.drivingRate);
  }
});

console.log(`Ten-level upgrades: ${groups} groups passed. Actual app/save/gameplay; renderer-free, no browser claim.`);
