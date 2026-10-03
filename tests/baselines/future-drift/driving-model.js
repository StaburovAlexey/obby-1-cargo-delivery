/** Original four-contact-patch planar vehicle solver, in meters / seconds / kg.
 * Independently implements rigid-body force/torque and tire-slip principles;
 * no article implementation is copied. +Y is up and heading 0 faces -Z.
 * The TOW_DRIVING name and UI/view fields remain public for compatibility.
 */
import { CITY_SURFACE, normalizeSurfaceDynamics } from './biome-surfaces.js';
import { vehicleConfig } from '../../../dist/economy-config.js';
import { getUpgradeModifiers } from '../../../dist/vehicle-upgrades.js';
// Compatibility metadata for older view/input consumers. Acceleration, inertia,
// and geometric-turn values here do not drive the new force solver.
export const TOW_DRIVING = Object.freeze({
  maxSpeed: 11,
  accelerationSeconds: 1.3,
  inertiaSeconds: 2.2,
  steeringStrength: 1,
  maximumWheelAngle: 0.48,
  steeringDeadzone: 0.08,
  steeringResponseSeconds: 0.22,
  wheelbase: 3.2,
  sourceWheelRadius: 0.48,
  wheelRadius: 0.68,
  sharpTurnSpeedReduction: 0.18,
  movingThreshold: 0.05,
  maxDelta: 0.05,
  followSmoothing: 7,
  cameraFov: 70,
  cameraOffset: [0, 5.4, 7.8],
  cameraTarget: [0, 1, -2.2],
});
export const moveTowards = (current, target, amount) =>
  Math.abs(target - current) <= amount
    ? target
    : current + Math.sign(target - current) * amount;
export function steeringTarget(input) {
  const steering =
    Math.abs(input) < 0.08 ? 0 : Math.max(-1, Math.min(1, input));
  const magnitude = Math.max(0, (Math.abs(steering) - 0.08) / 0.92);
  const response = Math.sign(steering) * magnitude * (0.55 + 0.45 * magnitude);
  return (
    -response * TOW_DRIVING.maximumWheelAngle * TOW_DRIVING.steeringStrength
  );
}

/** Legacy geometric stepping retained for character and compatibility callers.
 * The vehicle rigid body below does not use this kinematic helper. */
export function moveWithContacts(
  position,
  rotation,
  travel,
  yawDelta,
  colliderReach,
  getContact,
) {
  const MAX_STEP_DISTANCE = 0.15,
    CONTACT_EPSILON = 0.00001,
    MAX_CONTACT_PASSES = 6;
  const steps = Math.max(
    1,
    Math.ceil(
      (Math.abs(travel) + Math.abs(yawDelta) * colliderReach) /
        MAX_STEP_DISTANCE,
    ),
  );
  const stepTravel = travel / steps,
    stepYaw = yawDelta / steps;
  let collided = false;
  const resolveContacts = () => {
    let correctionDistance = 0;
    for (let pass = 0; pass < MAX_CONTACT_PASSES; pass++) {
      const contact = getContact();
      if (!contact) return true;
      collided = true;
      const correction = contact.depth + CONTACT_EPSILON;
      correctionDistance += correction;
      if (correctionDistance > MAX_STEP_DISTANCE * 3) return false;
      position.x += contact.normalX * correction;
      position.z += contact.normalZ * correction;
    }
    return !getContact();
  };
  for (let step = 0; step < steps; step++) {
    const px = position.x,
      pz = position.z,
      py = rotation.y;
    rotation.y += stepYaw;
    position.x -= Math.sin(rotation.y) * stepTravel;
    position.z -= Math.cos(rotation.y) * stepTravel;
    if (resolveContacts()) continue;
    rotation.y = py;
    position.x = px - Math.sin(py) * stepTravel;
    position.z = pz - Math.cos(py) * stepTravel;
    if (resolveContacts()) continue;
    position.x = px;
    position.z = pz;
    break;
  }
  return collided;
}

