/** Driving port from StaburovAlexey/worker-play-ads, branch tow-confiscator.
 * Source commit 6c52e417cd499c7b9d9c6f450961c8ca0956063c.
 * Config: playable.config.ts. Dynamics: src/engines/three/scene.ts updateVehicle.
 * Collision stepping: src/engines/three/vehicle-collision-response.ts.
 * Adaptations: this procedural truck faces -Z, ground fit lives in city-driving.js,
 * and rolling uses this mesh's 0.68 m tire radius. No engine or imported model.
 */
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

/** Same substep/contact response as tow-confiscator, with -Z forward conversion. */
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

export function createDrivingModel({
  x = 1.8,
  z = 9.8,
  heading = 0,
  contact = () => undefined,
  maxSpeed = TOW_DRIVING.maxSpeed,
} = {}) {
  // Vehicle progression changes only the top-speed scale; Tow input, steering,
  // acceleration timing, coasting and contact stepping remain the same.
  maxSpeed = Math.max(1,Math.min(30,Number(maxSpeed)||TOW_DRIVING.maxSpeed));
  const spawn = { x, z, heading };
  const state = {
    x,
    z,
    heading,
    speed: 0,
    frontWheelAngle: 0,
    wheelSpin: 0,
    gear: "D",
    steering: 0,
    active: false,
    moving: false,
    blocked: false,
    travel: 0,
    bodyPitch: 0,
    bodyRoll: 0,
    bodyBob: 0,
  };
  const springs = {
    pitch: { value: 0, velocity: 0 },
    roll: { value: 0, velocity: 0 },
    bob: { value: 0, velocity: 0 },
  };
  let phase = 0;
  const clearSprings = () => {
    phase = 0;
    for (const spring of Object.values(springs)) {
      spring.value = 0;
      spring.velocity = 0;
    }
    state.bodyPitch = state.bodyRoll = state.bodyBob = 0;
  };
  const springStep = (spring, target, stiffness, damping, dt) => {
    spring.velocity += (target - spring.value) * stiffness * dt;
    spring.velocity *= Math.exp(-damping * dt);
    spring.value += spring.velocity * dt;
  };
  const api = {
    state,
    setInput({ steering = 0, active = false }) {
      state.steering = Math.max(-1, Math.min(1, Number(steering) || 0));
      state.active = !!active;
    },
    setGear(gear) {
      if (gear !== "D" && gear !== "R") throw new Error("Gear must be D or R");
      state.gear = gear;
    },
    pause() {
      state.active = false;
      state.steering = 0;
      state.speed = 0;
      state.frontWheelAngle = 0;
      state.moving = false;
      state.travel = 0;
      clearSprings();
    },
    reset() {
      Object.assign(state, spawn, {
        speed: 0,
        frontWheelAngle: 0,
        wheelSpin: 0,
        gear: "D",
        steering: 0,
        active: false,
        moving: false,
        blocked: false,
        travel: 0,
      });
      clearSprings();
    },
    step(deltaSeconds) {
      const dt = Math.max(
        0,
        Math.min(TOW_DRIVING.maxDelta, Number(deltaSeconds) || 0),
      );
      if (!dt) return state;
      const targetWheelAngle = steeringTarget(state.steering);
      state.frontWheelAngle +=
        (targetWheelAngle - state.frontWheelAngle) * (1 - Math.exp(-dt / 0.22));
      const turnAmount = Math.min(
        1,
        Math.abs(state.frontWheelAngle) /
          Math.max(0.001, 0.48 * TOW_DRIVING.steeringStrength),
      );
      const sharpTurn = Math.max(0, (turnAmount - 0.45) / 0.55);
      const turnSpeedLimit = maxSpeed * (1 - 0.18 * sharpTurn * sharpTurn);
      const previousSpeed = state.speed;
      state.speed = moveTowards(
        state.speed,
        state.active ? (state.gear === "D" ? 1 : -1) * turnSpeedLimit : 0,
        (state.active ? maxSpeed / 1.3 : maxSpeed / 2.2) * dt,
      );
      const intended = state.speed * dt;
      let actual = intended;
      state.blocked = false;
      if (Math.abs(state.speed) > 0.05) {
        const yawRate =
          (state.speed * Math.tan(state.frontWheelAngle)) /
          TOW_DRIVING.wheelbase;
        const px = state.x,
          pz = state.z,
          rotation = { y: state.heading };
        state.blocked = moveWithContacts(
          state,
          rotation,
          intended,
          yawRate * dt,
          3.3,
          () => contact(state.x, state.z, rotation.y),
        );
        state.heading = rotation.y;
        const travelled = Math.hypot(state.x - px, state.z - pz);
        actual = travelled * Math.sign(intended);
        if (state.blocked)
          state.speed =
            travelled < Math.abs(intended) * 0.1
              ? 0
              : state.speed * Math.exp(-3 * dt);
      }
      state.travel = actual;
      state.wheelSpin += actual / TOW_DRIVING.wheelRadius;
      const acceleration = (state.speed - previousSpeed) / dt;
      const yawRate =
        (state.speed * Math.tan(state.frontWheelAngle)) / TOW_DRIVING.wheelbase;
      phase += Math.abs(actual) * 4.2;
      const pitchStrength =
        Math.abs(state.speed) > Math.abs(previousSpeed) ? 0.5 : 1;
      const targetPitch = Math.max(
        -0.0375,
        Math.min(0.0375, -acceleration * 0.011 * pitchStrength),
      );
      const targetRoll = Math.max(
        -0.1,
        Math.min(0.1, -state.speed * yawRate * 0.014 * 0.7),
      );
      const targetBob =
        Math.abs(state.speed) > 0.05
          ? Math.sin(phase) * 0.03 * Math.min(1, Math.abs(state.speed) / maxSpeed)
          : 0;
      springStep(springs.pitch, targetPitch, 48, 8.5, dt);
      springStep(springs.roll, targetRoll, 54, 9, dt);
      springStep(springs.bob, targetBob, 70, 11, dt);
      state.bodyPitch = springs.pitch.value;
      state.bodyRoll = springs.roll.value;
      state.bodyBob = springs.bob.value;
      state.moving = Math.abs(state.speed) > 0.05;
      return state;
    },
  };
  return api;
}
