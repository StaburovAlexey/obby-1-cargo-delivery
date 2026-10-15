#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { CHARACTER_CATALOG, loadCharacter } from '../dist/character.js';

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1024, height: 512, close() {} });
const SPEED = 8, GRAVITY = 22, DURATION = 2 * SPEED / GRAVITY;
const near = (a, b, tolerance = 1e-6, message = '') => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`);
const vector = new THREE.Vector3(), expected = new THREE.Quaternion();
const metrics = [];

for (const entry of CHARACTER_CATALOG) {
  const bytes = fs.readFileSync(entry.url);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${entry.id} source GLB changed`);
  const character = await loadCharacter(THREE, { id: entry.id,
    data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  const { group } = character, pivot = group.children[0], hips = group.getObjectByName('mixamorigHips');
  const nativeJump = character.animations.find(clip => clip.name === 'Jumping');
  const nativeIdle = character.animations.find(clip => /idle/i.test(clip.name));
  assert.ok(nativeJump && nativeJump.duration > 0.8);
  assert.ok(character.animations.every(clip => !/fall|sit/i.test(clip.name)), 'Do not fabricate or relabel a Fall/Sit clip');
  assert.equal(group.userData.character.jumpClip, 'Jumping');
  const originalTracks = nativeJump.tracks.map(track => Array.from(track.values));
  const root = nativeIdle.tracks.find(track => /Hips\.position$/.test(track.name));
  const rotationTracks = nativeJump.tracks.filter(track => /\.quaternion$/.test(track.name)).map(track => ({
    bone: group.getObjectByName(track.name.slice(0, -'.quaternion'.length)), interpolant: track.createInterpolant(),
  }));
  const soles = [], meshes = [];
  group.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    meshes.push(mesh);
    const vertices = [], positions = mesh.geometry.attributes.position;
    const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < positions.count; i++) {
      let footWeight = 0;
      for (let j = 0; j < 4; j++) if (/Foot|Toe/.test(mesh.skeleton.bones[indices.getComponent(i, j)].name)) footWeight += weights.getComponent(i, j);
      if (footWeight > 0.08) vertices.push(i);
    }
    soles.push({ mesh, vertices });
  });
  const sample = () => {
    group.updateMatrixWorld(true);
    let foot = Infinity;
    for (const { mesh, vertices } of soles) for (const index of vertices) {
      mesh.getVertexPosition(index, vector).applyMatrix4(mesh.matrixWorld);
      assert.ok(vector.toArray().every(Number.isFinite), `${entry.id} invalid skin`);
      foot = Math.min(foot, vector.y);
    }
    const hip = hips.getWorldPosition(vector).clone().sub(group.position);
    return { hip, foot, pivot: pivot.position.y };
  };
  let minFoot = Infinity, minAirFoot = Infinity, maxAirFoot = -Infinity, maxLocalHipStep = 0;
  let maxSupportStep = 0, poseError = 0, pureAirHipMin = Infinity, pureAirHipMax = -Infinity;
  const fpsValues = entry.id === 'bacon' ? [30, 60, 120] : [60];
  for (const fps of fpsValues) {
    const dt = 1 / fps;
    for (const speed of [0, 4.5, 7]) {
      character.resetMotion(); group.position.set(5, 0, -3);
      for (let i = 0; i < fps; i++) character.update(dt, speed, 0);
      let previous = sample();

      for (let repetition = 0; repetition < 3; repetition++) {
        character.setAirborne({ airborne: true, elapsed: 0, duration: DURATION, justJumped: true,
          height: 0, verticalVelocity: SPEED });
        character.update(0, speed, 0);
        near(sample().hip.distanceTo(previous.hip), 0, 1e-6, 'takeoff pose is continuous');
        near(sample().pivot, previous.pivot, 1e-8, 'takeoff support is continuous');
        for (let frame = 1; frame <= Math.ceil(DURATION * fps); frame++) {
          const elapsed = Math.min(DURATION, frame * dt);
          const height = Math.max(0, SPEED * elapsed - GRAVITY * elapsed * elapsed / 2);
          group.position.set(5 + repetition, height, -3 - elapsed * speed);
          const world = group.position.clone();
          character.setAirborne({ airborne: true, elapsed, duration: DURATION,
            height, verticalVelocity: SPEED - GRAVITY * elapsed });
          const frameSpeed = repetition === 1 && elapsed > .25 ? (speed > 0 ? 0 : 7) : speed;
          character.update(dt, frameSpeed, 0);
          assert.deepEqual(group.position.toArray(), world.toArray(), 'Character added world jump/root motion');
          const current = sample();
          minFoot = Math.min(minFoot, current.foot);
          maxLocalHipStep = Math.max(maxLocalHipStep, current.hip.distanceTo(previous.hip));
          maxSupportStep = Math.max(maxSupportStep, Math.abs(current.pivot - previous.pivot));
          if (elapsed > .15 && elapsed < DURATION - .15) {
            minAirFoot = Math.min(minAirFoot, current.foot); maxAirFoot = Math.max(maxAirFoot, current.foot);
          }
          if (elapsed >= .1 && character.jumpState.weight === 1) {

            for (const { bone, interpolant } of rotationTracks) {
              expected.fromArray(interpolant.evaluate(character.jumpState.time)).normalize();
              poseError = Math.max(poseError, expected.angleTo(bone.quaternion.clone().normalize()));
            }
            near(hips.position.x, root.values[0]); near(hips.position.y, root.values[1]); near(hips.position.z, root.values[2]);
            pureAirHipMin = Math.min(pureAirHipMin, current.hip.y); pureAirHipMax = Math.max(pureAirHipMax, current.hip.y);
          }
          previous = current;
        }

        near(character.jumpState.time, group.userData.character.motion.jumpSourceTouchdown);
        const impactPose = sample();
        character.setAirborne({ airborne: false, height: 0, verticalVelocity: 0 });
        character.update(0, repetition === 1 ? (speed > 0 ? 0 : 7) : speed, 0);
        near(sample().hip.distanceTo(impactPose.hip), 0, 1e-6, 'zero-dt landing does not snap the root');
        near(sample().pivot, impactPose.pivot, 1e-8, 'zero-dt landing does not snap support');
        group.position.y = 0;
        for (let i = 0; i < (repetition < 2 ? 1 : Math.ceil(fps * .7)); i++) {
          const postSpeed = repetition === 2 && i > fps * .15 ? 0 : speed;
          character.update(dt, postSpeed, 0);
          const current = sample(); minFoot = Math.min(minFoot, current.foot);
          maxLocalHipStep = Math.max(maxLocalHipStep, current.hip.distanceTo(previous.hip));
          maxSupportStep = Math.max(maxSupportStep, Math.abs(current.pivot - previous.pivot));
          previous = current;
        }
      }
      assert.equal(character.airborne, false);
      assert.equal(character.jumpState.weight, 0, 'Native jump never finishes its landing blend');
      assert.equal(character.seated, false); assert.equal(character.seatedWeight, 0);
    }
  }
  assert.ok(minFoot > -.001, `${entry.id} feet penetrate floor: ${minFoot}`);
  assert.ok(minAirFoot > .4 && maxAirFoot > 1.1, `${entry.id} no genuine airborne skin: ${minAirFoot}..${maxAirFoot}`);
  assert.ok(poseError < .0001, `${entry.id} native rotations changed: ${poseError}`);
  near(pureAirHipMax - pureAirHipMin, 0, 2e-6, `${entry.id} authored ballistic arc was applied twice`);
  assert.ok(maxLocalHipStep < .19, `${entry.id} local root teleport: ${maxLocalHipStep}`);
  assert.ok(maxSupportStep < .19, `${entry.id} support discontinuity: ${maxSupportStep}`);



  let maxRadius = 0, maxX = 0, maxZ = 0, groundedLandingRadius = 0;
  character.resetMotion(); group.position.set(0, 0, 0);
  for (const speed of [0, 4.5, 7]) {
    for (let i = 0; i < 60; i++) character.update(1 / 60, speed, 0);
    character.setAirborne({ airborne: true, elapsed: 0, duration: DURATION, justJumped: true });
    for (let frame = 0; frame <= 65; frame++) {
      const elapsed = frame / 60;
      character.setAirborne({ airborne: elapsed < DURATION, elapsed, duration: DURATION });
      character.update(1 / 60, speed, 0); group.updateMatrixWorld(true);
      for (const mesh of meshes) for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, vector).applyMatrix4(mesh.matrixWorld);
        assert.ok(vector.toArray().every(Number.isFinite));
        maxRadius = Math.max(maxRadius, Math.hypot(vector.x, vector.z));
        if (elapsed >= DURATION) groundedLandingRadius = Math.max(groundedLandingRadius, Math.hypot(vector.x, vector.z));
        maxX = Math.max(maxX, Math.abs(vector.x)); maxZ = Math.max(maxZ, Math.abs(vector.z));
      }
    }
  }
  assert.ok(maxRadius < (entry.id === 'jandel' ? 2.05 : 1.8), `${entry.id} expanded jump capsule too small: ${maxRadius}`);
  console.log(`FOOTPRINT ${entry.id}: radius ${maxRadius.toFixed(5)}, grounded landing ${groundedLandingRadius.toFixed(5)}, X ${maxX.toFixed(5)}, Z ${maxZ.toFixed(5)}`);

  character.resetMotion(); group.position.set(27, 3, -19);
  character.setAirborne({ airborne: true, elapsed: DURATION / 2, duration: DURATION });
  character.update(0, 0, 0);
  near(character.jumpState.time, group.userData.character.motion.jumpSourceApex);
  character.resetMotion(-1.2);
  assert.equal(character.airborne, false); assert.equal(character.jumpState.weight, 0);
  assert.deepEqual(group.position.toArray(), [27, 3, -19], 'Reset changes caller world position');
  near(sample().foot, 3, .0001);
  character.setSeated(true); for (let i = 0; i < 120; i++) character.update(1 / 60, 0, 0);
  assert.equal(character.setAirborne({ airborne: true, justJumped: true }), false, 'Seated jump accepted');
  character.update(1 / 60, 0, 0); assert.equal(character.jumpState.weight, 0);
  character.setSeated(false);
  character.setAirborne({ airborne: true, elapsed: 0, duration: DURATION });
  assert.equal(character.airborne, true, 'Standing does not unlock jumping');
  character.update(0, 0, 0);
  character.setAirborne({ airborne: true, elapsed: NaN, duration: NaN, height: NaN, verticalVelocity: NaN });
  character.update(NaN, NaN, NaN); character.update(10, 7, 0);
  assert.ok(group.matrixWorld.elements.every(Number.isFinite));

  const originalGetters = meshes.map(mesh => [mesh, mesh.getVertexPosition]);
  for (const mesh of meshes) mesh.getVertexPosition = () => { throw Error('Runtime jump geometry scan'); };
  for (let i = 0; i < 90; i++) {
    character.setAirborne({ airborne: i < 44, elapsed: i / 60, duration: DURATION });
    character.update(1 / 60, 7, 0);
  }
  for (const [mesh, getter] of originalGetters) mesh.getVertexPosition = getter;
  nativeJump.tracks.forEach((track, i) => assert.deepEqual(Array.from(track.values), originalTracks[i], 'Original Jumping data mutated'));
  character.dispose(); character.dispose(); character.update(1 / 60, 7, 0);
  assert.equal(character.setAirborne({ airborne: true }), false);
  const metric = { id: entry.id, minFoot, minAirFoot, maxAirFoot, maxLocalHipStep, maxSupportStep, poseError, maxRadius, maxX, maxZ, groundedLandingRadius };
  metrics.push(metric);
  console.log(`PASS ${entry.id}: native Jumping, real airborne skin, repeated landing/rejump, fixed root, seating/reset/disposal; min foot ${(minFoot * 1000).toFixed(3)} mm`);
}
console.log(JSON.stringify({ actualNativeModels: metrics.length, browserRun: false,
  peakPhysicsHeight: SPEED * SPEED / (2 * GRAVITY), duration: DURATION,
  maxLocalHipStep: Math.max(...metrics.map(m => m.maxLocalHipStep)),
  maxSupportStep: Math.max(...metrics.map(m => m.maxSupportStep)),
  minFoot: Math.min(...metrics.map(m => m.minFoot)),
  maxPoseError: Math.max(...metrics.map(m => m.poseError)) }, null, 2));
