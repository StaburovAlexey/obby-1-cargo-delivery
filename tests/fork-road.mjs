#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { buildCity } from '../dist/scene.js';
import * as layout from '../dist/road-layout.js';
import { groundHeight, fitTruckToGround, getTruckContact, collectObstacles, overlapsTruck, projectRoad } from '../dist/city-driving.js';
import { createDrivingModel, moveWithContacts, TOW_DRIVING } from '../dist/driving-model.js';
import { createVehicleRig } from '../dist/vehicle-rig.js';
import { createAppDom } from './fixtures/app-dom.mjs';
import { FOLLOW_CAMERA, computeFollowOffset } from '../dist/follow-camera.js';

const report = { generatedAt: new Date().toISOString(), baselineCommit: '4d3283d6d1242b82addf1bd7f1231c30d2b3d38f', checks: [], limitations: 'Node execution with real Three.js geometry, ray intersections and camera math; renderer and DOM are mocked. No browser, WebGL, physical multitouch, Android or FPS validation.' };
function check(name, fn) {
  if (process.env.TEST_FILTER && !new RegExp(process.env.TEST_FILTER, 'i').test(name)) return;
  try { const details = fn(); report.checks.push({ name, status: 'passed', details }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, status: 'failed', error: error.stack || String(error) }); console.error(`FAIL ${name}: ${error.message}`); }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const oldCenter = y => 4.2 * Math.sin(Math.PI * smooth((y + 3) / 88));
const junctionX = oldCenter(74);

const spread = y => y <= 74 ? 0 : y <= 156 ? 40 * smooth((y-74)/82) : y <= 250 ? 40 : y <= 330 ? 40*(1-smooth((y-250)/80)) : y <= 350 ? 0 : y <= 435 ? 54*smooth((y-350)/85) : y <= 505 ? 54 : y <= 590 ? 54*(1-smooth((y-505)/85)) : 0;
const center = (id, y) => y <= 74 ? oldCenter(y) : junctionX + (id === 'main' ? 0 : id === 'left' ? -spread(y) : spread(y));
const height = (id, y) => y <= 74 ? 11*smooth((y-13)/61) : y <= 170 ? id === 'left' ? 11*(1-smooth((y-122)/34)) : 11 : y < 265 ? (id === 'left' ? 0 : 11)+(id === 'left' ? 5 : -6)*smooth((y-170)/95) : id === 'left' && y > 390 && y < 535 ? 5+13*(smooth((y-390)/45)-smooth((y-470)/65)) : 5;
function spans(y) {
  if (y < -23 || y > 620) return [];
  if (y <= 74) return [{ min: oldCenter(y) - 15, max: oldCenter(y) + 15 }];
  const left = { min: center('left', y) - 15, max: center('left', y) + 15 }, right = { min: center('right', y) - 15, max: center('right', y) + 15 };
  return left.max >= right.min ? [{ min: left.min, max: right.max }] : [left, right];
}
function pointInRoad(x, z, tolerance = 2e-5) {
  const y = -z;
  if (y < -23 - tolerance || y > 620 + tolerance) return false;
  return spans(clamp(y, -23, 620)).some(s => x >= s.min - tolerance && x <= s.max + tolerance);
}
function bodyPoint(x, z, heading, dx, dz) {
  return { x: x + Math.cos(heading) * dx + Math.sin(heading) * dz, z: z - Math.sin(heading) * dx + Math.cos(heading) * dz };
}
function assertBodyInRoad(s, label, dense = false) {
  const count = dense ? 124 : 24;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    for (const [dx, dz] of [[-2.9 + 5.8 * t, -3.6], [-2.9 + 5.8 * t, 3.6], [-2.9, -3.6 + 7.2 * t], [2.9, -3.6 + 7.2 * t]]) {
      const p = bodyPoint(s.x, s.z, s.heading, dx, dz);
      assert.ok(pointInRoad(p.x, p.z), `${label}: body edge leaves road at ${JSON.stringify(p)}, pose ${JSON.stringify(s)}`);
    }
  }

  for (const dx of [-.8, 0, .8]) for (const dz of [-2, -1, 0, 1, 2]) {
    const p = bodyPoint(s.x, s.z, s.heading, dx, dz);
    assert.ok(pointInRoad(p.x, p.z), `${label}: body interior crosses median`);
  }
}
function near(a, b, epsilon = 1e-9, label = 'value') { assert.ok(Number.isFinite(a) && Math.abs(a - b) <= epsilon, `${label}: ${a} versus ${b}`); }
function headingAt(id, y) { return -Math.atan((center(id, y + .01) - center(id, y - .01)) / .02); }
const city = buildCity(THREE, { seed: 42 });
const obstacles = collectObstacles(THREE, city);

check('Requested fork dimensions and independent horizontal road-union oracle agree', () => {
  for (const [key, value] of Object.entries({ start: -23, fork: 74, end: 620, cityEnd: 156, halfWidth: 15, descentStart: 122 })) near(layout.ROUTE[key], value, 0, key);
  let samples = 0;
  for (let y = -24; y <= 621; y += .0625) {
    const actual = layout.roadIntervals(y), expected = spans(y);
    assert.equal(actual.length, expected.length, `Union span count at ${y}`);
    for (let i = 0; i < actual.length; i++) { near(actual[i].min, expected[i].min, 1e-9); near(actual[i].max, expected[i].max, 1e-9); }
    samples++;
  }
  for (const id of ['left', 'right']) for (let y = 74; y <= 620; y += .125) {
    near(layout.branchCenter(id, y), center(id, y), 1e-9);
    near(layout.branchHeight(id, y), height(id, y), 1e-9);
  }
  near(layout.branchHeight('left', 156), 0); near(layout.branchHeight('right', 156), 11);
  return { unionSamples: samples, uphillRise: 11, forkAt: 74, downhillStarts: 122, branchEnd: 620, branchEndpointSeparation: 80, roadWidth: 30 };
});

