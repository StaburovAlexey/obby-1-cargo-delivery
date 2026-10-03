#!/usr/bin/env node
// Renderer-free regression against the actual original GLB, Three mixer and
// deformed vertices. Covers true 0.6333 s loops, not only short start-up samples.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { loadBacon, BACON_HEIGHT } from '../dist/character.js';

const bytes = fs.readFileSync(new URL('../dist/assets/bacon.glb', import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),
  'eb78b0d387d323905bc0151d4a533a07acf61cea6d98de417c105079750a6415');
const oldSelf = globalThis.self, oldBitmap = globalThis.createImageBitmap;
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1024, height: 512, close() {} });
let character;
try {
  character = await loadBacon(THREE, {
    data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
} finally {
  if (oldSelf === undefined) delete globalThis.self; else globalThis.self = oldSelf;
  if (oldBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = oldBitmap;
}
const { group } = character, pivot = group.children[0];
const hips = group.getObjectByName('mixamorigHips');
const run = character.animations.find(clip => clip.name === 'running');
const originalTrackBytes = run.tracks.map(track => Array.from(track.values));
const rotations = run.tracks.filter(track => track.name.endsWith('.quaternion')).map(track => ({
  bone: group.getObjectByName(track.name.slice(0, -'.quaternion'.length)),
  interpolant: track.createInterpolant(),
}));
const up = new THREE.Vector3(0, 1, 0), box = new THREE.Box3();
const vec = new THREE.Vector3(), expected = new THREE.Quaternion();
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const angularDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
let checks = 0;
function pass(message) { console.log(`PASS ${message}`); checks++; }
function sample() {
  group.updateMatrixWorld(true);
  return {
    hip: hips.getWorldPosition(vec).clone().sub(group.position).applyAxisAngle(up, -group.rotation.y),
    foot: box.setFromObject(group, true).min.y - group.position.y,
    pivot: pivot.position.y,
  };
}
function reset(heading = 0) {
  group.position.set(0, 0, 0);
  character.resetMotion(heading);
}

// The root already loops: do not hide a discontinuity by slowing the whole game.
for (const track of run.tracks) {
  const size = track.getValueSize();
  const a = Array.from(track.values.slice(0, size));
  const b = Array.from(track.values.slice(-size));
  const error = size === 4 ? new THREE.Quaternion(...a).normalize().angleTo(new THREE.Quaternion(...b).normalize())
    : new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
  assert.ok(error < 1e-4, `${track.name} endpoint gap ${error}`);
}
pass('Original run has continuous root/limb loop endpoints; GLB hash is unchanged');

const metrics = [];
for (const fps of [30, 60, 120]) {
  reset();
  let previous = sample(), previousStep = 0, previousPhase = 0, loopCount = 0;
  const m = { fps, hipStep: 0, hipSecondDifference: 0, pivotStep: 0, horizontalStep: 0,
    minFoot: Infinity, maxFoot: -Infinity, minHip: Infinity, maxHip: -Infinity, loopHipStep: 0, poseError: 0 };
  for (let i = 1; i <= fps * 13; i++) {
    const t = i / fps;
    group.position.z = -7 * t; // Same full-speed external controller movement.
    character.update(1 / fps, 7, 0);
    const current = sample();
    // Exact phase integral of the smoothed 0.3 -> 1 cadence.
    const phase = (t - 0.07 * (1 - Math.exp(-10 * t))) % run.duration;
    const dy = current.hip.y - previous.hip.y;
    if (t >= 3) {
      m.hipStep = Math.max(m.hipStep, Math.abs(dy));
      m.hipSecondDifference = Math.max(m.hipSecondDifference, Math.abs(dy - previousStep));
      m.pivotStep = Math.max(m.pivotStep, Math.abs(current.pivot - previous.pivot));
      m.horizontalStep = Math.max(m.horizontalStep, Math.hypot(current.hip.x - previous.hip.x, current.hip.z - previous.hip.z));
      m.minFoot = Math.min(m.minFoot, current.foot); m.maxFoot = Math.max(m.maxFoot, current.foot);
      m.minHip = Math.min(m.minHip, current.hip.y); m.maxHip = Math.max(m.maxHip, current.hip.y);
      for (const { bone, interpolant } of rotations) {
        expected.fromArray(interpolant.evaluate(phase)).normalize();
        m.poseError = Math.max(m.poseError, expected.angleTo(bone.quaternion.clone().normalize()));
      }
      if (phase < previousPhase) { loopCount++; m.loopHipStep = Math.max(m.loopHipStep, Math.abs(dy)); }
    }
    previous = current; previousStep = dy; previousPhase = phase;
  }
  assert.ok(loopCount >= 15, `Need complete real loops: ${loopCount}`);
  assert.ok(m.hipStep < 0.96 / fps, JSON.stringify(m));
  assert.ok(m.hipSecondDifference < 2 / fps, JSON.stringify(m));
  assert.ok(m.pivotStep < 1e-7, JSON.stringify(m));
  assert.ok(m.horizontalStep < 1e-7, JSON.stringify(m));
  assert.ok(m.minFoot >= -0.001 && m.minFoot < 0.012, JSON.stringify(m));
  assert.ok(m.maxFoot > 0.12 && m.maxFoot < 0.22, JSON.stringify(m));
  assert.ok(m.maxHip - m.minHip > 0.06 && m.maxHip - m.minHip < 0.071, JSON.stringify(m));
  assert.ok(m.poseError < 0.0001, `Original limb/root rotations changed: ${m.poseError}`);
  assert.ok(m.loopHipStep < 0.96 / fps, `Loop body discontinuity: ${m.loopHipStep}`);
  near(group.position.z, -91);
  metrics.push(m);
  pass(`${fps} fps: 15+ true full-speed run loops retain original bone phase, bounded body trajectory and natural flight`);
}

// Repeat complete speed changes and start/stop sequences. Cross-frame-rate
// snapshots must match, including cadence, blend weights and support position.
const snapshots = [];
for (const fps of [30, 60, 120]) {
  reset();
  let prev = sample(), prevDy = 0, maxStep = 0, maxSecond = 0, minFoot = Infinity, maxFoot = -Infinity;
  const states = [];
  for (let i = 0; i < fps * 15; i++) {
    const t = i / fps;
    const speed = t < 1 ? 0 : t < 3 ? 4.5 : t < 5 ? 7 : t < 6 ? 3.5 : t < 8 ? 0
      : t < 8.2 ? 7 : t < 8.4 ? 0 : t < 8.6 ? 7 : t < 9 ? 0 : t < 12 ? 7 : 0;
    character.update(1 / fps, speed, 0);
    const current = sample(), dy = current.hip.y - prev.hip.y;
    maxStep = Math.max(maxStep, Math.abs(dy)); maxSecond = Math.max(maxSecond, Math.abs(dy - prevDy));
    minFoot = Math.min(minFoot, current.foot); maxFoot = Math.max(maxFoot, current.foot);
    if ((i + 1) % fps === 0) states.push({ hip: current.hip.toArray(), foot: current.foot,
      arm: group.getObjectByName('mixamorigLeftArm').quaternion.toArray() });
    prev = current; prevDy = dy;
  }
  assert.ok(maxStep < 2.6 / fps, `Transition snap at ${fps} fps: ${maxStep}`);
  assert.ok(maxSecond < 1.8 / fps, `Transition acceleration at ${fps} fps: ${maxSecond}`);
  assert.ok(minFoot > -0.001 && maxFoot < 0.27, `Transition foot clearance ${minFoot}..${maxFoot}`);
  assert.ok(Math.abs(prev.foot) < 0.001, 'Stopped feet settle onto the floor');
  snapshots.push(states);
  console.log(`METRIC transitions ${fps} fps: max hip step ${(maxStep * 100).toFixed(3)} cm; foot ${(minFoot * 100).toFixed(4)}..${(maxFoot * 100).toFixed(2)} cm`);
}
for (const states of snapshots.slice(1)) {
  states.forEach((state, i) => {
    state.hip.forEach((value, j) => near(value, snapshots[0][i].hip[j], 1e-6));
    near(state.foot, snapshots[0][i].foot, 1e-6);
    near(new THREE.Quaternion(...state.arm).normalize().angleTo(new THREE.Quaternion(...snapshots[0][i].arm).normalize()), 0, 1e-6);
  });
}
pass('30/60/120 fps speed changes, repeated start/stop and interruptions remain grounded and phase-equivalent');

reset();
let idleMin = Infinity, idleMax = -Infinity;
for (let i = 0; i < 1050; i++) {
  character.update(1 / 60, 0, 0);
  const foot = sample().foot;
  idleMin = Math.min(idleMin, foot); idleMax = Math.max(idleMax, foot);
}
assert.ok(idleMin > -0.0001 && idleMax < 0.0001, `Idle floor drift ${idleMin}..${idleMax}`);
pass('Two complete idle loops keep sole contact within 0.1 mm without geometry feedback');

for (const fps of [30, 60, 120]) {
  reset(Math.PI - 0.02);
  const target = -Math.PI + 0.02;
  let previous = group.rotation.y;
  for (let i = 0; i < fps; i++) {
    character.update(1 / fps, 7, target);
    assert.ok(Math.abs(group.rotation.y - previous) < 0.04, 'Heading crossed the long arc');
    assert.ok(group.rotation.y >= previous, 'Short 0.04 rad positive turn reversed');
    previous = group.rotation.y;
  }
  near(angularDelta(group.rotation.y, target), 0, 1e-7);
  const origin = group.rotation.y;
  character.update(1 / fps, 7, origin + Math.PI / 2);
  assert.ok(group.rotation.y > origin && group.rotation.y < origin + Math.PI / 2, '90-degree input snapped instantly');
}
pass('Heading uses a smooth shortest arc across ±π and never snaps on ordinary turns');

reset(-1.5);
group.position.set(27, 2, -19);
const initial = sample();
near(initial.foot, 0); near(group.rotation.y, -1.5);
near(box.setFromObject(group, true).getSize(vec).y, BACON_HEIGHT);
character.update(0, 7, 1);
near(sample().hip.distanceTo(initial.hip), 0);
character.update(NaN, NaN, NaN);
assert.ok(group.matrixWorld.elements.every(Number.isFinite));
character.update(10, 7, 1);
assert.ok(group.matrixWorld.elements.every(Number.isFinite));
near(group.position.x, 27); near(group.position.y, 2); near(group.position.z, -19);
run.tracks.forEach((track, i) => assert.deepEqual(Array.from(track.values), originalTrackBytes[i]));
pass('Teleport reset preserves 3.5 m idle height, caller world position, pause safety and unmodified source tracks');

// Geometry is measured only during calibration. A render update must not run a
// 2,897-vertex Box3 ground-feedback pass or sample vertex deformation at all.
let mesh;
group.traverse(object => { if (object.isMesh) mesh = object; });
const originalGetVertex = mesh.getVertexPosition;
mesh.getVertexPosition = () => { throw new Error('Per-frame ground geometry scan returned'); };
for (let i = 0; i < 120; i++) character.update(1 / 60, 7, 0);
mesh.getVertexPosition = originalGetVertex;
pass('No per-frame skinned bounds or foot-vertex feedback in character.update');
character.dispose();
console.log('\nSteady running metrics (centimetres):');
for (const m of metrics) console.log(`${m.fps} fps: hip step ${(m.hipStep * 100).toFixed(3)}, pivot step ${(m.pivotStep * 100).toExponential(2)}, foot clearance ${(m.minFoot * 100).toFixed(3)}..${(m.maxFoot * 100).toFixed(3)}, root/limb pose error ${m.poseError.toExponential(2)} rad`);
console.log(`\n${checks} motion regression groups passed. Browser rendering was not run.`);