/** Calibrated for the existing 2.64 m track / 3.36 m wheelbase truck mesh.
 * Tire forces use a friction circle, not a geometric yaw-rate prescription.
 * The short speed-sensitive steering rack prevents a full UI turn at highway
 * speed from demanding more lateral acceleration than the tires can provide.
 */
export const VEHICLE_DYNAMICS = Object.freeze({
  mass: 1600,
  yawInertia: 5300,
  gravity: 9.81,
  fixedStep: 1 / 120,
  maxFrameDelta: 0.1,
  maxSubsteps: 12,
  maxSweepDistance: 0.12,
  halfWidth: 1.55,
  halfLength: 2.88,
  colliderReach: Math.hypot(1.55, 2.88),
  lateralViscosity: 10000, // N per m/s, per contact patch
  tireFriction: 1.35,
  rollingCoefficient: 0.018,
  rollingTransitionSpeed: 0.18,
  poweredDrag: 0.06, // acceleration per m/s, divided between all four tires
  coastingDrag: 0.38,
  maximumAcceleration: 7.5,
  accelerationTimeScale: 1.8,
  governorGain: 4,
  brakeAcceleration: 8.5,
  brakeViscosity: 11000,
  steeringSpeedScale: 9,
  gradeGravityScale: 1,
  sleepSpeed: 0.018,
  sleepYawSpeed: 0.008,
  maxContactPasses: 8,
  maxContactCorrection: 0.36,
  contactEpsilon: 0.000001,
  contactFaceTolerance: 0.025,
});
export const VEHICLE_WHEELS = Object.freeze([
  Object.freeze({ name: "front-left", x: -1.32, z: -1.63, front: true }),
  Object.freeze({ name: "front-right", x: 1.32, z: -1.63, front: true }),
  Object.freeze({ name: "rear-left", x: -1.32, z: 1.73, front: false }),
  Object.freeze({ name: "rear-right", x: 1.32, z: 1.73, front: false }),
]);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const normalizeMaxSpeed = (speed) => clamp(finite(Number(speed), TOW_DRIVING.maxSpeed), 1, 40);
const forwardSpeed = (s) => (-Math.sin(s.heading) * s.velocityX - Math.cos(s.heading) * s.velocityZ) || 0;

/** Actual road-wheel rack angle, independent of the +/-135-degree touch wheel. */
export function roadWheelTarget(steering, linearSpeed = 0) {
  const ratio = Math.abs(linearSpeed) / VEHICLE_DYNAMICS.steeringSpeedScale;
  return steeringTarget(steering) / (1 + ratio * ratio);
}

/** Pure force evaluation, exported so tests can inspect every tire force.
 * At a point r relative to the center, v_point = v + (omega*r.z,-omega*r.x).
 * A force at that point contributes tauY = r.z*Fx-r.x*Fz.
 * `braking` is the gear-interlock brake, and gradients are dh/dx and dh/dz.
 */
