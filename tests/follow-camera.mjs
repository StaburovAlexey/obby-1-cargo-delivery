#!/usr/bin/env node
// Pure camera state, real Three math and controls with explicit DOM mocks.
// No browser/WebGL or physical touchscreen validation is implied.
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { FOLLOW_CAMERA, createFollowCameraState, computeFollowOffset, shortestAngleDelta } from '../dist/follow-camera.js';
import { createLookInput } from '../dist/look-input.js';
import { createWalkInput } from '../dist/walk-input.js';
import { createJumpInput } from '../dist/jump-input.js';
import { createVehicleInput } from '../dist/vehicle-input.js';
import { createDrivingModel } from '../dist/driving-model.js';
import { createInputDom } from './fixtures/vehicle-input-dom.mjs';
import { freshCareer } from '../dist/career-save.js';
import { createAppDom } from './fixtures/app-dom.mjs';

let checks = 0;
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const orbit = (camera, yaw = 1, pitch = .2) => { camera.lookBegin(); camera.lookDelta(yaw, pitch); camera.lookEnd(); };

check('default offsets preserve the original walking/car height and rear distance at every heading', () => {
  for (const mode of ['walking', 'driving']) for (let i = 0; i < 24; i++) {
    const heading = i * Math.PI / 12;
    const camera = createFollowCameraState({ mode, heading });
    const expected = new THREE.Vector3(0, mode === 'walking' ? 5.6 : 8.3, mode === 'walking' ? 10 : 13)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    const out = new THREE.Vector3();
    assert.equal(computeFollowOffset(camera.state, out), out);
    assert.ok(expected.distanceTo(out) < 1e-12);
    near(out.length(), FOLLOW_CAMERA[mode].radius);
  }
});

check('walking yaw/pitch persist while moving, turning, parked, or after a long idle', () => {
  const camera = createFollowCameraState();
  orbit(camera, 1.9, .28);
  const before = { ...camera.state };
  for (let i = 0; i < 1000; i++) camera.update({ dt: 1, heading: i / 4, distance: 50 });
  camera.update({ dt: 86400, heading: -2, distance: 0 });
  assert.deepEqual(camera.state, before);
});

check('manual orbit is free through many revolutions, with only the declared elevation clamp', () => {
  const camera = createFollowCameraState();
  camera.lookBegin();
  camera.lookDelta(20 * Math.PI + .4, 999);
  near(camera.state.yaw, .4);
  near(camera.state.pitch, FOLLOW_CAMERA.maxPitch);
  camera.lookDelta(-40 * Math.PI - .8, -999);
  near(camera.state.yaw, -.4);
  near(camera.state.pitch, FOLLOW_CAMERA.minPitch);
  const before = { ...camera.state };
  camera.lookDelta(NaN, Infinity);
  assert.deepEqual(camera.state, before);
  camera.lookEnd();
  camera.lookDelta(1, 1);
  near(camera.state.yaw, -.4);
});

check('driving keeps world yaw through car turns until six actual metres after release', () => {
  const camera = createFollowCameraState({ mode: 'driving' });
  orbit(camera, 1.25, .2);
  const yaw = camera.state.yaw, pitch = camera.state.pitch;
  camera.update({ dt: 99999, heading: -2, distance: 0 });
  camera.update({ dt: .4, heading: .7, distance: 5.999 });
  near(camera.state.yaw, yaw); near(camera.state.pitch, pitch);
  assert.equal(camera.state.returning, false);
  camera.update({ dt: .01, heading: .7, distance: .001 });
  near(camera.state.yaw, yaw);
  assert.equal(camera.state.returning, true);
  camera.update({ dt: .1, heading: .7, distance: .1 });
  assert.ok(camera.state.yaw < yaw && camera.state.yaw > .7);
  assert.ok(camera.state.pitch < pitch && camera.state.pitch > FOLLOW_CAMERA.driving.pitch);
});

