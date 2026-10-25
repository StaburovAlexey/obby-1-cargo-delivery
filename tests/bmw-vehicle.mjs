#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.js';
import { BMW_VEHICLE, BMW_VEHICLE_LENGTH, loadBMWVehicle,
  createBMWVehicleAdapter, clearBMWVehicleCache } from '../dist/bmw-vehicle.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const nearArray = (a, b, e = 1e-6) => { assert.equal(a.length, b.length); a.forEach((v, i) => near(v, b[i], e)); };
const materialsOf = n => Array.isArray(n.material) ? n.material : n.material ? [n.material] : [];
function resourcesOf(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of materialsOf(node)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  return { geometries, materials, textures };
}
function matrices(group) {
  group.updateWorldMatrix(true, true);
  const values = [];
  group.traverse(node => { if (node.isMesh) values.push(node.matrixWorld.elements.slice()); });
  return values;
}

const bytes = fs.readFileSync(new URL(BMW_VEHICLE.url));
assert.equal(bytes.length, 353124);
assert.equal(createHash('sha256').update(bytes).digest('hex'), '1d46ba0f0eb984b2cffff0279c13e4550d80d99fe95fc42a0559370cd3c5aba5');
assert.equal(bytes.readUInt32LE(0), 0x46546c67);
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
assert.equal(json.asset.extras.title, 'Low Poly BMW G80 M3');
assert.match(json.asset.extras.author, /SharkyStudios/);
assert.match(json.asset.extras.license, /CC-BY-4\.0/);
assert.equal(json.materials.length, 9);
assert.equal(json.textures?.length ?? 0, 0);
assert.equal(json.images?.length ?? 0, 0);
const attribution = fs.readFileSync(new URL('../dist/assets/vehicles/bmw/License.txt', import.meta.url), 'utf8');
for (const phrase of ['SharkyStudios', 'creativecommons.org/licenses/by/4.0/', 'gold', json.asset.extras.source])
  assert.ok(attribution.includes(phrase), `Attribution contains ${phrase}`);
