#!/usr/bin/env node
// Actual eleven packaged GLBs and real GLTFLoader, CPU-only. PNG pixels are
// decoded below to independently verify red/yellow rear-lens selection.
// No browser, socket, renderer, bloom or GPU appearance claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import * as THREE from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.js';
import { COSMO_VEHICLES, createCosmoVehicleAdapter } from '../dist/cosmo-vehicles.js';
import { BMW_VEHICLE, createBMWVehicleAdapter } from '../dist/bmw-vehicle.js';

globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), close() {} };
};
const materialList = node => Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
function resources(root) {
  const materials = new Set(), geometries = new Set(), textures = new Set();
  root.traverse(mesh => {
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of materialList(mesh)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  return { materials, geometries, textures };
}
const appearance = material => ({ color: material.color.toArray(), emissive: material.emissive.toArray(),
  intensity: material.emissiveIntensity, metalness: material.metalness, roughness: material.roughness,
  side: material.side, opacity: material.opacity, transparent: material.transparent,
  map: material.map?.uuid, emissiveMap: material.emissiveMap?.uuid, envMap: material.envMap?.uuid });
const textureState = texture => [texture.source.uuid, texture.offset.toArray(), texture.repeat.toArray(),
  texture.rotation, texture.wrapS, texture.wrapT, texture.colorSpace, texture.flipY, texture.version];
function matrices(root) {
  root.updateWorldMatrix(true, true);
  const result = [];
  root.traverse(node => result.push(node.matrixWorld.elements.slice()));
  return result;
}
function pngPixels(bytes) {
  assert.equal(bytes[24], 8, '8-bit palette PNG');
  assert.equal(bytes[25], 6, 'RGBA palette PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), chunks = [];
  for (let p = 8; p < bytes.length;) {
    const length = bytes.readUInt32BE(p), type = bytes.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') chunks.push(bytes.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const packed = inflateSync(Buffer.concat(chunks)), stride = width * 4;
  const data = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)];
    assert.ok(filter >= 0 && filter <= 4);
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= 4 ? data[i - 4] : 0;
      const b = y ? data[i - stride] : 0, c = y && x >= 4 ? data[i - stride - 4] : 0;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      data[i] = packed[y * (stride + 1) + x + 1] + predictor;
    }
  }
  return (u, v) => Array.from(data.subarray((Math.floor(v * height) * width + Math.floor(u * width)) * 4,
    (Math.floor(v * height) * width + Math.floor(u * width)) * 4 + 3));
}
function paletteOf(bytes) {
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  if (!json.images?.length) return null;
  const view = json.bufferViews[json.images[0].bufferView], offset = 28 + jsonLength + (view.byteOffset ?? 0);
  return pngPixels(bytes.subarray(offset, offset + view.byteLength));
}
function triangles(geometry) {
  const index = geometry.index, count = index?.count ?? geometry.attributes.position.count;
  return Array.from({ length: count / 3 }, (_, i) => [0, 1, 2].map(k => index ? index.getX(i * 3 + k) : i * 3 + k));
}

