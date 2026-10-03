#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import * as optimized from '../dist/scene.js';
import { collectObstacles } from '../dist/city-driving.js';

// Reproduce the published v3 generator from byte-for-byte git-show fixtures.
// Fixtures make the same independent audit portable in the source archive without .git.
// This is a deterministic geometry/collision audit, not a browser or FPS benchmark.
const baselineCommit = '7f1f32551db2423127517085cacbe62425ed7cdf';
const root = fileURLToPath(new URL('..', import.meta.url));
const report = { generatedAt: new Date().toISOString(), baselineCommit, checks: [], measurements: [], notes: [] };
const directory = path.join(root, 'tests/fixtures/baseline-v3');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
const baselineFiles = new Map(manifest.files.map((record) => [record.file, record]));
const failures = [];
function check(name, fn) {
  try { const details = fn(); report.checks.push({ name, status: 'passed', details }); }
  catch (error) { failures.push(error); report.checks.push({ name, status: 'failed', error: error.stack || String(error) }); }
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function metrics(city) {
  let triangles = 0, instances = 0, meshBatches = 0, studInstances = 0, residenceTriangles = 0;
  city.group.traverse((object) => {
    if (!object.isMesh) return;
    const count = object.isInstancedMesh ? object.count : 1;
    const perObject = (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    triangles += count * perObject;
    meshBatches++;
    if (object.isInstancedMesh) {
      instances += count;
      studInstances += object.userData.partNames.filter((name) => /stud/i.test(name)).length;
      residenceTriangles += object.userData.partNames.filter((name) => /^Residence \d+$/.test(name)).length * perObject;
    }
  });
  return { triangles, instances, meshBatches, studInstances, residenceTriangles };
}
function obstacles(city, collect) {
  return collect(THREE, city).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function meshData(city, section) {
  const meshes = [];
  city.group.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || object.parent?.name !== section) return;
    meshes.push({ name: object.name, position: [...object.geometry.attributes.position.array], uv: object.geometry.attributes.uv ? [...object.geometry.attributes.uv.array] : null, index: [...object.geometry.index.array] });
  });
  return meshes.sort((a, b) => a.name.localeCompare(b.name));
}
try {
  assert.equal(manifest.commit, baselineCommit, 'Baseline fixture provenance mismatch');
  for (const file of ['scene.js', 'building-material.js', 'city-driving.js']) {
    const bytes = fs.readFileSync(path.join(directory, file));
    assert.equal(sha256(bytes), baselineFiles.get(`dist/${file}`).sha256, `Baseline fixture ${file} was modified`);
  }
  const baseline = await import(pathToFileURL(path.join(directory, 'scene.js')));
  const { collectObstacles: collectBaseline } = await import(pathToFileURL(path.join(directory, 'city-driving.js')));
  check('Tow dynamics, rig, input and original art remain byte-identical; historical HUD CSS stays hash-locked', () => {
    const paths = ['driving-model.js', 'vehicle-rig.js', 'vehicle-input.js', 'vehicle-controls.css', 'assets/vehicle-steering.png', 'assets/vehicle-gear-panel-cropped.webp'];
    return paths.map((file) => {
      const relative = `dist/${file}`, expected = baselineFiles.get(relative), after = fs.readFileSync(file === 'vehicle-controls.css' ? path.join(root,'tests/fixtures/baseline-v7/vehicle-controls.css') : path.join(root, relative));
      assert.equal(sha256(after), expected.sha256, `${relative} changed from published v3`);
      assert.equal(after.length, expected.bytes, `${relative} byte length changed from published v3`);
      return { file: relative, bytes: after.length, sha256: sha256(after) };
    });
  });
  check('Original uphill approach retains exact center and height values before the fork', () => {
    let samples = 0;
    for (let y = -23; y <= 74; y += 0.125) {
      assert.equal(optimized.routeHeight(y), baseline.routeHeight(y), `routeHeight(${y})`);
      assert.equal(optimized.routeCenter(y), baseline.routeCenter(y), `routeCenter(${y})`);
      samples++;
    }
    return { samples, hillRise: 11, roadWidth: 30 };
  });
  check('Expanded five-biome network remains compact relative to route length', () => {
    const previous = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/baseline-v6/manifest.json'), 'utf8'));
    const city = optimized.buildCity(THREE, { seed: 42 });
    try {
      const after = metrics(city), before = previous.seed42;
      assert.ok(after.triangles / city.stats.routeLength < before.triangles / before.routeLength);
      assert.ok(after.instances < before.instances); assert.ok(after.meshBatches < before.meshBatches);
      assert.equal(city.stats.roadWidth, 30); assert.equal(city.stats.buildings, 86); assert.equal(city.stats.biomes, 5);
      return { baselineCommit: previous.commit, before, after, trianglesPerRouteMetre: after.triangles / city.stats.routeLength, priorTrianglesPerRouteMetre: before.triangles / before.routeLength };
    } finally { city.dispose(); }
  });
  check('Low-poly geometry reductions survive the wider route and continuous homes across seven seeds', () => {
    for (const seed of [0, 1, 17, 42, 2026, 2027, 4294967295]) {
      const before = baseline.buildCity(THREE, { seed }), after = optimized.buildCity(THREE, { seed });
      try {
        const oldMetrics = metrics(before), newMetrics = metrics(after);
        const newObstacles = obstacles(after, collectObstacles);
        assert.ok(newObstacles.every(o => /^Residence /.test(o.name))); 
        assert.ok(!newObstacles.some(o => /Tree|Lamp|Pump|Portal/.test(o.name)));
        assert.ok(newMetrics.triangles <= 60_000, `Seed ${seed}: exceeds 60,000 triangle budget for 643m five-biome network`);
        assert.ok(newMetrics.meshBatches <= 30, `Seed ${seed}: exceeds 30 mesh batches`);
        assert.ok(newMetrics.instances <= 1_600, `Seed ${seed}: exceeds 1,600 instances`);
        assert.equal(newMetrics.studInstances, 0, `Seed ${seed}: geometry studs remain`);
        assert.equal(newMetrics.residenceTriangles, after.stats.buildings * 12, `Seed ${seed}: every residence must remain one simple cuboid`);
        assert.ok(after.stats.buildings >= 60);
        assert.ok(newMetrics.triangles < oldMetrics.triangles * 0.3, `Seed ${seed}: expected at least 70% fewer triangles`);
        assert.ok(newMetrics.instances < oldMetrics.instances * 0.3, `Seed ${seed}: expected at least 70% fewer instances`);
        assert.ok(newMetrics.meshBatches < oldMetrics.meshBatches, `Seed ${seed}: batches did not decrease`);
        if (seed === 42) assert.deepEqual(oldMetrics, { triangles: 208812, instances: 9180, meshBatches: 37, studInstances: 4684, residenceTriangles: 96 }, 'Reproduced baseline does not match the published v3 reference');
        report.measurements.push({ seed, before: oldMetrics, after: newMetrics, triangleReductionPercent: (1 - newMetrics.triangles / oldMetrics.triangles) * 100, instanceReductionPercent: (1 - newMetrics.instances / oldMetrics.instances) * 100, obstacleCount: newObstacles.length, obstacleBoundsSha256: sha256(JSON.stringify(newObstacles)) });
      } finally { before.dispose(); after.dispose(); }
    }
    return { seeds: report.measurements.map((measurement) => measurement.seed), maximumRenderedTriangles: 60000, maximumMeshBatches: 30, maximumInstances: 1600, routeAndObstacleLayoutIntentionallyUpdated: true };
  });
} catch (error) {
  failures.push(error); report.checks.push({ name: 'Load published baseline and optimized scene', status: 'failed', error: error.stack || String(error) });
}
report.passed = failures.length === 0;
report.failedChecks = failures.length;
report.notes.push('Counts are measured from every generated mesh, including rendered instances. Mesh-batch totals are scene mesh objects, not GPU draw-call measurements.');
report.notes.push('No browser rendering, physical touch input, frame-time, or FPS claim is made.');
const reportPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'tests/latest-optimization-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = failures.length ? 1 : 0;
