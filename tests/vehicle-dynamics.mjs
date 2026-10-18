#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  createDrivingModel, evaluateVehicleForces, VEHICLE_DYNAMICS as P,
  VEHICLE_WHEELS, roadWheelTarget, steeringTarget, TOW_DRIVING,
} from '../dist/driving-model.js';
import { corridorContact, truckInRoad, ROUTE, ROAD_MARGIN, TRUCK_HALF_WIDTH } from '../dist/road-layout.js';

let checks = 0;
const results = [];
function check(name, fn) {
  const details = fn();
  checks++;
  results.push({ name, ...(details === undefined ? {} : { details }) });
  console.log(`PASS ${name}${details === undefined ? '' : `: ${JSON.stringify(details)}`}`);
}
function near(actual, expected, epsilon = 1e-10) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon,
    `Expected ${expected} +/- ${epsilon}, received ${actual}`);
}
function run(model, seconds, fps = 120) {
  let distance = 0, travel = 0;
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    model.step(1 / fps);
    distance += model.state.pathDistance;
    travel += model.state.travel;
  }
  return { distance, travel };
}
function energy(s) {
  return 0.5 * P.mass * (s.velocityX ** 2 + s.velocityZ ** 2) +
    0.5 * P.yawInertia * s.angularVelocity ** 2;
}
function sideWall(x, z, h) {
  const reach = P.halfWidth * Math.abs(Math.cos(h)) + P.halfLength * Math.abs(Math.sin(h));
  const depth = x + reach - 6;
  return depth > 0 ? { normalX: -1, normalZ: 0, depth, name: 'wall x=6' } : undefined;
}
function frontWall(x, z, h) {
  const reach = P.halfWidth * Math.abs(Math.sin(h)) + P.halfLength * Math.abs(Math.cos(h));
  const depth = reach - z;
  return depth > 0 ? { normalX: 0, normalZ: 1, depth, name: 'wall z=0' } : undefined;
}

