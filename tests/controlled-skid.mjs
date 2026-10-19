#!/usr/bin/env node
// Production CPU solver checks. These do not simulate rendering or touch input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDrivingModel, evaluateVehicleForces, CONTROLLED_SKID} from '../dist/driving-model.js';
import {VEHICLE_CONFIG, BIOME_SEQUENCE} from '../dist/economy-config.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';

const ordinary = VEHICLE_CONFIG.filter(v => !v.rewardOnly);
const dt = 1 / 120;
const degrees = 180 / Math.PI;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const sideSpeed = s => Math.cos(s.heading) * s.velocityX - Math.sin(s.heading) * s.velocityZ;
const slip = s => Math.atan2(sideSpeed(s), Math.max(.001, Math.abs(s.speed)));
const make = (v, levels = {}, biome = v.specialty) => createDrivingModel({
  x: 0, z: 0, vehicleId: v.id, maxSpeed: v.maxSpeed,
  getUpgrades: () => levels, groundSurface: () => surfaceForBiome(biome, v.id),
});
const run = (m, seconds, input, fps = 120) => {
  m.setInput(input);
  let peakSlip = 0, path = 0, minForward = Infinity;
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    m.step(1 / fps);
    peakSlip = Math.max(peakSlip, Math.abs(slip(m.state)) * degrees);
    minForward = Math.min(minForward, m.state.speed);
    path += m.state.pathDistance;
    for (const value of Object.values(m.state)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  return {peakSlip, path, minForward};
};
const near = (a, b, message, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${message}: ${a} != ${b}`);
assert.equal(ordinary.length, 10);
assert.equal(CONTROLLED_SKID.startSpeed, 6);
const rows = [];

// A sharp steering request produces readable slip; steady gentle steering can
// stay planted. No prescribed angle or force is injected into the vehicle.
for (const v of ordinary) {
  const corners = [], gripRecovery = [], countersteer = [], breakaway = [];
  for (const level of [0, 5, 10]) {
    const m = make(v, {handling: level, grip: level});
    run(m, 15, {active: true});
    const corner = run(m, 6, {active: true, steering: 1});
    assert.ok(corner.peakSlip < 18 && corner.minForward > v.maxSpeed * .65, `${v.id}/${level}: bounded forward skid`);
    run(m, 6, {active: false, steering: 0});
    assert.ok(Math.abs(slip(m.state)) * degrees < 1 && Math.abs(m.state.angularVelocity) < .01, `${v.id}/${level}: lift recovers`);
    corners.push(corner);
    // Centering the rack must also end the skid with throttle held. This guards
    // against the rear-compliance model creating a self-sustaining yaw loop.
    const centered = make(v, {handling: level, grip: level});
    run(centered, 15, {active: true}); run(centered, 3, {active: true, steering: 1});
    run(centered, 5, {active: true, steering: 0});
    assert.ok(Math.abs(slip(centered.state)) * degrees < .1 && Math.abs(centered.state.angularVelocity) < .005, `${v.id}/${level}: centered rack regains stability`);

    const g = make(v, {grip: level});
    Object.assign(g.state, {velocityX: 3, velocityZ: -Math.min(15, v.maxSpeed * .8)});
    let recovery = 0;
    while (Math.abs(sideSpeed(g.state)) > .1 && recovery < 8) {g.step(dt); recovery += dt;}
    assert.ok(recovery < 8, `${v.id}/${level}: grip recovery`);
    gripRecovery.push(recovery);

    // Shared exact starting state isolates handling, rather than rewarding a
    // different skid entry. Handling affects the user's rack, never auto-yaw.
    const seed = make(v);
    run(seed, 15, {active: true}); run(seed, 1, {active: true, steering: 1});
    const h = make(v, {handling: level}); Object.assign(h.state, seed.state);
    h.setInput({active: false, steering: -.4});
    let reversal = 0;
    while (h.state.frontWheelAngle < 0 && reversal < 2) {h.step(dt); reversal += dt;}
    countersteer.push(reversal);

    // Operational breakaway threshold: minimum abrupt steering input producing
    // a 5-degree transient in 3 seconds at the same catalog entry speed.
    let threshold = null;
    for (let tick = 12; tick <= 40; tick++) {
      const b = make(v, {grip: level}); b.state.velocityZ = -v.maxSpeed;
      if (run(b, 3, {active: true, steering: tick / 40}).peakSlip > 5) {threshold = tick / 40; break;}
    }
    breakaway.push(threshold);
  }
  assert.ok(corners[0].peakSlip > 7, `${v.id}: stock sharp turns visibly slip`);
  assert.ok(corners[1].peakSlip < corners[0].peakSlip && corners[2].peakSlip < corners[1].peakSlip, `${v.id}: 0/5/10 skid improvement`);
  assert.ok(corners[2].peakSlip < corners[0].peakSlip * .8, `${v.id}: max grip/handling difference is meaningful`);
  assert.ok(gripRecovery[1] <= gripRecovery[0] && gripRecovery[2] < gripRecovery[0] * .9, `${v.id}: grip shortens recovery`);
  assert.ok(countersteer[1] < countersteer[0] && countersteer[2] < countersteer[1] && countersteer[2] < countersteer[0] * .78, `${v.id}: handling speeds countersteer`);
  assert.ok((breakaway[1] ?? Infinity) > breakaway[0] && (breakaway[2] ?? Infinity) > breakaway[1], `${v.id}: grip raises breakaway threshold`);
  rows.push({vehicle: v.id, biome: v.specialty, corners, gripRecoverySeconds: gripRecovery, countersteerSeconds: countersteer, breakawayInput: breakaway});
}

// Identical timed input phases at 15/30/60Hz, including skid, countersteer,
// release, and D/R interlock. Check state and actual traveled distance.
let frameCases = 0;
for (const v of ordinary) for (const level of [0, 5, 10]) {
  const snapshots = [15, 30, 60].map(fps => {
    const m = make(v, {grip: level, handling: level}); let path = 0;
    for (const [seconds, input] of [[6, {active: true}], [2, {active: true, steering: .9}], [1, {active: false, steering: -.4}], [4, {active: false}], [4, {speedDemand: -.5, steering: .4}]]) {
      path += run(m, seconds, input, fps).path;
    }
    frameCases++; return {...m.state, pathDistance: path};
  });
  for (const current of snapshots.slice(1)) for (const key of ['x', 'z', 'heading', 'velocityX', 'velocityZ', 'angularVelocity', 'frontWheelAngle', 'pathDistance']) near(current[key], snapshots[0][key], `${v.id}/${level}/${key}`);
}

// A tire can dissipate contact-patch energy; it may not inject lateral energy
// or yaw independently. All tires retain the original combined friction budget.
let forceCases = 0;
for (const v of ordinary) for (const biome of BIOME_SEQUENCE) for (const speed of [0, 3, 6, 10, 25, 40]) for (const skidGrip of [1, 1.1, 1.2]) {
  const surface = surfaceForBiome(biome.id, v.id);
  const state = {heading: .4, velocityX: speed * .3, velocityZ: -speed, angularVelocity: .2, frontWheelAngle: -.2, gear: 'D', active: false};
  const forces = evaluateVehicleForces(state, {surface, skidGrip, braking: .2});
  for (const tire of forces.tires) {
    assert.ok(tire.lateralForce * tire.lateralSpeed <= 1e-8, 'lateral force opposes slip');
    assert.ok(Math.hypot(tire.longitudinalForce / surface.longitudinalGripFactor, tire.lateralForce) <= tire.grip + 1e-8, 'combined tire budget');
    assert.ok(tire.forceX * tire.pointVelocityX + tire.forceZ * tire.pointVelocityZ <= 1e-8, 'passive contact cannot add energy');
  }
  near(forces.torque, forces.tires.reduce((sum, t) => sum + t.torque, 0), 'yaw only from tires');
  forceCases++;
}

// Below 6m/s, in reverse, and on unsuitable tires, the additional rear
// compliance is absent. Grip still upgrades the existing surface separately.
let precisionCases = 0;
for (const v of ordinary) for (const biome of BIOME_SEQUENCE) for (const gear of ['D', 'R']) for (const speed of [2, 5.9, 20]) {
  const surface = surfaceForBiome(biome.id, v.id);
  if (gear !== 'R' && speed > 6 && surface.longitudinalGripFactor < 2) continue;
  const state = {heading: 0, velocityX: .15, velocityZ: -speed, angularVelocity: .1, frontWheelAngle: -.03, gear, active: true};
  const a = evaluateVehicleForces(state, {surface, skidGrip: 1});
  const b = evaluateVehicleForces(state, {surface, skidGrip: 1.2});
  assert.deepEqual(a, b, `${v.id}/${biome.id}/${gear}/${speed}: precision/unsuitable tire path`);
  precisionCases++;
}

// Future biomes still punish holding full lock, but promptly lifting and
// countersteering remains a usable recovery technique for every ordinary car.
const wrongBiomeRecoveries = [];
for (const v of ordinary) for (const biome of BIOME_SEQUENCE) {
  if (BIOME_SEQUENCE.findIndex(b => b.id === biome.id) <= BIOME_SEQUENCE.findIndex(b => b.id === v.specialty)) continue;
  const m = make(v, {}, biome.id);
  run(m, 15, {active: true}); run(m, 1, {active: true, steering: 1});
  let elapsed = 0, peakSlip = 0;
  while (elapsed < 10) {
    // A test-only reactive driver uses only public input. It neither modifies
    // motion nor teleports. Steering aligns with velocity while damping yaw.
    const angle = slip(m.state);
    m.setInput({active: false, steering: clamp(angle * 2.5 + m.state.angularVelocity * .8, -.65, .65)});
    m.step(dt); elapsed += dt;
    peakSlip = Math.max(peakSlip, Math.abs(slip(m.state)) * degrees);
    if (Math.abs(slip(m.state)) * degrees < 2 && Math.abs(m.state.angularVelocity) < .03) break;
  }
  assert.ok(elapsed < 10, `${v.id}/${biome.id}: lift/countersteer can recover`);
  assert.equal(surfaceForBiome(biome.id, v.id).speedFactor, .75, '25% unsuitable-biome speed penalty retained');
  wrongBiomeRecoveries.push({vehicle: v.id, biome: biome.id, seconds: elapsed, peakSlip});
}

if (process.env.SKID_REPORT) {
  fs.writeFileSync(process.env.SKID_REPORT, JSON.stringify({scope: 'Production CPU solver; no browser/GPU or human touch validation.', rows, frameCases, forceCases, precisionCases, wrongBiomeRecoveries}, null, 2) + '\n');
}
console.log(`PASS controlled skid: ${rows.length} ordinary vehicles × levels 0/5/10; ${frameCases} frame-rate cases; ${forceCases} force cases; ${precisionCases} precision cases; ${wrongBiomeRecoveries.length} unsuitable-biome recoveries.`);