check('Road, kerb, pavement and terrain share one continuous height field at every wheel', () => {
  let samples = 0, maxEpsilonStep = 0, maxFitStep = 0;
  for (const id of ['main', 'left', 'right']) {
    const lo = id === 'main' ? -20 : 74, hi = id === 'main' ? 74 : 620;
    for (let y = lo; y <= hi; y += .5) {
      const cx = center(id, y);
      near(groundHeight(cx, -y), height(id, y) + layout.ROAD_SURFACE_OFFSET, 1e-9, `${id} road-center elevation`);
      for (const offset of [-18.01, -18, -15.31, -15.15, -15.01, -15, -14.99, 0, 14.99, 15, 15.01, 15.15, 15.31, 18, 18.01]) {
        const x = cx + offset;
        near(groundHeight(x, -y), layout.surfaceHeight(x, y) + layout.ROAD_SURFACE_OFFSET, 1e-10);
        for (const [dx, dz] of [[1e-5, 0], [0, 1e-5]]) {
          const jump = Math.abs(groundHeight(x + dx, -y + dz) - groundHeight(x - dx, -y - dz));
          maxEpsilonStep = Math.max(maxEpsilonStep, jump);
          assert.ok(jump < .0001, `${id} height discontinuity at y=${y}, offset=${offset}: ${jump}`);
        }
        for (const heading of [headingAt(id, y), Math.PI / 4, Math.PI / 2, Math.PI]) {
          const a = fitTruckToGround(THREE, x - .001, -y, heading), b = fitTruckToGround(THREE, x + .001, -y, heading);
          assert.ok([...a.position, ...a.quaternion, ...a.normal, ...a.clearances].every(Number.isFinite));
          assert.ok(Math.min(...a.clearances) >= -1e-10);
          const step = Math.abs(a.position.y - b.position.y); maxFitStep = Math.max(maxFitStep, step);
          assert.ok(step < .005, `Wheel support jumps ${step} m while crossing old curb`);
          assert.ok(a.quaternion.angleTo(b.quaternion) < .005, 'Wheel frame snaps across old curb');
          samples++;
        }
      }
    }
  }
  return { fourWheelPoses: samples, maxEpsilonHeightStep: maxEpsilonStep, maxTwoMillimetrePoseHeightStep: maxFitStep };
});

check('Fork, downhill entry and branch ends have continuous elevation and ground normals', () => {
  const details = [];
  for (const id of ['left', 'right']) for (const y of [74, 122, 156, 170, 250, 265, 330, 350, 390, 435, 470, 505, 535, 590, 620]) {
    const a = fitTruckToGround(THREE, center(id, y - .001), -y + .001, headingAt(id, y - .001));
    const b = fitTruckToGround(THREE, center(id, y + .001), -y - .001, headingAt(id, y + .001));
    assert.ok(Math.abs(a.position.y - b.position.y) < .002);


    const angle = a.normal.angleTo(b.normal); assert.ok(angle < .003, `${id} normal snaps at ${y}: ${angle}`);
    details.push({ branch: id, station: y, verticalStep: Math.abs(a.position.y - b.position.y), normalAngle: angle });
  }
  return details;
});


function convexHull(points) {
  const unique = [...new Map(points.map(p => [`${p.x.toFixed(7)},${p.y.toFixed(7)}`, p])).values()].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x), lower = [], upper = [];
  for (const p of unique) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of unique.slice().reverse()) { while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function geometryWitnesses(world) {
  const parts = []; world.group.updateMatrixWorld(true);
  world.group.traverse(mesh => {
    if (!mesh.isInstancedMesh || mesh.parent?.name === 'Orange delivery truck') return;
    for (let i = 0; i < mesh.count; i++) {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld);
      const vertices = Array.from({ length: mesh.geometry.attributes.position.count }, (_, j) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, j).applyMatrix4(matrix));
      const polygon = convexHull(vertices.map(v => ({ x: v.x, y: -v.z })));
      parts.push({ name: mesh.userData.partNames[i], polygon, minY: Math.min(...polygon.map(p => p.y)), maxY: Math.max(...polygon.map(p => p.y)), bottom: Math.min(...vertices.map(p => p.y)), top: Math.max(...vertices.map(p => p.y)), mesh });
    }
  });
  return parts;
}
function polygonSlice(polygon, y) {
  const xs = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (y < Math.min(a.y, b.y) - 1e-7 || y > Math.max(a.y, b.y) + 1e-7) continue;
    if (Math.abs(a.y - b.y) < 1e-9) xs.push(a.x, b.x);
    else xs.push(a.x + (b.x - a.x) * clamp((y - a.y) / (b.y - a.y), 0, 1));
  }
  return xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : undefined;
}
const renderedParts = geometryWitnesses(city);

