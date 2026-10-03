#!/usr/bin/env node
// Real Three GLTF parsing, skinning, animation, and input lifecycle checks.
// No browser/WebGL. PNG decoding/rendering is not claimed by these tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as THREE from '../dist/vendor/three.module.js';
import { loadBacon, BACON_HEIGHT } from '../dist/character.js';
import { createWalkInput, cameraRelativeAxes } from '../dist/walk-input.js';
const require = createRequire(import.meta.url);
let validator;
try { validator = require('gltf-validator'); }
catch { try { validator = require('../../tools/node_modules/gltf-validator'); } catch { /* Optional validation dependency. */ } }
let checks = 0;
function check(name, callback) { callback(); checks++; console.log(`PASS ${name}`); }
function near(actual, expected, epsilon = 1e-6) { assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`); }
const bytes = fs.readFileSync(new URL('../dist/assets/bacon.glb', import.meta.url));
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
if (validator) {
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: 'bacon.glb' });
  check('Original Bacon GLB passes Khronos validation without warnings', () => {
    assert.equal(report.issues.numErrors, 0);
    assert.equal(report.issues.numWarnings, 0);
  });
} else console.log('SKIP Khronos validation: install the optional gltf-validator package to run it.');
check('Shipped asset matches original GLB hash, clips and embedded PNG', () => {
  assert.equal(bytes.length, 704152);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'eb78b0d387d323905bc0151d4a533a07acf61cea6d98de417c105079750a6415');
  assert.deepEqual(json.animations.map(a => a.name), ['Jumping', 'Orc Idle', 'FlyingEdit', 'running']);
  assert.equal(json.images[0].mimeType, 'image/png');
  assert.equal(json.images[0].uri, undefined);
});
// GLTFLoader still reads the original embedded PNG. A minimal bitmap shim lets
// Node exercise the real loader without claiming browser image decoding.
const oldSelf = globalThis.self, oldBitmap = globalThis.createImageBitmap;
let bitmapClosed = 0, imageDecoded = 0;
globalThis.self = globalThis;
globalThis.createImageBitmap = async (blob) => {
  const png = Buffer.from(await blob.arrayBuffer());
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  imageDecoded++;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), close() { bitmapClosed++; } };
};
let character;
try {
  character = await loadBacon(THREE, { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
} finally {
  if (oldSelf === undefined) delete globalThis.self; else globalThis.self = oldSelf;
  if (oldBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = oldBitmap;
}
await assert.rejects(loadBacon(THREE, { data: new Uint8Array([1, 2, 3]).buffer }));
check('Invalid GLB rejects instead of producing a stand-in', () => {});
const { group } = character;
let mesh;
group.traverse(object => { if (object.isMesh) { assert.equal(mesh, undefined); mesh = object; } });
check('Loader uses actual 2,897-vertex skinned Bacon and embedded color texture', () => {
  assert.ok(mesh.isSkinnedMesh);
  assert.equal(mesh.geometry.attributes.position.count, 2897);
  assert.equal(mesh.skeleton.bones.length, 22);
  assert.equal(mesh.material.map.image.width, 1024);
  assert.equal(mesh.material.map.image.height, 512);
  assert.equal(mesh.material.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(imageDecoded, 1);
  assert.equal(mesh.frustumCulled, false);
});
check('Standing character is 3.5 m tall, centered, with feet at zero', () => {
  const box = new THREE.Box3().setFromObject(group, true);
  near(box.min.y, 0);
  near(box.max.y, BACON_HEIGHT);
  near((box.min.x + box.max.x) / 2, 0);
  near((box.min.z + box.max.z) / 2, 0);
});
check('Actual feet point toward -Z at heading zero', () => {
  const foot = group.getObjectByName('mixamorigLeftFoot').getWorldPosition(new THREE.Vector3());
  const toe = group.getObjectByName('mixamorigLeftToeBase').getWorldPosition(new THREE.Vector3());
  assert.ok(toe.z < foot.z - 0.2);
});
const arm = group.getObjectByName('mixamorigLeftArm');
const initialArm = arm.quaternion.clone();
check('Original animations advance with natural running flight and no floor penetration', () => {
  for (const speed of [4.5, 7, 0, 4.5, 0]) {
    for (let i = 0; i < 30; i++) {
      character.update(1 / 60, speed, Math.PI / 3);
      const box = new THREE.Box3().setFromObject(group, true);
      assert.ok(box.min.y >= group.position.y - 0.001);
      assert.ok(box.min.y <= group.position.y + 0.27);
      assert.ok(Number.isFinite(box.max.y) && box.max.y > 2.5 && box.max.y < 4.5);
    }
  }
  assert.ok(initialArm.angleTo(arm.quaternion) > 0.005);
  near(group.rotation.y, Math.PI / 3, 1e-5);
  assert.equal(group.userData.character.walkClip, null);
  assert.equal(group.userData.character.locomotionClip, 'running');
  assert.equal(group.userData.character.idleClip, 'Orc Idle');
});
check('World position, heading and paused-frame safety stay under caller control', () => {
  group.position.set(27, 2, -19);
  character.update(10, 7, Math.PI / 2);
  near(group.position.x, 27); near(group.position.y, 2); near(group.position.z, -19);
  assert.ok(new THREE.Box3().setFromObject(group, true).min.y >= 2 - 0.001);
  character.update(NaN, NaN, NaN);
  assert.ok(group.matrixWorld.elements.every(Number.isFinite));
});
check('Teleport reset snaps heading and restores the exact grounded idle pose', () => {
  character.resetMotion(-Math.PI / 2);
  near(group.rotation.y, -Math.PI / 2);
  near(new THREE.Box3().setFromObject(group, true).min.y, group.position.y);
  near(new THREE.Box3().setFromObject(group, true).getSize(new THREE.Vector3()).y, BACON_HEIGHT);
});
check('Character disposal releases geometry/material/texture exactly once', () => {
  let geometries = 0, materials = 0, textures = 0;
  mesh.geometry.addEventListener('dispose', () => geometries++);
  mesh.material.addEventListener('dispose', () => materials++);
  mesh.material.map.addEventListener('dispose', () => textures++);
  const scene = new THREE.Scene(); scene.add(group);
  character.dispose(); character.dispose(); character.update(1, 7, 0);
  assert.equal(group.parent, null);
  assert.deepEqual([geometries, materials, textures, bitmapClosed], [1, 1, 1, 1]);
});
check('Camera-relative movement is normalized, analog and stable overhead', () => {
  let a = cameraRelativeAxes(1, 1, { x: 0, z: -1 });
  near(Math.hypot(a.x, a.z), 1); assert.ok(a.x > 0 && a.z < 0);
  a = cameraRelativeAxes(0, 1, { x: 1, z: 0 }); near(a.x, 1); near(a.z, 0);
  a = cameraRelativeAxes(1, 0, { x: 1, z: 0 }); near(a.x, 0); near(a.z, 1);
  a = cameraRelativeAxes(0, 0.3, { x: 0, z: 0 }); near(a.z, -0.3); near(a.magnitude, 0.3);
});
class Target {
  constructor() { this.listeners = new Map(); this.style = {}; this.dataset = {}; this.attributes = {}; this.captures = new Set(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, values = {}) {
    const event = { target: this, button: 0, pointerId: 1, clientX: 150, clientY: 150, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.immediate = true; }, ...values };
    for (const fn of this.listeners.get(type) ?? []) fn(event);
    return event;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  closest() { return null; }
  getBoundingClientRect() { return { left: 100, top: 100, width: 100, height: 100 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.dispatch('lostpointercapture', { pointerId: id }); }
}
const win = new Target(), doc = new Target(), root = new Target(), joystick = new Target(), thumb = new Target();
doc.defaultView = win; root.ownerDocument = doc;
let camera = { x: 0, z: -1 }, safety = 0;
const input = createWalkInput({ root, joystick, thumb, getCameraForward: () => camera, onSafetyReset: () => safety++ });
check('Keyboard WASD/arrows combine without diagonal speed bonus; Shift runs', () => {
  const down = win.dispatch('keydown', { code: 'KeyW' });
  assert.ok(down.prevented && down.immediate);
  win.dispatch('keydown', { code: 'ArrowRight' });
  near(input.sample().magnitude, 1); near(Math.hypot(input.sample().x, input.sample().z), 1);
  win.dispatch('keydown', { code: 'ShiftLeft' }); assert.equal(input.sample().running, true);
  win.dispatch('keyup', { code: 'KeyW' }); near(input.sample().x, 1); near(input.sample().z, 0);
  input.reset(); assert.equal(input.sample().active, false);
});
check('Joystick owns one pointer; other fingers cannot hijack or release movement', () => {
  const down = joystick.dispatch('pointerdown', { pointerId: 8, clientY: 116, isPrimary: false });
  assert.ok(down.prevented && down.stopped); near(input.sample().z, -1); assert.equal(input.sample().running, true);
  assert.ok(joystick.hasPointerCapture(8));
  joystick.dispatch('pointerdown', { pointerId: 9, clientX: 184 });
  joystick.dispatch('pointermove', { pointerId: 9, clientX: 184 });
  joystick.dispatch('pointerup', { pointerId: 9 }); near(input.sample().z, -1);
  camera = { x: 1, z: 0 }; near(input.sample().x, 1); near(input.sample().z, 0);
  win.dispatch('pointerup', { pointerId: 8 }); assert.equal(input.sample().active, false);
  assert.equal(joystick.hasPointerCapture(8), false);
});
check('Joystick dead zone, diagonal normalization and interrupted capture reset', () => {
  camera = { x: 0, z: -1 };
  joystick.dispatch('pointerdown', { pointerId: 11, clientX: 151, clientY: 149 }); assert.equal(input.sample().active, false);
  joystick.dispatch('pointermove', { pointerId: 11, clientX: 150, clientY: 130 }); assert.equal(input.sample().running, false);
  assert.ok(input.sample().magnitude > 0.4 && input.sample().magnitude < 0.6);
  joystick.dispatch('pointermove', { pointerId: 11, clientX: 180, clientY: 120 }); near(input.sample().magnitude, 1);
  const strengthMove = strength => joystick.dispatch('pointermove', { pointerId:11, clientX:150, clientY:150-34*(.12+.88*strength) });
  for(const strength of [.84,.87,.82,.88]){strengthMove(strength);assert.equal(input.sample().running,true,'run must not chatter near the old .85 threshold');}
  strengthMove(.74);assert.equal(input.sample().running,false);
  strengthMove(.86);assert.equal(input.sample().running,false);
  strengthMove(.91);assert.equal(input.sample().running,true);

  joystick.dispatch('pointercancel', { pointerId: 11 }); assert.equal(input.sample().active, false);
  joystick.dispatch('pointerdown', { pointerId: 12, clientY: 116 });
  joystick.dispatch('lostpointercapture', { pointerId: 12 }); assert.equal(input.sample().active, false);
});
check('Blur, resize, hidden page, focus in input, disable and pagehide clear sticky movement', () => {
  for (const event of ['blur', 'resize', 'pagehide']) {
    win.dispatch('keydown', { code: 'KeyW' }); win.dispatch(event); assert.equal(input.sample().active, false);
  }
  win.dispatch('keydown', { code: 'KeyW' }); doc.hidden = true; doc.dispatch('visibilitychange'); assert.equal(input.sample().active, false);
  doc.hidden = false;
  const editable = { closest: () => ({}) };
  win.dispatch('keydown', { code: 'KeyW', target: editable }); assert.equal(input.sample().active, false);
  win.dispatch('keydown', { code: 'KeyW' }); doc.dispatch('focusin', { target: editable }); assert.equal(input.sample().active, false);
  joystick.dispatch('pointerdown', { pointerId: 14, clientY: 116 }); input.setEnabled(false); assert.equal(input.sample().active, false);
  win.dispatch('keydown', { code: 'KeyW' }); joystick.dispatch('pointerdown', { pointerId: 15, clientY: 116 });
  input.setEnabled(true); assert.equal(input.sample().active, false); assert.ok(safety >= 4);
});
check('Modifier shortcuts ignored; root pointer events do not reach orbit; destroy cleans up', () => {
  win.dispatch('keydown', { code: 'KeyW', ctrlKey: true }); assert.equal(input.sample().active, false);
  assert.ok(root.dispatch('pointerdown').stopped);
  input.destroy(); input.destroy();
  win.dispatch('keydown', { code: 'KeyW' }); assert.equal(input.sample().active, false);
  for (const target of [root, joystick, win, doc]) for (const handlers of target.listeners.values()) assert.equal(handlers.size, 0);
});
console.log(`\n${checks} character/input checks passed. Browser image decode, rendering and touch-device usability not run.`);