export function evaluateVehicleForces(state, {
  maxSpeed = TOW_DRIVING.maxSpeed,
  gradient = { x: 0, z: 0 },
  braking = false,
  surface = CITY_SURFACE,
  engineAcceleration,
  brakeFactor = 1,
  speedFraction = 1,
} = {}) {
  const p = VEHICLE_DYNAMICS;
  const ground = normalizeSurfaceDynamics(surface);
  const surfaceMaxSpeed = normalizeMaxSpeed(maxSpeed) * ground.speedFactor * clamp(speedFraction, 0, 1);
  const rollingCoefficient = p.rollingCoefficient * ground.rollingFactor;
  const c = Math.cos(state.heading), s = Math.sin(state.heading);
  const speed = forwardSpeed(state);
  const direction = state.gear === "R" ? -1 : 1;
  const powered = state.active && !braking;
  const drag = powered ? p.poweredDrag : p.coastingDrag * ground.coastingFactor;
  const nominalAcceleration = Number.isFinite(engineAcceleration) ? clamp(engineAcceleration, .1, 22) :
    Math.min(p.maximumAcceleration, normalizeMaxSpeed(maxSpeed) / p.accelerationTimeScale);
  const acceleration = nominalAcceleration * ground.engineFactor;
  const brakeScale = clamp(finite(brakeFactor, 1), .5, 2.5);
  const rollingAcceleration = p.gravity * rollingCoefficient;
  const speedInGear = speed * direction;
  // A governed engine feathers torque close to the requested maximum. At the
  // maximum on flat ground it supplies just the drag/rolling losses.
  const driveAcceleration = powered ? clamp(
    (surfaceMaxSpeed - speedInGear) * p.governorGain +
      p.poweredDrag * Math.max(0, speedInGear) +
      rollingAcceleration * Math.tanh(Math.max(0, speedInGear) / p.rollingTransitionSpeed),
    0, acceleration,
  ) * direction : 0;
  const gx = finite(Number(gradient?.x)), gz = finite(Number(gradient?.z));
  const slopeSquared = gx * gx + gz * gz;
  // Horizontal components of gravity projected onto the terrain tangent.
  let forceX = -p.mass * p.gravity * p.gradeGravityScale * gx / (1 + slopeSquared);
  let forceZ = -p.mass * p.gravity * p.gradeGravityScale * gz / (1 + slopeSquared);
  let torque = 0;
  const normalLoad = p.mass * p.gravity / Math.sqrt(1 + slopeSquared) / VEHICLE_WHEELS.length;
  const grip = normalLoad * p.tireFriction * ground.frictionFactor;
  const tires = [];
  for (const wheel of VEHICLE_WHEELS) {
    const rx = c * wheel.x + s * wheel.z;
    const rz = -s * wheel.x + c * wheel.z;
    const pointVelocityX = state.velocityX + state.angularVelocity * rz;
    const pointVelocityZ = state.velocityZ - state.angularVelocity * rx;
    const angle = state.heading + (wheel.front ? state.frontWheelAngle : 0);
    const fx = -Math.sin(angle), fz = -Math.cos(angle);
    const rightX = Math.cos(angle), rightZ = -Math.sin(angle);
    const longitudinalSpeed = pointVelocityX * fx + pointVelocityZ * fz;
    const lateralSpeed = pointVelocityX * rightX + pointVelocityZ * rightZ;
    let longitudinalForce = p.mass * driveAcceleration / VEHICLE_WHEELS.length -
      p.mass * drag * longitudinalSpeed / VEHICLE_WHEELS.length -
      normalLoad * rollingCoefficient * Math.tanh(longitudinalSpeed / p.rollingTransitionSpeed);
    if (braking) longitudinalForce += clamp(
      -longitudinalSpeed * p.brakeViscosity * brakeScale * Number(braking),
      -p.mass * p.brakeAcceleration * brakeScale / VEHICLE_WHEELS.length,
      p.mass * p.brakeAcceleration * brakeScale / VEHICLE_WHEELS.length,
    );
    let lateralForce = -lateralSpeed * p.lateralViscosity * ground.lateralDampingFactor;
    const requestedForce = Math.hypot(longitudinalForce, lateralForce);
    const gripScale = Math.min(1, grip / Math.max(1e-12, requestedForce));
    longitudinalForce *= gripScale;
    lateralForce *= gripScale;
    const tireForceX = fx * longitudinalForce + rightX * lateralForce;
    const tireForceZ = fz * longitudinalForce + rightZ * lateralForce;
    const tireTorque = rz * tireForceX - rx * tireForceZ;
    forceX += tireForceX;
    forceZ += tireForceZ;
    torque += tireTorque;
    tires.push({ name: wheel.name, rx, rz, pointVelocityX, pointVelocityZ,
      longitudinalSpeed, lateralSpeed, longitudinalForce, lateralForce,
      forceX: tireForceX, forceZ: tireForceZ, torque: tireTorque,
      normalLoad, grip, saturated: gripScale < 1 });
  }
  return { forceX, forceZ, torque, tires };
}