check('Only homes, broad biome masses and the truck remain, with no rendered road intrusion', () => {
  assert.ok(renderedParts.filter(o => /^Residence \d+$/.test(o.name)).length >= 60);
  assert.deepEqual([...new Set(renderedParts.filter(o => !/^Residence \d+$|^Distant tower$|^Terrace plinth$|^Biome barrier /.test(o.name)).map(o => o.name))], [], 'Small roadside props or service detail remain');
  let samples = 0, minimumGap = Infinity;
  for (const o of renderedParts) {
    const start = Math.max(-23, o.minY), end = Math.min(620, o.maxY), steps = Math.max(1, Math.ceil((end - start) / .025));
    if (end < start) continue;
    for (let i = 0; i <= steps; i++) {
      const y = start + (end - start) * i / steps, slice = polygonSlice(o.polygon, y); if (!slice) continue;
      for (const span of spans(y)) {
        const gap = Math.max(span.min - slice.max, slice.min - span.max); minimumGap = Math.min(minimumGap, gap);
        assert.ok(gap >= -.00002, `${o.name} rendered footprint overlaps road by ${-gap}m at ${y}`);
      }
      samples++;
    }
  }
  assert.equal(city.stats.roadsideProps, 0);
  return { actualRenderedParts: renderedParts.length, obstacleColliders: obstacles.length, polygonSliceChecks: samples, minimumRoadClearance: minimumGap, colliderFilteringNotUsedForWitnesses: true };
});

check('Visible building rows line every main and fork edge without a truck-sized escape gap', () => {
  const homes = renderedParts.filter(o => /^Residence \d+$/.test(o.name)), records = new Map();
  let samples = 0, maximumSetback = 0, maximumUnshieldedRun = 0, minimumWallHeight = Infinity;
  for (let y = -22.9375; y < 156; y += .125) {
    const roads = spans(y), slices = homes.filter(o => y >= o.minY && y <= o.maxY).map(o => ({ ...polygonSlice(o.polygon, y), home: o }));
    for (let r = 0; r < roads.length; r++) for (const side of [-1, 1]) {
      const edge = side < 0 ? roads[r].min : roads[r].max, inner = roads.length === 2 && (r === 0 && side === 1 || r === 1 && side === -1);
      const key = inner ? `inner-${side}` : `outer-${side}`, record = records.get(key) || { samples: 0, misses: 0, run: 0, maxRun: 0, maxSetback: 0 };

      if (inner && roads[1].min - roads[0].max < .25) continue;
      const candidates = slices.filter(o => side < 0 ? o.max <= edge + .00002 : o.min >= edge - .00002).map(o => ({ ...o, gap: side < 0 ? edge - o.max : o.min - edge })).sort((a, b) => a.gap - b.gap);
      const nearest = candidates[0], shielded = nearest && nearest.gap <= 1.25;
      if (shielded) {
        record.run = 0; maximumSetback = Math.max(maximumSetback, nearest.gap); record.maxSetback = Math.max(record.maxSetback, nearest.gap);
        const h = layout.surfaceHeight(edge, y); minimumWallHeight = Math.min(minimumWallHeight, nearest.home.top - h);
        assert.ok(nearest.home.bottom <= h + .15, `${nearest.home.name} leaves an open space beneath the wall at ${y}`);
        const minimumHeight = inner && roads[1].min - roads[0].max < 3 ? .75 : 5;
        assert.ok(nearest.home.top >= h + minimumHeight, `${nearest.home.name} is too low to bound the ${inner ? 'median' : 'outer'} edge at ${y}`);
      } else { record.run += .125; record.maxRun = Math.max(record.maxRun, record.run); record.misses++; maximumUnshieldedRun = Math.max(maximumUnshieldedRun, record.run); }
      record.samples++; records.set(key, record); samples++;
    }
  }
  for (const [key, record] of records) {
    assert.ok(record.maxRun < .75, `${key} has an unshielded building-row gap of at least ${record.maxRun}m`);
    assert.ok(record.misses / record.samples < .015, `${key} buildings missing from ${record.misses}/${record.samples} road-edge samples`);
  }
  assert.equal(records.size, 4, 'Missing an outer or median-side fork building row');
  return { buildingBodies: homes.length, samples, maximumSetback, maximumUnshieldedRun, minimumWallHeight, rows: Object.fromEntries(records) };
});

