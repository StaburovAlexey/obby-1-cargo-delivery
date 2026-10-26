




import { CITY_SURFACE, normalizeSurfaceDynamics } from './biome-surfaces.js';
import { vehicleConfig } from './economy-config.js';
import { getUpgradeModifiers, getSpeedStabilityDemand, getRoadGripMultiplier, steeringResponseSeconds, UPGRADE_MAX_LEVEL } from './vehicle-upgrades.js';
import { STANDARD_VEHICLE_BALANCE, UPGRADE_GAINS } from './economy-balance.js';
import {BMW_DRIFT,evaluateDriftDynamics,driftTelemetry,driftWheelTarget} from './drift-dynamics.js';
import {vehiclePhysicsGeometry, rearTireSlip} from './vehicle-physics.js';


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
  lateralViscosity: 10000,
  tireFriction: 1.35,
  rollingCoefficient: 0.018,
  rollingTransitionSpeed: 0.18,
  poweredDrag: 0.06,
  coastingDrag: 0.38,
  maximumAcceleration: 7.5,
  accelerationTimeScale: 1.8,
  governorGain: 4,
  brakeAcceleration: 8.5,
  brakeViscosity: 11000,
  steeringSpeedScale: 16,
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
const MAX_STANDARD_SPEED = STANDARD_VEHICLE_BALANCE.maxSpeed * (1 + UPGRADE_GAINS.speed * UPGRADE_MAX_LEVEL);
const normalizeMaxSpeed = (speed, reward=false) => clamp(finite(Number(speed), TOW_DRIVING.maxSpeed), 1, reward?50:MAX_STANDARD_SPEED);
const forwardSpeed = (s) => (-Math.sin(s.heading) * s.velocityX - Math.cos(s.heading) * s.velocityZ) || 0;
export const MAX_SPEED_ASSIST_RATIO = 1.10;

// Ordinary vehicles slide on their rear contact patches under a fast cornering
// load. This is tire compliance, not a sideways push or a requested body angle.
// The rear tires progressively regain stiffness as slip grows, so countersteer
// and lifting off can catch the slide rather than chasing a falling grip curve.
// Low-speed maneuvers, reverse, and unsuitable-biome tires keep their existing
// behavior; the BMW uses its separate rear-drive/handbrake tire model.
export const CONTROLLED_SKID = Object.freeze({
  startSpeed: 6,
  fullSpeed: 10,
  fastSpeedScale: 18,
  rearCompliance: .70,
  gripRecovery: .85,
  catchSlipStart: .06,
  catchSlipRange: .12,
  loadStart: .6,
  loadRange: 2.4,
});
const ordinaryRearStiffness = (state, ground, speed, gripUpgrade, geometry, speedAssistRatio) => {
  if (state.gear === 'R') return 1;
  const p = CONTROLLED_SKID;
  const speedBlend = clamp((Math.abs(speed) - p.startSpeed) / (p.fullSpeed - p.startSpeed), 0, 1);
  const bodySideSpeed = Math.cos(state.heading) * state.velocityX - Math.sin(state.heading) * state.velocityZ;
  const slip = geometry ? Math.abs(rearTireSlip(state, geometry.rearZ)) : Math.abs(Math.atan2(bodySideSpeed, Math.max(2, Math.abs(speed))));
  // A longer body has substantial normal COM-sideways motion in a turn.
  // Catch the actual rear tire slide instead of treating that motion as slip.
  const catchBlend = clamp((slip - (geometry ? .22 : p.catchSlipStart)) / (geometry ? .10 : p.catchSlipRange), 0, 1);
  const cornerLoad = speed * speed * Math.abs(Math.tan(state.frontWheelAngle)) / (geometry?.wheelbase ?? 3.36);
  const loadBlend = clamp((cornerLoad - p.loadStart) / p.loadRange, 0, 1);
  // Unsuitable-biome profiles already trade lateral for longitudinal traction.
  // Do not compound that existing difficulty with this road-tire compliance.
  const supportedTire = clamp(2 / ground.longitudinalGripFactor - 1, 0, 1);
  const surfaceCompliance = Math.min(1, (ground.lateralDampingFactor / ground.frictionFactor) ** 2);
  const fastScale = Math.min(1, p.fastSpeedScale / Math.max(1, Math.abs(speed) / speedAssistRatio));
  const maximumGripUpgrade=1+UPGRADE_GAINS.grip*UPGRADE_MAX_LEVEL;
  const compliance = p.rearCompliance - p.gripRecovery * (clamp(finite(gripUpgrade, 1), 1, maximumGripUpgrade) - 1);
  return 1 - speedBlend * loadBlend * (1 - catchBlend) * compliance * fastScale * surfaceCompliance * supportedTire;
};


