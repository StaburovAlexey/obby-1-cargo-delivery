#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {after, test} from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {COSMO_VEHICLES, loadCosmoVehicle, clearCosmoVehicleCache} from '../dist/cosmo-vehicles.js';
import {createDrivingModel, evaluateVehicleForces, VEHICLE_DYNAMICS as P} from '../dist/driving-model.js';
import {vehiclePhysicsGeometry} from '../dist/vehicle-physics.js';
import {VEHICLE_CONFIG, BIOME_SEQUENCE} from '../dist/economy-config.js';
import {normalizeSurfaceDynamics, surfaceForBiome} from '../dist/biome-surfaces.js';

// Exercise the real GLB loader, wheel extraction and runtime adapters. Only PNG
// decoding and file transport replace browser APIs; the model geometry is real.
const original = {fetch: globalThis.fetch, self: globalThis.self, createImageBitmap: globalThis.createImageBitmap};
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const png = Buffer.from(await blob.arrayBuffer());
  return {width: png.readUInt32BE(16), height: png.readUInt32BE(20), close() {}};
};
globalThis.fetch = async request => {
  const url = typeof request === 'string' ? request : request.url;
  if (url.startsWith('blob:')) return original.fetch(request);
  assert.ok(url.startsWith('file:'), `Unexpected nonlocal request: ${url}`);
  return new Response(fs.readFileSync(new URL(url)), {status: 200});
};
const adapters = await Promise.all(COSMO_VEHICLES.map(spec => loadCosmoVehicle(THREE, spec.id)));
const ordinary = VEHICLE_CONFIG.filter(spec => !spec.rewardOnly);
assert.equal(adapters.length, 10, 'all ten replacement GLBs participate');
assert.deepEqual(adapters.map(a => a.metadata.id), ordinary.map(v => v.id));
const cases = ordinary.map((spec, i) => ({spec, adapter: adapters[i], metadata: adapters[i].metadata}));
after(() => {
  adapters.forEach(adapter => adapter.dispose());
  clearCosmoVehicleCache();
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

const degrees = 180 / Math.PI;
const near = (actual, expected, message, tolerance = 1e-9) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `${message}: expected ${expected} +/- ${tolerance}, received ${actual}`,
);
const forward = state => -Math.sin(state.heading) * state.velocityX - Math.cos(state.heading) * state.velocityZ;
const bodySide = state => Math.cos(state.heading) * state.velocityX - Math.sin(state.heading) * state.velocityZ;
const rearSide = (state, rearZ) => bodySide(state) + state.angularVelocity * rearZ;
const rearSlip = (state, rearZ) => Math.atan2(rearSide(state, rearZ), Math.max(.001, Math.abs(forward(state))));
const make = ({spec, metadata}, levels = {}, extra = {}) => createDrivingModel({
  x: 0, z: 0, vehicleId: spec.id, maxSpeed: spec.maxSpeed,
  getVehicleMetadata: () => metadata, getUpgrades: () => levels,
  groundSurface: () => surfaceForBiome(spec.specialty, spec.id), ...extra,
});
function run(model, seconds, input, fps = 120, sample = () => {}) {
  model.setInput(input);
  const totals = {pathDistance: 0, travel: 0, movingSeconds: 0};
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
    model.step(1 / fps);
    for (const key of Object.keys(totals)) totals[key] += model.state[key];
    for (const [key, value] of Object.entries(model.state)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} remains finite`);
    }
    sample(model.state);
  }
  return totals;
}

// A reversion to the old shared wheel locations, body box or inertia must fail
// against actual rendered GLB geometry, not a second copy of adapter metadata.
test('each passenger solver uses its visible wheel centres and model dimensions', async t => {
  for (const item of cases) await t.test(item.spec.id, () => {
    const {adapter, metadata, spec} = item;
    adapter.group.updateWorldMatrix(true, true);
    const model = make(item), geometry = model.physicsGeometry;
    assert.ok(geometry, `${spec.id}: loaded model supplies physical geometry`);
    const bounds = new THREE.Box3().setFromObject(adapter.group, true);
    const size = bounds.getSize(new THREE.Vector3());
    near(geometry.halfWidth, size.x / 2, 'collider follows visible width');
    near(geometry.halfLength, size.z / 2, 'collider follows visible length');
    near(geometry.colliderReach, Math.hypot(size.x, size.z) / 2, 'swept collision reach');
    near(geometry.yawInertia, P.mass * (size.x ** 2 + size.z ** 2) / 12, 'body yaw inertia', 1e-7);
    assert.ok(Object.isFrozen(geometry) && Object.isFrozen(geometry.wheels));
    for (const wheel of adapter.wheels) {
      const centre = new THREE.Box3().setFromObject(wheel.node, true).getCenter(new THREE.Vector3());
      const physical = geometry.wheels.find(candidate => candidate.name === wheel.name);
      assert.ok(physical, `${spec.id}/${wheel.name}: physical contact exists`);
      near(physical.x, centre.x, 'visible tire centre X');
      near(physical.z, centre.z, 'visible tire centre Z');
      assert.equal(physical.front, wheel.front);
      assert.ok(physical.loadShare > 0 && Object.isFrozen(physical));
    }
    const frontZ = adapter.wheels.filter(w => w.front).reduce((sum, w) => sum + w.localPosition.z, 0) / 2;
    const rearZ = adapter.wheels.filter(w => !w.front).reduce((sum, w) => sum + w.localPosition.z, 0) / 2;
    near(geometry.frontZ, frontZ, 'front axle'); near(geometry.rearZ, rearZ, 'rear axle');
    near(geometry.wheelbase, rearZ - frontZ, 'actual wheelbase');
    assert.equal(metadata.assetFamily, 'passenger');
  });
});

test('static normal loads balance both axes through the actual model origin', async t => {
  for (const item of cases) await t.test(item.spec.id, () => {
    const geometry = vehiclePhysicsGeometry(item.metadata);
    for (const heading of [0, .37, 1.2]) for (const gradient of [{x: 0, z: 0}, {x: .12, z: -.08}]) {
      const forces = evaluateVehicleForces({heading, velocityX: 0, velocityZ: 0, angularVelocity: 0,
        frontWheelAngle: 0, gear: 'D', active: false}, {geometry, gradient});
      near(forces.tires.reduce((sum, tire) => sum + tire.normalLoad, 0),
        P.mass * P.gravity / Math.sqrt(1 + gradient.x ** 2 + gradient.z ** 2), 'total normal load');
      near(forces.tires.reduce((sum, tire) => sum + tire.rz * tire.normalLoad, 0), 0, 'normal load Z moment');
      near(forces.tires.reduce((sum, tire) => sum + tire.rx * tire.normalLoad, 0), 0, 'normal load X moment');
    }
  });
});

test('passive actual-model tires dissipate energy within every biome friction budget', async t => {
  for (const item of cases) await t.test(item.spec.id, () => {
    const geometry = vehiclePhysicsGeometry(item.metadata);
    for (const biome of BIOME_SEQUENCE) for (const speed of [0, 3, 10, 35]) for (const braking of [false, .7]) {
      const surface = surfaceForBiome(biome.id, item.spec.id), ground = normalizeSurfaceDynamics(surface);
      const heading = .37, gradient = {x: .12, z: -.08};
      const state = {heading, velocityX: speed * .3, velocityZ: -speed, angularVelocity: .17,
        frontWheelAngle: -.22, gear: 'D', active: false};
      const forces = evaluateVehicleForces(state, {geometry, surface, gradient, braking});
      for (const tire of forces.tires) {
        const wheel = geometry.wheels.find(w => w.name === tire.name);
        near(tire.rx, Math.cos(heading) * wheel.x + Math.sin(heading) * wheel.z, 'world contact X');
        near(tire.rz, -Math.sin(heading) * wheel.x + Math.cos(heading) * wheel.z, 'world contact Z');
        assert.ok(tire.lateralForce * tire.lateralSpeed <= 1e-8, 'lateral force opposes tire slip');
        assert.ok(tire.forceX * tire.pointVelocityX + tire.forceZ * tire.pointVelocityZ <= 1e-8,
          'an unpowered tire cannot add contact-patch energy');
        assert.ok(Math.hypot(tire.longitudinalForce / ground.longitudinalGripFactor, tire.lateralForce) <= tire.grip + 1e-8,
          `${biome.id}: braking and cornering share the friction circle`);
      }
      near(forces.torque, forces.tires.reduce((sum, tire) => sum + tire.torque, 0), 'yaw comes only from actual contacts');
    }
  });
});

test('full steering at rest cannot generate yaw or translation', async t => {
  for (const item of cases) await t.test(item.spec.id, () => {
    const model = make(item);
    run(model, 4, {active: false, steering: 1});
    assert.ok(Math.abs(model.state.frontWheelAngle) > .4, 'rack is at full lock');
    for (const key of ['x', 'z', 'heading', 'velocityX', 'velocityZ', 'angularVelocity']) near(model.state[key], 0, key);
  });
});

test('slow full-lock turns roll around the real rear axle rather than drifting around the body centre', async t => {
  for (const item of cases) for (const level of [0, 5, 10]) for (const demand of [1, 3, 5]) await t.test(`${item.spec.id}/level${level}/${demand}m/s`, () => {
    const model = make(item, {grip: level, handling: level}), geometry = model.physicsGeometry;
    const input = {speedDemand: demand / item.spec.maxSpeed, steering: 1};
    run(model, 20, input);
    let peakSide = 0, peakSlip = 0, peakRadiusError = 0;
    run(model, 3, input, 120, state => {
      peakSide = Math.max(peakSide, Math.abs(rearSide(state, geometry.rearZ)));
      peakSlip = Math.max(peakSlip, Math.abs(rearSlip(state, geometry.rearZ)) * degrees);
      const actualRadius = Math.abs(forward(state) / state.angularVelocity);
      const rollingRadius = geometry.wheelbase / Math.abs(Math.tan(state.frontWheelAngle));
      peakRadiusError = Math.max(peakRadiusError, Math.abs(actualRadius / rollingRadius - 1));
    });
    assert.ok(model.state.speed > demand * .8 && model.state.speed < demand * 1.1, 'test reaches its requested slow speed');
    assert.ok(peakSide < .2 || peakSlip < 3,
      `rear tires roll: ${peakSide.toFixed(3)} m/s residual, ${peakSlip.toFixed(2)} degrees slip`);
    assert.ok(peakRadiusError < .25, `radius follows actual wheelbase/rack; relative error ${peakRadiusError.toFixed(3)}`);
  });
});

test('loaded geometry binds after asynchronous asset availability without resetting a moving car', async t => {
  for (const item of cases) await t.test(item.spec.id, async () => {
    let loaded;
    const model = make(item, {}, {getVehicleMetadata: () => loaded});
    assert.equal(model.physicsGeometry, null, 'loading uses the existing fallback');
    run(model, 1, {active: true});
    Object.assign(model.state, {heading: .4, velocityX: .7, velocityZ: -5, angularVelocity: .2});
    const before = {...model.state}, stateObject = model.state;
    loaded = await Promise.resolve(item.metadata);
    const geometry = model.physicsGeometry;
    assert.ok(geometry, 'metadata becomes available after the loader resolves');
    assert.equal(model.state, stateObject); assert.deepEqual(model.state, before, 'binding preserves all motion and input state');
    assert.throws(() => { model.physicsGeometry = null; }, TypeError, 'computed geometry is read only');
    const expected = evaluateVehicleForces(before, {geometry, maxSpeed: item.spec.maxSpeed,
      engineAcceleration: item.spec.acceleration, brakeFactor: item.spec.grip,
      surface: surfaceForBiome(item.spec.specialty, item.spec.id)});
    model.step(P.fixedStep);
    near(model.state.velocityX, before.velocityX + expected.forceX / P.mass * P.fixedStep, 'new tire geometry applies immediately');
    near(model.state.velocityZ, before.velocityZ + expected.forceZ / P.mass * P.fixedStep, 'new tire load applies immediately');
    near(model.state.angularVelocity, before.angularVelocity + expected.torque / geometry.yawInertia * P.fixedStep,
      'new model inertia applies immediately');
    assert.equal(model.state.active, true);
  });
});

test('actual-model authoritative motion is identical at 30, 60 and 120 render frames per second', async t => {
  for (const item of cases) await t.test(item.spec.id, () => {
    const snapshots = [30, 60, 120].map(fps => {
      const model = make(item, {grip: 5, handling: 5}), totals = {pathDistance: 0, travel: 0, movingSeconds: 0};
      for (const [seconds, input] of [
        [6, {active: true}], [2, {active: true, steering: .9}],
        [1, {active: false, steering: -.4}], [3, {active: false}],
        [4, {speedDemand: -.5, steering: .4}],
      ]) {
        const phase = run(model, seconds, input, fps);
        for (const key of Object.keys(totals)) totals[key] += phase[key];
      }
      return {...model.state, ...totals};
    });
    for (const current of snapshots.slice(1)) for (const [key, expected] of Object.entries(snapshots[0])) {
      if (typeof expected === 'number') near(current[key], expected, `${item.spec.id}/${key}`, 1e-8);
      else assert.equal(current[key], expected, key);
    }
  });
});

test('fast actual-model corners stay forward, have bounded rear slip, and recover after centering or lifting', async t => {
  for (const item of cases) for (const level of [0, 10]) await t.test(`${item.spec.id}/level${level}`, () => {
    const levels = {grip: level, handling: level}, model = make(item, levels);
    const geometry = model.physicsGeometry;
    run(model, 15, {active: true});
    let peakSlip = 0, minForward = Infinity;
    run(model, 6, {active: true, steering: 1}, 120, state => {
      peakSlip = Math.max(peakSlip, Math.abs(rearSlip(state, geometry.rearZ)) * degrees);
      minForward = Math.min(minForward, forward(state));
    });
    assert.ok(peakSlip < 20 && minForward > item.spec.maxSpeed * .6,
      `${item.spec.id}/${level}: rear slip ${peakSlip.toFixed(2)} degrees, minimum forward ${minForward.toFixed(2)} m/s`);
    if (level === 0) assert.ok(peakSlip > 3, `${item.spec.id}: stock full-lock corner produces an actual rear-tire skid (${peakSlip.toFixed(2)} degrees)`);
    run(model, 6, {active: false, steering: 0});
    assert.ok(Math.abs(rearSlip(model.state, geometry.rearZ)) * degrees < 1 && Math.abs(model.state.angularVelocity) < .01,
      `${item.spec.id}/${level}: lifting and centering recovers`);
    const centered = make(item, levels);
    run(centered, 15, {active: true}); run(centered, 3, {active: true, steering: 1});
    run(centered, 5, {active: true, steering: 0});
    assert.ok(Math.abs(rearSlip(centered.state, geometry.rearZ)) * degrees < .2 && Math.abs(centered.state.angularVelocity) < .005,
      `${item.spec.id}/${level}: centered rack recovers with throttle held`);
  });
});

test('fully upgraded late cars damp low-speed disturbances on city pavement and settle at rest', async t => {
  for (const item of cases.slice(6)) await t.test(item.spec.id, () => {
    const model = make(item, {grip: 10, handling: 10}, {
      groundSurface: () => surfaceForBiome('city', item.spec.id),
    });
    const geometry = model.physicsGeometry;
    Object.assign(model.state, {velocityX: .08, velocityZ: -1, angularVelocity: .03});
    const energy = state => .5 * P.mass * (state.velocityX ** 2 + state.velocityZ ** 2) +
      .5 * geometry.yawInertia * state.angularVelocity ** 2;
    const initialEnergy = energy(model.state);
    let peakEnergy = initialEnergy, peakYaw = Math.abs(model.state.angularVelocity);
    run(model, 8, {active: false, steering: 0}, 120, state => {
      peakEnergy = Math.max(peakEnergy, energy(state));
      peakYaw = Math.max(peakYaw, Math.abs(state.angularVelocity));
    });
    assert.ok(peakEnergy <= initialEnergy * 1.02, 'stiff city tires do not amplify passive kinetic energy');
    assert.ok(peakYaw < .04, `small yaw disturbance stays damped (${peakYaw.toFixed(5)} rad/s)`);
    near(model.state.linearSpeed, 0, 'released vehicle reaches rest');
    near(model.state.angularVelocity, 0, 'released vehicle stops yawing');
  });
});

test('the reward BMW ignores ordinary metadata and retains identical motion in both gears', () => {
  const spec = VEHICLE_CONFIG.find(v => v.rewardOnly);
  const options = {x: 0, z: 0, vehicleId: spec.id, maxSpeed: spec.maxSpeed,
    groundSurface: () => surfaceForBiome(spec.specialty, spec.id)};
  const baseline = createDrivingModel(options);
  const withMetadata = createDrivingModel({...options, getVehicleMetadata: () => { throw new Error('BMW must not read passenger geometry'); }});
  assert.equal(withMetadata.physicsGeometry, null);
  for (const [seconds, input] of [
    [10, {active: true}], [2, {active: true, steering: .8, handbrake: .3}],
    [4, {active: false}], [5, {speedDemand: -.5, steering: -.4}],
  ]) {
    run(baseline, seconds, input); run(withMetadata, seconds, input);
    assert.deepEqual(withMetadata.state, baseline.state);
  }
});