check('Actual road triangles match the requested union and never overlap across the fork', () => {
  const road = city.group.getObjectByName('Continuous 30m-wide road'), p = road.geometry.attributes.position, indices = road.geometry.index.array;
  const triangles = [], hashes = new Set();
  for (let i = 0; i < indices.length; i += 3) {
    const vertices = [indices[i], indices[i + 1], indices[i + 2]].map(j => ({ x: p.getX(j), y: -p.getZ(j) }));
    const hash = vertices.map(v => `${v.x},${v.y}`).sort().join('|'); assert.ok(!hashes.has(hash), 'Duplicate road triangle'); hashes.add(hash);
    triangles.push({ vertices, min: Math.min(...vertices.map(v => v.y)), max: Math.max(...vertices.map(v => v.y)) });
  }
  let slices = 0, maxBoundaryError = 0, maxOverlappedLength = 0;
  for (let y = -22.875; y < 620; y += .25) {
    const pieces = [];
    for (const { vertices, min, max } of triangles) {
      if (y <= min || y >= max) continue;
      const xs = [];
      for (let i = 0; i < 3; i++) {
        const a = vertices[i], b = vertices[(i + 1) % 3];
        if (y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y) || Math.abs(a.y - b.y) < 1e-12) continue;
        xs.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
      }
      if (xs.length >= 2) pieces.push({ min: Math.min(...xs), max: Math.max(...xs) });
    }
    pieces.sort((a, b) => a.min - b.min); const union = [];
    for (const span of pieces) {
      const previous = union.at(-1);
      if (previous && span.min <= previous.max + 1e-6) previous.max = Math.max(previous.max, span.max);
      else union.push({ ...span });
    }
    const expected = spans(y); assert.equal(union.length, expected.length, `Rendered branch count at ${y}`);
    for (let i = 0; i < union.length; i++) for (const edge of ['min', 'max']) {
      const error = Math.abs(union[i][edge] - expected[i][edge]); maxBoundaryError = Math.max(maxBoundaryError, error); assert.ok(error < .0015, `Road edge mesh deviates ${error}m at ${y}`);
    }
    const overlap = pieces.reduce((n, s) => n + s.max - s.min, 0) - union.reduce((n, s) => n + s.max - s.min, 0);
    maxOverlappedLength = Math.max(maxOverlappedLength, overlap); assert.ok(Math.abs(overlap) < 1e-5, `Fork road triangles overlap by ${overlap}m at ${y}`); slices++;
  }
  return { triangles: triangles.length, slices, maxBoundaryError, maxOverlappedLength };
});

function assertAnimatedVerticesInRoad(rig, pose, state, label) {
  rig.update({ position: pose.position, quaternion: pose.quaternion, steerAngle: state.frontWheelAngle, wheelSpin: state.wheelSpin, bodyPitch: -state.bodyPitch, bodyRoll: -state.bodyRoll, bodyBob: state.bodyBob });
  let vertices = 0;
  rig.root.traverse(mesh => {
    if (!mesh.isInstancedMesh) return;
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < mesh.count; i++) {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld);
      for (let j = 0; j < p.count; j++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, j).applyMatrix4(matrix);
        assert.ok(pointInRoad(v.x, v.z, .00003), `${label}: actual ${mesh.userData.partNames[i]} vertex leaves road at ${JSON.stringify(v)}, pose ${JSON.stringify(state)}`); vertices++;
      }
    }
  });
  return vertices;
}

check('High-speed diagonal approaches preserve whole-body containment and slide along the road edge', () => {
  const details = [];
  for (const side of [-1, 1]) for (const direction of [-1, 1]) {
    const position = { x: side * 10.7, z: 10 }, rotation = { y: -side * .25 + (direction === -1 ? Math.PI : 0) };
    assertBodyInRoad({ ...position, heading: rotation.y }, 'initial diagonal', true);
    const before = { ...position };
    const blocked = moveWithContacts(position, rotation, direction * 10, 0, 3.3, () => getTruckContact(position.x, position.z, rotation.y, obstacles));
    assert.equal(blocked, true); assertBodyInRoad({ ...position, heading: rotation.y }, 'diagonal impact', true);
    assert.ok(before.z - position.z > 7, 'Road-edge contact froze the tangential component');
    details.push({ side, direction, progress: before.z - position.z, x: position.x });
  }
  return details;
});

check('Straight-on median entry blocks without arbitrary branch teleportation', () => {
  const position = { x: junctionX, z: -98 }, rotation = { y: 0 };
  assertBodyInRoad({ ...position, heading: rotation.y }, 'median approach', true);
  const blocked = moveWithContacts(position, rotation, 28, 0, 3.3, () => getTruckContact(position.x, position.z, rotation.y, []));
  assert.equal(blocked, true); assertBodyInRoad({ ...position, heading: rotation.y }, 'median stop', true);
  near(position.x, junctionX, .02, 'Centered vehicle silently chose a branch');
  assert.ok(-position.z > 98 && -position.z < 115);
  return { stopStation: -position.z, lateralCorrection: position.x - junctionX };
});

function steeringForTarget(s, tx, ty) {
  const dx = tx - s.x, dz = -ty - s.z, right = dx * Math.cos(s.heading) - dz * Math.sin(s.heading);
  const wheel = clamp(-Math.atan2(2 * TOW_DRIVING.wheelbase * right, dx * dx + dz * dz), -.48, .48);
  const magnitude = (-.55 + Math.sqrt(.55 * .55 + 1.8 * Math.abs(wheel) / .48)) / .9;
  return -Math.sign(wheel) * (.08 + .92 * magnitude);
}
check('D and R can choose either fork and return through the junction without projection snaps', () => {
  const runs = [];
  for (const id of ['left', 'right']) for (const outboundGear of ['D', 'R']) {
    const heading = headingAt('main', 55) + (outboundGear === 'R' ? Math.PI : 0);
    const model = createDrivingModel({ x: center('main', 55), z: -55, heading, contact: (x, z, h) => getTruckContact(x, z, h, obstacles) });
    model.setGear(outboundGear); let phase = 'out', frames = 0, maxStep = 0, maxHeightStep = 0, branchExtent = 0, lastPose = fitTruckToGround(THREE, model.state.x, model.state.z, heading);
    while (frames++ < 5000) {
      const s = model.state, y = -s.z;
      if (phase === 'out' && y > 143) { phase = 'return'; model.setGear(outboundGear === 'D' ? 'R' : 'D'); }
      if (phase === 'return' && y < 56) break;

      const outward = phase === 'out' || Math.sign(s.speed) === (outboundGear === 'D' ? 1 : -1);
      const targetY = clamp(y + (outward ? 5.5 : -5.5), -20, 153);
      model.setInput({ active: true, steering: steeringForTarget(s, center(id, targetY), targetY) });
      const old = { ...s }; model.step(1 / 60); assertBodyInRoad(s, `${id} ${outboundGear} frame ${frames}`);
      assert.equal(getTruckContact(s.x, s.z, s.heading, obstacles), undefined, 'Residual contact after source solver');
      const step = Math.hypot(s.x - old.x, s.z - old.z); maxStep = Math.max(maxStep, step); assert.ok(step <= .20, `Branch projection teleports ${step} m`);
      const pose = fitTruckToGround(THREE, s.x, s.z, s.heading), heightStep = Math.abs(pose.position.y - lastPose.position.y); maxHeightStep = Math.max(maxHeightStep, heightStep); assert.ok(heightStep < .10, `Height snaps ${heightStep} m`); lastPose = pose;
      branchExtent = Math.max(branchExtent, Math.abs(s.x - junctionX));
    }
    assert.ok(frames < 5000, `${id}/${outboundGear} failed to return through junction; pose ${JSON.stringify(model.state)}`);
    assert.ok(branchExtent > 33, 'Truck did not actually reach the selected branch');
    runs.push({ branch: id, outboundGear, frames, maxStep, maxHeightStep, branchExtent, returnedStation: -model.state.z });
  }
  return runs;
});