check('forward and reverse both count positive actual distance, including a D/R combination', () => {
  for (const direction of [1, -1]) {
    const camera = createFollowCameraState({ mode: 'driving' });
    orbit(camera);
    camera.update({ dt: 1, heading: 0, distance: direction * 5 });
    assert.equal(camera.state.returning, false);
    near(camera.state.distanceSinceLook, 5);
    camera.update({ dt: 1, heading: 0, distance: direction * 2 });
    assert.equal(camera.state.returning, true);
    near(camera.state.distanceSinceLook, 7);
    assert.ok(camera.state.yaw < 1);
  }
  const camera = createFollowCameraState({ mode: 'driving' });
  orbit(camera);
  camera.update({ dt: 1, distance: 3.2 });
  camera.update({ dt: 1, distance: -3.2, heading: 0 });
  near(camera.state.distanceSinceLook, 6.4);
  assert.equal(camera.state.returning, true);
});

check('held look never credits travel; every new touch cancels return and resets the distance budget', () => {
  const camera = createFollowCameraState({ mode: 'driving' });
  camera.lookBegin(); camera.lookDelta(1, .2);
  camera.update({ dt: 400, heading: -2, distance: 4000 });
  near(camera.state.distanceSinceLook, 0); near(camera.state.yaw, 1);
  camera.lookEnd();
  camera.update({ dt: .4, heading: 0, distance: 7 });
  assert.equal(camera.state.returning, true);
  camera.lookBegin();
  const before = camera.state.yaw;
  camera.update({ dt: 10, heading: -1, distance: 200 });
  near(camera.state.yaw, before); near(camera.state.distanceSinceLook, 0);
  assert.equal(camera.state.returning, false);
  camera.lookEnd();
  camera.update({ dt: 60, heading: -1, distance: 5.9 });
  near(camera.state.yaw, before);
  // Duplicate/global releases do not erase distance already accumulated.
  camera.lookEnd(); near(camera.state.distanceSinceLook, 5.9);
});

check('stopping freezes return even after it has started; no parked or blocked time is counted', () => {
  const camera = createFollowCameraState({ mode: 'driving' });
  orbit(camera);
  camera.update({ dt: .1, heading: 0, distance: 7 });
  const before = { ...camera.state };
  for (const dt of [0, 1 / 60, 10, 10000]) camera.update({ dt, heading: -2, distance: 0 });
  assert.deepEqual(camera.state, before);
  camera.update({ dt: .1, heading: 0, distance: .5 });
  assert.ok(camera.state.yaw < before.yaw);
});

check('the 180-degree boundary uses the short arc, without a nearly full-circle return', () => {
  const start = Math.PI - .03, target = -Math.PI + .03;
  const camera = createFollowCameraState({ mode: 'driving', heading: start });
  orbit(camera, 0, 0);
  camera.update({ dt: 0, heading: target, distance: 6 });
  camera.update({ dt: .2, heading: target, distance: .2 });
  const moved = shortestAngleDelta(start, camera.state.yaw);
  assert.ok(moved > 0 && moved < .06);
  assert.ok(Math.abs(shortestAngleDelta(camera.state.yaw, target)) < .06);
});

check('threshold crossing plus exponential return matches exactly at 30/60/120 FPS', () => {
  const values = [];
  for (const fps of [30, 60, 120]) {
    const camera = createFollowCameraState({ mode: 'driving' });
    orbit(camera, -1.2, .4);
    for (let i = 0; i < 2.2 * fps; i++) camera.update({ dt: 1 / fps, heading: 1.4, distance: 5.7 / fps });
    const returnSeconds = 2.2 - 6 / 5.7;
    near(camera.state.yaw, 1.4 + (-1.2 - 1.4) * Math.exp(-FOLLOW_CAMERA.returnRate * returnSeconds));
    near(camera.state.pitch, FOLLOW_CAMERA.driving.pitch + .4 * Math.exp(-FOLLOW_CAMERA.returnRate * returnSeconds));
    values.push({ ...camera.state });
  }
  for (const state of values.slice(1)) {
    near(state.yaw, values[0].yaw, 1e-12);
    near(state.pitch, values[0].pitch, 1e-12);
  }
});

