// Derived once when a model loads. Coordinates share the render model's origin:
// +X right, -Z forward. No per-frame mesh traversal or extra physics bodies.
export function vehiclePhysicsGeometry(metadata, mass = 1600) {
  const contacts = metadata?.wheels ?? metadata?.wheelContacts;
  const dimensions = metadata?.dimensions;
  if (!Array.isArray(contacts) || contacts.length !== 4 ||
      !Array.isArray(dimensions) || dimensions.length !== 3 || !dimensions.every(v => Number.isFinite(v) && v > 0) ||
      !Number.isFinite(mass) || mass <= 0) return null;
  const wheels = contacts.map(w => ({
    name: w.name, front: w.front === true,
    x: w.center?.[0], z: w.center?.[2],
  }));
  if (wheels.some(w => !Number.isFinite(w.x) || !Number.isFinite(w.z))) return null;
  const front = wheels.filter(w => w.front), rear = wheels.filter(w => !w.front);
  if (front.length !== 2 || rear.length !== 2) return null;
  const frontZ = (front[0].z + front[1].z) / 2;
  const rearZ = (rear[0].z + rear[1].z) / 2;
  if (frontZ >= 0 || rearZ <= 0) return null;
  const wheelbase = rearZ - frontZ;
  // Models can have millimetres of left/right asymmetry. Balance each axle at
  // X=0 as well as balancing the two axles at Z=0, so straight thrust has no yaw.
  const axleShares = axle => {
    if (axle[0].x * axle[1].x >= 0) return null;
    const first = axle[1].x / (axle[1].x - axle[0].x);
    return [first, 1 - first];
  };
  const frontShares = axleShares(front), rearShares = axleShares(rear);
  if (!frontShares || !rearShares) return null;
  const frontSupportZ = front.reduce((sum,w,i) => sum + w.z * frontShares[i], 0);
  const rearSupportZ = rear.reduce((sum,w,i) => sum + w.z * rearShares[i], 0);
  if (frontSupportZ >= 0 || rearSupportZ <= 0) return null;
  const frontLoad = rearSupportZ / (rearSupportZ - frontSupportZ);
  front.forEach((w,i) => { w.loadShare = frontLoad * frontShares[i]; });
  rear.forEach((w,i) => { w.loadShare = (1 - frontLoad) * rearShares[i]; });
  for (const w of wheels) {
    // Static axle loads balance the body-centred origin. The same shares are
    // used for grip, stiffness and longitudinal forces, avoiding artificial yaw.
    Object.freeze(w);
  }
  const halfWidth = dimensions[0] / 2, halfLength = dimensions[2] / 2;
  return Object.freeze({
    wheels: Object.freeze(wheels), frontZ, rearZ, wheelbase,
    halfWidth, halfLength, colliderReach: Math.hypot(halfWidth, halfLength),
    yawInertia: mass * (dimensions[0] ** 2 + dimensions[2] ** 2) / 12,
  });
}

export function rearTireSlip(state, rearZ) {
  const c = Math.cos(state.heading), s = Math.sin(state.heading);
  const forward = -s * state.velocityX - c * state.velocityZ;
  const sideways = c * state.velocityX - s * state.velocityZ + state.angularVelocity * rearZ;
  return Math.atan2(sideways, Math.max(2, Math.abs(forward)));
}