check('Thirty-metre avenue permits complete D and R turning circles in both steering directions', () => {
  const runs = [], radius = 3.2 / Math.tan(.48);
  for (const gear of ['D', 'R']) for (const steering of [-1, 1]) {
    const model = createDrivingModel({ x: -steering * radius, z: 0, heading: 0, contact: (x, z, h) => getTruckContact(x, z, h, obstacles) });
    model.setGear(gear); model.setInput({ active: true, steering });
    model.state.frontWheelAngle = -steering * .48; model.state.speed = gear === 'D' ? 9.02 : -9.02;
    let frames = 0, maximumRadiusError = 0;
    while (Math.abs(model.state.heading) < Math.PI * 2 && frames++ < 1000) {
      const state = model.step(1 / 120); assertBodyInRoad(state, `${gear} ${steering} turnaround`, true);
      assert.equal(state.blocked, false, 'Wider road must permit the full source turning circle');
      assert.equal(getTruckContact(state.x, state.z, state.heading, obstacles), undefined);
      maximumRadiusError = Math.max(maximumRadiusError, Math.abs(Math.hypot(state.x, state.z) - radius));
    }
    assert.ok(frames < 1000); assert.ok(maximumRadiusError < .04);
    runs.push({ gear, steering, frames, sourceTurningRadius: radius, maximumRadiusError, totalRotation: model.state.heading });
  }
  return runs;
});

check('Seeded random contacts on legal main/fork poses cannot tunnel, teleport or overlap props', () => {
  let randomState = 88743; const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
  let frames = 0, contacts = 0, maxStep = 0, maxHeightStep = 0, actualAnimatedVertices = 0;
  for (const seed of [1, 17, 42, 2026]) {
    const world = buildCity(THREE, { seed }), objects = collectObstacles(THREE, world), rig = createVehicleRig(THREE, world);
    try {
      for (let episode = 0; episode < 36; episode++) {
        const id = ['main', 'left', 'right'][episode % 3]; let x, y, heading, attempts = 0;
        do { y = id === 'main' ? -16 + random() * 84 : 83 + random() * 527; x = center(id, y); heading = headingAt(id, y) + (random() > .5 ? Math.PI : 0) + (random() - .5) * .6; assert.ok(attempts++ < 100, 'Could not select a legal fork spawn'); } while (getTruckContact(x, -y, heading, objects));
        const model = createDrivingModel({ x, z: -y, heading, contact: (x, z, h) => getTruckContact(x, z, h, objects) });
        model.state.speed = 11; let lastPose = fitTruckToGround(THREE, x, -y, heading);
        for (let i = 0; i < 300; i++) {
          if (i % 31 === 0) { model.setInput({ active: random() > .12, steering: random() * 2 - 1 }); if (random() < .3) model.setGear(model.state.gear === 'D' ? 'R' : 'D'); }
          const old = { ...model.state }, s = model.step(.05);
          assertBodyInRoad(s, `seed ${seed} episode ${episode} frame ${i}`, i % 20 === 0);
          assert.equal(getTruckContact(s.x, s.z, s.heading, objects), undefined, 'Residual penetration');
          assert.ok(!objects.some(o => overlapsTruck(s.x, s.z, s.heading, o)), 'Prop overlap');
          const step = Math.hypot(s.x - old.x, s.z - old.z); maxStep = Math.max(maxStep, step); assert.ok(step < .63, `Projection teleport ${step}`);
          const pose = fitTruckToGround(THREE, s.x, s.z, s.heading), dh = Math.abs(pose.position.y - lastPose.position.y); maxHeightStep = Math.max(maxHeightStep, dh); assert.ok(dh < .32, `Pose jumps ${dh}`); lastPose = pose;
          if (i % 10 === 0 || s.blocked && i % 3 === 0) actualAnimatedVertices += assertAnimatedVerticesInRoad(rig, pose, s, `seed ${seed}, episode ${episode}, frame ${i}`);
          assert.ok(Object.values(s).filter(v => typeof v === 'number').every(Number.isFinite));
          frames++; if (s.blocked) contacts++;
        }
      }
    } finally { rig.dispose(); world.dispose(); }
  }
  return { frames, contacts, maxStep, maxIndividualFrameHeightStep: maxHeightStep, actualAnimatedVertices, roadFootprintHalfWidth: 2.9, roadFootprintHalfLength: 3.6, randomSeed: 88743 };
});