check('teleport/fuel resets clear held look and old distance without counting the position jump', () => {
  const camera = createFollowCameraState({ mode: 'driving' });
  orbit(camera);
  camera.update({ dt: 1, distance: 5.5 });
  camera.lookBegin();
  camera.update({ dt: 1, heading: -2, distance: 5000, teleported: true });
  near(camera.state.yaw, -2); near(camera.state.distanceSinceLook, 0);
  assert.equal(camera.state.looking, false);
  camera.reset({ mode: 'walking', heading: 0 });
  near(camera.state.pitch, FOLLOW_CAMERA.walking.pitch);
  near(camera.state.radius, FOLLOW_CAMERA.walking.radius);
  assert.equal(camera.state.returning, false);
  camera.setMode('driving', { heading: 1.5, reset: true });
  near(camera.state.yaw, 1.5);
  orbit(camera, 1, 0);
  camera.update({ dt: 500, heading: -1, distance: 5.9 });
  near(camera.state.yaw, 2.5);
});

check('non-reset mode changes preserve manual world yaw, while changing the fixed follow radius', () => {
  const camera = createFollowCameraState();
  orbit(camera, 1.2, .2);
  const yaw = camera.state.yaw;
  camera.setMode('driving');
  near(camera.state.yaw, yaw); near(camera.state.radius, FOLLOW_CAMERA.driving.radius);
  camera.update({ dt: 100, heading: 0, distance: 5.9 });
  near(camera.state.yaw, yaw);
  camera.setMode('walking');
  near(camera.state.yaw, yaw); near(camera.state.radius, FOLLOW_CAMERA.walking.radius);
});

check('actual force-based driving triggers return after six metres in D and R', () => {
  for (const gear of ['D', 'R']) {
    const model = createDrivingModel({ x: 0, z: 0, heading: 0 });
    model.setGear(gear); model.setInput({ active: true, steering: 0 });
    const camera = createFollowCameraState({ mode: 'driving' });
    orbit(camera, 1, 0);
    let distance = 0, crossed = false;
    for (let frame = 0; frame < 180; frame++) {
      model.step(1 / 60);
      const stepDistance = model.state.pathDistance;
      distance += stepDistance;
      camera.update({ dt: 1 / 60, heading: model.state.heading, distance: stepDistance });
      near(camera.state.distanceSinceLook, distance);
      if (distance < 6) near(camera.state.yaw, 1);
      else crossed = true;
    }
    assert.ok(crossed && camera.state.returning && camera.state.yaw < .1);
    assert.ok(gear === 'D' ? model.state.z < 0 : model.state.z > 0);
  }
});

check('holding the real vehicle against a wall never falsely unlocks camera return', () => {
  const model = createDrivingModel({ x: 0, z: 0, heading: 0,
    contact: (x, z) => z < -.1 ? { normalX: 0, normalZ: 1, depth: -.1 - z } : undefined });
  model.setInput({ active: true, steering: 0 });
  const camera = createFollowCameraState({ mode: 'driving' });
  orbit(camera, 1, 0);
  for (let frame = 0; frame < 1800; frame++) {
    const x = model.state.x, z = model.state.z;
    model.step(1 / 60);
    camera.update({ dt: 1 / 60, heading: model.state.heading, distance: Math.hypot(model.state.x - x, model.state.z - z) });
  }
  assert.ok(model.state.blocked);
  assert.ok(camera.state.distanceSinceLook < .11);
  near(camera.state.yaw, 1);
  assert.equal(camera.state.returning, false);
});

function inputFixture() {
  const dom = createInputDom(), Element = dom.root.constructor;
  const canvas = new Element(); canvas.ownerDocument = dom.doc;
  canvas.style.touchAction = 'manipulation';
  canvas.parent = dom.doc; dom.doc.parent = dom.win; dom.root.parent = dom.doc;
  const camera = createFollowCameraState({ mode: 'driving' });
  const begins = [], ends = [], safety = [], deltas = [];
  const input = createLookInput({ canvas,
    onBegin: e => { begins.push(e.pointerId); camera.lookBegin(); },
    onDelta: (yaw, pitch) => { deltas.push([yaw, pitch]); camera.lookDelta(yaw, pitch); },
    onEnd: e => { ends.push(e); camera.lookEnd(); }, onSafetyReset: reason => safety.push(reason) });
  const pointer = (target, type, id, x = 100, y = 100, extra = {}) => target.dispatch(type,
    { pointerId: id, button: 0, clientX: x, clientY: y, pointerType: 'touch', isPrimary: id === 1, ...extra });
  return { ...dom, canvas, camera, begins, ends, safety, deltas, input, pointer, Element };
}

