// Source-backed numeric oracle. DO NOT derive expected results from the port.
// Mechanics below are copied verbatim (TypeScript types stripped only) from
// StaburovAlexey/worker-play-ads@6c52e417cd499c7b9d9c6f450961c8ca0956063c:
// src/engines/three/scene.ts (updateVehicle, updateVehicleSuspension, helpers) and
// src/engines/three/vehicle-collision-response.ts. Source uses +Z forward.
// City colliderReach=3.3 is the only collision-shape adapter in this fixture.
import * as THREE from '../../dist/vendor/three.module.js';
function moveTowards(current        , target        , maxDelta        )         {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function updateSpring(
  spring              ,
  target        ,
  stiffness        ,
  damping        ,
  deltaSeconds        ,
)       {
  spring.velocity += (target - spring.value) * stiffness * deltaSeconds;
  spring.velocity *= Math.exp(-damping * deltaSeconds);
  spring.value += spring.velocity * deltaSeconds;
}


                                                            

const MAX_STEP_DISTANCE = 0.15;
const CONTACT_EPSILON = 0.00001;
const MAX_CONTACT_PASSES = 6;

/** Move in small steps and remove penetration along obstacle normals, retaining tangent motion. */
function moveVehicleWithCollisions(
  position                          ,
  rotation               ,
  travel        ,
  yawDelta        ,
  colliderReach        ,
  getContact                                    ,
)          {
  const steps = Math.max(1, Math.ceil((Math.abs(travel) + Math.abs(yawDelta) * colliderReach) / MAX_STEP_DISTANCE));
  const stepTravel = travel / steps;
  const stepYaw = yawDelta / steps;
  let collided = false;
  const resolveContacts = ()          => {
    let correctionDistance = 0;
    for (let pass = 0; pass < MAX_CONTACT_PASSES; pass += 1) {
      const contact = getContact();
      if (!contact) return true;
      collided = true;
      const correction = contact.depth + CONTACT_EPSILON;
      correctionDistance += correction;
      // Confined corners must not teleport the vehicle to the far side of a wall.
      if (correctionDistance > MAX_STEP_DISTANCE * 3) return false;
      position.x += contact.normalX * correction;
      position.z += contact.normalZ * correction;
    }
    return !getContact();
  };
  for (let step = 0; step < steps; step += 1) {
    const previousX = position.x, previousZ = position.z, previousYaw = rotation.y;
    rotation.y += stepYaw;
    position.x += Math.sin(rotation.y) * stepTravel;
    position.z += Math.cos(rotation.y) * stepTravel;
    if (resolveContacts()) continue;
    // If turning wedges the long body into a corner, try translation at its last safe heading.
    rotation.y = previousYaw;
    position.x = previousX + Math.sin(previousYaw) * stepTravel;
    position.z = previousZ + Math.cos(previousYaw) * stepTravel;
    if (resolveContacts()) continue;
    position.x = previousX;
    position.z = previousZ;
    break;
  }
  return collided;
}

export function createSourceOracle({x=0,z=0,heading=0}={}) {
const MAX_FRONT_WHEEL_ANGLE=.48,VEHICLE_WHEEL_BASE=3.2,VEHICLE_WHEEL_RADIUS=.48;
const BODY_MAX_PITCH=.0375,BODY_MAX_ROLL=.1,BODY_MAX_BOB=.03;
const vehicleConfig={maxSpeed:11,accelerationSeconds:1.3,inertiaSeconds:2.2,steeringStrength:1,accelerationSquatStrength:.5,brakingDiveStrength:1,cornerRollStrength:.7};
const cameraConfig={followSmoothing:7};
const car={position:new THREE.Vector3(x,0,z),rotation:{y:heading}};
let vehicleInput={steering:0,active:false},gear='D',vehicleFrontWheelAngle=0,vehicleSpeed=0,suspensionPhase=0;
const bodyPitch={value:0,velocity:0},bodyRoll={value:0,velocity:0},bodyBob={value:0,velocity:0},bodyRig=null;
const context={root:{dataset:{}}},useProductionRendering=true,propPlacements=[],editablePropPlacements=[];
const vehicleCollisionCircles=[{offsetX:0,offsetZ:0,radius:3.3}],getVehicleSceneContact=()=>undefined,cancelGangsterApproachIfMoved=()=>{};
const wheelRigs=[{front:true,turn:{rotation:{y:0}},spin:{rotation:{x:0}}}];
const worldUp=new THREE.Vector3(0,1,0),baseCameraOffset=new THREE.Vector3(0,5.4,-7.8),baseCameraTarget=new THREE.Vector3(0,1,2.2);
const rotatedCameraOffset=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),rotatedTargetOffset=new THREE.Vector3(),desiredTarget=new THREE.Vector3();
const camera={position:new THREE.Vector3(),lookAt(){}};
  const updateVehicleSuspension = (
    speed        ,
    previousSpeed        ,
    yawRate        ,
    travelDistance        ,
    deltaSeconds        ,
  )       => {
    if (deltaSeconds <= 0) return;
    const longitudinalAcceleration = (speed - previousSpeed) / deltaSeconds;
    const lateralAcceleration = speed * yawRate;
    suspensionPhase += Math.abs(travelDistance) * 4.2;
    const maximumSpeed = Math.max(0.01, vehicleConfig.maxSpeed);
    const speedRatio = Math.min(1, Math.abs(speed) / maximumSpeed);
    const gainingSpeed = Math.abs(speed) > Math.abs(previousSpeed);
    const pitchStrength = Math.max(0, gainingSpeed
      ? vehicleConfig.accelerationSquatStrength
      : vehicleConfig.brakingDiveStrength);
    const rollStrength = Math.max(0, vehicleConfig.cornerRollStrength);
    const targetPitch = Math.max(-BODY_MAX_PITCH, Math.min(BODY_MAX_PITCH, -longitudinalAcceleration * 0.011 * pitchStrength));
    const targetRoll = Math.max(-BODY_MAX_ROLL, Math.min(BODY_MAX_ROLL, -lateralAcceleration * 0.014 * rollStrength));
    const targetBob = Math.abs(speed) > 0.05 ? Math.sin(suspensionPhase) * BODY_MAX_BOB * speedRatio : 0;
    updateSpring(bodyPitch, targetPitch, 48, 8.5, deltaSeconds);
    updateSpring(bodyRoll, targetRoll, 54, 9, deltaSeconds);
    updateSpring(bodyBob, targetBob, 70, 11, deltaSeconds);
    if (bodyRig) {
      bodyRig.rotation.x = bodyPitch.value;
      bodyRig.rotation.z = bodyRoll.value;
      bodyRig.position.y = bodyBob.value;
    }
    context.root.dataset.vehicleBodyPitch = bodyPitch.value.toFixed(3);
    context.root.dataset.vehicleBodyRoll = bodyRoll.value.toFixed(3);
    context.root.dataset.vehicleBodyBob = bodyBob.value.toFixed(3);
  };


  const updateVehicle = (deltaSeconds        )       => {
    if (!car) return;
    const steering = Math.abs(vehicleInput.steering) < 0.08 ? 0 : vehicleInput.steering;
    const throttleActive = vehicleInput.active;
    const direction = gear === "D" ? 1 : -1;
    const effectiveThrottle = throttleActive;
    // Screen-space steering is opposite Three.js positive Y rotation:
    // dragging the wheel right must produce a right-hand vehicle turn.
    const steeringMagnitude = Math.max(0, (Math.abs(steering) - 0.08) / 0.92);
    const steeringResponse = Math.sign(steering) * steeringMagnitude * (0.55 + 0.45 * steeringMagnitude);
    const targetWheelAngle = -steeringResponse * MAX_FRONT_WHEEL_ANGLE * Math.max(0, vehicleConfig.steeringStrength);
    // Build up steering gradually, with a gentler response near the centre.
    vehicleFrontWheelAngle += (targetWheelAngle - vehicleFrontWheelAngle)
      * (1 - Math.exp(-Math.max(0, deltaSeconds) / 0.22));
    const frontWheelAngle = vehicleFrontWheelAngle;
    const maximumSpeed = Math.max(0, vehicleConfig.maxSpeed);
    const turnAmount = Math.min(1, Math.abs(frontWheelAngle) / Math.max(0.001,
      MAX_FRONT_WHEEL_ANGLE * Math.max(0, vehicleConfig.steeringStrength)));
    const sharpTurn = Math.max(0, (turnAmount - 0.45) / 0.55);
    const turnSpeedLimit = maximumSpeed * (1 - 0.18 * sharpTurn * sharpTurn);
    const acceleration = maximumSpeed / Math.max(0.01, vehicleConfig.accelerationSeconds);
    const coastDeceleration = maximumSpeed / Math.max(0.01, vehicleConfig.inertiaSeconds);
    const speedBeforeUpdate = vehicleSpeed;
    vehicleSpeed = moveTowards(
      vehicleSpeed,
      effectiveThrottle ? direction * turnSpeedLimit : 0,
      (effectiveThrottle ? acceleration : coastDeceleration) * deltaSeconds,
    );
    let moving = Math.abs(vehicleSpeed) > 0.05;
    const intendedTravelDistance = vehicleSpeed * deltaSeconds;
    let actualTravelDistance = intendedTravelDistance;
    let boundaryHit = false;
    if (moving) {
      const yawRate = vehicleSpeed * Math.tan(frontWheelAngle) / VEHICLE_WHEEL_BASE;
      const previousX = car.position.x;
      const previousZ = car.position.z;
      const activePropPlacements = useProductionRendering ? propPlacements : editablePropPlacements;
      const colliderReach = vehicleCollisionCircles.reduce((reach, circle) =>
        Math.max(reach, Math.hypot(circle.offsetX, circle.offsetZ) + circle.radius), 0);
      boundaryHit = moveVehicleWithCollisions(car.position, car.rotation, intendedTravelDistance,
        yawRate * deltaSeconds, colliderReach, () => getVehicleSceneContact(activePropPlacements));
      const travelled = Math.hypot(car.position.x - previousX, car.position.z - previousZ);
      actualTravelDistance = travelled * Math.sign(intendedTravelDistance);
      if (boundaryHit) {
        vehicleSpeed = travelled < Math.abs(intendedTravelDistance) * 0.1 ? 0 : vehicleSpeed * Math.exp(-3 * deltaSeconds);
      }
    }
    cancelGangsterApproachIfMoved();
    moving = Math.abs(vehicleSpeed) > 0.05;
    updateVehicleSuspension(vehicleSpeed, speedBeforeUpdate,
      vehicleSpeed * Math.tan(frontWheelAngle) / VEHICLE_WHEEL_BASE,
      actualTravelDistance, deltaSeconds);
    for (const rig of wheelRigs) {
      if (rig.front) rig.turn.rotation.y = frontWheelAngle;
      if (actualTravelDistance !== 0) rig.spin.rotation.x -= actualTravelDistance / VEHICLE_WHEEL_RADIUS;
    }
    rotatedCameraOffset.copy(baseCameraOffset).applyAxisAngle(worldUp, car.rotation.y);
    desiredCamera.copy(car.position).add(rotatedCameraOffset);
    camera.position.lerp(desiredCamera, Math.min(1, deltaSeconds * cameraConfig.followSmoothing));
    rotatedTargetOffset.copy(baseCameraTarget).applyAxisAngle(worldUp, car.rotation.y);
    desiredTarget.copy(car.position).add(rotatedTargetOffset);
    camera.lookAt(desiredTarget);
    context.root.dataset.vehicleMoving = String(moving);
    context.root.dataset.vehicleThrottle = String(effectiveThrottle);
    context.root.dataset.vehicleWallBlocked = String(boundaryHit);
    context.root.dataset.vehicleSpeed = vehicleSpeed.toFixed(2);
    context.root.dataset.vehicleGear = gear;
    context.root.dataset.vehicleSteering = steering.toFixed(2);
    context.root.dataset.vehicleTurn = frontWheelAngle.toFixed(2);
    context.root.dataset.wheelRotation = (wheelRigs[0]?.spin.rotation.x ?? 0).toFixed(2);
  };


return {setInput(value){vehicleInput=value;},setGear(value){gear=value;},step(dt){updateVehicle(Math.min(.05,Math.max(0,dt)));return this.state;},get state(){return {x:car.position.x,z:car.position.z,heading:car.rotation.y,speed:vehicleSpeed,frontWheelAngle:vehicleFrontWheelAngle,sourceWheelRotation:wheelRigs[0].spin.rotation.x,bodyPitch:bodyPitch.value,bodyRoll:bodyRoll.value,bodyBob:bodyBob.value,moving:Math.abs(vehicleSpeed)>.05};}};
}