check('Actual application camera math remains continuous across curb coordinates and both branches', () => {
  const app = createAppDom(); let maxVerticalStep = 0, maxPositionStep = 0, frames = 0;
  try {
    let time = 1000; app.frame(time);
    for (const id of ['left', 'right']) for (const orientation of [0, Math.PI]) {
      const state = app.debug.model.state;
      for (let y = 60; y <= 614; y += .2) {
        state.x = center(id, y); state.z = -y; state.heading = headingAt(id, y) + orientation; state.speed = 0; state.active = false;
        if (y === 60) for (let i = 0; i < 100; i++) app.frame(time += 1000 / 60);
        const previous = app.debug.camera.position.clone(); app.frame(time += 1000 / 60);
        const dy = Math.abs(app.debug.camera.position.y - previous.y), distance = app.debug.camera.position.distanceTo(previous);
        maxVerticalStep = Math.max(maxVerticalStep, dy); maxPositionStep = Math.max(maxPositionStep, distance);
        assert.ok(dy < .15, `${id} follow camera vertical discontinuity ${dy}`); assert.ok(distance < .75, `${id} heading offset ${orientation} raised follow camera jumps ${distance} at station ${y}`);
        assert.ok([...app.debug.camera.position, ...app.debug.camera.quaternion].every(Number.isFinite)); frames++;
      }
    }
  } finally { app.dispose(); }
  return { frames, maxVerticalStep, maxPositionStep, renderer: 'mocked', math: 'actual bundled Three.js and app.js' };
});

check('Fixed-radius third-person orbit frames the truck without geometry-dependent zoom or terrain pushes', () => {
  const results = [];
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1024, 768]]) {
    const app = createAppDom({ width, height }); let time = 1000;
    try {
      app.frame(time); const { model, rig, camera, city: world } = app.debug, houseMeshes = [];
      world.group.traverse(mesh => { if (mesh.isInstancedMesh && mesh.parent?.name !== 'Orange delivery truck') houseMeshes.push(mesh); });
      const scale=width/height<.8?1.2:1;
      const ray = new THREE.Raycaster(), result = { width, height, poses: 0, sightlines: 0, occludedSightlines: 0, vertices: 0, maximumNdcX: 0, maximumNdcY: 0, minimumElevation: Infinity, minimumTerrainClearance: Infinity, maximumRadiusError: 0 };
      for (const id of ['main', 'left', 'right']) for (const y of id === 'main' ? [0, 43, 70] : [115, 150, 180, 225, 285, 330, 379, 435, 465, 535, 560, 610]) for (const offset of [-10, 0, 10]) for (const heading of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
        const x = center(id, y); if (getTruckContact(x + offset, -y, heading, [])) continue;
        Object.assign(model.state, { x: x + offset, z: -y, heading, speed: 0, active: false });app.debug.applyTruckPose();app.debug.followTruck(1,true);
        for (let i = 0; i < 120; i++) app.frame(time += 1000 / 60);
        camera.updateMatrixWorld(true); rig.root.updateMatrixWorld(true);
        const elevation = camera.position.y - rig.root.position.y, terrainClearance = camera.position.y - groundHeight(camera.position.x, camera.position.z);
        result.minimumElevation = Math.min(result.minimumElevation, elevation); result.minimumTerrainClearance = Math.min(result.minimumTerrainClearance, terrainClearance);
        const anchor=rig.root.position.clone().add(new THREE.Vector3(0,1.7,0));
        const expected=computeFollowOffset(app.debug.cameraState.state,new THREE.Vector3()).multiplyScalar(scale);
        const actual=camera.position.clone().sub(anchor);
        near(elevation,1.7+8.3*scale,1e-8,'Unrequested geometry-dependent camera height');
        near(actual.distanceTo(expected),0,1e-8,'Fixed orbit offset');
        const radiusError=Math.abs(actual.length()-FOLLOW_CAMERA.driving.radius*scale);
        result.maximumRadiusError=Math.max(result.maximumRadiusError,radiusError);
        assert.ok(radiusError<1e-8,'Camera radius changed near an obstacle');
        const centered=anchor.clone().project(camera);
        assert.ok(Math.abs(centered.x)<1e-8&&Math.abs(centered.y)<1e-8,'Camera anchor is not centred');
        const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading)), behind = camera.position.clone().sub(rig.root.position).dot(forward);
        assert.ok(behind < -.05, 'Third-person camera must remain behind the vehicle');


        for (const local of [[0, 1.8, 0], [0, 2.5, -1.5], [0, 1.7, 1.5]]) {
          const target = new THREE.Vector3(...local).applyQuaternion(rig.root.quaternion).add(rig.root.position), direction = target.clone().sub(camera.position);
          ray.set(camera.position, direction.clone().normalize()); ray.far = direction.length() - .02;
          const hits = ray.intersectObjects(houseMeshes, false);
          if(hits.length)result.occludedSightlines++;
          result.sightlines++;
        }
        rig.root.traverse(mesh => {
          if (!mesh.isInstancedMesh) return;
          const positions = mesh.geometry.attributes.position;
          for (let i = 0; i < mesh.count; i++) {
            const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld);
            for (let j = 0; j < positions.count; j++) {
              const v = new THREE.Vector3().fromBufferAttribute(positions, j).applyMatrix4(matrix).project(camera);
              assert.ok([v.x, v.y, v.z].every(Number.isFinite));
              assert.ok(Math.abs(v.x) < .9 && Math.abs(v.y) < .9 && v.z > -1 && v.z < 1, `${width}x${height} actual truck vertex clipped by raised camera`);
              result.maximumNdcX = Math.max(result.maximumNdcX, Math.abs(v.x)); result.maximumNdcY = Math.max(result.maximumNdcY, Math.abs(v.y)); result.vertices++;
            }
          }
        });
        result.poses++;
      }
      assert.ok(result.poses >= 200, `Only ${result.poses} collision-free camera poses tested`); results.push(result);
    } finally { app.dispose(); }
  }
  assert.ok(results.some(result=>result.occludedSightlines>0),'Expected obstructed poses were incorrectly protected');
  assert.ok(results.some(result=>result.minimumTerrainClearance<7.9),'Old terrain-clearance push still appears to be active');
  return results;
});

