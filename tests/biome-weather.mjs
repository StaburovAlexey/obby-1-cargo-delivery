import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createBiomeWeather } from '../dist/biome-weather.js';

const weather = createBiomeWeather(THREE);
const points = weather.group.children[0];
const geometry = points.geometry;
const material = points.material;
const position = geometry.getAttribute('position');
const originalBuffer = position.array;
const haze = geometry.getAttribute('haze');
const originalHazeBuffer = haze.array;
const life = geometry.getAttribute('life');
const originalLifeBuffer = life.array;
const camera = new THREE.PerspectiveCamera(53, 390 / 844, .5, 1800);
camera.position.set(123, 12, -30);
camera.lookAt(123, 1.7, -46);
camera.updateMatrixWorld();
const cameraPose = [...camera.position.toArray(), ...camera.quaternion.toArray(), ...camera.projectionMatrix.elements];
assert.equal(weather.group.visible, false);
assert.equal(weather.fog, null);
assert.equal(position.count, 768);
assert.equal(haze.count, 768);
assert.equal(life.count, 768);
assert.equal(life.usage, THREE.DynamicDrawUsage);
assert.equal(haze.array.reduce((sum, value) => sum + value, 0), 24, 'haze shares 24 pool slots');
assert.ok(haze.array.every(value => value === 0 || value === 1));
assert.equal(weather.group.children.length, 1);
assert.equal(points.isPoints, true);
assert.equal(material.transparent, true);
assert.equal(material.depthWrite, false);
assert.equal(material.depthTest, true);
assert.equal(position.usage, THREE.DynamicDrawUsage);
assert.equal(material.uniforms.opacity.value, 0);
assert.equal(material.uniforms.hazeOpacity.value, 0);
assert.match(material.vertexShader, /smoothstep\(3\.0, 6\.0, distanceToCamera\)/, 'near-camera fade keeps the immediate view clear');
assert.match(material.vertexShader, /mix\(52\.0, 180\.0, haze\)/, 'sprite size is capped');
assert.match(material.vertexShader, /smoothstep\(0\.0, 0\.3, life\)/, 'recycled particles fade in over 300 ms');
assert.match(material.vertexShader, /smoothstep\(30\.0, 40\.0, distanceToCamera\)/, 'extended far volume has a full 10 m fade');
for (const axis of ['x', 'y']) assert.ok(material.vertexShader.includes(`smoothstep(1.25, 1.8, edge.${axis})`), 'lateral fade begins beyond the entire viewport');
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const visibility = (depth, x, y, age = .3) => smooth(0, .3, age) * smooth(3, 6, depth) * (1 - smooth(30, 40, depth)) * (1 - smooth(1.25, 1.8, Math.abs(x))) * (1 - smooth(1.25, 1.8, Math.abs(y)));
for (const x of [-1.25, -1, 0, 1, 1.25]) for (const y of [-1.25, -1, 0, 1, 1.25]) assert.equal(visibility(12, x, y), 1, 'no screen-edge thinning, including a 25% margin');
for (const x of [-1.8, 1.8]) assert.equal(visibility(12, x, 0), 0);
for (const y of [-1.8, 1.8]) assert.equal(visibility(12, 0, y), 0);
for (const depth of [3, 40]) assert.equal(visibility(depth, 0, 0), 0);
assert.ok(visibility(35, 0, 0) > 0 && visibility(35, 0, 0) < 1);
assert.equal(visibility(12, 0, 0, 0), 0, 'new particles are invisible even if recycled into view');
assert.ok(visibility(12, 0, 0, .15) > 0 && visibility(12, 0, 0, .15) < 1);
const bounded = (activeCamera = camera) => {
  const inverse = activeCamera.quaternion.clone().invert();
  const halfHeight = Math.tan(activeCamera.fov * Math.PI / 360) / activeCamera.zoom;
  for (let i = 0; i < geometry.drawRange.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(position, i).applyQuaternion(inverse), depth = -v.z;
    assert.ok(depth >= 2.99998 && depth <= 40.00002, `bounded depth ${depth}`);
    assert.ok(Math.abs(v.x) <= depth * halfHeight * activeCamera.aspect * 1.80001);
    assert.ok(Math.abs(v.y) <= depth * halfHeight * 1.80001);
  }
};
const strengths = {
  forest: { count: 768, oldOpacity: .50, oldSize: 12 },
  desert: { count: 768, oldOpacity: .36, oldSize: 7 },
  snow: { count: 768, oldOpacity: .74, oldSize: 5 },
  volcanic: { count: 768, oldOpacity: .54, oldSize: 4 },
};
const types = new Set();
for (const [biome, strength] of Object.entries(strengths)) {
  weather.update(1 / 60, { biome, camera });
  assert.equal(weather.group.visible, true);
  assert.deepEqual(weather.group.position.toArray(), camera.position.toArray());
  assert.equal(geometry.drawRange.count, strength.count);
  assert.ok(material.uniforms.opacity.value > strength.oldOpacity && material.uniforms.opacity.value <= .90);
  assert.ok(material.uniforms.particleSize.value > strength.oldSize);
  assert.ok(material.uniforms.hazeOpacity.value >= .16 && material.uniforms.hazeOpacity.value <= .24);
  assert.ok(weather.fog.near >= 36 && weather.fog.far <= 220 && weather.fog.far > weather.fog.near);
  const fog = weather.fog;
  types.add(material.uniforms.kind.value);
  const before = position.array.slice();
  for (let frame = 0; frame < 400; frame++) weather.update(1 / 60, { biome, camera });
  assert.notDeepEqual(position.array, before);
  bounded();
  assert.equal(weather.fog, fog, 'fog config is reused, not allocated every frame');
  assert.equal(position.array, originalBuffer, 'updates reuse fixed buffer');
  assert.equal(geometry.getAttribute('position'), position);
  assert.equal(geometry.getAttribute('haze'), haze);
  assert.equal(haze.array, originalHazeBuffer);
  assert.equal(geometry.getAttribute('life'), life);
  assert.equal(life.array, originalLifeBuffer, 'fade updates reuse one fixed buffer');
  assert.ok(life.array.every(value => value >= 0 && value <= .300001));
  assert.equal(haze.version, 0, 'haze mask does not need per-frame GPU uploads');
  assert.equal(weather.group.children[0], points);
  assert.equal(points.geometry, geometry);
  assert.equal(points.material, material);
  assert.deepEqual([...camera.position.toArray(), ...camera.quaternion.toArray(), ...camera.projectionMatrix.elements], cameraPose, 'weather never changes the camera');
}
assert.equal(types.size, 4);
weather.update(0, { biome: 'snow', camera });
const reserve = { left: 0, right: 0, top: 0, bottom: 0, far: 0 };
const inverse = camera.quaternion.clone().invert();
const halfHeight = Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
for (let i = 0; i < geometry.drawRange.count; i++) {
  const v = new THREE.Vector3().fromBufferAttribute(position, i).applyQuaternion(inverse), depth = -v.z;
  const nx = v.x / (depth * halfHeight * camera.aspect), ny = v.y / (depth * halfHeight);
  if (nx < -1.25) reserve.left++;
  if (nx > 1.25) reserve.right++;
  if (ny > 1.25) reserve.top++;
  if (ny < -1.25) reserve.bottom++;
  if (depth > 30) reserve.far++;
}
for (const [edge, count] of Object.entries(reserve)) assert.ok(count >= 30, `${edge}: a substantial padded reserve must exist (${count})`);
bounded();
for (const biome of ['city', 'unknown', undefined, 'toString']) {
  weather.update(1 / 60, { biome, camera });
  assert.equal(weather.group.visible, false);
  assert.equal(weather.fog, null);
  assert.equal(geometry.drawRange.count, 0);
  assert.equal(material.uniforms.opacity.value, 0);
  assert.equal(material.uniforms.hazeOpacity.value, 0);
}
weather.update(0, { biome: { id: 'forest' }, camera });
assert.equal(weather.group.visible, true);
const beforeFreeze = position.array.slice();
for (const dt of [-1, NaN, Infinity]) weather.update(dt, { biome: 'forest', camera });
assert.deepEqual(position.array, beforeFreeze, 'invalid times do not corrupt particles');
weather.update(100, { biome: 'forest', camera });
bounded();
weather.update(1, { biome: 'forest', camera, active: false });
assert.equal(weather.group.visible, false, 'hangar/inactive hides weather and storm fog');
assert.equal(weather.fog, null);
assert.equal(geometry.drawRange.count, 0);
weather.update(0, { biome: 'snow', camera, x: 10000, y: 12, z: -20000 });
bounded();
assert.deepEqual(weather.group.position.toArray(), [10000, 12, -20000]);
const beforeTeleport = position.array.slice();
weather.update(0, { biome: 'snow', camera, x: -10000, y: 12, z: 20000 });
assert.notDeepEqual(position.array, beforeTeleport, 'same-biome teleport reseeds the local volume');
bounded();
const afterTeleport = position.array.slice();
weather.update(0, { biome: 'snow', camera, x: -10000, y: 12, z: 20000 });
assert.deepEqual(position.array, afterTeleport, 'stable zero-step updates preserve the pool');
weather.clear();
assert.equal(weather.group.visible, false);
assert.equal(weather.fog, null);
assert.equal(geometry.drawRange.count, 0);
assert.equal(material.uniforms.opacity.value, 0);
assert.equal(material.uniforms.hazeOpacity.value, 0);
weather.update(0, { biome: 'desert' });
assert.equal(weather.group.visible, true, 'standalone fallback needs no camera');
assert.equal(material.uniforms.opacity.value, .60);
assert.equal(material.uniforms.hazeOpacity.value, .24);
for (const invalidAnchor of [{ x: NaN }, { y: Infinity }, { z: -Infinity }]) {
  weather.update(0, { biome: 'desert', ...invalidAnchor });
  assert.equal(weather.group.visible, false);
  assert.equal(weather.fog, null);
  assert.equal(geometry.drawRange.count, 0);
  assert.equal(material.uniforms.hazeOpacity.value, 0);
}
let geometryDisposed = 0, materialDisposed = 0;
geometry.addEventListener('dispose', () => geometryDisposed++);
material.addEventListener('dispose', () => materialDisposed++);
const scene = new THREE.Scene();
scene.add(weather.group);
weather.dispose();
weather.dispose();
weather.update(1, { biome: 'forest', camera });
assert.equal(geometryDisposed, 1);
assert.equal(materialDisposed, 1);
assert.equal(weather.group.visible, false);
assert.equal(weather.group.children.length, 0);
assert.equal(weather.group.parent, null);
assert.equal(weather.fog, null);
console.log('PASS biome weather: four strong styles, wide padded bounds, off-screen edge fade, soft recycling, one 768-slot pool/draw, immutable camera, inactivity, teleports, resets and disposal');