export function roadWheelTarget(steering, linearSpeed = 0, speedScale = VEHICLE_DYNAMICS.steeringSpeedScale) {
  const ratio = Math.abs(linearSpeed) / speedScale;
  return steeringTarget(steering) / (1 + ratio * ratio);
}






export function evaluateVehicleForces(state, {
  maxSpeed = TOW_DRIVING.maxSpeed,
  gradient = { x: 0, z: 0 },
  braking = false,
  surface = CITY_SURFACE,
  engineAcceleration,
  brakeFactor = 1,
  speedFraction = 1,
  rewardDrift = null,
  skidGrip = 1,
  geometry = null,
  speedAssistRatio = 1,
  rearGripDeficit = 0,
} = {}) {
  const p = VEHICLE_DYNAMICS;
  const ground = normalizeSurfaceDynamics(surface);
  const surfaceMaxSpeed = normalizeMaxSpeed(maxSpeed,!!rewardDrift) * ground.speedFactor * clamp(speedFraction, 0, 1);
  const rollingCoefficient = p.rollingCoefficient * ground.rollingFactor;
  const c = Math.cos(state.heading), s = Math.sin(state.heading);
  const speed = forwardSpeed(state);
  const direction = state.gear === "R" ? -1 : 1;
  const powered = state.active && !braking;
  const drag = powered ? p.poweredDrag : p.coastingDrag * ground.coastingFactor;
  const nominalAcceleration = Number.isFinite(engineAcceleration) ? clamp(engineAcceleration, .1, rewardDrift?26:22) :
    Math.min(p.maximumAcceleration, normalizeMaxSpeed(maxSpeed) / p.accelerationTimeScale);
  const acceleration = nominalAcceleration * ground.engineFactor;
  const brakeScale = clamp(finite(brakeFactor, 1), .5, 2.5);
  const rollingAcceleration = p.gravity * rollingCoefficient;
  const speedInGear = speed * direction;


  const driveAcceleration = powered ? clamp(
    (surfaceMaxSpeed - speedInGear) * p.governorGain +
      p.poweredDrag * Math.max(0, speedInGear) +
      rollingAcceleration * Math.tanh(Math.max(0, speedInGear) / p.rollingTransitionSpeed),
    0, acceleration,
  ) * direction : 0;
  const gx = finite(Number(gradient?.x)), gz = finite(Number(gradient?.z));
  const slopeSquared = gx * gx + gz * gz;

  let forceX = -p.mass * p.gravity * p.gradeGravityScale * gx / (1 + slopeSquared);
  let forceZ = -p.mass * p.gravity * p.gradeGravityScale * gz / (1 + slopeSquared);
  let torque = 0;
  const totalNormalLoad = p.mass * p.gravity / Math.sqrt(1 + slopeSquared);
  const rearStiffness = rewardDrift ? 1 : ordinaryRearStiffness(state, ground, speed, skidGrip, geometry,
    clamp(finite(speedAssistRatio, 1), 1, MAX_SPEED_ASSIST_RATIO));
  const gripDeficit = !rewardDrift && state.gear === 'D' ? clamp(finite(rearGripDeficit), 0, 1) : 0;
  // Reduce only rear lateral capacity. Recover it progressively at large tire
  // slip, keeping lift-off and countersteer effective after the rear breaks away.
  const rearLateralGrip = gripDeficit > 0 ? 1 - .35 * gripDeficit /
    (1 + (rearTireSlip(state, geometry?.rearZ ?? 1.73) / .5) ** 2) : 1;
  // Firm contact damping during parking fades into the finite slip-angle tire
  // at road speed. Only contact forces change; velocity and yaw stay integrated.
  const lowSpeedStiffness = geometry ? 1 + 3 * (1 - clamp((Math.abs(speed) - 4) / 4, 0, 1)) : 1;
  const tires = [];
  for (const wheel of rewardDrift?BMW_DRIFT.wheels:(geometry?.wheels ?? VEHICLE_WHEELS)) {
    const loadShare = rewardDrift ? .25 : (wheel.loadShare ?? .25);
    const normalLoad = totalNormalLoad * loadShare;
    // A small front/rear stiffness and grip bias keeps saturation progressive:
    // the front starts to push before the rear can sustain an uncontrolled spin.
    const axleStiffness = geometry ? (wheel.front ? .95 : 1.05) : 1;
    const grip = normalLoad * p.tireFriction * ground.frictionFactor * (geometry && wheel.front ? .95 : 1);
    const rx = c * wheel.x + s * wheel.z;
    const rz = -s * wheel.x + c * wheel.z;
    const pointVelocityX = state.velocityX + state.angularVelocity * rz;
    const pointVelocityZ = state.velocityZ - state.angularVelocity * rx;
    const angle = state.heading + (wheel.front ? state.frontWheelAngle : 0);
    const fx = -Math.sin(angle), fz = -Math.cos(angle);
    const rightX = Math.cos(angle), rightZ = -Math.sin(angle);
    const longitudinalSpeed = pointVelocityX * fx + pointVelocityZ * fz;
    const lateralSpeed = pointVelocityX * rightX + pointVelocityZ * rightZ;
    let longitudinalForce = p.mass * driveAcceleration * (rewardDrift?(wheel.front?.05:.45):loadShare) -
      p.mass * drag * longitudinalSpeed * loadShare -
      normalLoad * rollingCoefficient * Math.tanh(longitudinalSpeed / p.rollingTransitionSpeed);
    if (braking) longitudinalForce += clamp(
      -longitudinalSpeed * p.brakeViscosity * brakeScale * Number(braking) * loadShare * 4,
      -p.mass * p.brakeAcceleration * brakeScale * loadShare,
      p.mass * p.brakeAcceleration * brakeScale * loadShare,
    );


    const rearDrift = !wheel.front && rewardDrift && powered && Math.abs(state.frontWheelAngle)>.008;
    const lateralGrip = rearDrift ? clamp(rewardDrift.rearLateralGrip,.4,1) : wheel.front ? 1 : rearLateralGrip;
    // At speed, use a finite slip-angle stiffness instead of an increasingly
    // rigid velocity damper. Slow bridge maneuvering retains high tire stiffness.
    const supportedTire = Math.min(1, 1 / ground.longitudinalGripFactor);
    const slipStiffness = 1 - supportedTire * (1 - 1 / Math.sqrt(1 + (longitudinalSpeed / 8) ** 2));
    let lateralForce = -lateralSpeed * p.lateralViscosity * slipStiffness * ground.lateralDampingFactor * loadShare * 4 * axleStiffness * lowSpeedStiffness * (wheel.front ? 1 : rearStiffness) * (rearDrift?clamp(rewardDrift.rearLateralDamping,.3,1):1);


    const requestedForce = Math.hypot(longitudinalForce / ground.longitudinalGripFactor, lateralForce/lateralGrip);
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

const RENDER_FIELDS=['x','z','heading','velocityX','velocityZ','driftIntensity','frontWheelAngle','wheelSpin','bodyPitch','bodyRoll','bodyBob'];

export function createDrivingModel({
  x = 1.8,
  z = 9.8,
  heading = 0,
  contact = () => undefined,
  groundGradient = () => ({ x: 0, z: 0 }),
  groundSurface = () => CITY_SURFACE,
  vehicleId = 'pickup',
  getUpgrades = () => undefined,
  getVehicleMetadata = () => undefined,
  maxSpeed = TOW_DRIVING.maxSpeed,
} = {}) {
  const spec = vehicleConfig(vehicleId);
  let p = spec.rewardDrift?{...VEHICLE_DYNAMICS,yawInertia:BMW_DRIFT.yawInertia,halfWidth:BMW_DRIFT.halfWidth,halfLength:BMW_DRIFT.halfLength,colliderReach:Math.hypot(BMW_DRIFT.halfWidth,BMW_DRIFT.halfLength)}:VEHICLE_DYNAMICS;
  let geometry = null, metadataSource;
  const syncGeometry = () => {
    if (spec.rewardDrift) return;
    const metadata = getVehicleMetadata();
    if (metadata === metadataSource) return;
    metadataSource = metadata;
    geometry = vehiclePhysicsGeometry(metadata, VEHICLE_DYNAMICS.mass);
    p = geometry ? {...VEHICLE_DYNAMICS, ...geometry} : VEHICLE_DYNAMICS;
  };
  maxSpeed = normalizeMaxSpeed(maxSpeed,!!spec.rewardDrift);


  const catalogAcceleration = maxSpeed === spec.maxSpeed ? spec.acceleration :
    Math.min(p.maximumAcceleration, maxSpeed / p.accelerationTimeScale);
  const readModifiers = () => {
    let levels;
    try { levels = typeof getUpgrades === 'function' ? getUpgrades() : undefined; } catch {                                     }
    return getUpgradeModifiers(levels,vehicleId);
  };
  const spawn = { x, z, heading };
  const state = {
    x, z, heading,
    velocityX: 0, velocityZ: 0, angularVelocity: 0,
    speed: 0, linearSpeed: 0,
    frontWheelAngle: 0, wheelSpin: 0,
    gear: "D", steering: 0, active: false, speedDemand: null,
    moving: false, blocked: false, braking: 0, impactSpeed: 0,
    brake:0,handbrake:0,slipAngle:0,driftIntensity:0,driftBlend:0,
    travel: 0, pathDistance: 0, movingSeconds: 0,
    bodyPitch: 0, bodyRoll: 0, bodyBob: 0,
  };
  const springs = {
    pitch: { value: 0, velocity: 0 },
    roll: { value: 0, velocity: 0 },
    bob: { value: 0, velocity: 0 },
  };
  let accumulator = 0, phase = 0, gearBraking = false;
  // Display the previous/current tick blend; gameplay keeps the authoritative state.
  const previousRender={},currentRender={},renderState={};
  const captureRender=target=>{for(const key of RENDER_FIELDS)target[key]=state[key];};
  const resetRender=()=>{captureRender(previousRender);captureRender(currentRender);};
  // Teleports and other explicit pose changes must appear immediately.
  const syncRender=()=>{for(const key of RENDER_FIELDS)if(state[key]!==currentRender[key]){resetRender();break;}};
  resetRender();
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


    const points = [];
    for (const sx of [-p.halfWidth, p.halfWidth]) for (const sz of [-p.halfLength, p.halfLength]) {
      const rx = c * sx + s * sz, rz = -s * sx + c * sz;
      points.push({ support: rx * nx + rz * nz, lever: rz * nx - rx * nz });
    }
    points.sort((a, b) => a.support - b.support);
    const candidates = points.filter(point => point.support - points[0].support <= p.contactFaceTolerance);
    const normalVelocity = (point) => state.velocityX * nx + state.velocityZ * nz + state.angularVelocity * point.lever;
    state.impactSpeed = Math.max(state.impactSpeed, ...candidates.map(point=>Math.max(0,-normalVelocity(point))));
    const applyImpulse = (impulse, lever) => {
      state.velocityX += nx * impulse / p.mass;
      state.velocityZ += nz * impulse / p.mass;
      state.angularVelocity += lever * impulse / p.yawInertia;
    };



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
    const requestingReverse = Number.isFinite(state.speedDemand) && state.speedDemand < -.001;
    const roadForward=!spec.rewardDrift&&state.gear==='D'&&!requestingReverse;
    const supportedTire = clamp(2 / surface.longitudinalGripFactor - 1, 0, 1);
    const stockSurfaceSpeed = Math.max(CONTROLLED_SKID.startSpeed, maxSpeed * surface.speedFactor);
    const gripMultiplier=roadForward?getRoadGripMultiplier(upgrades,state.linearSpeed,stockSurfaceSpeed,supportedTire):upgrades.grip;
    surface.frictionFactor *= gripMultiplier;
    surface.lateralDampingFactor *= gripMultiplier;
    const effectiveMaxSpeed = maxSpeed * upgrades.speed;
    // Extra speed is relative to this car's stock terrain cap, never to bought
    // levels or pedal demand. Slow driving therefore keeps its original feel.
    const speedAssistRatio = !spec.rewardDrift && state.gear === 'D' ?
      clamp(state.speed / stockSurfaceSpeed, 1, MAX_SPEED_ASSIST_RATIO) : 1;
    // Total motion keeps the load present when the body turns across its path.
    // Analog gear selection happens below; bypass the new load immediately on
    // a reverse request while preserving the existing rack/gear update order.
    // Unsuitable tires already have their own traction penalty. Apply this mask
    // once to both deficits, including while crossing a blended terrain edge.
    const stabilitySpeed = !spec.rewardDrift && state.gear === 'D' && !requestingReverse ? state.linearSpeed : 0;
    const {loadBlend:speedLoadBlend,handlingProgress,rearGripDeficit,handlingDeficit} =
      getSpeedStabilityDemand(stabilitySpeed,stockSurfaceSpeed,upgrades,supportedTire);
    const controlSupport=roadForward?supportedTire:0;
    const responseSeconds = (spec.rewardDrift ? .22 / (spec.handling * upgrades.handling ** 1.35) : steeringResponseSeconds(spec.handling * upgrades.handling, state.linearSpeed,controlSupport)) / surface.handlingFactor * (1 + .20 * speedLoadBlend*(1-handlingProgress*controlSupport) + handlingDeficit);




    const steeringGripScale = Math.sqrt(Math.min(1, surface.frictionFactor * surface.longitudinalGripFactor));
    const reverseGripScale = state.gear === 'R' ? Math.min(1, surface.frictionFactor) : 1;
    // Bound only the extra speed assistance. Tire velocities and corner loads
    // still use actual motion; speed limiting resumes beyond the +10% range.
    const targetWheelAngle = spec.rewardDrift&&state.gear!=='R'?driftWheelTarget(state.steering,state.linearSpeed,state.slipAngle):roadWheelTarget(state.steering, state.linearSpeed / speedAssistRatio / steeringGripScale, 9 + 7 * Math.min(1, 1 / surface.longitudinalGripFactor)) * reverseGripScale;
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


    const speedFraction = analog ? Math.abs(demand) : 1;
    const targetSpeed = normalizeMaxSpeed(effectiveMaxSpeed,!!spec.rewardDrift) * surface.speedFactor * speedFraction;
    const excessSpeed = state.speed * direction - targetSpeed;
    const analogBrake = analog ? (speedFraction < .001 ? 1 : clamp((excessSpeed - .04) * .7, 0, 1)) : 0;
    const serviceBraking = Math.max(state.brake,gearBraking ? 1 : analogBrake);
    state.braking = Math.max(serviceBraking,state.handbrake);
    const bmwForward=spec.rewardDrift&&state.gear==='D'&&!gearBraking;
    // Keep the established stock drift budget, then apply every purchased level.
    // Calibrate only the forward drift model; reverse uses its regular tires.
    const driftSurface = bmwForward ? {...surface, frictionFactor: Math.min(surface.frictionFactor / upgrades.grip, 1.4) * upgrades.grip} : surface;
    const forces = bmwForward?evaluateDriftDynamics(state,{maxSpeed:targetSpeed,engineAcceleration:catalogAcceleration*upgrades.engine*surface.engineFactor,surface:driftSurface,gradient,braking:serviceBraking,dt,mass:p.mass,inertia:p.yawInertia}):evaluateVehicleForces(state, { maxSpeed: effectiveMaxSpeed, gradient, braking: state.braking, speedFraction, surface,
      engineAcceleration: catalogAcceleration * upgrades.engine, brakeFactor: spec.grip * upgrades.grip, rewardDrift:spec.rewardDrift, skidGrip:upgrades.grip, geometry, speedAssistRatio, rearGripDeficit });
    state.velocityX += forces.forceX / p.mass * dt;
    state.velocityZ += forces.forceZ / p.mass * dt;
    state.angularVelocity += forces.torque / p.yawInertia * dt;


    const slope = Math.hypot(finite(Number(gradient.x)), finite(Number(gradient.z)));
    if (!state.active && slope < p.rollingCoefficient * surface.rollingFactor &&
      Math.hypot(state.velocityX, state.velocityZ) < p.sleepSpeed &&
      Math.abs(state.angularVelocity) < p.sleepYawSpeed) stopMotion();
    const previousTravel = state.travel;
    const previousDistance = state.pathDistance;
    moveRigidBody(dt);
    updateSpeed();
    if(spec.rewardDrift)Object.assign(state,driftTelemetry(state));
    const actualTravel = state.travel - previousTravel;
    const actualDistance = state.pathDistance - previousDistance;


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


    const roughness = surface.vibration * Math.min(1, state.linearSpeed / 3);
    // The ordinary models have tight wheel arches. Limit visual body travel
    // without moving contact patches or changing the BMW suspension response.
    const suspensionTravel = spec.rewardDrift ? 1 : 1 / 3;
    state.bodyPitch = (springs.pitch.value + roughness * Math.sin(phase * .83) * .0015) * suspensionTravel;
    state.bodyRoll = (springs.roll.value + roughness * Math.sin(phase * 1.13) * .003) * suspensionTravel;
    state.bodyBob = (springs.bob.value + roughness * (Math.sin(phase * 1.7) * .011 + Math.sin(phase * .67) * .004)) * suspensionTravel;
  };
  return {
    state,
    get physicsGeometry() { syncGeometry(); return geometry; },
    setInput({ steering = 0, active = false, speedDemand,brake=0,handbrake=0 }) {
      state.steering = clamp(finite(Number(steering)), -1, 1);
      state.speedDemand = Number.isFinite(speedDemand) ? clamp(speedDemand, -1, 1) : null;
      state.active = state.speedDemand === null ? !!active : Math.abs(state.speedDemand) > .001;
      state.brake=clamp(finite(Number(brake)),0,1);state.handbrake=spec.rewardDrift?clamp(finite(Number(handbrake)),0,1):0;
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
      state.blocked = false;state.impactSpeed=0;state.braking=0;
      state.brake=state.handbrake=state.slipAngle=state.driftIntensity=state.driftBlend=0;
      accumulator = 0;
      gearBraking = false;
      stopMotion();
      clearSprings();
      resetRender();
    },
    reset() {
      Object.assign(state, spawn, {
        frontWheelAngle: 0, wheelSpin: 0, gear: "D", steering: 0,
        active: false, speedDemand: null, blocked: false, braking:0, impactSpeed:0, travel: 0, pathDistance: 0, movingSeconds: 0,
        brake:0,handbrake:0,slipAngle:0,driftIntensity:0,driftBlend:0,
      });
      accumulator = 0;
      gearBraking = false;
      stopMotion();
      clearSprings();
      resetRender();
    },
    getRenderState() {
      syncRender();
      const alpha=clamp(accumulator/p.fixedStep,0,1);
      for(const key of RENDER_FIELDS)renderState[key]=previousRender[key]+(currentRender[key]-previousRender[key])*alpha;
      const turn=currentRender.heading-previousRender.heading;
      renderState.heading=previousRender.heading+Math.atan2(Math.sin(turn),Math.cos(turn))*alpha;
      return renderState;
    },
    step(deltaSeconds) {
      syncGeometry();
      syncRender();

      state.travel = state.pathDistance = state.movingSeconds = 0;
      state.blocked = false;state.impactSpeed=0;state.braking=0;
      const dt = clamp(finite(Number(deltaSeconds)), 0, p.maxFrameDelta);
      if (!dt) return state;
      accumulator = Math.min(accumulator + dt, p.maxFrameDelta);
      let steps = 0;
      while (accumulator + 1e-12 >= p.fixedStep && steps < p.maxSubsteps) {
        captureRender(previousRender);
        integrate(p.fixedStep);
        captureRender(currentRender);
        accumulator = Math.max(0, accumulator - p.fixedStep);
        steps++;
      }
      return state;
    },
  };
}