check('look can only start on the canvas; HUD, right mouse, and unowned pointers remain separate', () => {
  const f = inputFixture();
  try {
    f.pointer(f.root, 'pointerdown', 1);
    f.pointer(f.win, 'pointerdown', 2);
    f.pointer(f.canvas, 'pointerdown', 3, 100, 100, { button: 2, pointerType: 'mouse' });
    assert.equal(f.input.active, false);
    assert.equal(f.doc.listeners.get('pointerdown'), undefined);
    assert.equal(f.win.listeners.get('pointerdown'), undefined);
    f.pointer(f.canvas, 'pointerdown', 4, 100, 100, { isPrimary: false });
    assert.equal(f.input.pointerId, 4); assert.ok(f.canvas.hasPointerCapture(4));
    f.pointer(f.canvas, 'pointerdown', 5);
    f.pointer(f.win, 'pointermove', 5, 190, 150);
    f.pointer(f.win, 'pointerup', 5);
    assert.equal(f.input.pointerId, 4); near(f.camera.state.yaw, 0);
    f.pointer(f.canvas, 'pointermove', 4, 120, 110);
    near(f.camera.state.yaw, -.12);
    near(f.camera.state.pitch, FOLLOW_CAMERA.driving.pitch + .06);
    assert.equal(f.deltas.length, 1, 'canvas/window bubbling must not duplicate a move');
    f.pointer(f.win, 'pointerup', 4);
    assert.equal(f.input.active, false); assert.equal(f.ends.length, 1);
    assert.equal(f.ends[0].cancelled, false); assert.ok(!f.canvas.hasPointerCapture(4));
  } finally { f.input.destroy(); }
});

check('joystick, look and jump can be held simultaneously and released independently', () => {
  const f = inputFixture();
  const root = new f.Element(), joystick = new f.Element(), thumb = new f.Element(), jump = new f.Element();
  root.ownerDocument = f.doc; root.parent = f.doc; root.append(joystick); root.append(thumb); root.append(jump);
  const walk = createWalkInput({ root, joystick, thumb });
  let jumps=0;
  const jumpInput=createJumpInput({button:jump,onJump:()=>jumps++});
  try {
    f.pointer(joystick, 'pointerdown', 1, 90, 40);
    assert.ok(walk.sample().active);
    f.pointer(f.canvas, 'pointerdown', 2);
    f.pointer(jump, 'pointerdown', 3);
    f.pointer(f.canvas, 'pointermove', 2, 130, 120);
    assert.ok(walk.sample().active); assert.equal(jumps, 1); assert.equal(f.input.pointerId, 2);
    f.pointer(f.win, 'pointerup', 3);
    assert.equal(jumps, 1); assert.equal(f.input.pointerId, 2); assert.ok(walk.sample().active);
    f.pointer(f.win, 'pointercancel', 2);
    assert.equal(f.input.active, false); assert.ok(walk.sample().active);
    f.pointer(f.win, 'pointerup', 1);
    assert.equal(walk.sample().active, false);
    assert.deepEqual(f.begins, [2]); assert.equal(f.ends.length, 1);
  } finally { jumpInput.destroy(); walk.destroy(); f.input.destroy(); }
});

check('original wheel and D/R controls work while a secondary finger orbits', () => {
  const f = inputFixture(), vehicle = createVehicleInput({ root: f.root });
  try {
    f.pointer(f.wheel, 'pointerdown', 1, 100, 70);
    f.pointer(f.canvas, 'pointerdown', 2);
    f.pointer(f.canvas, 'pointermove', 2, 150, 105);
    assert.equal(f.input.pointerId, 2);
    f.pointer(f.r, 'pointerdown', 3);
    f.pointer(f.win, 'pointerup', 3);
    assert.equal(f.input.pointerId, 2);
    assert.ok(f.wheel.hasPointerCapture(1));
    f.pointer(f.win, 'pointercancel', 2);
    assert.ok(f.wheel.hasPointerCapture(1));
    f.pointer(f.wheel, 'pointerup', 1);
    assert.ok(!f.wheel.hasPointerCapture(1));
  } finally { vehicle.destroy(); f.input.destroy(); }
});