check('Four explicit contact patches have balanced straight engine thrust and yaw torque', () => {
  assert.equal(VEHICLE_WHEELS.length, 4);
  assert.equal(VEHICLE_WHEELS.filter(w => w.front).length, 2);
  assert.equal(new Set(VEHICLE_WHEELS.map(w => w.name)).size, 4);
  const model = createDrivingModel({ x: 0, z: 0 });
  model.setInput({ active: true });
  const f = evaluateVehicleForces(model.state);
  const perWheel = P.mass * 11 / P.accelerationTimeScale / 4;
  for (const wheel of f.tires) {
    near(wheel.forceX, 0); near(wheel.forceZ, -perWheel);
    near(wheel.normalLoad, P.mass * P.gravity / 4);
  }
  near(f.forceX, 0); near(f.forceZ, -perWheel * 4); near(f.torque, 0);
  near(f.tires[0].torque, -f.tires[1].torque);
  near(f.tires[2].torque, -f.tires[3].torque);
});
check('Tire point velocity and torque use the signed rigid-body cross products', () => {
  const m = createDrivingModel({ heading: 0.37 });
  Object.assign(m.state, { velocityX: 1.3, velocityZ: -4.7, angularVelocity: 0.6, frontWheelAngle: -0.19 });
  const forces = evaluateVehicleForces(m.state);
  for (const tire of forces.tires) {
    near(tire.pointVelocityX, m.state.velocityX + m.state.angularVelocity * tire.rz);
    near(tire.pointVelocityZ, m.state.velocityZ - m.state.angularVelocity * tire.rx);
    near(tire.torque, tire.rz * tire.forceX - tire.rx * tire.forceZ);
    assert.ok(Math.hypot(tire.forceX, tire.forceZ) <= tire.grip + 1e-9);
  }
  near(forces.torque, forces.tires.reduce((n, t) => n + t.torque, 0));
});
check('All four passive tires oppose slip and stay within individual friction circles', () => {
  const m = createDrivingModel();
  Object.assign(m.state, { velocityX: 7, velocityZ: -12, angularVelocity: 1.8, frontWheelAngle: 0.4 });
  const f = evaluateVehicleForces(m.state);
  for (const tire of f.tires) {
    assert.ok(tire.lateralForce * tire.lateralSpeed <= 0);
    assert.ok(tire.longitudinalForce * tire.longitudinalSpeed <= 0);
    assert.ok(tire.forceX * tire.pointVelocityX + tire.forceZ * tire.pointVelocityZ <= 1e-9);
    assert.ok(Math.hypot(tire.forceX, tire.forceZ) <= tire.grip + 1e-9);
  }
  assert.ok(f.tires.some(t => t.saturated));
});
check('Semi-implicit integration obeys F/m and torque/inertia instead of setting geometric yaw', () => {
  const m = createDrivingModel({ x: 0, z: 0 });
  Object.assign(m.state, { velocityX: 0.3, velocityZ: -6, angularVelocity: 0.4 });
  const old = { ...m.state }, f = evaluateVehicleForces(old);
  m.step(P.fixedStep);
  near(m.state.velocityX, old.velocityX + f.forceX / P.mass * P.fixedStep);
  near(m.state.velocityZ, old.velocityZ + f.forceZ / P.mass * P.fixedStep);
  near(m.state.angularVelocity, old.angularVelocity + f.torque / P.yawInertia * P.fixedStep);
  near(m.state.heading, old.heading + m.state.angularVelocity * P.fixedStep);
});
check('Mirrored steering gives mirrored lateral forces, paths, and yaw', () => {
  const left = createDrivingModel({ x: 0, z: 0 }), right = createDrivingModel({ x: 0, z: 0 });
  left.setInput({ active: true, steering: -0.8 }); right.setInput({ active: true, steering: 0.8 });
  run(left, 5); run(right, 5);
  for (const key of ['x', 'heading', 'velocityX', 'angularVelocity', 'frontWheelAngle', 'bodyRoll']) near(left.state[key], -right.state[key]);
  for (const key of ['z', 'speed', 'linearSpeed', 'wheelSpin', 'velocityZ']) near(left.state[key], right.state[key]);
});
check('UI steering remains normalized while actual road rack angle limits high-speed demand', () => {
  near(steeringTarget(1), -0.48);
  near(roadWheelTarget(1, 0), -0.48);
  near(roadWheelTarget(-1, 24), 0.48 / (1 + (24 / P.steeringSpeedScale) ** 2));
  near(roadWheelTarget(0.079, 5), 0);
  const m = createDrivingModel(); m.setInput({ steering: 1 }); m.step(0.05);
  near(m.state.frontWheelAngle, -0.48 * (1 - Math.exp(-0.05 / 0.28)));
  assert.equal(m.state.steering, 1);
});
check('Every vehicle reaches its 11 / 17 / 24 m/s governed speed without overshoot', () => {
  return [11, 17, 24].map(maxSpeed => {
    const m = createDrivingModel({ x: 0, z: 0, maxSpeed });
    m.setInput({ active: true }); let timeTo90 = 0;
    for (let i = 0; i < 1200; i++) {
      m.step(P.fixedStep);
      assert.ok(m.state.speed <= maxSpeed + 1e-10);
      if (!timeTo90 && m.state.speed >= maxSpeed * 0.9) timeTo90 = (i + 1) / 120;
    }
    near(m.state.speed, maxSpeed, 1e-8); near(m.state.x, 0); near(m.state.angularVelocity, 0);
    return { maxSpeed, timeTo90: +timeTo90.toFixed(3) };
  });
});
check('Maximum steering produces small controlled slip across all vehicle tiers', () => {
  return [11, 17, 24].map(maxSpeed => {
    const m = createDrivingModel({ x: 0, z: 0, maxSpeed }); m.setInput({ active: true }); run(m, 5);
    m.setInput({ active: true, steering: 1 }); let maxSlip = 0, maxYaw = 0;
    for (let i = 0; i < 1200; i++) {
      m.step(P.fixedStep);
      const lateral = Math.cos(m.state.heading) * m.state.velocityX - Math.sin(m.state.heading) * m.state.velocityZ;
      const slip = Math.abs(Math.atan2(lateral, m.state.speed));
      maxSlip = Math.max(maxSlip, slip); maxYaw = Math.max(maxYaw, Math.abs(m.state.angularVelocity));
      assert.ok(slip < 0.13, `Excessive body slip ${slip}`);
      assert.ok(Math.abs(m.state.angularVelocity) < 1.05);
      assert.ok(m.state.speed > maxSpeed * 0.93);
    }
    m.setInput({ active: true, steering: 0 }); run(m, 4);
    assert.ok(Math.abs(m.state.angularVelocity) < 0.004);
    const lateral = Math.cos(m.state.heading) * m.state.velocityX - Math.sin(m.state.heading) * m.state.velocityZ;
    assert.ok(Math.abs(lateral) < 0.02);
    return { maxSpeed, maxSlipDegrees: +(maxSlip * 180 / Math.PI).toFixed(2), maxYaw: +maxYaw.toFixed(3) };
  });
});
check('D/R selection brakes through a low-speed interlock before reverse acceleration', () => {
  return ['D', 'R'].map(startGear => {
    const m = createDrivingModel({ x: 0, z: 0 }); const sign = startGear === 'D' ? 1 : -1;
    m.setGear(startGear); m.setInput({ active: true }); run(m, 4);
    const initial = m.state.speed;
    m.setGear(startGear === 'D' ? 'R' : 'D'); near(m.state.speed, initial, 0);
    let old = initial, crossedAt = 0, minimum = Math.abs(initial);
    for (let i = 0; i < 960; i++) {
      m.step(P.fixedStep);
      minimum = Math.min(minimum, Math.abs(m.state.speed));
      assert.ok(Math.abs(m.state.speed - old) < 0.15, 'Velocity may not flip instantly');
      if (!crossedAt && m.state.speed * sign < 0) crossedAt = (i + 1) / 120;
      if (!crossedAt) assert.ok(Math.abs(m.state.speed) <= Math.abs(old) + 1e-10);
      old = m.state.speed;
    }
    assert.ok(crossedAt > 0.8 && crossedAt < 2);
    assert.ok(minimum < 0.07); near(m.state.speed, -sign * 11, 2e-4);
    assert.throws(() => m.setGear('N'));
    return { startGear, crossedAt: +crossedAt.toFixed(3), minimumSpeed: +minimum.toFixed(4) };
  });
});
check('Forward and reverse steer in opposite yaw directions without unstable reverse oscillation', () => {
  for (const gear of ['D', 'R']) {
    const m = createDrivingModel(); m.setGear(gear); m.setInput({ active: true, steering: 0.65 }); run(m, 8);
    assert.equal(Math.sign(m.state.angularVelocity), gear === 'D' ? -1 : 1);
    assert.equal(Math.sign(m.state.speed), gear === 'D' ? 1 : -1);
    assert.ok(Math.abs(m.state.angularVelocity) < 0.7);
  }
});
check('Flat release coasts, reaches rest, and stops all wheel/body motion after settling', () => {
  const m = createDrivingModel({ x: 0, z: 0 }); m.setInput({ active: true }); run(m, 4);
  const starting = m.state.speed; m.setInput({ active: false }); m.step(P.fixedStep);
  assert.ok(m.state.speed > starting - 0.1 && m.state.speed < starting);
  run(m, 15); assert.equal(m.state.speed, 0); assert.equal(m.state.linearSpeed, 0); assert.equal(m.state.moving, false);
  const old = { ...m.state }; run(m, 2);
  near(m.state.x, old.x, 0); near(m.state.z, old.z, 0); near(m.state.wheelSpin, old.wheelSpin, 0);
  assert.ok(Math.abs(m.state.bodyPitch) < 1e-12 && Math.abs(m.state.bodyRoll) < 1e-12 && Math.abs(m.state.bodyBob) < 1e-12);
});
check('A true ground gradient changes acceleration, coasting, and gentle-slope rollback', () => {
  const flat = createDrivingModel({ x: 0, z: 0 });
  const uphill = createDrivingModel({ x: 0, z: 0, groundGradient: () => ({ x: 0, z: -0.08 }) });
  const downhill = createDrivingModel({ x: 0, z: 0, groundGradient: () => ({ x: 0, z: 0.08 }) });
  for (const m of [flat, uphill, downhill]) { m.setInput({ active: true }); run(m, 1); }
  assert.ok(uphill.state.speed < flat.state.speed - 0.6); assert.ok(downhill.state.speed > flat.state.speed + 0.6);
  for (const m of [flat, uphill, downhill]) { m.setInput({ active: false }); run(m, 1); }
  assert.ok(uphill.state.speed < flat.state.speed); assert.ok(downhill.state.speed > flat.state.speed);
  const rollback = createDrivingModel({ x: 0, z: 0, groundGradient: () => ({ x: 0, z: -0.06 }) }); run(rollback, 4);
  assert.ok(rollback.state.speed < -0.5); assert.ok(rollback.state.z > 0.5);
  const side = createDrivingModel({ groundGradient: () => ({ x: 0.06, z: 0 }) }); run(side, 1);
  assert.ok(side.state.velocityX < 0); assert.ok(Math.abs(side.state.velocityX) < 0.05, 'Strong lateral grip should resist side slope drift');
  return { uphillAfterCoast: uphill.state.speed, flatAfterCoast: flat.state.speed,
    downhillAfterCoast: downhill.state.speed, rollbackSpeed: rollback.state.speed };
});
check('30 / 60 / 120 Hz rendering produces equivalent rigid-body state and path sums', () => {
  const snapshots = [30, 60, 120].map(fps => {
    const m = createDrivingModel({ x: 0, z: 0, groundGradient: () => ({ x: 0.01, z: -0.03 }) });
    let path = 0, travel = 0;
    for (const phase of [{ seconds: 2, steering: 0, active: true }, { seconds: 3, steering: 0.8, active: true },
      { seconds: 1, steering: -0.3, active: false }, { seconds: 3, gear: 'R', steering: 0.4, active: true }]) {
      if (phase.gear) m.setGear(phase.gear); m.setInput(phase);
      const moved = run(m, phase.seconds, fps); path += moved.distance; travel += moved.travel;
    }
    return { ...m.state, travel, pathDistance: path };
  });
  for (const s of snapshots.slice(1)) for (const key of Object.keys(snapshots[0])) {


    if (key === 'movingSeconds') continue;
    if (typeof s[key] === 'number') near(s[key], snapshots[0][key], 2e-10);
    else assert.equal(s[key], snapshots[0][key]);
  }
  return { totalDistance: snapshots[0].pathDistance };
});
check('Long frame stalls are bounded, fractional frames accumulate, invalid frames cannot replay distance', () => {
  const a = createDrivingModel(), b = createDrivingModel();
  for (const m of [a, b]) m.setInput({ active: true, steering: 0.4 });
  a.step(10); b.step(P.maxFrameDelta); assert.deepEqual(a.state, b.state);
  const c = createDrivingModel(); c.setInput({ active: true }); c.step(P.fixedStep / 2); near(c.state.speed, 0);
  c.step(P.fixedStep / 2); assert.ok(c.state.speed > 0);
  for (const dt of [0, -1, NaN, Infinity]) {
    const old = { ...a.state }; a.step(dt);
    near(a.state.x, old.x, 0); near(a.state.z, old.z, 0); near(a.state.velocityX, old.velocityX, 0);
    near(a.state.pathDistance, 0, 0); near(a.state.travel, 0, 0);
  }
});
check('Unsigned actual path counts lateral skid even when forward wheel rolling is zero', () => {
  const m = createDrivingModel({ x: 0, z: 0 }); m.state.velocityX = 2;
  m.step(P.fixedStep); assert.ok(m.state.pathDistance > 0.01);
  assert.ok(Math.abs(m.state.travel) < m.state.pathDistance * 0.01);
  near(m.state.linearSpeed, Math.hypot(m.state.velocityX, m.state.velocityZ));
  assert.ok(m.state.moving);
  m.step(P.fixedStep / 4); near(m.state.pathDistance, 0); near(m.state.travel, 0);
});
check('Head-on contacts remove inward normal motion with no bounce or wheel spinning through a wall', () => {
  const m = createDrivingModel({ x: 0, z: P.halfLength + 0.000001, contact: frontWall, maxSpeed: 24 });
  m.state.velocityZ = -24; m.setInput({ active: true });
  let maxPath = 0;
  for (let i = 0; i < 120; i++) {
    m.step(P.fixedStep); maxPath = Math.max(maxPath, m.state.pathDistance);
    assert.ok(m.state.z >= P.halfLength - 1e-12); assert.equal(m.state.blocked, true);
    near(m.state.velocityZ, 0, 1e-12); near(m.state.angularVelocity, 0, 1e-12);
  }
  assert.ok(maxPath < 1e-8); assert.ok(Math.abs(m.state.wheelSpin) < 1e-8);
});
check('Oblique contacts preserve along-wall velocity and generate an off-center contact torque', () => {
  const aligned = createDrivingModel({ x: 6 - P.halfWidth - 0.000001, z: 0, contact: sideWall });
  Object.assign(aligned.state, { velocityX: 3, velocityZ: -6 });
  aligned.step(P.fixedStep);
  assert.equal(aligned.state.blocked, true); near(aligned.state.velocityX, 0, 1e-10);
  assert.ok(aligned.state.velocityZ < -5.9); near(aligned.state.angularVelocity, 0, 0.001);
  const heading = -0.25;
  const reach = P.halfWidth * Math.abs(Math.cos(heading)) + P.halfLength * Math.abs(Math.sin(heading));
  const corner = createDrivingModel({ x: 6 - reach - 0.000001, z: 0, heading, contact: sideWall });
  Object.assign(corner.state, { velocityX: 5, velocityZ: -6 });
  const beforeEnergy = energy(corner.state); corner.step(P.fixedStep);
  assert.equal(corner.state.blocked, true); assert.ok(corner.state.angularVelocity > 0.1);
  assert.ok(corner.state.velocityZ < -5.8); assert.ok(energy(corner.state) < beforeEnergy);
  assert.equal(sideWall(corner.state.x, corner.state.z, corner.state.heading), undefined);
  assert.ok(corner.state.pathDistance < 0.09);
  return { tangentSpeed: corner.state.velocityZ, contactYawRate: corner.state.angularVelocity };
});
check('Near-parallel contact stays stable inside the real conservative road envelope', () => {
  const boundary = ROUTE.halfWidth - TRUCK_HALF_WIDTH - ROAD_MARGIN - 0.0002;
  let maxYaw = 0;
  for (const heading of [0, 0.00001, -0.00001, 0.002, -0.002]) {
    const m = createDrivingModel({ x: boundary - 0.015, z: 0, heading, contact: corridorContact });
    Object.assign(m.state, { velocityX: 3, velocityZ: -6 });
    let contacts = 0;
    for (let i = 0; i < 360; i++) {
      m.step(P.fixedStep);
      maxYaw = Math.max(maxYaw, Math.abs(m.state.angularVelocity));
      if (m.state.blocked) contacts++;
      assert.ok(truckInRoad(m.state.x, m.state.z, m.state.heading));
      assert.ok(m.state.pathDistance < 0.06);
      assert.ok(Math.abs(m.state.angularVelocity) < 0.001, 'Aligned face contact must not produce a yaw kick');
    }
    assert.ok(contacts > 0); assert.ok(m.state.speed > 1.5, 'Along-edge coasting motion survives');
  }
  return { poses: 5, frames: 1800, maxYaw };
});
check('Adaptive swept collision samples cannot tunnel through a thin barrier at 24 m/s', () => {
  let calls = 0;
  const m = createDrivingModel({ x: 0, z: 12, maxSpeed: 24, contact: (x, z, h) => { calls++; return frontWall(x, z, h); } });
  m.setInput({ active: true });
  for (let i = 0; i < 300; i++) {
    m.step(1 / 30); assert.ok(m.state.z >= P.halfLength - 1e-10);
  }
  assert.ok(calls >= 1200); near(m.state.speed, 0, 1e-12);
});
check('Invalid confined contacts cannot create projection teleports or heading snaps', () => {
  const m = createDrivingModel({ x: 2, z: 3, heading: 0.2,
    contact: () => ({ normalX: 1, normalZ: 0, depth: 1, name: 'impossible overlap' }) });
  m.setInput({ active: true, steering: 1 }); run(m, 3);
  near(m.state.x, 2, 0); near(m.state.z, 3, 0); near(m.state.heading, 0.2, 0);
  near(m.state.pathDistance, 0, 0); near(m.state.wheelSpin, 0, 0);
  assert.equal(m.state.blocked, true);
});
check('Pause and reset clear all velocities, accumulator residue, and suspension springs', () => {
  const m = createDrivingModel({ x: 1, z: 2, heading: 0.3 });
  m.setInput({ active: true, steering: 0.8 }); run(m, 2); m.step(P.fixedStep / 2);
  m.pause();
  for (const key of ['velocityX', 'velocityZ', 'angularVelocity', 'speed', 'linearSpeed', 'travel', 'pathDistance',
    'steering', 'frontWheelAngle', 'bodyPitch', 'bodyRoll', 'bodyBob']) near(m.state[key], 0, 0);
  assert.equal(m.state.active, false); assert.equal(m.state.blocked, false); assert.equal(m.state.moving, false);
  m.setInput({ active: true }); m.step(P.fixedStep / 2); near(m.state.speed, 0, 0);
  m.step(P.fixedStep / 2); assert.ok(m.state.speed > 0);
  m.setGear('R'); m.reset(); near(m.state.x, 1); near(m.state.z, 2); near(m.state.heading, 0.3);
  near(m.state.wheelSpin, 0); near(m.state.velocityX, 0); near(m.state.velocityZ, 0); near(m.state.angularVelocity, 0);
  assert.equal(m.state.gear, 'D'); m.step(P.fixedStep); near(m.state.bodyPitch, 0); near(m.state.bodyRoll, 0); near(m.state.bodyBob, 0);
});

console.log(`\n${checks} original planar vehicle dynamics checks passed.`);
