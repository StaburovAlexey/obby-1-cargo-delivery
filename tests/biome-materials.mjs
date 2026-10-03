#!/usr/bin/env node
// Independent, renderer-free acceptance audit. Only actual Three.js meshes,
// instance matrices, texture bytes and the hash-locked published v7 fixture
// establish the assertions below; scene feature/stat metadata is not evidence.
// Usage: node tests/biome-materials.mjs
import assert from 'node:assert/strict';
import {CHARACTER_CATALOG} from '../dist/character-catalog.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import { buildCity } from '../dist/scene.js';
import { buildCity as buildPublishedCity } from './fixtures/baseline-v7/scene.js';
import { createGroundTextureData as publishedGrass } from './fixtures/baseline-v7/ground-material.js';
import { sampleSquareStud as publishedSample } from './fixtures/baseline-v7/square-stud-texture.js';
import { BIOMES } from '../dist/road-layout.js';
import { projectBuildingSurface, projectEnvironmentSurface, sampleEnvironmentSurface,
  sampleBuildingSurface, createRoadTextureData } from '../dist/building-material.js';
import { createGroundTextureData } from '../dist/ground-material.js';
import { GRASS_CHECKER_TEXTURE, createGrassCheckerTextureData } from '../dist/square-stud-texture.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixtureRoot = path.join(root, 'tests/fixtures/baseline-v7');
const seeds = [0, 1, 17, 42, 2026, 2027, 4294967295];
const expectedIds = ['city', 'forest', 'desert', 'snow', 'volcanic'];
const expectedTerrainColors = [0x22e500, 0x159b2e, 0xf2b941, 0xe6f8ff, 0x553442];
const expectedLayers = {
  forest: ['root mass', 'lower canopy', 'upper canopy', 'treetop'],
  desert: ['sandstone base', 'ochre stratum', 'mesa cap', 'butte'],
  snow: ['blue glacier', 'ice wall', 'snow cap', 'ice spire'],
  volcanic: ['basalt footing', 'lava seam', 'black ridge', 'crater rim', 'ember crest'],
};
const report = { threeRevision: THREE.REVISION, checks: [], notes: [
  'Node/actual Three.js only. No browser, socket, WebGL, GLSL compilation, image rendering or FPS claims.',
  'Reported physical mass volume is the sum of rendered cuboid volumes, not the union volume of overlapping tiers.',
] };
let failures = 0;
function check(name, run) {
  try { report.checks.push({ name, status: 'passed', details: run() }); }
  catch (error) { failures++; report.checks.push({ name, status: 'failed', error: error.stack }); }
}
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const close = (actual, expected, message, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} != ${expected} (tolerance ${tolerance})`);
// At most four Float32 ULPs at the largest participating value, with a 2 µm floor.
const floatTolerance = (...values) => Math.max(2e-6, ...values.map(v => Math.abs(v) * 2 ** -22));
const cubeCorners = [];
for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) cubeCorners.push(new THREE.Vector3(x, y, z));
function partsIn(group) {
  const parts = [];
  group.updateMatrixWorld(true);
  group.traverse(mesh => {
    if (!mesh.isInstancedMesh) return;
    assert.equal(mesh.userData.partNames?.length, mesh.count, `${mesh.name}: complete instance names`);
    for (let index = 0; index < mesh.count; index++) {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld);
      const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      matrix.decompose(position, rotation, scale);
      const corners = cubeCorners.map(point => point.clone().applyMatrix4(matrix));
      const color = new THREE.Color(); mesh.getColorAt(index, color);
      parts.push({ name: mesh.userData.partNames[index], mesh, index, matrix, position, rotation, scale, corners, color,
        bottom: Math.min(...corners.map(p => p.y)), top: Math.max(...corners.map(p => p.y)) });
    }
  });
  return parts;
}
function housesByName(parts) {
  const result = new Map();
  for (const part of parts.filter(part => /^Residence \d+$/.test(part.name))) {
    assert.ok(!result.has(part.name), `Duplicate actual house ${part.name}`);
    result.set(part.name, part);
  }
  assert.equal(result.size, 86, 'Exactly 86 actual original houses');
  assert.deepEqual([...result.keys()].sort(), Array.from({ length: 86 }, (_, i) => `Residence ${i}`).sort());
  return result;
}
function assertPlainCube(geometry, label) {
  assert.equal(geometry.type, 'BoxGeometry', `${label}: a simple cube body`);
  assert.equal(geometry.attributes.position.count, 24, `${label}: no relief vertices`);
  assert.equal(geometry.index.count, 36, `${label}: exactly 12 body triangles`);
  const reference = new THREE.BoxGeometry(1, 1, 1);
  try {
    assert.deepEqual(geometry.attributes.position.array, reference.attributes.position.array, `${label}: unchanged unit cube vertices`);
    assert.deepEqual(geometry.attributes.normal.array, reference.attributes.normal.array, `${label}: unchanged flat cube normals`);
    assert.deepEqual(geometry.index.array, reference.index.array, `${label}: unchanged cube topology`);
  } finally { reference.dispose(); }
}
function patchedShader(material) {
  const shader = { uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader);
  return shader;
}

check('The exact published v7 fixture and protected controller/artwork match their manifest; requested v17 HUD style is separate', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.commit, '4d3283d6d1242b82addf1bd7f1231c30d2b3d38f');
  assert.equal(manifest.files.filter(row => row.protected).length, 6);
  assert.equal(manifest.files.filter(row => !row.protected).length, 5);
  return manifest.files.map(row => {
    // The user explicitly requested new HUD artwork/styles in v17. Keep the
    // historical CSS hash-locked here while mechanics and source art stay current.
    const filename = row.protected && row.file !== 'dist/vehicle-controls.css' ? path.join(root, row.file) : path.join(fixtureRoot, path.basename(row.file));
    const bytes = fs.readFileSync(filename);
    assert.equal(bytes.length, row.bytes, `${filename}: byte count`);
    assert.equal(hash(bytes), row.sha256, `${filename}: published content hash`);
    return { file: path.relative(root, filename), bytes: bytes.length, sha256: row.sha256 };
  });
});

check('All 86 actual house transforms retain horizontal placement, footprint, rotation and bottom while height doubles across seven seeds', () => {
  let maximumBottomError = 0, maximumHeightError = 0, maximumHorizontalError = 0;
  let matchedInstances = 0;
  for (const seed of seeds) {
    const current = buildCity(THREE, { seed }), published = buildPublishedCity(THREE, { seed });
    try {
      const a = housesByName(partsIn(current.group)), b = housesByName(partsIn(published.group));
      for (const [name, actual] of a) {
        const baseline = b.get(name), label = `seed ${seed}, ${name}`;
        assertPlainCube(actual.mesh.geometry, label);
        assertPlainCube(baseline.mesh.geometry, `${label} fixture`);
        // Raw horizontal matrix columns and translation must be bit-exact.
        for (const index of [0, 1, 2, 3, 8, 9, 10, 11, 12, 14, 15])
          assert.equal(actual.matrix.elements[index], baseline.matrix.elements[index], `${label}: preserved matrix[${index}]`);
        for (const index of [4, 5, 6]) close(actual.matrix.elements[index], baseline.matrix.elements[index] * 2,
          `${label}: doubled vertical basis[${index}]`, floatTolerance(actual.matrix.elements[index]));
        close(Math.abs(actual.rotation.dot(baseline.rotation)), 1, `${label}: rotation`, 1e-7);
        // Color is intentionally restyled in v17; protected geometry remains exact.
        assert.ok(actual.color.toArray().every(Number.isFinite), `${label}: valid updated palette`);
        close(actual.scale.x, baseline.scale.x, `${label}: width`, floatTolerance(actual.scale.x));
        close(actual.scale.z, baseline.scale.z, `${label}: frontage`, floatTolerance(actual.scale.z));
        const bottomError = Math.abs(actual.bottom - baseline.bottom);
        const heightError = Math.abs((actual.top - actual.bottom) - 2 * (baseline.top - baseline.bottom));
        close(actual.bottom, baseline.bottom, `${label}: actual mesh bottom`, floatTolerance(actual.position.y, actual.scale.y, baseline.position.y));
        close(actual.top - actual.bottom, 2 * (baseline.top - baseline.bottom), `${label}: actual mesh height`, floatTolerance(actual.scale.y));
        for (let corner = 0; corner < 8; corner++) for (const axis of ['x', 'z']) {
          const delta = Math.abs(actual.corners[corner][axis] - baseline.corners[corner][axis]);
          maximumHorizontalError = Math.max(maximumHorizontalError, delta);
          assert.equal(delta, 0, `${label}: world footprint corner ${corner}/${axis}`);
        }
        maximumBottomError = Math.max(maximumBottomError, bottomError);
        maximumHeightError = Math.max(maximumHeightError, heightError);
        matchedInstances++;
      }
    } finally { current.dispose(); published.dispose(); }
  }
  assert.equal(matchedInstances, 602);
  return { seeds, housesPerSeed: 86, matchedInstances, maximumBottomError, maximumHeightError, maximumHorizontalError,
    tolerance: 'At most four Float32 ULPs at participating value scale, minimum 0.000002 m; horizontal transform bit-exact; palette intentionally updated from reference.' };
});

check('Canonical 128², 4 m grass tile is byte-identical to v7 and shared by every actual environment base', () => {
  const reference = publishedGrass('grass');
  assert.equal(reference.width, 128); assert.equal(reference.height, 128);
  assert.equal(hash(reference.data), '2faeeaee2175ad9e7f2fe89deabc5e24600eb75f0ad41bbfd0ff88769c9379b6');
  assert.equal(GRASS_CHECKER_TEXTURE.tileMeters, 4); assert.equal(GRASS_CHECKER_TEXTURE.panelMeters, 2);
  assert.equal(GRASS_CHECKER_TEXTURE.studPitch, .4); assert.equal(GRASS_CHECKER_TEXTURE.studSize, .2);
  for (const source of [createGrassCheckerTextureData(), createRoadTextureData(), createGroundTextureData('grass'), createGroundTextureData('concrete')]) {
    assert.equal(source.width, 128); assert.equal(source.height, 128);
    assert.deepEqual(source.data, reference.data, 'Every generated environment base has exact original grass bytes');
  }
  const city = buildCity(THREE, { seed: 42 });
  try {
    const terrain = city.group.getObjectByName('Closed continuous terrain foundation');
    const canonical = terrain.material.map, baseMaps = new Set(), overlays = new Set();
    const meshes = [];
    city.group.traverse(mesh => {
      if (!mesh.isMesh) return;
      const material = mesh.material;
      if (mesh.name === 'Flush road markings') {
        assert.equal(material.map, null, 'Flush paint is an untextured marking overlay'); return;
      }
      const map = material.squareStudMap || material.map;
      assert.equal(map, canonical, `${mesh.name}: exact same canonical map object`);
      baseMaps.add(map);
      assert.ok(map.isDataTexture, `${mesh.name}: generated pixel data, not an image asset`);
      assert.deepEqual(map.image.data, reference.data, `${mesh.name}: unchanged original bytes`);
      assert.equal(map.image.width, 128); assert.equal(map.image.height, 128);
      assert.equal(map.wrapS, THREE.RepeatWrapping); assert.equal(map.wrapT, THREE.RepeatWrapping);
      assert.deepEqual(map.repeat.toArray(), [1, 1]); assert.deepEqual(map.offset.toArray(), [0, 0]);
      assert.equal(map.rotation, 0); assert.equal(map.colorSpace, THREE.SRGBColorSpace);
      assert.equal(map.minFilter, THREE.LinearMipmapLinearFilter); assert.equal(map.magFilter, THREE.LinearFilter);
      assert.equal(map.generateMipmaps, true); assert.ok(map.anisotropy >= 4);
      if (material.squareStudMap) {
        overlays.add(material.map);
        assert.notEqual(material.map, canonical, 'Window overlay remains a separate atlas');
        assert.equal(patchedShader(material).uniforms.urSquareStudMap.value, canonical, 'Actual building shader binds canonical map');
      }
      meshes.push({ name: mesh.name, instances: mesh.isInstancedMesh ? mesh.count : 1 });
    });
    assert.equal(baseMaps.size, 1); assert.equal(overlays.size, 1); assert.equal(meshes.length, 13);
    return { canonicalSha256: hash(canonical.image.data), dimensions: [128, 128], tileMeters: 4,
      panelMeters: 2, studPitchMeters: .4, sharedBaseMapObjects: baseMaps.size, separateWindowAtlases: overlays.size, meshes };
  } finally { city.dispose(); }
});

check('All six building/barrier faces use independent metric projections with 4 m repeats, .4 m studs and 2 m panels', () => {
  const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const sizes = [[7.5, 26.4, 6.45], [12, 5.25, 9.8], [40, 33, 17], [.82, 2.4, 1.69], [-7.5, 26.4, -6.45]];
  let pointChecks = 0, metricDistanceChecks = 0, baseSampleChecks = 0;
  for (const scale of sizes) for (const normal of faces) {
    const faceAxis = normal.findIndex(v => v !== 0), axes = faceAxis === 1 ? [0, 2] : faceAxis === 0 ? [2, 1] : [0, 1];
    for (const u of [.01, .19, .47, .71, .99]) for (const v of [.01, .23, .51, .83, .99]) {
      const position = [0, 0, 0]; position[faceAxis] = normal[faceAxis] / 2;
      position[axes[0]] = u - .5; position[axes[1]] = v - .5;
      const meters = [u * Math.abs(scale[axes[0]]), v * Math.abs(scale[axes[1]])];
      const building = projectBuildingSurface(position, normal, scale), environment = projectEnvironmentSurface(position, normal, scale);
      for (let axis = 0; axis < 2; axis++) {
        close(building.patternUv[axis], meters[axis] / 4, 'Building metric base projection', 1e-12);
        close(environment.patternUv[axis], meters[axis] / 4, 'Barrier metric base projection', 1e-12);
        close(building.studUv[axis], meters[axis] / .4, 'Building physical stud pitch', 1e-12);
        close(environment.studUv[axis], meters[axis] / .4, 'Barrier physical stud pitch', 1e-12);
      }
      const expected = publishedSample(...meters, { panelMeters: 2, panelVariation: true });
      const actual = sampleEnvironmentSurface(position, normal, scale);
      actual.forEach((value, channel) => close(value, expected[channel], 'Barrier uses original metric grass shading', 1e-9));
      // Roofs, bottoms and plain walls/margins cannot acquire facade window cells.
      if (building.tile !== 0) {
        sampleBuildingSurface(position, normal, scale).forEach((value, channel) => close(value, expected[channel], 'Plain building uses original metric grass shading', 1e-9));
        baseSampleChecks++;
      }
      pointChecks++;
    }
    for (let axis = 0; axis < 2; axis++) for (const distance of [.4, 2, 4]) {
      if (Math.abs(scale[axes[axis]]) < distance + .1) continue;
      const a = [0, 0, 0]; a[faceAxis] = normal[faceAxis] / 2;
      a[axes[axis]] = -.5 + .05 / Math.abs(scale[axes[axis]]);
      const b = a.slice(); b[axes[axis]] += distance / Math.abs(scale[axes[axis]]);
      for (const project of [projectBuildingSurface, projectEnvironmentSurface]) {
        const pa = project(a, normal, scale), pb = project(b, normal, scale);
        close(pb.patternUv[axis] - pa.patternUv[axis], distance / 4, 'Physical step maps to correct repeat fraction', 1e-12);
        close(pb.studUv[axis] - pa.studUv[axis], distance / .4, 'Physical step maps to correct stud count', 1e-12);
        close(pb.patternUv[1 - axis], pa.patternUv[1 - axis], 'Other face axis remains stable', 1e-12);
        metricDistanceChecks++;
      }
    }
  }
  const city = buildCity(THREE, { seed: 42 });
  try {
    const parts = partsIn(city.group), building = parts.find(p => /^Residence /.test(p.name)).mesh.material;
    const barrier = parts.find(p => /^Biome barrier /.test(p.name)).mesh.material;
    const b = patchedShader(building), e = patchedShader(barrier);
    for (const shader of [b, e]) {
      assert.match(shader.vertexShader, /urObjectMatrix = modelMatrix \* instanceMatrix/);
      assert.match(shader.vertexShader, /length\(urObjectMatrix\[0\]\.xyz\).*length\(urObjectMatrix\[1\]\.xyz\).*length\(urObjectMatrix\[2\]\.xyz\)/);
      assert.match(shader.vertexShader, /urMeters = \(position \+ vec3\(0\.5\)\) \* urSize/);
    }
    assert.match(b.vertexShader, /urStudUv = urMeters\.xz \/ 4\.0/);
    assert.match(b.vertexShader, /urStudUv = urWall \/ 4\.0/);
    assert.match(e.vertexShader, /urFace\.y > 0\.5 \? urMeters\.xz : \(urFace\.x > urFace\.z \? urMeters\.zy : urMeters\.xy\)/);
    assert.match(e.vertexShader, /urEnvironmentUv = urMetricFace \/ 4\.0/);
    assert.match(b.fragmentShader, /textureGrad\(urSquareStudMap, urStudUv, dFdx\(urStudUv\), dFdy\(urStudUv\)\)/);
    assert.match(e.fragmentShader, /textureGrad\(map, urEnvironmentUv, dFdx\(urEnvironmentUv\), dFdy\(urEnvironmentUv\)\)/);
    let roadVertices = 0, terrainTopVertices = 0;
    for (const mesh of [city.group.getObjectByName('Continuous 30m-wide road'), city.group.getObjectByName('Closed continuous terrain foundation')]) {
      const p = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        if (mesh.name.startsWith('Closed') && Math.abs(p.getY(i) + 1.8) < 1e-6) continue;
        close(uv.getX(i), p.getX(i) / 4, `${mesh.name}: actual horizontal UV`, 1e-6);
        close(uv.getY(i), -p.getZ(i) / 4, `${mesh.name}: actual longitudinal UV`, 1e-5);
        if (mesh.name.startsWith('Closed')) terrainTopVertices++; else roadVertices++;
      }
    }
    return { allSixFaces: true, cuboidSizes: sizes, pointChecks, metricDistanceChecks, baseSampleChecks,
      roadVertices, terrainTopVertices, shaderContract: 'Actual patched Three.js shader sources bind and project the same metric base.' };
  } finally { city.dispose(); }
});

check('Actual terrain vertex colors and rendered cuboid masses express five sizeable distinct physical biomes', () => {
  assert.deepEqual(BIOMES.map(b => b.id), expectedIds);
  assert.deepEqual(BIOMES.map(b => b.color), expectedTerrainColors);
  const city = buildCity(THREE, { seed: 42 });
  try {
    const terrain = city.group.getObjectByName('Closed continuous terrain foundation');
    assert.equal(terrain.material.vertexColors, true); assert.equal(terrain.material.color.getHex(), 0xffffff);
    const p = terrain.geometry.attributes.position, colors = terrain.geometry.attributes.color, indices = terrain.geometry.index.array;
    assert.equal(colors.count, p.count, 'Every actual terrain vertex has an actual color');
    const palette = expectedTerrainColors.map(color => new THREE.Color(color));
    const vertexBiome = Array.from({ length: p.count }, (_, i) => palette.findIndex(color => color.toArray().every((v, axis) => Math.abs(v - colors.array[i * 3 + axis]) < 1e-7)));
    const areas = Object.fromEntries(expectedIds.map(id => [id, 0]));
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]], biome = vertexBiome[a];
      if (biome < 0 || vertexBiome[b] !== biome || vertexBiome[c] !== biome) continue;
      const origin = new THREE.Vector3().fromBufferAttribute(p, a);
      const cross = new THREE.Vector3().fromBufferAttribute(p, b).sub(origin)
        .cross(new THREE.Vector3().fromBufferAttribute(p, c).sub(origin));
      if (cross.y > 0) areas[expectedIds[biome]] += cross.y / 2;
    }
    for (const [id, area] of Object.entries(areas)) assert.ok(area > 10000, `${id}: >10,000 m² visibly colored top-surface footprint; got ${area}`);
    const raycaster = new THREE.Raycaster(), samples = [];
    city.group.updateMatrixWorld(true);
    for (let biome = 0; biome < BIOMES.length; biome++) for (const dx of [-22, 0, 22]) for (const dy of [-20, 0, 20]) {
      const [x, y] = BIOMES[biome].sample;
      raycaster.set(new THREE.Vector3(x + dx, 80, -y - dy), new THREE.Vector3(0, -1, 0));
      const hit = raycaster.intersectObject(terrain, false)[0];
      assert.ok(hit, `${BIOMES[biome].id}: terrain present near biome sample`);
      const { a, b, c } = hit.face;
      const barycentric = THREE.Triangle.getBarycoord(hit.point,
        new THREE.Vector3().fromBufferAttribute(p, a), new THREE.Vector3().fromBufferAttribute(p, b), new THREE.Vector3().fromBufferAttribute(p, c), new THREE.Vector3());
      const actual = new THREE.Vector3().fromBufferAttribute(colors, a).multiplyScalar(barycentric.x)
        .addScaledVector(new THREE.Vector3().fromBufferAttribute(colors, b), barycentric.y)
        .addScaledVector(new THREE.Vector3().fromBufferAttribute(colors, c), barycentric.z);
      palette[biome].toArray().forEach((expected, axis) => close(actual.getComponent(axis), expected, 'Ray-hit interpolated actual biome color', 1e-7));
      samples.push({ biome: BIOMES[biome].id, point: [x + dx, y + dy], color: actual.toArray() });
    }
    const masses = Object.fromEntries(expectedIds.map(id => [id, { count: 0, summedBoxVolume: 0, maximumHeight: 0,
      colors: new Set(), layers: new Set(), groups: new Set(), bounds: new THREE.Box3(), weightedCenter: new THREE.Vector3() }]));
    for (const part of partsIn(city.group)) {
      const match = /^Biome barrier (forest|desert|snow|volcanic) (?:(\d+) )?(.+)$/.exec(part.name);
      const id = /^Residence \d+$/.test(part.name) ? 'city' : match?.[1];
      if (!id) continue;
      assertPlainCube(part.mesh.geometry, part.name);
      const data = masses[id];
      assert.ok(part.scale.toArray().every(v => v > 0), `${part.name}: actual positive-volume solid cuboid`);
      const volume = part.scale.x * part.scale.y * part.scale.z;
      data.count++; data.summedBoxVolume += volume;
      data.weightedCenter.addScaledVector(part.position, volume);
      data.maximumHeight = Math.max(data.maximumHeight, part.scale.y);
      data.colors.add(part.color.getHexString());
      for (const corner of part.corners) data.bounds.expandByPoint(corner);
      if (match) { if (match[2]) data.groups.add(match[2]); data.layers.add(match[3]); }
    }
    for (const [id, data] of Object.entries(masses)) {
      assert.ok(data.count >= 80, `${id}: at least 80 rendered substantial components`);
      assert.ok(data.summedBoxVolume > 50000, `${id}: >50,000 m³ summed rendered volume`);
      assert.ok(data.maximumHeight >= 10, `${id}: tall physical barrier masses`);
      assert.ok(data.colors.size >= 3, `${id}: distinct layered physical coloration`);
      if (id !== 'city') {
        assert.ok(data.groups.size >= 25, `${id}: at least 25 distinct physical barrier masses`);
        for (const layer of expectedLayers[id]) assert.ok(data.layers.has(layer), `${id}: actual ${layer} mesh layer is present`);
        for (const layer of data.layers) assert.ok(expectedLayers[id].includes(layer) || /endcap|tip|nose/i.test(layer), `${id}: known large barrier layer or necessary fork endcap, got ${layer}`);
      }
      data.colors = [...data.colors].sort(); data.layers = [...data.layers].sort(); data.groups = data.groups.size;
      data.bounds = { min: data.bounds.min.toArray(), max: data.bounds.max.toArray() };
      data.weightedCenter = data.weightedCenter.divideScalar(data.summedBoxVolume).toArray();
    }
    assert.equal(new Set(Object.values(masses).map(data => JSON.stringify(data.colors))).size, 5, 'Five distinct actual mass palettes');
    // Rotated median faces/endcaps can have overlapping global AABBs while the
    // paired physical regions remain separate. Measure actual volume-weighted
    // positions instead of incorrectly requiring disjoint global AABBs.
    assert.ok(masses.desert.weightedCenter[0] - masses.forest.weightedCenter[0] > 40, 'Forest and desert physical mass centers differ by >40 m laterally');
    assert.ok(masses.volcanic.weightedCenter[0] - masses.snow.weightedCenter[0] > 40, 'Snow and volcanic physical mass centers differ by >40 m laterally');
    assert.ok(masses.snow.bounds.min[2] < masses.forest.bounds.min[2] - 100, 'Highland physical masses extend over 100 m beyond the first biome pair');
    return { topSurfaceFootprintM2: areas, terrainRaySamples: samples.length, sampleNeighborhoodMeters: [44, 40], masses };
  } finally { city.dispose(); }
});

check('No imported environment textures/models or texture-relief geometry/material channels are present', () => {
  const sourceFiles = ['scene.js', 'building-material.js', 'ground-material.js', 'square-stud-texture.js'];
  for (const file of sourceFiles) {
    const source = fs.readFileSync(path.join(root, 'dist', file), 'utf8');
    assert.doesNotMatch(source, /\b(?:TextureLoader|ImageLoader|ImageBitmapLoader|GLTFLoader|FBXLoader|OBJLoader|STLLoader|DRACOLoader)\b/, `${file}: no loading environment assets`);
    assert.doesNotMatch(source, /\b(?:fetch|createImageBitmap)\s*\(|new\s+Image\s*\(/, `${file}: no remote/image texture source`);
    assert.doesNotMatch(source, /(?:bumpMap|normalMap|displacementMap)\s*[:=]\s*(?!null\b)/, `${file}: no relief map assignment`);
  }
  const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
  assert.deepEqual(walk(path.join(root, 'dist')).filter(filename => /\.(?:glb|gltf|fbx|obj|stl|dae|blend|ply|3ds)$/i.test(filename)).map(filename=>path.relative(root,filename)).sort(),CHARACTER_CATALOG.map(c=>path.relative(root,fileURLToPath(c.url))).sort());
  const imageAssets = walk(path.join(root, 'dist')).filter(filename => /\.(?:png|jpe?g|webp|gif|avif|ktx2?|hdr|exr)$/i.test(filename)).map(filename => path.relative(root, filename)).sort();
  assert.deepEqual(imageAssets, ['dist/assets/vehicle-gear-panel-cropped.webp', 'dist/assets/vehicle-steering.png']);
  const city = buildCity(THREE, { seed: 42 });
  try {
    const geometries = new Set(), materials = new Set();
    let boxInstances = 0;
    city.group.traverse(mesh => {
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry); materials.add(mesh.material);
      for (const channel of ['bumpMap', 'normalMap', 'displacementMap']) assert.equal(mesh.material[channel], null, `${mesh.name}: ${channel}`);
      if (mesh.geometry.type === 'BoxGeometry') { assertPlainCube(mesh.geometry, mesh.name); boxInstances += mesh.count; }
      if (mesh.isInstancedMesh) for (const name of mesh.userData.partNames)
        assert.doesNotMatch(name, /(?:roof stud|brick stud|texture relief|grass stud|pebble|bollard|streetlamp)/i, 'No geometric surface decoration or roadside clutter');
    });
    assert.equal(geometries.size, 5, 'Only unit box, wheel cylinder, closed ground, road and paint geometries');
    const actualParts = partsIn(city.group), boxParts = actualParts.filter(part => part.mesh.geometry.type === 'BoxGeometry');
    const barrierParts = boxParts.filter(part => /^Biome barrier (?:forest|desert|snow|volcanic) /.test(part.name));
    const residenceParts = boxParts.filter(part => /^Residence \d+$/.test(part.name));
    const truckParts = boxParts.filter(part => part.mesh.parent.name === 'Orange delivery truck');
    assert.equal(residenceParts.length, 86); assert.equal(truckParts.length, 71);
    assert.equal(boxInstances, barrierParts.length + residenceParts.length + truckParts.length, 'Only actual house, biome barrier and retained truck box parts');
    return { checkedSourceFiles: sourceFiles, importedModelFiles: 0, environmentImageAssets: 0,
      allowedControlImageAssets: imageAssets, uniqueGeometries: geometries.size, checkedMaterials: materials.size, boxInstances };
  } finally { city.dispose(); }
});

report.passed = failures === 0;
report.failedChecks = failures;
fs.writeFileSync(new URL('./latest-biome-material-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = failures ? 1 : 0;
