#!/usr/bin/env node
// Actual packaged BMW tire vertices against production ground/bridge math.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { loadBMWVehicle } from '../dist/bmw-vehicle.js';
import { fitTruckToGround, groundHeight } from '../dist/city-driving.js';
import { routePointAtProgress } from '../dist/road-layout.js';
import { BRIDGES, bridgeSupport } from '../dist/road-bridges.js';

const originalFetch = globalThis.fetch;
globalThis.fetch = async url => new Response(fs.readFileSync(new URL(url)));
let adapter;
let poses = 0, minimum = Infinity, largestMinimum = -Infinity, centeredBridges = 0, edgeBridges = 0;
try {
  adapter = await loadBMWVehicle(THREE);
  const { metadata } = adapter;
  // Independent measurements, not a generic old procedural-truck envelope.
  const boxes = adapter.wheels.map(wheel => new THREE.Box3().setFromObject(wheel.node, true));
  const measuredHalfWidth = Math.max(...boxes.map(box => Math.max(Math.abs(box.min.x), Math.abs(box.max.x))));
  assert.ok(Math.abs(measuredHalfWidth - 1.578429980785126) < 1e-6);
  assert.ok(measuredHalfWidth < metadata.bodyHalfWidth);
  for (const q of [40, 290, 830, 1500, 2800, 3900, 6300, 9400, 11200, 14800])
    for (const reverse of [0, Math.PI]) for (const yaw of [-.12, 0, .12]) {
      const road = routePointAtProgress(q);
      const pose = fitTruckToGround(THREE, road.x, road.z, road.heading + reverse + yaw, road, metadata);
      assert.ok(pose.clearances.every(v => v >= .011999));
      let low = Infinity;
      for (const wheel of metadata.wheelContacts) for (const point of wheel.vertices) {
        const v = new THREE.Vector3(...point).add(new THREE.Vector3(...wheel.center))
          .applyQuaternion(pose.quaternion).add(pose.position);
        const clearance = v.y - groundHeight(v.x, v.z, road);
        minimum = Math.min(minimum, clearance); low = Math.min(low, clearance);
      }
      assert.ok(low >= -.008, `BMW q${q} clips ground: ${low}`);
      assert.ok(low < .09, `BMW q${q} floats: ${low}`);
      largestMinimum = Math.max(largestMinimum, low); poses++;
    }
  for (const bridge of BRIDGES) for (const reverse of [0, Math.PI]) {
    const road = routePointAtProgress((bridge.from + bridge.to) / 2);
    const at = offset => ({ x: road.x + road.right.x * (bridge.offset + offset),
      z: road.z + road.right.z * (bridge.offset + offset), heading: road.heading + reverse,
      frontWheelAngle: 0, wheelSpin: 0 });
    assert.equal(bridgeSupport(at(0), road, metadata).fall, false, `BMW centered on ${bridge.id}`);
    centeredBridges++;
    for (const side of [-1, 1]) for (const delta of [-.04, .04]) {
      const offset = side * (bridge.halfWidth - measuredHalfWidth + delta);
      assert.equal(bridgeSupport(at(offset), road, metadata).fall, delta > 0,
        `BMW ${bridge.id} measured tire edge threshold ${offset}`);
      edgeBridges++;
    }
  }
} finally { adapter?.dispose(); globalThis.fetch = originalFetch; }
console.log(JSON.stringify({ passed: true, poses, centeredBridges, edgeBridges,
  minimumClearance: minimum, largestLowestTireClearance: largestMinimum,
  scope: 'Actual BMW GLB tire vertices, production ground fit and bridge support; no GPU claim' }));
