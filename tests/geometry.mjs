#!/usr/bin/env node
import {CHARACTER_CATALOG} from '../dist/character-catalog.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import { ROUTE, branchCenter, branchHeight, roadIntervals, surfaceHeight, ROAD_SURFACE_OFFSET } from '../dist/road-layout.js';



const scenePath = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../dist/scene.js', import.meta.url));
const projectRoot = path.dirname(scenePath);
const reportPath = path.resolve(process.argv[3] || fileURLToPath(new URL('./latest-report.json', import.meta.url)));
const report = { generatedAt: new Date().toISOString(), threeRevision: THREE.REVISION, scenePath, checks: [], notes: [] };
let failures = 0;
function check(name, test) {
  try {
    const details = test();
    report.checks.push({ name, status: 'passed', ...(details === undefined ? {} : { details }) });
  } catch (error) {
    failures++;
    report.checks.push({ name, status: 'failed', error: error.message });
  }
}
function finiteArray(values, context) {
  for (let i = 0; i < values.length; i++) assert.ok(Number.isFinite(values[i]), `${context}[${i}] is not finite`);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    if (ArrayBuffer.isView(value)) return Array.from(value);
    return Object.fromEntries(Object.keys(value).filter((key) => !['uuid', 'id'].includes(key)).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
function normalizeResult(value) {
  const group = value?.isGroup ? value : value?.group || value?.city || value?.root || value?.scene;
  const stats = value?.stats || group?.userData?.stats || {};
  assert.ok(group?.isGroup, 'buildCity must return a THREE.Group or { group: THREE.Group, stats }.');
  return { group, stats, dispose: typeof value.dispose === 'function' ? value.dispose.bind(value) : undefined };
}
function fingerprint(group) {
  const hash = crypto.createHash('sha256');
  const seenGeometries = new Set();
  const seenMaterials = new Set();
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    hash.update(JSON.stringify({ type: object.type, name: object.name, visible: object.visible, matrix: object.matrix.toArray(), children: object.children.length }));
    if (object.instanceMatrix) hash.update(Buffer.from(object.instanceMatrix.array.buffer, object.instanceMatrix.array.byteOffset, object.count * 16 * object.instanceMatrix.array.BYTES_PER_ELEMENT));
    if (object.instanceColor) hash.update(Buffer.from(object.instanceColor.array.buffer, object.instanceColor.array.byteOffset, object.count * 3 * object.instanceColor.array.BYTES_PER_ELEMENT));
    const geometry = object.geometry;
    if (geometry && !seenGeometries.has(geometry)) {
      seenGeometries.add(geometry);
      for (const name of Object.keys(geometry.attributes).sort()) {
        const attr = geometry.attributes[name];
        hash.update(name);
        hash.update(Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength));
      }
      if (geometry.index) hash.update(Buffer.from(geometry.index.array.buffer, geometry.index.array.byteOffset, geometry.index.array.byteLength));
      hash.update(JSON.stringify(geometry.groups));
    }
    for (const material of [].concat(object.material || [])) {
      if (!seenMaterials.has(material)) {
        seenMaterials.add(material);
        const properties = ['type', 'name', 'color', 'emissive', 'roughness', 'metalness', 'opacity', 'transparent', 'side', 'vertexColors'];
        hash.update(JSON.stringify(Object.fromEntries(properties.map((key) => [key, material[key]?.isColor ? material[key].toArray() : material[key]]))));
      }
    }
  });
  return hash.digest('hex');
}
function inspectGeometry(group) {
  let objects = 0, meshObjects = 0, instancedMeshes = 0, instances = 0, triangles = 0, degenerateNormals = 0;
  const geometries = new Set(), materials = new Set();
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    objects++;
    finiteArray(object.matrix.elements, `${object.name || object.type}.matrix`);
    finiteArray(object.matrixWorld.elements, `${object.name || object.type}.matrixWorld`);
    if (!object.isMesh) return;
    meshObjects++;
    assert.ok(object.geometry?.isBufferGeometry, `${object.name} has no BufferGeometry`);
    const geometry = object.geometry;
    geometries.add(geometry);
    [].concat(object.material || []).forEach((material) => materials.add(material));
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    assert.ok(position && position.count > 0, `${object.name} has no position data`);
    assert.ok(normal && normal.count === position.count, `${object.name} has missing or mismatched normals`);
    for (const [name, attr] of Object.entries(geometry.attributes)) finiteArray(attr.array, `${object.name}.${name}`);
    if (geometry.index) {
      finiteArray(geometry.index.array, `${object.name}.indices`);
      for (const index of geometry.index.array) assert.ok(index >= 0 && index < position.count, `${object.name} has out-of-range index ${index}`);
    }
    for (let i = 0; i < normal.count; i++) {
      const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
      if (length < 1e-6) degenerateNormals++;
      else assert.ok(Math.abs(length - 1) < 0.02, `${object.name} normal ${i} has length ${length}`);
    }
    const count = object.isInstancedMesh ? object.count : 1;
    if (object.isInstancedMesh) {
      instancedMeshes++;
      instances += count;
      assert.ok(Number.isInteger(count) && count > 0 && count <= object.instanceMatrix.count, `${object.name} invalid instance count`);
      finiteArray(object.instanceMatrix.array.subarray(0, count * 16), `${object.name}.instanceMatrix`);
      if (object.instanceColor) finiteArray(object.instanceColor.array.subarray(0, count * 3), `${object.name}.instanceColor`);
    }
    triangles += (geometry.index?.count || position.count) / 3 * count;
    geometry.computeBoundingBox();
    assert.ok(!geometry.boundingBox.isEmpty(), `${object.name} has an empty bounding box`);
    finiteArray([...geometry.boundingBox.min, ...geometry.boundingBox.max], `${object.name}.bounds`);
  });
  assert.ok(meshObjects > 0, 'No mesh objects.');
  assert.equal(degenerateNormals, 0, 'Degenerate normals exist.');
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(!bounds.isEmpty(), 'Scene bounds are empty.');
  const size = bounds.getSize(new THREE.Vector3());
  return { objects, meshObjects, instancedMeshes, instances, uniqueGeometries: geometries.size, uniqueMaterials: materials.size, renderedTriangles: triangles, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() } };
}
function allFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? allFiles(path.join(directory, item.name)) : [path.join(directory, item.name)]);
}
function withoutComments(source) {
  let output = '', state = 'code';
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (state === 'line') { if (c === '\n') { state = 'code'; output += '\n'; } else output += ' '; continue; }
    if (state === 'block') { if (c === '*' && next === '/') { state = 'code'; output += '  '; i++; } else output += c === '\n' ? '\n' : ' '; continue; }
    if (state !== 'code') {
      output += c;
      if (c === '\\') { output += next || ''; i++; }
      else if (c === state) state = 'code';
      continue;
    }
    if (c === '/' && next === '/') { state = 'line'; output += '  '; i++; }
    else if (c === '/' && next === '*') { state = 'block'; output += '  '; i++; }
    else { output += c; if (["'", '"', '`'].includes(c)) state = c; }
  }
  return output;
}
function inspectDependencies() {
  const files = allFiles(projectRoot);
  const modelFiles = files.filter((file) => /\.(?:glb|gltf|obj|fbx|stl|dae|blend|3ds|ply)$/i.test(file));
  assert.deepEqual(modelFiles.map(f=>path.relative(projectRoot,f)).sort(),CHARACTER_CATALOG.map(c=>path.relative(projectRoot,c.url.pathname)).sort(),'Only the explicitly requested 17 original character models may be imported.');
  const localReferences = [], unresolved = [], external = [];
  const importMap = {};
  for (const file of files.filter((file) => /\.html?$/i.test(file))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const [, json] of source.matchAll(/<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      for (const [specifier, target] of Object.entries(JSON.parse(json).imports || {})) importMap[specifier] = { target, base: path.dirname(file) };
    }
  }
  for (const file of files.filter((file) => /\.(?:m?js|cjs|html?|css)$/i.test(file))) {
    const source = withoutComments(fs.readFileSync(file, 'utf8'));

    if (!file.split(path.sep).some((part) => ['vendor', 'node_modules'].includes(part)) && !['character.js','character-catalog.js'].includes(path.basename(file))) {
      assert.ok(!/\b(?:new\s+)?(?:GLTFLoader|OBJLoader|FBXLoader|STLLoader|ColladaLoader|DRACOLoader|PLYLoader)\s*\(/.test(source), `${file} uses a model loader.`);
      assert.ok(!/(?:from\s*|import\s*\(|new\s+URL\s*\()["'][^"']*\.(?:glb|gltf|obj|fbx|stl|dae|blend|ply)(?:[?#][^"']*)?["']/.test(source), `${file} imports a model.`);
    }
    const refs = [];
    for (const match of source.matchAll(/(?:^|\n)\s*(?:import\s*(?:[^;]*?\sfrom\s*)?|export\s+[^;]*?\sfrom\s*)["']([^"']+)["']/g)) refs.push(match[1]);
    for (const match of source.matchAll(/(?:\b(?:src|href)\s*=\s*|\bnew\s+URL\s*\(\s*|\bfetch\s*\(\s*)["']([^"']+)["']/g)) refs.push(match[1]);
    for (const match of source.matchAll(/\burl\(\s*["']?([^\s"')]+)["']?\s*\)/g)) refs.push(match[1]);
    for (let reference of refs) {
      let referenceBase = path.dirname(file);
      if (reference.startsWith('#') || reference.startsWith('data:') || reference.startsWith('blob:') || reference.startsWith('mailto:')) continue;
      if (importMap[reference]) { const mapped = importMap[reference]; reference = mapped.target; referenceBase = mapped.base; }
      if (/^(?:https?:)?\/\//.test(reference)) { external.push({ file: path.relative(projectRoot, file), reference }); continue; }
      if (!reference.startsWith('.') && !reference.startsWith('/') && !/\.[a-z\d]+(?:[?#]|$)/i.test(reference)) {
        unresolved.push({ file: path.relative(projectRoot, file), reference, reason: 'Unmapped bare module specifier' });
        continue;
      }
      const resolved = reference.startsWith('/') ? path.resolve(projectRoot, '.' + reference.replace(/[?#].*$/, '')) : path.resolve(referenceBase, reference.replace(/[?#].*$/, ''));
      if (!fs.existsSync(resolved)) unresolved.push({ file: path.relative(projectRoot, file), reference, reason: 'Missing local file' });
      else localReferences.push({ file: path.relative(projectRoot, file), reference });
    }
  }
  assert.deepEqual(external, [], 'Runtime dependency references remote URLs.');
  assert.deepEqual(unresolved, [], 'Runtime references cannot be resolved locally.');
  return { checkedFiles: files.length, resolvedLocalReferences: localReferences.length, modelFiles: modelFiles.length, externalReferences: external.length, localReferences };
}
function inspectRoute(group, stats, module) {
  const road = group.getObjectByName('Continuous 30m-wide road');
  assert.ok(road && !road.isInstancedMesh, 'Expected one merged fork road mesh.');
  assert.equal(stats.roadWidth, 30); assert.equal(stats.rampRise, 11);
  assert.equal(stats.routeLength, 643); assert.equal(stats.roadBranches, 4);


  const p = road.geometry.attributes.position, ray = new THREE.Raycaster();
  let samples = 0, maximumHeightError = 0, minimumNormalY = 1;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = -p.getZ(i);
    assert.ok(y >= ROUTE.start && y <= ROUTE.end);
    assert.ok(roadIntervals(y).some(r => x >= r.min - 4e-5 && x <= r.max + 4e-5), 'Road vertex falls outside requested union.');
    assert.ok(Math.abs(p.getY(i) - surfaceHeight(x, y) - ROAD_SURFACE_OFFSET) < 1e-5);
  }
  group.updateMatrixWorld(true);
  for (let y = ROUTE.start + .125; y < ROUTE.end; y += .25) for (const span of roadIntervals(y)) {
    for (const t of [.002, .2, .41, .73, .998]) {
      const x = span.min + (span.max - span.min) * t;
      ray.set(new THREE.Vector3(x, 30, -y), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(road, false);
      assert.ok(hits.length, `Road missing at x=${x}, station=${y}`);
      const error = Math.abs(hits[0].point.y - surfaceHeight(x, y) - ROAD_SURFACE_OFFSET);
      maximumHeightError = Math.max(maximumHeightError, error); minimumNormalY = Math.min(minimumNormalY, hits[0].face.normal.y);
      assert.ok(error < .002, `Road triangle differs from shared sampler by ${error} m`);
      assert.ok(hits.every(hit => Math.abs(hit.point.y - hits[0].point.y) < 1e-6), 'Overlapping road heights at fork');
      samples++;
    }
  }
  for (const id of ['left', 'right']) {
    assert.equal(branchHeight(id, 74), 11);
    assert.equal(branchHeight(id, 156), id === 'left' ? 0 : 11);
  }
  return { width: stats.roadWidth, rise: stats.rampRise, longitudinalLength: stats.routeLength, roadBranches: 4, raySamples: samples, maximumHeightError, minimumNormalY, triangles: road.geometry.index.count / 3 };
}
function inspectRibbonNormals(group) {
  const surfaces = [];
  group.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || !['Street', 'Sidewalks'].includes(object.parent?.name)) return;
    const normals = object.geometry.getAttribute('normal');
    let minimumY = Infinity, maximumY = -Infinity;
    for (let i = 0; i < normals.count; i++) { minimumY = Math.min(minimumY, normals.getY(i)); maximumY = Math.max(maximumY, normals.getY(i)); }
    surfaces.push({ name: object.name, minimumY, maximumY });
  });
  const downward = surfaces.filter((surface) => surface.minimumY <= 0);
  assert.deepEqual(downward, [], 'Road/sidewalk ribbon normals should face upward.');
  return surfaces;
}
function inspectTerrainClearance(group, module) {
  const terrain = group.getObjectByName('Closed continuous terrain foundation');
  const road = group.getObjectByName('Continuous 30m-wide road');
  assert.ok(terrain && road, 'Expected continuous terrain and road meshes.');
  const p = terrain.geometry.attributes.position, indices = terrain.geometry.index.array;
  const edges = new Map(), keys = [];
  let topVertices = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), h = p.getY(i), y = -p.getZ(i);
    keys.push([x, h, y].map(v => v.toFixed(5)).join(','));
    if (Math.abs(h + 1.8) < 2e-6) continue;
    assert.ok(Math.abs(h - surfaceHeight(x, y)) < 2e-6, 'Terrain vertex differs from shared continuous surface.');
    topVertices++;
  }
  for (let i = 0; i < indices.length; i += 3) for (const [a, b] of [[indices[i], indices[i + 1]], [indices[i + 1], indices[i + 2]], [indices[i + 2], indices[i]]]) {
    const key = [keys[a], keys[b]].sort().join('|');
    assert.notEqual(keys[a], keys[b], 'Zero-length triangle edge remains.');
    edges.set(key, (edges.get(key) || 0) + 1);
  }
  const nonmanifold = [...edges].filter(([, count]) => count !== 2);
  assert.equal(nonmanifold.length, 0, `Terrain must be closed after coordinate welding: ${nonmanifold.length} unmatched edges; ${JSON.stringify(nonmanifold.slice(0, 4))}`);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  let minimumMeshClearance = Infinity, maximumMeshClearance = -Infinity, samples = 0;
  group.updateMatrixWorld(true);
  for (let y = ROUTE.start + .125; y < ROUTE.end; y += .5) for (const span of roadIntervals(y)) for (const t of [.01, .25, .5, .75, .99]) {
    const x = span.min + t * (span.max - span.min);
    ray.set(new THREE.Vector3(x, 30, -y), down);
    const a = ray.intersectObject(road, false)[0], b = ray.intersectObject(terrain, false)[0];
    assert.ok(a && b, 'Both terrain and road must cover the drivable corridor.');
    const clearance = a.point.y - b.point.y;
    minimumMeshClearance = Math.min(minimumMeshClearance, clearance); maximumMeshClearance = Math.max(maximumMeshClearance, clearance);
    assert.ok(Math.abs(clearance - ROAD_SURFACE_OFFSET) < .00002, `Road/terrain separation ${clearance} differs from flat rendering offset.`);
    samples++;
  }
  return { topVertices, closedManifoldEdges: edges.size, roadSamples: samples, minimumMeshClearance, maximumMeshClearance, renderingSeparationMetres: ROAD_SURFACE_OFFSET };
}
function inspectWheelAxes(group) {
  const wheels = [];
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (!object.isInstancedMesh) return;
    object.userData.partNames?.forEach((name, index) => {
      if (!/^(Truck tire|Wheel hub|Hub center|Forklift wheel)$/.test(name)) return;
      const matrix = new THREE.Matrix4(); object.getMatrixAt(index, matrix); matrix.premultiply(object.matrixWorld);
      const axle = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
      assert.ok(Math.abs(axle.x) > 0.99999 && Math.abs(axle.y) < 0.00001 && Math.abs(axle.z) < 0.00001, `${name} cylinder axle is not world-X aligned.`);
      wheels.push({ name, axle: axle.toArray() });
    });
  });
  assert.ok(wheels.length >= 8, 'Expected truck wheel cylinders.');
  return { testedCylinders: wheels.length, axle: 'world X', partNames: [...new Set(wheels.map((wheel) => wheel.name))] };
}
function inspectSimpleResidences(group) {
  const residences = [], extraDetails = [];
  group.updateMatrixWorld(true);
  group.traverse((mesh) => {
    if (!mesh.isMesh || !/residences$/i.test(mesh.parent?.name || '')) return;
    assert.ok(mesh.isInstancedMesh, `${mesh.name}: residence parts should remain batched`);
    assert.equal(mesh.userData.partNames?.length, mesh.count, `${mesh.name}: missing instance names`);
    for (const [index, name] of mesh.userData.partNames.entries()) {
      if (name === 'Terrace plinth') continue;
      if (!/^Residence \d+$/.test(name)) { extraDetails.push(name); continue; }
      assert.equal(mesh.geometry.type, 'BoxGeometry', `${name}: must be a cuboid`);
      assert.equal(mesh.geometry.index.count / 3, 12, `${name}: must have exactly 12 triangles`);
      assert.equal(mesh.geometry.attributes.position.count, 24, `${name}: expected six flat-shaded faces`);
      assert.equal(mesh.geometry.attributes.uv.count, 24, `${name}: every face needs UV coordinates`);
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
      const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      matrix.decompose(position, rotation, scale);
      assert.ok(scale.toArray().every((n) => n > 0), `${name}: invalid cuboid scale`);
      assert.ok(Math.abs(rotation.x) + Math.abs(rotation.z) < 1e-8, `${name}: cuboid unexpectedly pitched or rolled`);
      residences.push({ name, triangles: 12, size: scale.toArray() });
    }
  });
  assert.ok(residences.length >= 60, 'Continuous edge rows need at least 60 ordinary cuboid residences');
  assert.equal(new Set(residences.map((item) => item.name)).size, residences.length, 'Duplicate residence bodies');
  assert.deepEqual(extraDetails, [], 'Ordinary residences retain window, balcony, roof, or other decoration meshes');
  return { residences, bodyTriangles: residences.length * 12, decorativeMeshes: extraDetails.length, buildingRowsFollowRoadEdges: true };
}
function inspectDisposal(city) {
  assert.equal(typeof city.dispose, 'function', 'buildCity should expose dispose().');
  const resources = new Map();
  city.group.traverse((object) => {
    if (object.isInstancedMesh) resources.set(object, { type: 'InstancedMesh', name: object.name, calls: 0 });
    if (object.geometry) resources.set(object.geometry, { type: 'BufferGeometry', name: object.geometry.name, calls: 0 });
    for (const material of [].concat(object.material || [])) resources.set(material, { type: 'Material', name: material.name, calls: 0 });
  });
  for (const [resource, record] of resources) resource.addEventListener('dispose', () => record.calls++);
  city.dispose();
  const missing = [...resources.values()].filter((record) => record.calls !== 1);
  assert.deepEqual(missing, [], 'Each owned geometry, material, and instanced mesh needs one dispose event.');
  return [...resources.values()].reduce((totals, record) => { totals[record.type] = (totals[record.type] || 0) + 1; return totals; }, {});
}

try {
  const source = withoutComments(fs.readFileSync(scenePath, 'utf8'));
  check('Generator contains no model-loader imports', () => {
    assert.ok(!/\b(?:GLTFLoader|OBJLoader|FBXLoader|STLLoader|ColladaLoader|DRACOLoader|PLYLoader)\b/.test(source), 'Generator references a model loader.');
    assert.ok(!/\b(?:Math\.random|Date\.now)\s*\(/.test(source), 'Generator uses an unseeded random or time source.');
  });
  const module = await import(pathToFileURL(scenePath));
  assert.equal(typeof module.buildCity, 'function', 'Expected named buildCity export.');
  const first = normalizeResult(module.buildCity(THREE, { seed: 2026 }));
  const second = normalizeResult(module.buildCity(THREE, { seed: 2026 }));
  const third = normalizeResult(module.buildCity(THREE, { seed: 2027 }));
  const hashes = { first: fingerprint(first.group), sameSeed: fingerprint(second.group), differentSeed: fingerprint(third.group) };
  check('Seed determinism', () => { assert.equal(hashes.first, hashes.sameSeed); assert.deepEqual(canonical(first.stats), canonical(second.stats)); return hashes.first; });
  check('Changing seed changes scene', () => { assert.notEqual(hashes.first, hashes.differentSeed); return hashes.differentSeed; });
  let structural;
  check('Finite indexed geometry, normals, transforms, and bounds', () => structural = inspectGeometry(first.group));
  check('Object and instancing budgets', () => {
    assert.ok(structural, 'Geometry check must pass first.');
    assert.ok(structural.objects <= 60, 'Optimization regressed above 60 Object3D nodes.');
    assert.ok(structural.meshObjects <= 30, 'Optimization regressed above 30 mesh batches.');
    assert.ok(structural.renderedTriangles <= 60_000, 'Optimization regressed above 60,000 rendered triangles for the 643m network.');
    assert.ok(structural.instances <= 1_600, 'Optimization regressed above 1,600 instances.');
    assert.ok(structural.instancedMeshes > 0, 'Repeated scene elements should use InstancedMesh.');
    return { objects: structural.objects, meshObjects: structural.meshObjects, instancedMeshes: structural.instancedMeshes, instances: structural.instances, renderedTriangles: structural.renderedTriangles };
  });
  check('Fork width, branch elevations, actual triangles and shared ground sampler', () => inspectRoute(first.group, first.stats, module));
  check('Road and sidewalk normals face upward', () => inspectRibbonNormals(first.group));
  check('Closed continuous terrain stays flush beneath the fork road', () => inspectTerrainClearance(first.group, module));
  check('Vehicle wheel cylinders have correct axle orientation', () => inspectWheelAxes(first.group));
  check('Continuous ordinary residence rows are single 12-triangle textured cuboids', () => inspectSimpleResidences(first.group));
  check('Reported geometry counts agree with actual scene', () => {
    assert.ok(structural, 'Geometry check must pass first.');
    if (first.stats.instances !== undefined) assert.equal(first.stats.instances, structural.instances, 'Instance count mismatch.');
    if (first.stats.triangles !== undefined) assert.equal(first.stats.triangles, structural.renderedTriangles, 'Triangle count mismatch.');
    if (first.stats.drawCalls !== undefined) assert.equal(first.stats.drawCalls, structural.meshObjects, 'Mesh batch count mismatch.');
    return { instances: first.stats.instances, triangles: first.stats.triangles, meshBatches: first.stats.drawCalls };
  });
  check('Legacy studs option never restores geometry', () => {
    const withoutStuds = normalizeResult(module.buildCity(THREE, { seed: 2026, studs: false }));
    const reduced = inspectGeometry(withoutStuds.group);
    try {
      assert.equal(reduced.instances, structural.instances, 'Legacy studs option changes instance count');
      assert.equal(reduced.renderedTriangles, structural.renderedTriangles, 'Legacy studs option changes triangle count');
      assert.equal(reduced.meshObjects, structural.meshObjects, 'Legacy studs option changes batches');
      for (const city of [first, withoutStuds]) city.group.traverse((object) => {
        assert.ok(!/stud/i.test(object.name), `${object.name}: actual stud mesh remains`);
        assert.equal(object.userData.partNames?.filter((name) => /stud/i.test(name)).length || 0, 0, 'Actual stud instances remain');
      });
      return { instances: reduced.instances, renderedTriangles: reduced.renderedTriangles, actualStudMeshes: 0, geometryUnchangedByLegacyOption: true };
    } finally { withoutStuds.dispose(); }
  });
  check('All distribution dependencies local; only requested 17 character GLBs imported', inspectDependencies);
  check('Regeneration disposal releases mesh instance buffers and shared resources', () => inspectDisposal(third));
  report.stats = canonical(first.stats);
  report.notes.push('Checks are structural Node.js tests, not a browser render or visual inspection.');
} catch (error) {
  failures++;
  report.checks.push({ name: 'Load and build procedural module', status: 'failed', error: error.stack || String(error) });
}
report.passed = failures === 0;
report.failedChecks = failures;
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = failures ? 1 : 0;