export function createDrivingModel({
  x = 1.8,
  z = 9.8,
  heading = 0,
  contact = () => undefined,
  groundGradient = () => ({ x: 0, z: 0 }),
  groundSurface = () => CITY_SURFACE,
  vehicleId = 'pickup',
  getUpgrades = () => undefined,
  maxSpeed = TOW_DRIVING.maxSpeed,
} = {}) {
  const p = VEHICLE_DYNAMICS;
  maxSpeed = normalizeMaxSpeed(maxSpeed);
  const spec = vehicleConfig(vehicleId);
  // Non-catalog speed callers keep the original force tuning. Production cars
  // pass both their stable ID and nominal catalog speed.
  const catalogAcceleration = maxSpeed === spec.maxSpeed ? spec.acceleration :
    Math.min(p.maximumAcceleration, maxSpeed / p.accelerationTimeScale);
  const readModifiers = () => {
    let levels;
    try { levels = typeof getUpgrades === 'function' ? getUpgrades() : undefined; } catch { /* malformed callback uses stock */ }
    return getUpgradeModifiers(levels);
  };
  const spawn = { x, z, heading };
  const state = {
    x, z, heading,
    velocityX: 0, velocityZ: 0, angularVelocity: 0,
    speed: 0, linearSpeed: 0,
    frontWheelAngle: 0, wheelSpin: 0,
    gear: "D", steering: 0, active: false, speedDemand: null,
    moving: false, blocked: false,
    travel: 0, pathDistance: 0, movingSeconds: 0,
    bodyPitch: 0, bodyRoll: 0, bodyBob: 0,
  };
  const springs = {
    pitch: { value: 0, velocity: 0 },
    roll: { value: 0, velocity: 0 },
    bob: { value: 0, velocity: 0 },
  };
  let accumulator = 0, phase = 0, gearBraking = false;
  const clearSprings = () => {
    phase = 0;
    for (const spring of Object.values(springs)) spring.value = spring.velocity = 0;
    state.bodyPitch = state.bodyRoll = state.bodyBob = 0;
  };
  const springStep = (spring, target, stiffness, damping, dt) => {
    spring.velocity += (target - spring.value) * stiffness * dt;
    spring.velocity *= Math.exp(-damping * dt);
    spring.value += spring.velocity * dt;
  };
  const updateSpeed = () => {
    state.speed = forwardSpeed(state);
    state.linearSpeed = Math.hypot(state.velocityX, state.velocityZ);
    state.moving = state.linearSpeed > TOW_DRIVING.movingThreshold ||
      Math.abs(state.angularVelocity) > p.sleepYawSpeed;
  };
  const stopMotion = () => {
    state.velocityX = state.velocityZ = state.angularVelocity = 0;
    state.speed = state.linearSpeed = 0;
    state.moving = false;
  };
  const readContact = () => {
    const hit = contact(state.x, state.z, state.heading);
    if (!hit || !Number.isFinite(hit.depth) || hit.depth < 0) return;
    const length = Math.hypot(hit.normalX, hit.normalZ);
    if (!Number.isFinite(length) || length < 1e-9) return;
    return { ...hit, normalX: hit.normalX / length, normalZ: hit.normalZ / length };
  };
  const contactImpulse = (hit) => {
    const nx = hit.normalX, nz = hit.normalZ;
    const c = Math.cos(state.heading), s = Math.sin(state.heading);
    // Contacts may come from a larger conservative road envelope. Projection
    // honors that envelope; impulses act at this physical chassis footprint.
    const points = [];
    for (const sx of [-p.halfWidth, p.halfWidth]) for (const sz of [-p.halfLength, p.halfLength]) {
      const rx = c * sx + s * sz, rz = -s * sx + c * sz;
      points.push({ support: rx * nx + rz * nz, lever: rz * nx - rx * nz });
    }
    points.sort((a, b) => a.support - b.support);
    const candidates = points.filter(point => point.support - points[0].support <= p.contactFaceTolerance);
    const normalVelocity = (point) => state.velocityX * nx + state.velocityZ * nz + state.angularVelocity * point.lever;
    const applyImpulse = (impulse, lever) => {
      state.velocityX += nx * impulse / p.mass;
      state.velocityZ += nz * impulse / p.mass;
      state.angularVelocity += lever * impulse / p.yawInertia;
    };
    // Nearly parallel contact is a face, not an arbitrarily selected corner.
    // Solve its two endpoint constraints together, with nonnegative impulses.
    // This prevents tiny tire yaw at a flat wall from producing a yaw kick.
    if (candidates.length === 2) {
      const [a, b] = candidates;
      const va = normalVelocity(a), vb = normalVelocity(b);
      const aa = 1 / p.mass + a.lever * a.lever / p.yawInertia;
      const bb = 1 / p.mass + b.lever * b.lever / p.yawInertia;
      const ab = 1 / p.mass + a.lever * b.lever / p.yawInertia;
      const determinant = aa * bb - ab * ab;
      const ja = (-va * bb + vb * ab) / determinant;
      const jb = (-vb * aa + va * ab) / determinant;
      if (ja >= 0 && jb >= 0) {
        applyImpulse(ja, a.lever); applyImpulse(jb, b.lever);
        return;
      }
    }
    // A corner, or a face with one endpoint moving away: use unilateral
    // constraints. Restitution is zero and tangential velocity is untouched.
    for (let pass = 0; pass < 4; pass++) {
      for (const point of candidates) {
        const velocity = normalVelocity(point);
        if (velocity >= 0) continue;
        const impulse = -velocity / (1 / p.mass + point.lever * point.lever / p.yawInertia);
        applyImpulse(impulse, point.lever);
      }
    }
  };
  const resolveContacts = () => {
    let correction = 0;
    for (let pass = 0; pass < p.maxContactPasses; pass++) {
      const hit = readContact();
      if (!hit) return true;
      state.blocked = true;
      contactImpulse(hit);
      const amount = hit.depth + p.contactEpsilon;
      correction += amount;
      if (correction > p.maxContactCorrection) return false;
      state.x += hit.normalX * amount;
      state.z += hit.normalZ * amount;
    }
    return !readContact();
  };
  const moveRigidBody = (dt) => {
    let remaining = dt;
    while (remaining > 1e-12) {
      // Recompute after an impulse, which can trade translation for rotation.
      const sweptDistance = (Math.hypot(state.velocityX, state.velocityZ) +
        Math.abs(state.angularVelocity) * p.colliderReach) * remaining;
      const count = Math.max(1, Math.ceil(sweptDistance / p.maxSweepDistance));
      const slice = remaining / count;
      remaining -= slice;
      const px = state.x, pz = state.z, previousHeading = state.heading;
      state.x += state.velocityX * slice;
      state.z += state.velocityZ * slice;
      state.heading += state.angularVelocity * slice;
      if (!resolveContacts()) {
        // An inconsistent/confined/deeply overlapping pose cannot teleport the
        // body. Keep the last conservative pose; the contact impulse remains.
        state.x = px; state.z = pz; state.heading = previousHeading;
      }
      const dx = state.x - px, dz = state.z - pz;
      const middleHeading = (state.heading + previousHeading) * 0.5;
      const rollingDistance = -Math.sin(middleHeading) * dx - Math.cos(middleHeading) * dz;
      state.travel += rollingDistance;
      state.pathDistance += Math.hypot(dx, dz);
    }
  };
  const integrate = (dt) => {
    updateSpeed();
    const oldVelocityX = state.velocityX, oldVelocityZ = state.velocityZ;
    const upgrades = readModifiers();
    const surface = normalizeSurfaceDynamics(groundSurface(state.x, state.z, vehicleId));
    // Upgrade effects enter the existing four contact forces, never positions,
    // heading, velocity, fuel or range. A purchase applies on the next step.
    surface.frictionFactor *= upgrades.grip;
    surface.lateralDampingFactor *= upgrades.grip;
    const effectiveMaxSpeed = maxSpeed * upgrades.speed;
    const responseSeconds = TOW_DRIVING.steeringResponseSeconds / (spec.handling * upgrades.handling * surface.handlingFactor);
    // Retain the same UI/rack response, reducing only its high-speed demand on
    // low-grip surfaces. Yaw still comes entirely from the four tire forces.
    // This keeps a held reverse turn on snow controllable rather than asking
    // winter tires for dry-asphalt lateral acceleration indefinitely.
    const steeringGripScale = Math.sqrt(Math.min(1, surface.frictionFactor));
    const reverseGripScale = state.gear === 'R' ? Math.min(1, surface.frictionFactor) : 1;
    const targetWheelAngle = roadWheelTarget(state.steering, state.linearSpeed / steeringGripScale) * reverseGripScale;
    state.frontWheelAngle += (targetWheelAngle - state.frontWheelAngle) *
      (1 - Math.exp(-dt / responseSeconds));
    const analog = Number.isFinite(state.speedDemand);
    const demand = analog ? state.speedDemand : 0;
    if (analog && Math.abs(demand) > .001) {
      const requestedGear = demand < 0 ? 'R' : 'D';
      if (state.gear !== requestedGear) gearBraking = false;
      state.gear = requestedGear;
    }
    const direction = state.gear === "R" ? -1 : 1;
    if (!state.active) gearBraking = false;
    else if (state.speed * direction < -0.08) gearBraking = true;
    if (gearBraking && state.linearSpeed < 0.08 && Math.abs(state.angularVelocity) < 0.05) {
      stopMotion();
      gearBraking = false;
    }
    const gradient = groundGradient(state.x, state.z) || { x: 0, z: 0 };
    // The stick requests speed, never velocity. Existing tire forces accelerate,
    // brake and reverse through zero; terrain traction still limits the result.
    const speedFraction = analog ? Math.abs(demand) : 1;
    const targetSpeed = normalizeMaxSpeed(effectiveMaxSpeed) * surface.speedFactor * speedFraction;
    const excessSpeed = state.speed * direction - targetSpeed;
    const analogBrake = analog ? (speedFraction < .001 ? 1 : clamp((excessSpeed - .04) * .7, 0, 1)) : 0;
    const forces = evaluateVehicleForces(state, { maxSpeed: effectiveMaxSpeed, gradient, braking: gearBraking ? 1 : analogBrake, speedFraction, surface,
      engineAcceleration: catalogAcceleration * upgrades.engine, brakeFactor: spec.grip * upgrades.grip });
    state.velocityX += forces.forceX / p.mass * dt;
    state.velocityZ += forces.forceZ / p.mass * dt;
    state.angularVelocity += forces.torque / p.yawInertia * dt;
    // Tire static resistance holds only very shallow ground. On a real gentle
    // grade, projected gravity exceeds it and a released vehicle rolls downhill.
    const slope = Math.hypot(finite(Number(gradient.x)), finite(Number(gradient.z)));
    if (!state.active && slope < p.rollingCoefficient * surface.rollingFactor &&
      Math.hypot(state.velocityX, state.velocityZ) < p.sleepSpeed &&
      Math.abs(state.angularVelocity) < p.sleepYawSpeed) stopMotion();
    const previousTravel = state.travel;
    const previousDistance = state.pathDistance;
    moveRigidBody(dt);
    updateSpeed();
    const actualTravel = state.travel - previousTravel;
    const actualDistance = state.pathDistance - previousDistance;
    // Reward timing follows fixed-step contact-resolved travel, including when
    // high-refresh frames contain no physics step. Wheel spin cannot mint time.
    if (actualDistance / dt >= .15) state.movingSeconds += dt;
    state.wheelSpin += actualTravel / TOW_DRIVING.wheelRadius;
    phase += actualDistance * 4.2;
    const accelerationX = (state.velocityX - oldVelocityX) / dt;
    const accelerationZ = (state.velocityZ - oldVelocityZ) / dt;
    const forwardAcceleration = -Math.sin(state.heading) * accelerationX - Math.cos(state.heading) * accelerationZ;
    const lateralAcceleration = Math.cos(state.heading) * accelerationX - Math.sin(state.heading) * accelerationZ;
    const pitch = clamp(-forwardAcceleration * 0.006, -0.0375, 0.0375);
    const roll = clamp(lateralAcceleration * 0.0098, -0.1, 0.1);
    const bob = state.moving ? Math.sin(phase) * 0.022 * Math.min(1, state.linearSpeed / maxSpeed) : 0;
    springStep(springs.pitch, pitch, 48, 8.5, dt);
    springStep(springs.roll, roll, 54, 9, dt);
    springStep(springs.bob, bob, 70, 11, dt);
    // Basalt roughness is view-only: distance-driven, centimetre-scale, and
    // absent at rest. It never adds impulses, collision/fuel distance or noise.
    const roughness = surface.vibration * Math.min(1, state.linearSpeed / 3);
    state.bodyPitch = springs.pitch.value + roughness * Math.sin(phase * .83) * .0015;
    state.bodyRoll = springs.roll.value + roughness * Math.sin(phase * 1.13) * .003;
    state.bodyBob = springs.bob.value + roughness * (Math.sin(phase * 1.7) * .011 + Math.sin(phase * .67) * .004);
  };
  return {
    state,
    setInput({ steering = 0, active = false, speedDemand }) {
      state.steering = clamp(finite(Number(steering)), -1, 1);
      state.speedDemand = Number.isFinite(speedDemand) ? clamp(speedDemand, -1, 1) : null;
      state.active = state.speedDemand === null ? !!active : Math.abs(state.speedDemand) > .001;
    },
    setGear(gear) {
      if (gear !== "D" && gear !== "R") throw new Error("Gear must be D or R");
      if (state.gear !== gear) gearBraking = false;
      state.gear = gear;
    },
    pause() {
      state.active = false;
      state.speedDemand = Number.isFinite(state.speedDemand) ? 0 : null;
      state.steering = state.frontWheelAngle = 0;
      state.travel = state.pathDistance = state.movingSeconds = 0;
      state.blocked = false;
      accumulator = 0;
      gearBraking = false;
      stopMotion();
      clearSprings();
    },
    reset() {
      Object.assign(state, spawn, {
        frontWheelAngle: 0, wheelSpin: 0, gear: "D", steering: 0,
        active: false, speedDemand: null, blocked: false, travel: 0, pathDistance: 0, movingSeconds: 0,
      });
      accumulator = 0;
      gearBraking = false;
      stopMotion();
      clearSprings();
    },
    step(deltaSeconds) {
      // These are per-public-frame sums, including when no fixed step is due.
      // Keeping stale travel on a zero-delta frame would burn fuel twice.
      state.travel = state.pathDistance = state.movingSeconds = 0;
      state.blocked = false;
      const dt = clamp(finite(Number(deltaSeconds)), 0, p.maxFrameDelta);
      if (!dt) return state;
      accumulator = Math.min(accumulator + dt, p.maxFrameDelta);
      let steps = 0;
      while (accumulator + 1e-12 >= p.fixedStep && steps < p.maxSubsteps) {
        integrate(p.fixedStep);
        accumulator = Math.max(0, accumulator - p.fixedStep);
        steps++;
      }
      return state;
    },
  };
}
