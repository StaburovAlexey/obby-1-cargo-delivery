// Camera-only orbit state. It never queries collision geometry or changes the
// player/car: the application supplies actual travelled distance after physics.
const radians = (degrees) => degrees * Math.PI / 180;
export const FOLLOW_CAMERA = Object.freeze({
  minPitch: radians(15),
  maxPitch: radians(78),
  returnDistance: 6,
  returnRate: 3.2,
  walking: Object.freeze({ radius: Math.hypot(5.6, 10), pitch: Math.atan2(5.6, 10) }),
  driving: Object.freeze({ radius: Math.hypot(8.3, 13), pitch: Math.atan2(8.3, 13) }),
});
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const cameraMode = (mode) => mode === 'driving' ? 'driving' : 'walking';
const clampPitch = (pitch) => Math.max(FOLLOW_CAMERA.minPitch, Math.min(FOLLOW_CAMERA.maxPitch, pitch));
export const wrapAngle = (angle) => Math.atan2(Math.sin(finite(angle)), Math.cos(finite(angle)));
export const shortestAngleDelta = (from, to) => wrapAngle(to - from);

/** +Z is behind a subject with heading 0; positive yaw rotates toward +X.
 * Pitch is elevation above the horizontal. The fixed offset is deliberately
 * independent of walls, roofs, terrain and any zoom/occlusion adjustment.
 */
export function computeFollowOffset({ yaw, pitch, radius }, out = {}) {
  const horizontal = Math.cos(pitch) * radius;
  out.x = Math.sin(yaw) * horizontal;
  out.y = Math.sin(pitch) * radius;
  out.z = Math.cos(yaw) * horizontal;
  return out;
}

export function createFollowCameraState({ mode = 'walking', heading = 0 } = {}) {
  const state = {
    mode: cameraMode(mode), yaw: 0, pitch: 0, radius: 0,
    looking: false, distanceSinceLook: 0, returning: false,
  };
  function reset({ mode = state.mode, heading = 0 } = {}) {
    state.mode = cameraMode(mode);
    state.yaw = wrapAngle(heading);
    state.pitch = FOLLOW_CAMERA[state.mode].pitch;
    state.radius = FOLLOW_CAMERA[state.mode].radius;
    state.looking = false;
    state.distanceSinceLook = 0;
    // A fresh driving view is already behind the car. Manual look suspends
    // following until a new, released-gesture travel budget reaches six metres.
    state.returning = state.mode === 'driving';
    return state;
  }
  reset({ mode, heading });
  return {
    state,
    reset,
    setMode(mode, { heading = state.yaw, reset: resetView = false } = {}) {
      mode = cameraMode(mode);
      if (resetView) return reset({ mode, heading });
      if (mode !== state.mode) {
        state.mode = mode;
        state.radius = FOLLOW_CAMERA[mode].radius;
        state.looking = false;
        state.distanceSinceLook = 0;
        state.returning = false;
      }
      return state;
    },
    lookBegin({ position, target, scale = 1 } = {}) {
      // Adopt the rendered orbit, not the unsmoothed subject position. This
      // only synchronizes input state; acquiring a pointer never moves the eye
      // or the target. Keep viewport scaling out of the fixed-radius state.
      if (position && target && Number.isFinite(scale) && scale > 0) {
        const x = (position.x - target.x) / scale;
        const y = (position.y - target.y) / scale;
        const z = (position.z - target.z) / scale;
        const radius = Math.hypot(x, y, z);
        if (Number.isFinite(radius) && radius > 1e-9) {
          state.yaw = Math.atan2(x, z);
          state.pitch = Math.atan2(y, Math.hypot(x, z));
          state.radius = radius;
        }
      }
      state.looking = true;
      state.distanceSinceLook = 0;
      state.returning = false;
      return state;
    },
    lookDelta(yaw, pitch) {
      if (!state.looking) return state;
      state.yaw = wrapAngle(state.yaw + finite(yaw));
      state.pitch = clampPitch(state.pitch + finite(pitch));
      return state;
    },
    lookEnd() {
      if (!state.looking) return state;
      state.looking = false;
      state.distanceSinceLook = 0;
      state.returning = false;
      return state;
    },
    /** distance is this frame's actual movement in metres, never intended
     * throttle/speed*time. Signed reverse travel is accepted. Reset on a
     * teleport instead of passing the discontinuity as travelled distance.
     */
    update({ dt = 0, heading = state.yaw, distance = 0, teleported = false } = {}) {
      if (teleported) return reset({ heading, mode: state.mode });
      if (state.mode !== 'driving' || state.looking) return state;
      const travelled = Math.abs(finite(distance));
      if (travelled <= 1e-9) return state;
      const before = state.distanceSinceLook;
      state.distanceSinceLook += travelled;
      let returnDt = Math.max(0, finite(dt));
      if (!state.returning) {
        if (state.distanceSinceLook < FOLLOW_CAMERA.returnDistance - 1e-9) return state;
        state.returning = true;
        // Only smooth over the portion of the frame AFTER crossing six metres.
        // This avoids an extra frame of return at 30 Hz versus 60/120 Hz.
        const pastThreshold = Math.max(0, state.distanceSinceLook - Math.max(before, FOLLOW_CAMERA.returnDistance));
        returnDt *= Math.min(1, pastThreshold / travelled);
      }
      const alpha = -Math.expm1(-FOLLOW_CAMERA.returnRate * returnDt);
      state.yaw = wrapAngle(state.yaw + shortestAngleDelta(state.yaw, finite(heading, state.yaw)) * alpha);
      state.pitch += (FOLLOW_CAMERA.driving.pitch - state.pitch) * alpha;
      return state;
    },
  };
}

// Only very tall portrait viewports need extra room for the full-size cars.
export function drivingCameraScale(aspect){return aspect<.8?Math.max(1.2,.54/Math.max(.2,aspect)):1;}
