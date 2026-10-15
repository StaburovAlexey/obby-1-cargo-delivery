#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDrivingModel, VEHICLE_DYNAMICS as P, TOW_DRIVING } from '../dist/driving-model.js';
import { VEHICLE_CONFIG as cars, BIOME_SEQUENCE as biomes } from '../dist/economy-config.js';
import { surfaceForBiome } from '../dist/biome-surfaces.js';
import { VEHICLE_CONFIG as originalCars } from '../qa/halved-handling/baseline/economy-config.js';
import { surfaceForBiome as originalSurface } from '../qa/halved-handling/baseline/biome-surfaces.js';
import { getVehiclePerformance } from '../dist/vehicle-upgrades.js';
import { getVehiclePerformance as originalPerformance } from '../qa/halved-handling/baseline/vehicle-upgrades.js';

const dt = P.fixedStep;
const near = (actual, expected, epsilon = 1e-8, context = '') =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon,
    `${context}: ${actual} != ${expected} ± ${epsilon}`);
const finite = (state, context) => {
  for (const [key, value] of Object.entries(state)) if (typeof value === 'number')
    assert.ok(Number.isFinite(value), `${context}/${key} must remain finite`);
};
const make = (car, biome, extra = {}) => createDrivingModel({
  x: 0, z: 0, vehicleId: car.id, maxSpeed: car.maxSpeed,
  groundSurface: () => surfaceForBiome(biome.id, car.id), ...extra,
});
const run = (model, seconds, inspect = () => {}) => {
  for (let frame = 0; frame < Math.round(seconds / dt); frame++) {
    const before = { ...model.state };
    model.step(dt);
    inspect(model.state, before, frame);
  }
};
const report = { scope: 'Actual production physics in Node; no browser, WebGL, touch-device or deployment claim',
  carCount: cars.length, biomeCount: biomes.length, passed: [], failures: [], targetMatrix: [],
  transitions: [], slopeCases: 0 };
