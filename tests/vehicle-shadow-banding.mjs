#!/usr/bin/env node
// CPU diagnostic against actual GLBs and the shipped Three shadow matrices.
// Reproduces depth-map self-occlusion; it is not a GPU/mobile appearance test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {COSMO_VEHICLES, loadCosmoVehicle} from '../dist/cosmo-vehicles.js';
import {SHADOW_LAYOUT as P, followShadowLight} from '../dist/scene-lighting.js';

const originalFetch = globalThis.fetch;
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const bytes = Buffer.from(await blob.arrayBuffer());
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), close() {}};
};
globalThis.fetch = async request => {
  const url = typeof request === 'string' ? request : request.url;
  return url.startsWith('blob:') ? originalFetch(request) : new Response(fs.readFileSync(new URL(url)));
};

const lightDirection = new T.Vector3(P.offset.x, P.offset.y, P.offset.z).normalize();
const cross2 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];

function makeLight(driving) {
  const light = new T.DirectionalLight();
  Object.assign(light.shadow.camera, {near: P.near, far: P.far});
  followShadowLight(light, {x: 0, y: 0, z: 0}, driving ? {x: 0, z: -1} : null);
  light.shadow.updateMatrices(light);
  return light;
}

function trianglesOf(group, light) {
  const triangles = [];
  group.updateWorldMatrix(true, true);
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry, position = geometry.attributes.position;
    const normalMatrix = new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const material = materialsOf(mesh)[0];
    assert.equal(materialsOf(mesh).length, 1, 'Audited GLB primitives have individual materials');
    for (let index = 0; index < (geometry.index?.count ?? position.count); index += 3) {
      const ids = [0, 1, 2].map(i => geometry.index ? geometry.index.getX(index + i) : index + i);
      const world = ids.map(i => new T.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
      const normals = ids.map(i => new T.Vector3().fromBufferAttribute(geometry.attributes.normal, i).applyNormalMatrix(normalMatrix));
      const face = new T.Vector3().subVectors(world[1], world[0]).cross(new T.Vector3().subVectors(world[2], world[0]));
      const area = face.length() / 2;
      if (area < 1e-9) continue;
      const projected = world.map(v => v.clone().applyMatrix4(light.shadow.matrix));
      projected.forEach(v => {v.x *= P.mapSize; v.y *= P.mapSize;});
      triangles.push({world, normals, projected, area, front: face.normalize().dot(lightDirection) > 0, material});
    }
  });
  return triangles;
}

function rasterize(triangles, corrected) {
  const projected = triangles.flatMap(t => t.projected);
  const x0 = Math.floor(Math.min(...projected.map(p => p.x))) - 2;
  const y0 = Math.floor(Math.min(...projected.map(p => p.y))) - 2;
  const width = Math.ceil(Math.max(...projected.map(p => p.x))) - x0 + 3;
  const height = Math.ceil(Math.max(...projected.map(p => p.y))) - y0 + 3;
  const depth = new Float64Array(width * height).fill(Infinity);
  const owner = new Int32Array(width * height).fill(-1);
  triangles.forEach((triangle, id) => {
    const side = corrected ? triangle.material.shadowSide : T.DoubleSide;
    if (side === T.BackSide && triangle.front || side === T.FrontSide && !triangle.front) return;
    const [a, b, c] = triangle.projected, denominator = cross2(a, b, c);
    if (Math.abs(denominator) < 1e-10) return;
    const xmin = Math.ceil(Math.min(a.x, b.x, c.x) - .5), xmax = Math.floor(Math.max(a.x, b.x, c.x) - .5);
    const ymin = Math.ceil(Math.min(a.y, b.y, c.y) - .5), ymax = Math.floor(Math.max(a.y, b.y, c.y) - .5);
    for (let y = ymin; y <= ymax; y++) for (let x = xmin; x <= xmax; x++) {
      const p = {x: x + .5, y: y + .5};
      const u = cross2(b, c, p) / denominator, v = cross2(c, a, p) / denominator, w = 1 - u - v;
      if (Math.min(u, v, w) < -1e-9) continue;
      const z = u * a.z + v * b.z + w * c.z, i = (y - y0) * width + x - x0;
      if (z < depth[i]) {depth[i] = z; owner[i] = id;}
    }
  });
  return {depth, owner, x0, y0, width, height, index(x, y) {
    x = Math.floor(x) - x0; y = Math.floor(y) - y0;
    return x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x;
  }};
}