check('window/canvas up, cancellation and lost capture release exactly once, including reentrant loss', () => {
  for (const target of ['canvas', 'win']) for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const f = inputFixture();
    try {
      const originalRelease = f.canvas.releasePointerCapture.bind(f.canvas);
      f.canvas.releasePointerCapture = id => { originalRelease(id); f.pointer(f.canvas, 'lostpointercapture', id); };
      f.pointer(f.canvas, 'pointerdown', 4);
      f.pointer(f[target], type, 4);
      f.pointer(f.win, 'pointerup', 4);
      assert.equal(f.input.active, false); assert.equal(f.camera.state.looking, false);
      assert.equal(f.ends.length, 1); near(f.camera.state.distanceSinceLook, 0);
      f.pointer(f.canvas, 'pointerdown', 5);
      assert.equal(f.input.pointerId, 5);
    } finally { f.input.destroy(); }
  }
});

check('blur, hidden, resize and pagehide cancel held look and allow a fresh gesture', () => {
  for (const reason of ['blur', 'hidden', 'resize', 'pagehide']) {
    const f = inputFixture();
    try {
      f.pointer(f.canvas, 'pointerdown', 2);
      if (reason === 'hidden') { f.doc.hidden = true; f.doc.dispatch('visibilitychange'); }
      else f.win.dispatch(reason);
      assert.equal(f.input.active, false); assert.equal(f.ends.length, 1);
      assert.deepEqual(f.safety, [reason]); assert.equal(f.camera.state.looking, false);
      f.pointer(f.win, 'pointermove', 2, 200, 200); near(f.camera.state.yaw, 0);
      f.pointer(f.canvas, 'pointerdown', 3); assert.equal(f.input.pointerId, 3);
    } finally { f.input.destroy(); }
  }
});

check('disabled/destroyed look is inert and restores canvas touch-action without leaking listeners', () => {
  const f = inputFixture();
  assert.equal(f.canvas.style.touchAction, 'none');
  f.pointer(f.canvas, 'pointerdown', 1); f.input.setEnabled(false);
  assert.equal(f.input.active, false); assert.equal(f.canvas.style.touchAction, 'manipulation');
  f.pointer(f.canvas, 'pointerdown', 2); assert.equal(f.begins.length, 1);
  f.input.setEnabled(true); f.pointer(f.canvas, 'pointerdown', 3);
  assert.equal(f.input.pointerId, 3);
  f.input.destroy(); f.input.destroy(); f.input.setEnabled(true);
  assert.equal(f.canvas.style.touchAction, 'manipulation');
  f.pointer(f.canvas, 'pointerdown', 4); assert.equal(f.begins.length, 2);
  for (const target of [f.canvas, f.doc, f.win]) for (const callbacks of target.listeners.values()) assert.equal(callbacks.size, 0);
});

check('pointer-capture failure still permits look and release through the window fallback', () => {
  const f = inputFixture();
  try {
    f.canvas.setPointerCapture = () => { throw new Error('Interrupted pointer'); };
    f.pointer(f.canvas, 'pointerdown', 2);
    f.pointer(f.win, 'pointermove', 2, 150, 125);
    near(f.camera.state.yaw, -.3);
    f.pointer(f.win, 'pointerup', 2);
    assert.equal(f.input.active, false); assert.equal(f.ends.length, 1);
  } finally { f.input.destroy(); }
});