function check(name, fn) {
  try { const result = fn(); report.passed.push({ name, ...result }); console.log(`PASS ${name}`); }
  catch (error) { report.failures.push({ name, message: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}

check('Catalog, upgrade and surface handling/grip remain exactly halved; other stats unchanged', () => {
  assert.equal(cars.length, 10); assert.equal(biomes.length, 5);
  for (const [index, car] of cars.entries()) {
    for (const key of Object.keys(car)) {
      if (['handling', 'grip'].includes(key)) near(car[key], originalCars[index][key] / 2);
      else assert.deepEqual(car[key], originalCars[index][key]);
    }
    for (let level = 0; level <= 3; level++) {
      const upgrades = { speed: level, handling: level, grip: level, fuel: level };
      const current = getVehiclePerformance(car.id, upgrades), old = originalPerformance(car.id, upgrades);
      near(current.handling, old.handling / 2); near(current.grip, old.grip / 2);
      near(current.steeringResponseSeconds, old.steeringResponseSeconds * 2);
      for (const key of ['maxSpeed', 'acceleration', 'range', 'capacity', 'consumption']) near(current[key], old[key]);
    }
    for (const biome of biomes) {
      const current = surfaceForBiome(biome.id, car.id), old = originalSurface(biome.id, car.id);
      for (const [key, value] of Object.entries(current)) {
        if (['frictionFactor', 'lateralDampingFactor'].includes(key)) near(value, old[key] / 2);
        else assert.deepEqual(value, old[key]);
      }
    }
  }
  return { profiles: 50, upgradeProfiles: 40 };
});

check('All 300 signed 25/50/100% demands converge to proportional terrain-adjusted speed caps', () => {
  for (const car of cars) for (const biome of biomes) for (const demand of [-1, -.5, -.25, .25, .5, 1]) {
    const model = make(car, biome), target = car.maxSpeed * surfaceForBiome(biome.id, car.id).speedFactor * demand;
    model.setInput({ speedDemand: demand });
    assert.equal(model.state.active, true); assert.equal(model.state.speedDemand, demand);
    let peak = 0;
    run(model, 40, state => {
      finite(state, `${car.id}/${biome.id}/${demand}`);
      assert.ok(state.speed * Math.sign(demand) >= -1e-10);
      assert.ok(Math.abs(state.speed) <= Math.abs(target) + 1e-8, 'No powered overshoot on a flat straight road');
      peak = Math.max(peak, Math.abs(state.speed));
    });
    near(model.state.speed, target, 2e-5, `${car.id}/${biome.id}/${demand}`);
    near(model.state.x, 0); near(model.state.angularVelocity, 0);
    assert.equal(model.state.gear, demand < 0 ? 'R' : 'D');
    report.targetMatrix.push({ car: car.id, biome: biome.id, demand, target, speed: model.state.speed, peak });
  }
  return { cases: report.targetMatrix.length };
});

check('Lowering demand brakes through tire forces; centered/released demand stops all 100 directions/profiles', () => {
  for (const car of cars) for (const biome of biomes) for (const sign of [-1, 1]) {
    const model = make(car, biome), cap = car.maxSpeed * surfaceForBiome(biome.id, car.id).speedFactor;
    model.setInput({ speedDemand: sign }); run(model, 40);
    for (const fraction of [.5, .25]) {
      const oldSpeed = model.state.speed;
      model.setInput({ speedDemand: sign * fraction });
      near(model.state.speed, oldSpeed, 0, 'Input cannot rewrite velocity');
      model.step(dt);
      assert.ok(Math.abs(model.state.speed) < Math.abs(oldSpeed), 'Lowering the stick must brake immediately');
      run(model, 30, state => finite(state, 'lower-demand'));
      near(model.state.speed * sign, cap * fraction, 2e-5);
    }
    const initial = model.state.speed, coast = make(car, biome);
    Object.assign(coast.state, { velocityX: model.state.velocityX, velocityZ: model.state.velocityZ,
      heading: model.state.heading, gear: model.state.gear });
    coast.setInput({ active: false }); model.setInput({ steering: 0, speedDemand: 0 });
    assert.equal(model.state.active, false); near(model.state.speed, initial, 0);
    model.step(dt); coast.step(dt);
    assert.ok(model.state.linearSpeed < coast.state.linearSpeed, 'Analog release applies stronger stopping force than legacy coasting');
    let stoppedAt = null;
    run(model, 30, (state, before, frame) => {
      finite(state, 'released');
      assert.ok(state.speed * sign >= -1e-10, 'Braking must not propel the car in the opposite direction');
      assert.ok(state.linearSpeed <= before.linearSpeed + 1e-9, 'Straight release dissipates speed');
      if (stoppedAt === null && state.linearSpeed === 0) stoppedAt = (frame + 2) * dt;
    });
    near(model.state.linearSpeed, 0, 0); assert.equal(model.state.moving, false);
    report.transitions.push({ car: car.id, biome: biome.id, sign, releaseStoppedSeconds: stoppedAt });
  }
  return { cases: report.transitions.length };
});

check('Both reversal directions brake through a near-zero interlock without instant velocity flips', () => {
  let maximumStepChange = 0;
  for (const car of cars) for (const biome of biomes) for (const sign of [-1, 1]) {
    const model = make(car, biome); model.setInput({ speedDemand: sign }); run(model, 40);
    const initial = model.state.speed; model.setInput({ speedDemand: -sign }); near(model.state.speed, initial, 0);
    let crossed = false, minimum = Math.abs(initial);
    run(model, 40, (state, before) => {
      finite(state, 'reverse');
      const change = Math.abs(state.speed - before.speed);
      maximumStepChange = Math.max(maximumStepChange, change);
      assert.ok(change < .3, `${car.id}/${biome.id}: abrupt reversal jump`);
      minimum = Math.min(minimum, Math.abs(state.speed));
      if (!crossed && state.speed * sign < 0) {
        assert.ok(Math.abs(before.speed) < .08, 'Opposite power must wait until near zero');
        crossed = true;
      } else if (!crossed) assert.ok(Math.abs(state.speed) <= Math.abs(before.speed) + 1e-9);
    });
    assert.ok(crossed); assert.ok(minimum < .08);
    near(model.state.speed, -sign * car.maxSpeed * surfaceForBiome(biome.id, car.id).speedFactor, 2e-5);
  }
  return { cases: 100, maximumStepChange };
});

check('Canceling an in-progress reversal resumes the currently moving direction immediately', () => {
  for (const car of cars) for (const biome of biomes) for (const sign of [-1, 1]) {
    const model = make(car, biome); model.setInput({ speedDemand: sign }); run(model, 40);
    model.setInput({ speedDemand: -sign }); run(model, .2);
    assert.ok(model.state.speed * sign > .08);
    const before = model.state.speed * sign;
    model.setInput({ speedDemand: sign }); run(model, .2);
    assert.ok(model.state.speed * sign > before,
      `${car.id}/${biome.id}/${sign}: reversal brake remained latched (${before} -> ${model.state.speed * sign})`);
  }
  return { cases: 100 };
});

check('Side-only stick steers the wheels without moving or rotating a stationary vehicle', () => {
  for (const car of cars) for (const biome of biomes) for (const steering of [-1, 1]) {
    const model = make(car, biome); model.setInput({ steering, speedDemand: 0 }); run(model, 4);
    for (const key of ['x', 'z', 'heading', 'velocityX', 'velocityZ', 'angularVelocity', 'speed', 'linearSpeed', 'pathDistance']) near(model.state[key], 0, 0);
    assert.ok(Math.abs(model.state.frontWheelAngle) > .4); assert.equal(model.state.active, false);
  }
  return { cases: 100 };
});

check('Legacy full-power and gear callers retain the same straight-line force response', () => {
  for (const car of cars) for (const biome of biomes) for (const sign of [-1, 1]) {
    const analog = make(car, biome), legacy = make(car, biome);
    analog.setInput({ speedDemand: sign }); legacy.setGear(sign < 0 ? 'R' : 'D'); legacy.setInput({ active: true });
    assert.equal(legacy.state.speedDemand, null);
    for (let frame = 0; frame < 1200; frame++) {
      analog.step(dt); legacy.step(dt);
      for (const key of ['x', 'z', 'heading', 'velocityX', 'velocityZ', 'angularVelocity', 'speed', 'linearSpeed', 'wheelSpin']) near(analog.state[key], legacy.state[key], 1e-10);
    }
    legacy.setInput({ active: false }); assert.equal(legacy.state.active, false); assert.equal(legacy.state.speedDemand, null);
  }
  return { cases: 100 };
});

check('Slope, yaw, release and changing directions stay finite on all car/biome profiles', () => {
  let maximumYaw = 0;
  for (const car of cars) for (const biome of biomes) for (const gradient of [{ x: .12, z: -.16 }, { x: -.12, z: .16 }]) {
    const model = make(car, biome, { heading: .37, groundGradient: () => gradient });
    for (const [demand, steering] of [[1, .8], [.25, -.8], [-.5, .8], [0, 1], [-1, -.8], [1, .8]]) {
      model.setInput({ speedDemand: demand, steering });
      run(model, 4, state => {
        finite(state, `${car.id}/${biome.id}/slope`); maximumYaw = Math.max(maximumYaw, Math.abs(state.angularVelocity));
        assert.ok(state.linearSpeed < 100); assert.ok(Math.abs(state.angularVelocity) < 10);
      });
    }
    report.slopeCases++;
  }
  return { cases: report.slopeCases, maximumYaw };
});

check('Sanitized input, pauses, resets and frame rates preserve finite deterministic behavior', () => {
  const car = cars[0], biome = biomes[0];
  for (const demand of [-100, -1, 0, 1, 100, NaN, Infinity, -Infinity, null, undefined, '1']) {
    const model = make(car, biome); model.setInput({ speedDemand: demand, active: true, steering: NaN });
    assert.equal(model.state.speedDemand, Number.isFinite(demand) ? Math.max(-1, Math.min(1, demand)) : null);
    run(model, .5); finite(model.state, 'malformed-input');
    model.pause(); assert.equal(model.state.speedDemand, Number.isFinite(demand) ? 0 : null); assert.equal(model.state.active, false);
    near(model.state.linearSpeed, 0, 0); near(model.state.angularVelocity, 0, 0);
    model.setInput({ speedDemand: -.5, steering: .5 }); run(model, .5); model.reset();
    assert.equal(model.state.speedDemand, null); assert.equal(model.state.gear, 'D'); near(model.state.x, 0, 0); near(model.state.z, 0, 0);
  }
  const states = [];
  for (const fps of [30, 60, 120]) {
    const model = make(cars[6], biomes[3]);
    for (const [demand, steering] of [[.25, .5], [.5, -.5], [1, .2], [-1, .2], [0, 0]]) {
      model.setInput({ speedDemand: demand, steering });
      for (let frame = 0; frame < fps * 4; frame++) model.step(1 / fps);
    }
    states.push({ ...model.state });
  }
  for (const state of states.slice(1)) for (const key of ['x', 'z', 'heading', 'speed', 'linearSpeed', 'angularVelocity', 'wheelSpin', 'bodyPitch', 'bodyRoll', 'bodyBob']) near(state[key], states[0][key], 1e-9);
  assert.equal(TOW_DRIVING.steeringStrength, 1);
  return { frameRates: [30, 60, 120] };
});

if (process.argv.includes('--report')) {
  fs.mkdirSync(new URL('../qa/analog-driving/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('../qa/analog-driving/report.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`\n${report.passed.length} analog-driving groups passed; ${report.failures.length} failed; ${report.targetMatrix.length} signed cap cases.`);
if (report.failures.length) process.exitCode = 1;