const reports = [];
for (const spec of [...COSMO_VEHICLES, BMW_VEHICLE]) {
  const bytes = fs.readFileSync(new URL(spec.url)), pixel = paletteOf(bytes);
  const parse = () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  const gltf = await parse(), twinGLTF = await parse();
  const originalResources = resources(gltf.scene), originals = [];
  gltf.scene.updateWorldMatrix(true, true);
  let expectedRearTriangles = 0, excludedRearTriangles = 0;
  gltf.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry, position = geometry.attributes.position;
    const records = triangles(geometry);
    originals.push({ mesh, attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([key, attr]) => [key, Array.from(attr.array)])),
      triangles: records.map(t => t.join(',')).sort() });
    if (!['light', 'Material.018'].includes(mesh.material.name)) return;
    for (const triangle of records) {
      if (!triangle.every(index => new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld).z < 0)) continue;
      const uv = geometry.attributes.uv;
      const rgb = pixel ? pixel(triangle.reduce((s, i) => s + uv.getX(i), 0) / 3,
        triangle.reduce((s, i) => s + uv.getY(i), 0) / 3) : [255, 0, 0];
      const [r, g, b] = rgb;
      const lens = spec.model === 'kamaro' ? r > 180 && g > 120 && b < g * .8 : r > 150 && r > g * 2 && r > b * 2;
      if (lens) expectedRearTriangles++; else excludedRearTriangles++;
    }
  });
  const create = spec.id === BMW_VEHICLE.id ? createBMWVehicleAdapter : createCosmoVehicleAdapter;
  const adapter = create(THREE, spec.id, gltf), twin = create(THREE, spec.id, twinGLTF);
  const owned = resources(adapter.group), twinOwned = resources(twin.group);
  const lamps = [...owned.materials].filter(m => m.userData.vehicleBrakeLamp);
  assert.ok(lamps.length > 0, `${spec.model}: brake lamps exist`);
  assert.equal(adapter.metadata.brakeLights.triangles, expectedRearTriangles + (spec.model === 'lamb' ? 24 : 0), `${spec.model}: every eligible rear triangle selected`);
  assert.equal(adapter.metadata.brakeLights.addedTriangles, spec.model === 'lamb' ? 24 : 0);
  for (const entry of originals) {
    for (const [key, values] of Object.entries(entry.attributes))
      assert.deepEqual(Array.from(entry.mesh.geometry.attributes[key].array), values, `${spec.model}: ${key} preserved`);
    assert.deepEqual(triangles(entry.mesh.geometry).map(t => t.join(',')).sort(), entry.triangles, 'same source faces, merely grouped');
  }

  let selectedTriangles = 0, frontTriangles = 0;
  adapter.group.updateWorldMatrix(true, true);
  adapter.group.traverse(mesh => {
    assert.ok(!mesh.isLight, 'no point lights or scene light added');
    if (!mesh.isMesh) return;
    const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0,
      count: mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count, materialIndex: 0 }];
    const records = triangles(mesh.geometry), materials = materialList(mesh);
    for (const group of groups) {
      const material = materials[group.materialIndex], isBrake = material?.userData.vehicleBrakeLamp;
      for (let i = group.start / 3; i < (group.start + group.count) / 3; i++) {
        const points = records[i].map(index => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld));
        if (isBrake) {
          selectedTriangles++;
          assert.ok(points.every(p => p.z > 0), `${spec.model}: brake face entirely behind vehicle center`);
          if (pixel) {
            const uv = mesh.geometry.attributes.uv;
            const [r, g, b] = pixel(records[i].reduce((s, v) => s + uv.getX(v), 0) / 3,
              records[i].reduce((s, v) => s + uv.getY(v), 0) / 3);
            assert.ok(spec.model === 'kamaro' ? r > 180 && g > 120 && b < g * .8 : r > 150 && r > g * 2 && r > b * 2,
              `${spec.model}: selected actual red/yellow palette cell, no white/blue lamp`);
          }
        } else if (material?.name === 'light' || material?.name === 'Material.019') {
          if (points.every(p => p.z < 0)) frontTriangles++;
        }
      }
    }
  });
  assert.equal(selectedTriangles, adapter.metadata.brakeLights.triangles);
  assert.ok(frontTriangles > 0, `${spec.model}: original front lights preserved`);
  if (['jeep', 'armor', 'fenyr'].includes(spec.model)) assert.ok(excludedRearTriangles > 0, 'mixed rear lamp colors excluded');
  if (spec.model === 'lamb') {
    const normalized = adapter.body.children[0], inverse = normalized.matrixWorld.clone().invert();
    const ray = new THREE.Raycaster(), direction = new THREE.Vector3(0, 0, 1).transformDirection(normalized.matrixWorld);
    const bounds = new THREE.Box3().setFromObject(adapter.group, true);
    for (const [key, values] of Object.entries(adapter.metadata.bounds))
      values.forEach((value, index) => assert.ok(Math.abs(bounds[key].toArray()[index] - value) < 1e-6, 'added lamps preserve original bounds'));
    for (const mesh of normalized.children.filter(mesh => mesh.userData.vehicleBrakeSupplement)) {
      const position = mesh.geometry.attributes.position, records = triangles(mesh.geometry);
      for (const triangle of records.slice(0, 2)) {
        const corners = triangle.map(index => new THREE.Vector3().fromBufferAttribute(position, index));
        for (let u = 0; u <= 10; u++) for (let v = 0; v <= 10 - u; v++) {
          const point = corners[0].clone().multiplyScalar(1 - (u + v) / 10)
            .addScaledVector(corners[1], u / 10).addScaledVector(corners[2], v / 10);
          ray.set(new THREE.Vector3(point.x, point.y, -10).applyMatrix4(normalized.matrixWorld), direction);
          const hit = ray.intersectObject(gltf.scene, true).find(hit => hit.object.material?.name === 'metallic');
          assert.ok(hit, 'lamp has a real rear body panel directly behind it');
          const clearance = hit.point.clone().applyMatrix4(inverse).z - point.z;
          assert.ok(clearance > .003 && clearance < .025, `rear lens clears shell without floating or z-fighting: ${clearance}`);
        }
      }
    }
  }

  const baseline = new Map([...owned.materials].map(m => [m, appearance(m)]));
  const twinBaseline = new Map([...twinOwned.materials].map(m => [m, appearance(m)]));
  const paletteBaseline = new Map([...owned.textures].map(t => [t, textureState(t)]));
  const restMatrices = matrices(adapter.group), wheelContacts = JSON.stringify(adapter.metadata.wheelContacts);
  assert.equal(adapter.setBrakeLights(true), adapter);
  for (const material of owned.materials) {
    if (!material.userData.vehicleBrakeLamp) assert.deepEqual(appearance(material), baseline.get(material), 'front/body/wheel materials unchanged');
    else {
      assert.equal(material.emissiveIntensity, 3);
      assert.ok(material.emissive.r > material.emissive.g * 20 && material.emissive.r > material.emissive.b * 20, 'brake emission is red');
      assert.ok(!twinOwned.materials.has(material), 'independent per-car brake material');
    }
  }
  for (const [material, before] of twinBaseline) assert.deepEqual(appearance(material), before, 'other car stays off');
  for (const [texture, before] of paletteBaseline) assert.deepEqual(textureState(texture), before, 'shared palette is immutable');
  assert.deepEqual(matrices(adapter.group), restMatrices, 'braking never changes vehicle transforms');
  assert.equal(JSON.stringify(adapter.metadata.wheelContacts), wheelContacts, 'braking never changes contact data');
  adapter.setBrakeLights(.5);
  for (const material of lamps) assert.ok(Math.abs(material.emissiveIntensity - (baseline.get(material).intensity + 3) / 2) < 1e-12);
  adapter.setBrakeLights(5);
  for (const material of lamps) assert.equal(material.emissiveIntensity, 3);
  adapter.setBrakeLights(-5);
  for (const [material, before] of baseline) assert.deepEqual(appearance(material), before, 'off restores exact material');
  for (const value of [NaN, Infinity, null, undefined, '1']) assert.throws(() => adapter.setBrakeLights(value), /boolean or finite/);
  adapter.setBrakeLights(true);
  adapter.update({ steerAngle: .3, wheelSpin: 1, bodyBob: .1 });
  adapter.reset();
  for (const [material, before] of baseline) assert.deepEqual(appearance(material), before, 'reset switches off lamps');
  assert.deepEqual(matrices(adapter.group), restMatrices, 'reset keeps existing rig contract');

  const disposable = new Set([...originalResources.geometries, ...originalResources.materials, ...owned.geometries, ...owned.materials]);
  const disposalCounts = new Map([...disposable].map(resource => [resource, 0]));
  for (const resource of disposable) resource.addEventListener('dispose', () => disposalCounts.set(resource, disposalCounts.get(resource) + 1));
  adapter.setBrakeLights(true);
  adapter.dispose(); adapter.dispose(); adapter.setBrakeLights(true); adapter.reset();
  for (const [resource, count] of disposalCounts) assert.equal(count, 1, `${resource.type}: each original/clone disposed exactly once`);
  for (const [material, before] of twinBaseline) assert.deepEqual(appearance(material), before, 'twin survives disposal unchanged');
  twin.dispose();
  reports.push({ model: spec.model, rearTriangles: selectedTriangles, excludedRearTriangles, frontTriangles });
  console.log(`PASS ${spec.model}: ${selectedTriangles} rear brake faces, ${excludedRearTriangles} other rear lamp faces retained, front/body/rig/resource isolation`);
}
assert.equal(reports.length, 11);
console.log('PASS all 11 real GLBs: red brakes on/off/partial/clamped, independent materials, reset and disposal. CPU-only verification.');