check('Five connected physical biomes form two real fork/rejoin loops', () => {
  assert.deepEqual(city.biomes.map(b => b.id), ['city','forest','desert','snow','volcanic']);
  assert.equal(city.network.nodes.length, 6); assert.equal(city.network.edges.length, 7);
  const nodes = new Map(city.network.nodes.map(n => [n.id,n])), adjacency = new Map([...nodes.keys()].map(id => [id,new Set()]));
  for (const edge of city.network.edges) {
    assert.ok(nodes.has(edge.from) && nodes.has(edge.to));
    adjacency.get(edge.from).add(edge.to); adjacency.get(edge.to).add(edge.from);
    const a = nodes.get(edge.from), b = nodes.get(edge.to);
    near(center(edge.branch,a.y),a.x,1e-8); near(center(edge.branch,b.y),b.x,1e-8);
    for (let y = a.y + 4; y < b.y - 4; y += .5) {
      const x = center(edge.branch,y); assertBodyInRoad({x,z:-y,heading:headingAt(edge.branch,y)}, edge.id);
      assert.equal(getTruckContact(x,-y,headingAt(edge.branch,y),obstacles),undefined,`${edge.id} center blocked at ${y}`);
    }
  }
  const seen = new Set(), visit = id => { if(seen.has(id))return; seen.add(id); for(const next of adjacency.get(id))visit(next); }; visit(city.network.nodes[0].id);
  assert.equal(seen.size,nodes.size); assert.equal(city.network.edges.length-nodes.size+1,2);
  for (const biome of city.biomes) {
    assert.equal(city.biomeAt(...biome.sample).id,biome.id);
    assert.ok(city.features.some(f=>f.biome===biome.id),'Biome has no physical features');
  }
  const merges=[330,590];
  for(const y of merges)for(const delta of [-3,-.1,0,.1,3]){
    assert.equal(spans(y+delta).length,1);assert.equal(getTruckContact(junctionX,-y-delta,0,obstacles),undefined);
  }
  return {nodes:nodes.size,edges:city.network.edges.length,reachable:seen.size,independentCycles:2,biomes:city.biomes.map(b=>b.id)};
});

check('All new outer edges and truck-width median gaps have visible substantial mesh boundaries', () => {
  const records = new Map(); let samples=0,maximumUnshieldedRun=0,maximumSetback=0;
  for(let y=156.125;y<619.9;y+=.25){
    const roads=spans(y),slices=renderedParts.filter(o=>y>=o.minY&&y<=o.maxY).map(o=>({...polygonSlice(o.polygon,y),part:o}));
    for(let i=0;i<roads.length;i++)for(const side of [-1,1]){
      const inner=roads.length===2&&(i===0&&side===1||i===1&&side===-1);
      if(inner&&roads[1].min-roads[0].max<5.8)continue;
      const edge=side<0?roads[i].min:roads[i].max,key=(inner?'inner':'outer')+side;
      const h=layout.surfaceHeight(edge,y),candidates=slices.filter(o=>o.part.bottom<=h+.15&&o.part.top>=h+2&& (side<0?o.max<=edge+.00003:o.min>=edge-.00003)).map(o=>({...o,gap:side<0?edge-o.max:o.min-edge})).sort((a,b)=>a.gap-b.gap);
      const nearest=candidates[0],record=records.get(key)||{samples:0,misses:0,run:0,maxRun:0,firstMiss:undefined,ranges:[],rangeStart:undefined};
      if(record.lastY!==undefined&&y-record.lastY>.251){if(record.rangeStart!==undefined)record.ranges.push([record.rangeStart,record.lastY]);record.rangeStart=undefined;record.run=0;} record.lastY=y;
      const shielded=nearest&&nearest.gap<=1.25;
      if(shielded){if(record.rangeStart!==undefined){record.ranges.push([record.rangeStart,y-.25]);record.rangeStart=undefined;}record.run=0;maximumSetback=Math.max(maximumSetback,nearest.gap);}else{record.run+=.25;record.maxRun=Math.max(record.maxRun,record.run);record.misses++;record.firstMiss??=y;record.rangeStart??=y;maximumUnshieldedRun=Math.max(maximumUnshieldedRun,record.run);}
      record.samples++;records.set(key,record);samples++;
    }
  }
  for(const [key,r] of records)assert.ok(r.maxRun<1.5,`${key} invisible wall spans at least ${r.maxRun} m; first missing mesh at station ${r.firstMiss}. ${JSON.stringify(Object.fromEntries(records))}`);
  return {samples,maximumUnshieldedRun,maximumSetback,records:Object.fromEntries(records)};
});

