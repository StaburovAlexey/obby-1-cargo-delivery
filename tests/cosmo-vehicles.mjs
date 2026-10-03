#!/usr/bin/env node
// Real packaged GLBs parsed with installed GLTFLoader, CPU only. Image bitmaps
// are dimensions-only stubs; no browser, socket, WebGL, rendered-image claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.js';
import {
  COSMO_VEHICLES, COSMO_VEHICLE_SCALE, loadCosmoVehicle, createCosmoVehicleAdapter, clearCosmoVehicleCache,
} from '../dist/cosmo-vehicles.js';

const originalFetch = globalThis.fetch;
const bitmaps = [], requests = new Map();
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const png = Buffer.from(await blob.arrayBuffer());
  const bitmap = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), closes: 0, close() { this.closes++; } };
  bitmaps.push(bitmap);
  return bitmap;
};
globalThis.fetch = async request => {
  const url = typeof request === 'string' ? request : request.url;
  if (url.startsWith('blob:')) return originalFetch(request);
  assert.ok(url.startsWith('file:'), `Unexpected nonlocal request: ${url}`);
  requests.set(url, (requests.get(url) ?? 0) + 1);
  return new Response(fs.readFileSync(new URL(url)), { status: 200 });
};
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const nearArray = (a, b, epsilon = 1e-6) => { assert.equal(a.length, b.length); a.forEach((v, i) => near(v, b[i], epsilon)); };
function resourceSets(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of (Array.isArray(node.material) ? node.material : node.material ? [node.material] : [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  return { geometries, materials, textures };
}
function matrices(group) {
  group.updateWorldMatrix(true, true);
  const result = [];
  group.traverse(node => { if (node.isMesh) result.push(node.matrixWorld.elements.slice()); });
  return result;
}

assert.equal(COSMO_VEHICLES.length, 10);
assert.equal(new Set(COSMO_VEHICLES.map(spec => spec.model)).size, 10);
assert.deepEqual(COSMO_VEHICLES.map(spec => spec.id), ['pickup', 'citycourier', 'rover', 'foresthauler', 'van', 'desertscout', 'snowgrip', 'snowrunner', 'lavacrawler', 'ashhauler']);
for (const biome of ['city', 'forest', 'desert', 'snow', 'lava'])
  assert.equal(COSMO_VEHICLES.filter(spec => spec.biome === biome).length, 2);
const manifest = JSON.parse(fs.readFileSync(new URL('../dist/assets/vehicles/cosmo/manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.files.length, 10);
for (const entry of manifest.files) {
  const bytes = fs.readFileSync(new URL(`../dist/assets/vehicles/cosmo/${entry.file}`, import.meta.url));
  assert.equal(bytes.length, entry.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
}
assert.match(fs.readFileSync(new URL('../dist/assets/vehicles/cosmo/License.txt', import.meta.url), 'utf8'), /CC0 1.0 Universal/);

const adapters = await Promise.all(COSMO_VEHICLES.map(spec => loadCosmoVehicle(THREE, spec.id)));
const sharedTextures = new Set(adapters.flatMap(adapter => [...resourceSets(adapter.group).textures]));
assert.equal(sharedTextures.size, 2, 'ten cars share exactly two original sampler variants');
assert.equal(new Set([...sharedTextures].map(texture => texture.source)).size, 1);
assert.equal(bitmaps.filter(bitmap => bitmap.closes === 0).length, 1, 'one retained decoded palette');
let sharedTextureDisposes = 0;
for (const texture of sharedTextures) texture.addEventListener('dispose', () => sharedTextureDisposes++);
let totalTriangles = 0, totalPrimitives = 0;
for (const adapter of adapters) {
  const { group, body, wheels, metadata } = adapter;
  totalTriangles += metadata.triangles;
  totalPrimitives += metadata.primitives;
  const rest = matrices(group);
  const bounds = new THREE.Box3().setFromObject(group, true);
  near(bounds.min.y, 0.05);
  near(bounds.min.x + bounds.max.x, 0);
  near(bounds.min.z + bounds.max.z, 0);
  const size = bounds.getSize(new THREE.Vector3());
  assert.equal(COSMO_VEHICLE_SCALE, 1.5);
  assert.equal(metadata.sizeMultiplier, 1.5);
  assert.ok(size.x <= 4.65 + 1e-6 && size.z <= 8.64 + 1e-6, `${metadata.id} footprint`);
  nearArray(size.toArray(), metadata.dimensions);
  metadata.sourceSize.forEach((v, i) => near(v * metadata.uniformScale, metadata.dimensions[i]));
  assert.equal(metadata.sourceForward, '+Z');
  assert.equal(metadata.forward, '-Z');
  assert.equal(wheels.length, 4);
  assert.equal(new Set(wheels.map(wheel => wheel.name)).size, 4);
  assert.equal(metadata.wheels, metadata.wheelContacts);
  assert.equal(metadata.wheels.length, 4);
  metadata.wheels.forEach((contact, i) => {
    const wheel = wheels[i];
    nearArray(contact.center, wheel.localPosition.toArray());
    nearArray([contact.position.x, contact.position.y, contact.position.z], contact.center);
    near(contact.radius, wheel.radius);
    near(contact.halfWidth, wheel.halfWidth);
    assert.ok(contact.vertices.length > 20);
    near(Math.max(...contact.vertices.map(([x]) => Math.abs(x))), contact.halfWidth);
    near(Math.max(...contact.vertices.map(([, y, z]) => Math.hypot(y, z))), contact.radius);
    assert.ok(Object.isFrozen(contact) && Object.isFrozen(contact.vertices));
  });
  const centers = wheels.map(wheel => wheel.pivot.getWorldPosition(new THREE.Vector3()).toArray());
  for (const wheel of wheels) {
    assert.equal(wheel.pivot.parent, group);
    assert.equal(wheel.node.parent, wheel.spin);
    assert.equal(wheel.front, wheel.localPosition.z < 0);
    assert.equal(wheel.side, wheel.localPosition.x < 0 ? 'left' : 'right');
    const wheelBounds = new THREE.Box3().setFromObject(wheel.node, true);
    nearArray(wheelBounds.getCenter(new THREE.Vector3()).toArray(), wheel.localPosition.toArray());
    assert.ok(wheel.radius > 0.25 * 1.5 && wheel.radius < 0.8 * 1.5);
    const wheelSize = wheelBounds.getSize(new THREE.Vector3());
    assert.ok(wheelSize.x < wheelSize.y * .7, 'tire axle is X');
    assert.ok(wheelSize.x < wheelSize.z * .7, 'tire axle is X');
  }
  group.traverse(node => {
    if (!node.isMesh) return;
    assert.ok(node.castShadow && node.receiveShadow);
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      assert.ok(material.emissiveIntensity <= 0.65);
      assert.ok(material.map || material.emissiveMap, `${metadata.id} retained palette texture`);
    }
  });
  adapter.update({ position: [100, 20, -60], quaternion: [0, 1, 0, 0], steerAngle: 0.42, wheelSpin: 1.8, bodyPitch: .12, bodyRoll: -.08, bodyBob: .17 });
  nearArray(group.position.toArray(), [0, 0, 0]);
  nearArray(group.quaternion.toArray(), [0, 0, 0, 1]);
  nearArray(body.position.toArray(), [0, .17, 0]);
  wheels.forEach((wheel, i) => {
    nearArray(wheel.pivot.getWorldPosition(new THREE.Vector3()).toArray(), centers[i]);
    near(wheel.pivot.rotation.y, wheel.front ? .42 : 0);
    near(wheel.wheelSpin * wheel.radius, 1.8 * .68);
    near(wheel.spin.rotation.x, -(wheel.wheelSpin % (Math.PI * 2)));
  });
  // Mixed-invalid poses must not partially mutate either body or wheels.
  const stateBeforeBadPose = matrices(group);
  assert.throws(() => adapter.update({ bodyBob: .9, wheelSpin: NaN }), /finite/);
  assert.deepEqual(matrices(group), stateBeforeBadPose);
  adapter.update({ wheelSpin: -3.2 });
  wheels.forEach(wheel => near(wheel.wheelSpin * wheel.radius, -3.2 * .68));
  near(body.position.y, .17);
  adapter.reset();
  matrices(group).forEach((matrix, i) => nearArray(matrix, rest[i]));
  assert.ok(adapter.cargoPosition.y - .55 > .5, 'cargo sits above roof');
  assert.ok(Math.abs(adapter.cargoPosition.z) + .59 < size.z / 2);

  // Shader substitutions target audited body paint only, leaving actual palette
  // PNGs, light/glass materials and wheel materials unchanged.
  const painted = [];
  body.traverse(node => {
    if (node.material && ['metallic', 'texture'].includes(node.material.name)) {
      assert.ok(node.material.metalness <= .22);
      assert.ok(node.material.roughness >= .32);
    }
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of materials) if (material.userData.cosmoPaintSwatches) painted.push(material);
  });
  if (metadata.paintSwatches.length) {
    assert.ok(painted.length > 0);
    for (const material of new Set(painted)) {
      assert.ok(['metallic', 'texture'].includes(material.name));
      const shader = { uniforms: {}, fragmentShader: 'void main() {\n#include <map_fragment>\n}' };
      material.onBeforeCompile(shader);
      assert.match(shader.fragmentShader, /texture2D\( map, vMapUv \)/);
      assert.match(shader.fragmentShader, /distance\(sampledDiffuseColor.rgb, cosmoPaintSource0\)/);
      assert.ok(shader.uniforms.cosmoPaintTarget0.value.isColor);
    }
  }
  for (const wheel of wheels) wheel.node.traverse(node => {
    for (const material of (Array.isArray(node.material) ? node.material : node.material ? [node.material] : []))
      assert.equal(material.userData.cosmoPaintSwatches, undefined);
  });
  console.log(`PASS ${metadata.id}: ${metadata.model}, 4 pivoted wheels, ${metadata.triangles} triangles, ${metadata.primitives} primitives`);
}
assert.equal(totalTriangles, 23207);
assert.equal(totalPrimitives, 109);
console.log('PASS all ten source palettes, +Z→-Z, uniform fit, grounding, articulation and cargo metadata');

// Concurrent loads share immutable bytes/palette. Geometry and materials remain independent.
const [a, b] = await Promise.all([loadCosmoVehicle(THREE, 'pickup'), loadCosmoVehicle(THREE, 'pickup')]);
assert.equal(requests.get(COSMO_VEHICLES[0].url), 1);
const aResources = resourceSets(a.group), bResources = resourceSets(b.group);
for (const key of ['geometries', 'materials'])
  for (const resource of aResources[key]) assert.ok(!bResources[key].has(resource), `independent ${key}`);
for (const texture of aResources.textures) assert.ok(bResources.textures.has(texture), 'immutable palette textures shared');
const foreignGeometry = new THREE.BoxGeometry(), foreignMaterial = new THREE.MeshBasicMaterial();
let foreignDisposes = 0;
foreignGeometry.addEventListener('dispose', () => foreignDisposes++);
foreignMaterial.addEventListener('dispose', () => foreignDisposes++);
const crate = new THREE.Mesh(foreignGeometry, foreignMaterial);
a.body.add(crate);
let expectedDisposes = 0, actualDisposes = 0;
for (const set of [aResources.geometries, aResources.materials]) for (const resource of set) {
  expectedDisposes++; resource.addEventListener('dispose', () => actualDisposes++);
}
const root = new THREE.Group(); root.add(a.group);
a.dispose(); a.dispose(); a.update({ bodyBob: 2 }); a.reset();
assert.equal(a.group.parent, null);
assert.equal(a.disposed, true);
assert.equal(actualDisposes, expectedDisposes);
assert.equal(foreignDisposes, 0, 'externally-owned cargo resources survive disposal');
assert.equal(sharedTextureDisposes, 0, 'shared palette survives individual adapter disposal');
b.update({ bodyBob: .2 }); near(b.body.position.y, .2);
b.dispose();
foreignGeometry.dispose(); foreignMaterial.dispose();

// Raw parsing route is real GLTFLoader too and prevents accidental double-adoption.
const bytes = fs.readFileSync(new URL(COSMO_VEHICLES[0].url));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const raw = createCosmoVehicleAdapter(THREE, 'pickup', gltf);
assert.throws(() => createCosmoVehicleAdapter(THREE, 'pickup', gltf), /already belongs/);
raw.dispose();
await assert.rejects(loadCosmoVehicle(THREE, 'not-a-car'), /Unknown/);
for (const adapter of adapters) adapter.dispose();
assert.equal(sharedTextureDisposes, 2, 'each pooled texture disposes once after final adapter');
assert.ok(bitmaps.length > 0);
assert.ok(bitmaps.every(bitmap => bitmap.closes === 1), 'every owned bitmap closes exactly once');
clearCosmoVehicleCache();
const fresh = await loadCosmoVehicle(THREE, 'pickup');
assert.equal(requests.get(COSMO_VEHICLES[0].url), 2);
fresh.dispose();
// Failed transport is evicted so a later explicit load can recover.
clearCosmoVehicleCache();
const workingFetch = globalThis.fetch;
let failNext = true;
globalThis.fetch = async request => {
  const url = typeof request === 'string' ? request : request.url;
  if (url === COSMO_VEHICLES[0].url && failNext) { failNext = false; return new Response('', { status: 503 }); }
  return workingFetch(request);
};
await assert.rejects(loadCosmoVehicle(THREE, 'pickup'), /503/);
const recovered = await loadCosmoVehicle(THREE, 'pickup');
recovered.dispose();
globalThis.fetch = originalFetch;
console.log('PASS cached bytes, independent resources, late-result disposal, idempotence and bitmap cleanup');
console.log(`Cosmo CPU adapter checks passed: ${totalTriangles} triangles / ${totalPrimitives} primitives. No GPU/browser verification performed.`);
