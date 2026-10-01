/* Transform-only vehicle root. Imported GLB adapters own all render geometry
 * and visual articulation. These contact records preserve the driving model's
 * established calibration; they allocate no meshes, materials or draw calls.
 * Three.js axes: +Y up, -Z forward, +X right.
 */
const activeRigs = new WeakMap();
const POSE_FIELDS = ['steerAngle', 'wheelSpin', 'bodyPitch', 'bodyRoll', 'bodyBob'];

export function createVehicleRig(THREE, root) {
  if (!root?.isGroup) throw new TypeError('Vehicle rig requires a vehicle root Group.');
  if (activeRigs.has(root)) throw new Error('This vehicle already has an active rig.');
  const initialPosition = root.position.clone();
  const initialQuaternion = root.quaternion.clone();
  const initialScale = root.scale.clone();
  const originalMatrix = root.matrix.clone();
  const originalMatrixAutoUpdate = root.matrixAutoUpdate;
  const nextPosition = new THREE.Vector3();
  const nextQuaternion = new THREE.Quaternion();
  const pose = Object.fromEntries(POSE_FIELDS.map(key => [key, 0]));
  const wheels = [-1.63, 1.73].flatMap(z => [-1, 1].map(side => ({
    name: `${z < 0 ? 'front' : 'rear'}-${side < 0 ? 'left' : 'right'}`,
    front: z < 0, side: side < 0 ? 'left' : 'right',
    localPosition: new THREE.Vector3(side * 1.32, .73, z),
    radius: .68, steerAngle: 0, wheelSpin: 0,
  })));
  let disposed = false;

  function readPosition(value) {
    if (value?.isVector3) nextPosition.copy(value);
    else if ((Array.isArray(value) || ArrayBuffer.isView(value)) && value.length === 3)
      nextPosition.fromArray(value);
    else throw new TypeError('Vehicle position must be a Vector3 or three-number array.');
    if (![nextPosition.x, nextPosition.y, nextPosition.z].every(Number.isFinite))
      throw new TypeError('Vehicle position must contain finite coordinates.');
  }
  function readQuaternion(value) {
    if (value?.isQuaternion) nextQuaternion.copy(value);
    else if ((Array.isArray(value) || ArrayBuffer.isView(value)) && value.length === 4)
      nextQuaternion.fromArray(value);
    else throw new TypeError('Vehicle quaternion must be a Quaternion or four-number array.');
    const components = nextQuaternion.toArray(), magnitude = Math.hypot(...components);
    if (!components.every(Number.isFinite) || !Number.isFinite(magnitude) || magnitude < 1e-12)
      throw new TypeError('Vehicle quaternion must be finite and nonzero.');
    nextQuaternion.set(...components.map(component => component / magnitude));
  }
  const rig = {
    root, group: root, pose, wheels,
    initialPosition: initialPosition.clone(), initialQuaternion: initialQuaternion.clone(),
    wheelRadius: .68, wheelbase: 3.36, frontAxleZ: -1.63, rearAxleZ: 1.73,
    get disposed() { return disposed; },
    update(next = {}) {
      if (disposed) return rig;
      if (!next || typeof next !== 'object') throw new TypeError('Vehicle update requires a pose object.');
      // Validate the complete request before changing either transform or state.
      if (next.position !== undefined) readPosition(next.position);
      if (next.quaternion !== undefined) readQuaternion(next.quaternion);
      for (const key of POSE_FIELDS)
        if (next[key] !== undefined && !Number.isFinite(next[key]))
          throw new TypeError(`Vehicle ${key} must be finite.`);
      if (next.position !== undefined) root.position.copy(nextPosition);
      if (next.quaternion !== undefined) root.quaternion.copy(nextQuaternion);
      for (const key of POSE_FIELDS) if (next[key] !== undefined) pose[key] = next[key];
      for (const wheel of wheels) {
        wheel.steerAngle = wheel.front ? pose.steerAngle : 0;
        wheel.wheelSpin = pose.wheelSpin;
      }
      root.updateMatrix();
      root.updateWorldMatrix(true, true);
      return rig;
    },
    reset() {
      if (disposed) return rig;
      return rig.update({ position: initialPosition, quaternion: initialQuaternion,
        steerAngle: 0, wheelSpin: 0, bodyPitch: 0, bodyRoll: 0, bodyBob: 0 });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.position.copy(initialPosition);
      root.quaternion.copy(initialQuaternion);
      root.scale.copy(initialScale);
      root.matrixAutoUpdate = originalMatrixAutoUpdate;
      if (root.matrixAutoUpdate) root.updateMatrix();
      else root.matrix.copy(originalMatrix);
      root.updateWorldMatrix(true, true);
      activeRigs.delete(root);
    },
  };
  root.matrixAutoUpdate = true;
  root.updateMatrix();
  activeRigs.set(root, rig);
  return rig;
}