check('gesture acquisition adopts the rendered orbit and viewport scale without modifying the camera or target', () => {
  const camera = createFollowCameraState({ mode: 'driving' });
  const target = new THREE.Vector3(13, 2.7, -91);
  const actual = { yaw: -2.3, pitch: .74, radius: FOLLOW_CAMERA.driving.radius };
  const position = computeFollowOffset(actual, new THREE.Vector3()).multiplyScalar(1.2).add(target);
  const positionBefore = position.clone(), targetBefore = target.clone();
  camera.lookBegin({ position, target, scale: 1.2 });
  near(camera.state.yaw, actual.yaw); near(camera.state.pitch, actual.pitch); near(camera.state.radius, actual.radius);
  assert.deepEqual(position, positionBefore); assert.deepEqual(target, targetBefore);
  camera.lookDelta(-.0006, .0006);
  near(camera.state.yaw, actual.yaw - .0006); near(camera.state.pitch, actual.pitch + .0006);
  camera.lookEnd();
  const before = { ...camera.state };
  camera.lookBegin({ position: target, target, scale: 1.2 });
  near(camera.state.yaw, before.yaw); near(camera.state.pitch, before.pitch); near(camera.state.radius, before.radius);
});

const appPointer = (target, type, pointerType = 'touch', id = 2, x = 100, y = 100) => target.dispatch(type,
  { pointerId: id, button: 0, clientX: x, clientY: y, pointerType, isPrimary: pointerType === 'mouse' || id === 1 });
function cameraSnapshot(d) {
  return { position: d.camera.position.clone(), quaternion: d.camera.quaternion.clone(), target: d.controls.target.clone(),
    yaw: d.cameraState.state.yaw, pitch: d.cameraState.state.pitch, radius: d.cameraState.state.radius };
}
function sameCamera(d, before) {
  near(d.camera.position.distanceTo(before.position), 0, 1e-10);
  near(d.controls.target.distanceTo(before.target), 0, 1e-10);
  for (const axis of ['x', 'y', 'z', 'w']) near(d.camera.quaternion[axis], before.quaternion[axis]);
  for (const key of ['yaw', 'pitch', 'radius']) near(d.cameraState.state[key], before[key]);
}
function assertRenderedOrbit(d, scale) {
  const expected = computeFollowOffset(d.cameraState.state, new THREE.Vector3()).multiplyScalar(scale);
  near(d.camera.position.clone().sub(d.controls.target).distanceTo(expected), 0, 1e-10);
  const forward = d.camera.getWorldDirection(new THREE.Vector3());
  near(forward.distanceTo(expected.normalize().negate()), 0, 1e-10);
}

for (const viewport of [{ width: 390, height: 844, name: 'portrait' }, { width: 1440, height: 900, name: 'landscape' }]) {
  for (const mode of ['walking', 'driving']) {
    check(`${viewport.name} ${mode}: zero-delta mouse/touch cannot snap a lagged target; the first quarter-pixel drag stays tiny`, () => {
      const app = createAppDom({ ...viewport, startDriving: mode === 'driving' }), d = app.debug;
      const canvas = d.renderer.domElement;
      const follow = dt => mode === 'driving' ? d.followTruck(dt) : d.followCharacter(dt);
      const scale = viewport.width / viewport.height < .8 ? mode === 'driving' ? 1.2 : 1.12 : 1;
      const rate = mode === 'driving' ? 7 : 8;
      try {
        for (const pointerType of ['touch', 'mouse']) {
          // A one-metre step left 0.875173 m / 0.889882 m of target lag.
          // Previously, merely acquiring the pointer applied ALL of it at dt=0.
          if (mode === 'driving') { d.model.state.x += 1; d.applyTruckPose(); }
          else d.gameplay.state.player.x += 1;
          follow(1 / 60);
          const before = cameraSnapshot(d);
          const subject = mode === 'driving' ? d.model.state : d.gameplay.state.player;
          assert.ok(Math.abs(subject.x - before.target.x) > .8, 'Reproduction must retain target lag');
          assertRenderedOrbit(d, scale);
          appPointer(canvas, 'pointerdown', pointerType);
          sameCamera(d, before);
          appPointer(canvas, 'pointermove', pointerType);
          follow(0);
          sameCamera(d, before);
          appPointer(canvas, 'pointermove', pointerType, 2, 100.25, 99.75);
          follow(0);
          near(d.cameraState.state.yaw, before.yaw - .0015);
          near(d.cameraState.state.pitch, before.pitch - .0015);
          near(d.controls.target.distanceTo(before.target), 0);
          assert.ok(d.camera.position.distanceTo(before.position) > 0 && d.camera.position.distanceTo(before.position) < .06);
          assertRenderedOrbit(d, scale);
          // Rotation remains direct, while translation retains its usual damping.
          const targetBeforeFrame = d.controls.target.clone(), yaw = d.cameraState.state.yaw;
          follow(1 / 60);
          near(d.controls.target.x, targetBeforeFrame.x + (subject.x - targetBeforeFrame.x) * (1 - Math.exp(-rate / 60)));
          near(d.cameraState.state.yaw, yaw);
          appPointer(canvas, 'pointerup', pointerType, 2, 100.25, 99.75);
          const after = cameraSnapshot(d); follow(0); sameCamera(d, after);
        }
      } finally { app.dispose(); }
    });
  }
}