// Compare only unambiguously false same-triangle self-occlusion on surfaces
// facing the sun. Actual shadows from roofs, spoilers and other cars are allowed.
function selfOcclusion(triangles, light, map) {
  let sampledArea = 0, acneArea = 0;
  triangles.forEach((triangle, id) => {
    if (!triangle.front || !triangle.material.userData.cosmoBodyFinish) return;
    for (const weights of [[1/3, 1/3, 1/3], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6]]) {
      const point = new T.Vector3(), normal = new T.Vector3();
      weights.forEach((w, i) => {point.addScaledVector(triangle.world[i], w); normal.addScaledVector(triangle.normals[i], w);});
      // Three interpolates normal-biased vertex positions in the shadow varying.
      point.addScaledVector(normal, P.normalBias).applyMatrix4(light.shadow.matrix);
      const i = map.index(point.x * P.mapSize, point.y * P.mapSize);
      sampledArea += triangle.area / 4;
      if (i >= 0 && map.owner[i] === id && point.z + P.bias > map.depth[i] + 1e-9) acneArea += triangle.area / 4;
    }
  });
  return {sampledArea, acneArea};
}

// Every shadow-map texel corresponds to a parallel light ray. Reconstruct its
// ground intersection and test the real ground receiver's bias. This verifies
// that car shadows remain cast, including near the four tire contacts.
function groundCoverage(map, light) {
  const inverse = light.shadow.matrix.clone().invert();
  const ground = new Set();
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const index = y * map.width + x;
    if (!Number.isFinite(map.depth[index])) continue;
    const world = new T.Vector3((x + map.x0 + .5) / P.mapSize, (y + map.y0 + .5) / P.mapSize, map.depth[index]).applyMatrix4(inverse);
    world.addScaledVector(lightDirection, -world.y / lightDirection.y);
    world.y += P.normalBias;
    const receiver = world.applyMatrix4(light.shadow.matrix);
    const receiverIndex = map.index(receiver.x * P.mapSize, receiver.y * P.mapSize);
    if (receiverIndex >= 0 && receiver.z + P.bias > map.depth[receiverIndex] + 1e-9) ground.add(index);
  }
  return ground;
}

const report = [];
let baselineAcneArea = 0, correctedAcneArea = 0, sampleArea = 0, minimumFootprintRatio = Infinity;
assert.equal(P.mapSize, 2048, 'Do not spend another shadow map or enlarge it');
assert.equal(P.halfExtent, 150, 'Preserve forward coverage');
assert.equal(P.localHalfExtent, 75, 'Preserve garage resolution');
for (const spec of COSMO_VEHICLES) {
  const adapter = await loadCosmoVehicle(T, spec.id);
  adapter.group.traverse(mesh => {
    if (!mesh.isMesh) return;
    assert(mesh.castShadow && mesh.receiveShadow, `${spec.id}: retain both cast and received shadows`);
    for (const material of materialsOf(mesh)) {
      assert.equal(material.side, T.DoubleSide, 'Visible source material sidedness is unchanged');
      assert.equal(material.shadowSide, T.BackSide, 'Opaque shells cast their back-face depth');
      assert.equal(material.transparent, false);
      assert.equal(material.opacity, 1);
      assert.equal(material.alphaTest, 0);
    }
  });
  for (const driving of [false, true]) for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    adapter.group.rotation.y = yaw;
    const light = makeLight(driving), triangles = trianglesOf(adapter.group, light);
    const baseline = rasterize(triangles, false), corrected = rasterize(triangles, true);
    const before = selfOcclusion(triangles, light, baseline), after = selfOcclusion(triangles, light, corrected);
    baselineAcneArea += before.acneArea; correctedAcneArea += after.acneArea; sampleArea += before.sampledArea;
    const oldGround = groundCoverage(baseline, light), newGround = groundCoverage(corrected, light);
    const retainedGround = [...oldGround].filter(index => newGround.has(index)).length;
    const ratio = retainedGround / oldGround.size;
    assert(oldGround.size > 100 && newGround.size > 100, `${spec.id}: real ground shadow remains`);
    assert(ratio > .85, `${spec.id}: preserve most ground silhouette (${ratio})`);
    minimumFootprintRatio = Math.min(minimumFootprintRatio, ratio);
    report.push({id: spec.id, driving, yaw, before: before.acneArea, after: after.acneArea, groundRatio: ratio});
  }
  adapter.dispose();
}
assert(baselineAcneArea / sampleArea > .05, 'Reproduce measurable false self-shadowing with the old double-sided depth pass');
assert.equal(correctedAcneArea, 0, 'Lit front faces no longer write false occlusion into their own shadow samples');
console.log(JSON.stringify({passed: true, poses: report.length, baselineFalseSelfOcclusion: baselineAcneArea / sampleArea,
  correctedFalseSelfOcclusion: correctedAcneArea / sampleArea, minimumGroundFootprintRatio: minimumFootprintRatio,
  scope: 'Actual GLBs, production matrices and CPU texel-depth model; no browser/GPU claim'}));
