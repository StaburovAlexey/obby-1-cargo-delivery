

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
    looking: false, distanceSinceLook: 0, returning: false, nitroScale: 1,
  };
  let nitroStartScale=1,previousNitroRemaining=0;
  function resetNitro(){state.nitroScale=1;nitroStartScale=1;previousNitroRemaining=0;}
  function reset({ mode = state.mode, heading = 0 } = {}) {
    state.mode = cameraMode(mode);
    state.yaw = wrapAngle(heading);
    state.pitch = FOLLOW_CAMERA[state.mode].pitch;
    state.radius = FOLLOW_CAMERA[state.mode].radius;
    state.looking = false;
    state.distanceSinceLook = 0;
    resetNitro();


    state.returning = state.mode === 'driving';
    return state;
  }
  reset({ mode, heading });
  return {
    state,
    reset,
    resetNitro,
    setMode(mode, { heading = state.yaw, reset: resetView = false } = {}) {
      mode = cameraMode(mode);
      if (resetView) return reset({ mode, heading });
      if (mode !== state.mode) {
        state.mode = mode;
        state.radius = FOLLOW_CAMERA[mode].radius;
        state.looking = false;
        state.distanceSinceLook = 0;
        state.returning = false;
        resetNitro();
      }
      return state;
    },
    lookBegin({ position, target, scale = 1 } = {}) {



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




    update({ dt = 0, heading = state.yaw, distance = 0, moving = false, teleported = false,drifting=false,velocityX=0,velocityZ=0,nitroActive=false,nitroRemaining=2 } = {}) {
      if (teleported) return reset({ heading, mode: state.mode });
      // A transient multiplier leaves the chosen orbit radius untouched, even
      // during manual look or when the vehicle stops moving after a charge.
      const boosted=state.mode==='driving'&&nitroActive&&Number.isFinite(nitroRemaining);
      const remaining=Math.max(0,Math.min(2,finite(nitroRemaining)));
      if(boosted){
        if(remaining>previousNitroRemaining+1e-9)nitroStartScale=state.nitroScale;
        state.nitroScale=nitroStartScale+(1.15-nitroStartScale)*(2-remaining)/2;
      }else{
        state.nitroScale+=(1-state.nitroScale)*-Math.expm1(-3*Math.max(0,finite(dt))/.35);
        if(Math.abs(state.nitroScale-1)<1e-8)state.nitroScale=1;
      }
      previousNitroRemaining=boosted?remaining:0;
      if (state.mode !== 'driving' || state.looking) return state;
      const travelled = Math.abs(finite(distance));
      if (travelled <= 1e-9 && !moving) return state;
      const before = state.distanceSinceLook;
      state.distanceSinceLook += travelled;
      let returnDt = Math.max(0, finite(dt));
      if (!state.returning) {
        if (state.distanceSinceLook < FOLLOW_CAMERA.returnDistance - 1e-9) return state;
        state.returning = true;


        const pastThreshold = Math.max(0, state.distanceSinceLook - Math.max(before, FOLLOW_CAMERA.returnDistance));
        returnDt *= travelled>1e-9?Math.min(1, pastThreshold / travelled):0;
      }
      const alpha = -Math.expm1(-FOLLOW_CAMERA.returnRate * returnDt);
      const viewHeading=drifting&&Math.hypot(velocityX,velocityZ)>4?heading+shortestAngleDelta(heading,Math.atan2(-velocityX,-velocityZ))*.75:heading;
      state.yaw = wrapAngle(state.yaw + shortestAngleDelta(state.yaw, finite(viewHeading, state.yaw)) * alpha);
      state.pitch += (FOLLOW_CAMERA.driving.pitch - state.pitch) * alpha;
      return state;
    },
  };
}


export function drivingCameraScale(aspect){return aspect<.8?Math.max(1.2,.54/Math.max(.2,aspect)):1;}