check('Both finite median ends block head-on D/R entry without choosing a branch or trapping the merge', () => {
  const results=[];
  for(const gap of layout.ROAD_GAPS)for(const end of ['start','end'])for(const gear of ['D','R']){
    const direction=end==='start'?1:-1,station=gap[end]-direction*10;
    const heading=(direction===1?0:Math.PI)+(gear==='R'?Math.PI:0),position={x:junctionX,z:-station},rotation={y:heading};
    assertBodyInRoad({...position,heading},'finite median initial',true);
    const blocked=moveWithContacts(position,rotation,(gear==='D'?1:-1)*28,0,3.3,()=>getTruckContact(position.x,position.z,rotation.y,[]));
    assert.equal(blocked,true); assertBodyInRoad({...position,heading:rotation.y},'finite median stop',true);
    near(position.x,junctionX,.03,'Median contact silently chooses branch');
    assert.ok(direction*(-position.z-station)>2&&direction*(-position.z-gap[end])<0,'Did not stop before island nose');
    const before={...position};moveWithContacts(position,rotation,(gear==='D'?-1:1)*7,0,3.3,()=>getTruckContact(position.x,position.z,rotation.y,[]));
    assert.ok(Math.hypot(position.x-before.x,position.z-before.z)>6.8,'Median contact trapped reversing truck');
    results.push({median:gap.name,end,gear,station:-position.z});
  }
  return results;
});

check('Actual D/R journeys cross all five biomes through both complete loops without teleporting', () => {
  const runs=[];
  for(const initialSide of ['left','right'])for(const gear of ['D','R']){
    const model=createDrivingModel({x:center('main',55),z:-55,heading:headingAt('main',55)+(gear==='R'?Math.PI:0),contact:(x,z,h)=>getTruckContact(x,z,h,obstacles)});
    model.setGear(gear); let returning=false,frames=0,maxStep=0,maxHeightStep=0,maxNormalAngle=0,lastPose=fitTruckToGround(THREE,model.state.x,model.state.z,model.state.heading);const visited=new Set(),crossings=[];
    while(frames++<22000){
      const s=model.state,y=-s.z;
      if(!returning&&y>607){returning=true;model.setGear(gear==='D'?'R':'D');}
      if(returning&&y<56)break;
      const outward=!returning||Math.sign(s.speed)===(gear==='D'?1:-1);
      const branch=returning?(initialSide==='left'?'right':'left'):initialSide;
      const targetY=clamp(y+(outward?5.5:-5.5),-19,616);
      model.setInput({active:true,steering:steeringForTarget(s,center(branch,targetY),targetY)});
      const old={...s};model.step(1/60);assertBodyInRoad(s,`loop ${initialSide}/${gear} ${frames}`,frames%120===0);
      assert.equal(getTruckContact(s.x,s.z,s.heading,obstacles),undefined,'Residual contact in biome journey');
      const step=Math.hypot(s.x-old.x,s.z-old.z);maxStep=Math.max(maxStep,step);assert.ok(step<.20,'Biome journey teleport');
      const pose=fitTruckToGround(THREE,s.x,s.z,s.heading),dh=Math.abs(pose.position.y-lastPose.position.y),da=pose.normal.angleTo(lastPose.normal);maxHeightStep=Math.max(maxHeightStep,dh);maxNormalAngle=Math.max(maxNormalAngle,da);assert.ok(dh<.11,'Biome journey height snap');assert.ok(da<.03,'Biome journey normal snap');lastPose=pose;
      visited.add(city.biomeAt(s.x,-s.z).id);
      for(const merge of [330,590])if((y-merge)*(-s.z-merge)<0)crossings.push(merge);
    }
    assert.ok(frames<22000,`Journey stalled ${JSON.stringify(model.state)}`);assert.deepEqual([...visited].sort(),['city','desert','forest','snow','volcanic']);assert.equal(crossings.length,4);
    runs.push({initialSide,gear,frames,biomes:[...visited],mergeCrossings:crossings,maxStep,maxHeightStep,maxNormalAngle});
  }
  return runs;
});

check('Actual HUD labels all five physical regions with no scene rebuild', () => {
  const app=createAppDom();let time=1000;const labels=[];
  try{app.frame(time);const original=app.debug.city;
    for(const biome of original.biomes){const [x,y]=biome.sample;Object.assign(app.debug.model.state,{x,z:-y,heading:0,speed:0,active:false});app.frame(time+=1000/60);assert.equal(app.ids.get('biome-name').textContent,biome.name);assert.equal(app.debug.city,original);labels.push({id:biome.id,label:app.ids.get('biome-name').textContent});}
  }finally{app.dispose();}return labels;
});

city.dispose();
report.failedChecks = report.checks.filter(c => c.status === 'failed').length; report.passed = report.failedChecks === 0;
fs.writeFileSync(process.env.TEST_REPORT || new URL('./latest-fork-road-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(`Fork road: ${report.checks.length - report.failedChecks}/${report.checks.length} checks passed.`);
process.exitCode = report.failedChecks ? 1 : 0;