const manifest = JSON.parse(fs.readFileSync(new URL('../dist/assets/vehicles/bmw/manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.files[0].bytes, bytes.length);
assert.equal(manifest.files[0].sha256, createHash('sha256').update(bytes).digest('hex'));

const parse = () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const original = await parse();
original.scene.updateWorldMatrix(true, true);
const sourceResources = resourcesOf(original.scene);
const sourceMaterials = new Map([...sourceResources.materials].map(m => [m.name, {
  color: m.color.toArray(), emissive: m.emissive.toArray(), metalness: m.metalness,
  roughness: m.roughness, emissiveIntensity: m.emissiveIntensity, side: m.side,
  transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest,
}]));
const sourceBounds = new THREE.Box3().setFromObject(original.scene, true);
nearArray(sourceBounds.getSize(new THREE.Vector3()).toArray(), [2.0190786864069388, 1.4566440563116303, 4.777743755163977]);
const sourceWhiteLights = original.scene.getObjectByName('Plane002_Material019_0');
const sourceRedLights = original.scene.getObjectByName('Plane002_Material018_0');
assert.ok(new THREE.Box3().setFromObject(sourceWhiteLights, true).min.z > 1.9, 'Headlights establish +Z source forward');
assert.ok(new THREE.Box3().setFromObject(sourceRedLights, true).max.z < -1.8, 'Red tail lamps establish source rear');

const adapter = createBMWVehicleAdapter(THREE, BMW_VEHICLE.id, original);
const { group, body, wheels, metadata } = adapter;
const resources = resourcesOf(group), allOwned = new Set();
for (const collection of [...Object.values(sourceResources), ...Object.values(resources)]) for (const value of collection) allOwned.add(value);
let disposalCount = 0;
for (const value of allOwned) value.addEventListener('dispose', () => disposalCount++);
const rest = matrices(group), bounds = new THREE.Box3().setFromObject(group, true);
const dimensions = bounds.getSize(new THREE.Vector3());
assert.equal(metadata.id, 'bmwreward');
assert.equal(BMW_VEHICLE_LENGTH, 8);
near(dimensions.z, 8);
near(dimensions.x, 3.3808069915422116);
assert.ok(dimensions.x <= 4.65);
near(bounds.min.y, .05);
near(bounds.min.x + bounds.max.x, 0);
near(bounds.min.z + bounds.max.z, 0);
nearArray(dimensions.toArray(), metadata.dimensions);
nearArray(group.scale.toArray(), [1, 1, 1]);
nearArray(group.position.toArray(), [0, 0, 0]);
nearArray(group.quaternion.toArray(), [0, 0, 0, 1]);
metadata.sourceSize.forEach((v, i) => near(v * metadata.uniformScale, metadata.dimensions[i]));
near(metadata.uniformScale, 1.6744305282913676);
assert.equal(metadata.sourceForward, '+Z');
assert.equal(metadata.forward, '-Z');
assert.equal(metadata.up, '+Y');
assert.equal(metadata.triangles, 6618);
assert.equal(metadata.primitives, 16);
assert.equal(resources.geometries.size, 16);
assert.equal(resources.materials.size, 9);
assert.equal(resources.textures.size, 1);
assert.equal(metadata.textureCount, 1);
assert.ok(new THREE.Box3().setFromObject(sourceWhiteLights, true).max.z < -3);
assert.ok(new THREE.Box3().setFromObject(sourceRedLights, true).min.z > 3);

assert.equal(wheels.length, 4);
assert.deepEqual(wheels.map(w => w.name), ['front-left', 'front-right', 'rear-left', 'rear-right']);
assert.equal(metadata.wheels, metadata.wheelContacts);
for (const [i, wheel] of wheels.entries()) {
  const box = new THREE.Box3().setFromObject(wheel.node, true);
  const contact = metadata.wheelContacts[i];
  nearArray(box.getCenter(new THREE.Vector3()).toArray(), wheel.localPosition.toArray());
  nearArray(contact.center, wheel.localPosition.toArray());
  nearArray([contact.position.x, contact.position.y, contact.position.z], contact.center);
  near(wheel.radius, .564649846197826);
  near(wheel.halfWidth, .27592217233284);
  near(Math.abs(wheel.localPosition.x), 1.302507808452286);
  near(wheel.localPosition.z, wheel.front ? -2.583029430974918 : 2.221491636941347);
  near(contact.radius, Math.max(...contact.vertices.map(([, y, z]) => Math.hypot(y, z))));
  near(contact.halfWidth, Math.max(...contact.vertices.map(([x]) => Math.abs(x))));
  assert.ok(contact.vertices.length > 150);
  assert.ok(Object.isFrozen(contact) && Object.isFrozen(contact.center) && Object.isFrozen(contact.vertices));
  assert.equal(wheel.pivot.parent, group);
  assert.equal(wheel.spin.parent, wheel.pivot);
  assert.equal(wheel.node.parent, wheel.spin);
  const expected = new Set(contact.vertices.map(p => p.map(v => v.toFixed(5)).join(',')));
  wheel.node.traverse(mesh => {
    const positions = mesh.geometry?.attributes?.position;
    if (!positions) return;
    for (let j = 0; j < positions.count; j++) {
      const v = new THREE.Vector3().fromBufferAttribute(positions, j).applyMatrix4(mesh.matrixWorld).sub(wheel.localPosition);
      assert.ok(expected.has(v.toArray().map(x => x.toFixed(5)).join(',')), 'Contact vertices come from the actual normalized tire/rim mesh');
    }
  });
}

const gold = [...resources.materials].filter(m => m.userData.bmwGoldBodyFinish);
assert.equal(gold.length, 1);
assert.equal(gold[0].name, 'Material.015');
assert.equal(gold[0].color.getHex(), 0xffc52e);
near(gold[0].metalness, .9);
near(gold[0].roughness, .22);
near(gold[0].emissiveIntensity, .12);
assert.ok(gold[0].emissive.r > gold[0].emissive.g && gold[0].emissive.g > gold[0].emissive.b);
const environment = gold[0].envMap;
assert.ok(environment.isDataTexture);
assert.equal(environment.mapping, THREE.EquirectangularReflectionMapping);
assert.equal(environment.colorSpace, THREE.LinearSRGBColorSpace);
assert.equal(environment.image.width, 128);
assert.equal(environment.image.height, 64);
assert.equal(environment.image.data.byteLength, 32768);
const rgb = [...environment.image.data].filter((_, i) => i % 4 !== 3);
assert.ok(Math.max(...rgb) > 245 && Math.min(...rgb) > 40, 'Bright, non-black reflection input');
assert.ok(Math.max(...rgb) - Math.min(...rgb) > 150, 'Environment has visible reflective contrast');
assert.equal(new Set(rgb).size > 100, true, 'Environment has smooth light variation');
group.traverse(mesh => {
  if (!mesh.isMesh) return;
  assert.ok(mesh.castShadow);
  assert.equal(mesh.receiveShadow, false);
  for (const material of materialsOf(mesh)) {
    assert.equal(material.side, THREE.DoubleSide);
    assert.equal(material.shadowSide, THREE.BackSide);
    assert.ok(material.emissiveIntensity <= .65);
    if (material.userData.bmwGoldBodyFinish) continue;
    const source = sourceMaterials.get(material.name);
    nearArray(material.color.toArray(), source.color);
    nearArray(material.emissive.toArray(), source.emissive);
    near(material.metalness, source.metalness);
    near(material.roughness, source.roughness);
    near(material.emissiveIntensity, Math.min(source.emissiveIntensity, .65));
    assert.equal(material.transparent, source.transparent);
    assert.equal(material.opacity, source.opacity);
    assert.equal(material.alphaTest, source.alphaTest);
    assert.equal(material.envMap, null, 'Only gold paint has a new environment');
  }
});
for (const wheel of wheels) wheel.node.traverse(node => {
  for (const material of materialsOf(node)) assert.equal(material.userData.bmwGoldBodyFinish, undefined);
});

const centers = wheels.map(w => w.pivot.getWorldPosition(new THREE.Vector3()).toArray());
adapter.update({ position: [99, 20, 50], quaternion: [0, 1, 0, 0], steerAngle: .37, wheelSpin: 2.4, bodyBob: .14, bodyPitch: .1, bodyRoll: -.08 });
nearArray(group.position.toArray(), [0, 0, 0]);
nearArray(group.quaternion.toArray(), [0, 0, 0, 1]);
near(body.position.y, .14);
wheels.forEach((wheel, i) => {
  nearArray(wheel.pivot.getWorldPosition(new THREE.Vector3()).toArray(), centers[i]);
  near(wheel.pivot.rotation.y, wheel.front ? .37 : 0);
  near(wheel.wheelSpin * wheel.radius, 2.4 * .68);
  near(wheel.spin.rotation.x, -(wheel.wheelSpin % (Math.PI * 2)));



  const expected = new Set(wheel.contactVertices.map(point => new THREE.Vector3(...point)
    .applyMatrix4(wheel.spin.matrixWorld).toArray().map(v => v.toFixed(5)).join(',')));
  wheel.node.traverse(mesh => {
    const positions = mesh.geometry?.attributes?.position;
    if (!positions) return;
    for (let j = 0; j < positions.count; j++) {
      const actual = new THREE.Vector3().fromBufferAttribute(positions, j).applyMatrix4(mesh.matrixWorld);
      assert.ok(expected.has(actual.toArray().map(v => v.toFixed(5)).join(',')), 'Wheel rotates about its own axle center');
    }
  });
});
const beforeInvalid = matrices(group);
assert.throws(() => adapter.update({ bodyBob: .9, wheelSpin: NaN }), /finite/);
assert.deepEqual(matrices(group), beforeInvalid);
assert.throws(() => adapter.update(null), /pose object/);
adapter.update({ wheelSpin: -3.2 });
wheels.forEach(wheel => near(wheel.wheelSpin * wheel.radius, -3.2 * .68));
adapter.reset();
matrices(group).forEach((matrix, i) => nearArray(matrix, rest[i]));
assert.throws(() => createBMWVehicleAdapter(THREE, BMW_VEHICLE.id, original), /already belongs/);
assert.throws(() => createBMWVehicleAdapter(THREE, BMW_VEHICLE.id, {}), /parsed GLTF/);

const externalGeometry = new THREE.BoxGeometry(), externalMaterial = new THREE.MeshBasicMaterial();
let externalDisposals = 0;
externalGeometry.addEventListener('dispose', () => externalDisposals++);
externalMaterial.addEventListener('dispose', () => externalDisposals++);
body.add(new THREE.Mesh(externalGeometry, externalMaterial));
const parent = new THREE.Group(); parent.add(group);
adapter.dispose(); adapter.dispose(); adapter.update({ bodyBob: 1 }); adapter.reset();
assert.equal(group.parent, null);
assert.equal(adapter.disposed, true);
assert.equal(disposalCount, allOwned.size, 'Every owned resource, including replaced source paint, disposes once');
assert.equal(externalDisposals, 0, 'External cargo resources survive');
externalGeometry.dispose(); externalMaterial.dispose();

const originalFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = async url => {
  assert.equal(url, BMW_VEHICLE.url, 'Only the local bundled file is requested');
  requests++;
  return new Response(bytes);
};
try {
  clearBMWVehicleCache();
  const [a, b] = await Promise.all([loadBMWVehicle(THREE), loadBMWVehicle(THREE, 'bmwreward')]);
  assert.equal(requests, 1, 'Concurrent loads share immutable source bytes');
  const ar = resourcesOf(a.group), br = resourcesOf(b.group);
  for (const key of Object.keys(ar)) for (const resource of ar[key]) assert.ok(!br[key].has(resource), `Independent ${key}`);
  a.dispose(); b.update({ bodyBob: .2 }); near(b.body.position.y, .2); b.dispose();
  clearBMWVehicleCache();
  const c = await loadBMWVehicle(THREE); c.dispose(); assert.equal(requests, 2);
  await assert.rejects(loadBMWVehicle(THREE, 'pickup'), /Unknown BMW/);
  clearBMWVehicleCache();
  globalThis.fetch = async () => new Response('', { status: 503 });
  await assert.rejects(loadBMWVehicle(THREE), /503/);
  globalThis.fetch = async () => new Response(bytes);
  const recovered = await loadBMWVehicle(THREE); recovered.dispose();
} finally { globalThis.fetch = originalFetch; clearBMWVehicleCache(); }

const invalid = await parse();
const badResources = resourcesOf(invalid.scene);
let failedDisposals = 0, expectedFailedDisposals = 0;
for (const set of Object.values(badResources)) for (const value of set) {
  expectedFailedDisposals++; value.addEventListener('dispose', () => failedDisposals++);
}
invalid.scene.getObjectByName('Plane003').name = 'unexpected-wheel';
assert.throws(() => createBMWVehicleAdapter(THREE, 'bmwreward', invalid), /expected four wheels/);
assert.equal(failedDisposals, expectedFailedDisposals, 'Construction failures release adopted resources');
console.log(JSON.stringify({ passed: true, scope: 'Actual BMW GLB, CPU geometry/material/resource checks; no GPU claim',
  triangles: metadata.triangles, primitives: metadata.primitives, dimensions: metadata.dimensions,
  radius: wheels[0].radius, reflectionTextureBytes: environment.image.data.byteLength }));