check('seating, standing, character changes, recenter, teleport and reset keep the next tap at the rendered pose', () => {
  const app = createAppDom({ startDriving: false, career: { ...freshCareer(), ownedSkinIds: ['bacon','pack1'] } }), d = app.debug;
  const canvas = d.renderer.domElement;
  const stableTap = label => {
    const before = cameraSnapshot(d);
    appPointer(canvas, 'pointerdown');
    sameCamera(d, before);
    if (d.driving) d.followTruck(0); else d.followCharacter(0);
    sameCamera(d, before);
    appPointer(canvas, 'pointerup');
    assertRenderedOrbit(d, d.driving ? 1.2 : 1.12);
    assert.equal(d.lookInput.active, false, label);
  };
  try {
    stableTap('initial view');
    const desk = d.garage.desks[0];
    d.gameplay.state.seatedId = desk.id; d.gameplay.state.player = { ...desk.seat };
    d.followCharacter(1 / 60);
    stableTap('seating while target is still smoothing');
    d.standCharacter(); stableTap('standing');
    appPointer(canvas, 'pointerdown'); appPointer(canvas, 'pointermove', 'touch', 2, 155, 125);
    d.followCharacter(0); appPointer(canvas, 'pointerup');
    const chosenYaw = d.cameraState.state.yaw;
    d.selectCharacter('pack1'); assert.equal(d.gameplay.state.characterId, 'pack1'); stableTap('model change'); near(d.cameraState.state.yaw, chosenYaw);
    d.setDriving(false); d.setDriving(true); stableTap('overview return / recenter');
    d.gameplay.state.cooldown = 0; d.enterVehicle('pickup'); stableTap('vehicle entry / teleport');
    appPointer(canvas, 'pointerdown'); appPointer(canvas, 'pointermove', 'touch', 2, 200, 130);
    d.followTruck(0); appPointer(canvas, 'pointerup');
    d.followTruck(1 / 60, false, 7); stableTap('partway through six-metre return');
    d.returnToGarage('empty'); stableTap('fuel reset');
    d.rebuild(17); stableTap('scene reset');
  } finally { app.dispose(); }
});

check('holding a walking joystick or original car wheel does not turn a secondary look tap into a camera jump', () => {
  const app = createAppDom({ startDriving: false }), d = app.debug, canvas = d.renderer.domElement;
  try {
    for (const driving of [false, true]) {
      if (driving) { d.gameplay.state.cooldown = 0; d.enterVehicle('pickup'); }
      const other = driving ? app.wheel : app.ids.get('walk-stick');
      appPointer(other, 'pointerdown', 'touch', 1, 80, 30);
      for (let frame = 0; frame < 12; frame++) app.frame();
      const before = cameraSnapshot(d);
      appPointer(canvas, 'pointerdown', 'touch', 2);
      appPointer(canvas, 'pointermove', 'touch', 2);
      if (driving) d.followTruck(0); else d.followCharacter(0);
      sameCamera(d, before);
      assert.ok(other.hasPointerCapture(1)); assert.equal(d.lookInput.pointerId, 2);
      if (!driving) assert.ok(d.walkInput.sample().active);
      appPointer(canvas, 'pointerup', 'touch', 2);
      assert.ok(other.hasPointerCapture(1));
      appPointer(other, 'pointerup', 'touch', 1, 80, 30);
      assert.equal(other.hasPointerCapture(1), false);
    }
  } finally { app.dispose(); }
});

console.log(`\n${checks} camera and multitouch checks passed (Node, real Three.js, mocked DOM; no browser launch).`);
