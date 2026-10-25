import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createFleetNeon } from '../dist/vehicle-neon.js';

function car() {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const geometry = new THREE.BoxGeometry(2, 1, 4);
  body.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  return { group, body, geometry };
}

test('A single broad transparent halo replaces the solid rectangular neon frame', () => {
  const fleet = createFleetNeon(THREE), adapter = car();
  fleet.setColor('red'); fleet.attach(adapter);
  const root = adapter.body.getObjectByName('vehicle-underglow');
  assert.equal(root.children.length, 1, 'no opaque bars remain');
  const halo = root.children[0], material = halo.material;
  assert.equal(material.transparent, true); assert.equal(material.depthWrite, false);
  assert.equal(material.blending, THREE.AdditiveBlending); assert.equal(material.toneMapped, false);
  assert.ok(halo.scale.x > 2 * 1.7 && halo.scale.y > 4 * 1.3, 'halo extends softly beyond the car');
  const { data, width, height } = material.map.image;
  const alpha = (x, y) => data[(y * width + x) * 4 + 3];
  for (let x = 0; x < width; x++) assert.equal(alpha(x, 0) + alpha(x, height - 1), 0);
  for (let y = 0; y < height; y++) assert.equal(alpha(0, y) + alpha(width - 1, y), 0);
  const row = Math.floor(height / 2), profile = [];
  for (let x = Math.floor(width / 2); x < width; x++) profile.push(alpha(x, row));
  assert.ok(profile[Math.floor(profile.length / 2)] > 100, 'broad visible color, not a thin bright center');
  assert.ok(new Set(profile).size > 16, 'smooth falloff');
  assert.ok(profile.every((value, index) => !index || value <= profile[index - 1]));
  fleet.dispose();
});

test('Halo stays on rest ground while the suspended body bobs and rolls, with no repeated bounds traversal', () => {
  const fleet = createFleetNeon(THREE), adapter = car(); let measurements = 0;
  const compute = adapter.geometry.computeBoundingBox.bind(adapter.geometry);
  adapter.geometry.computeBoundingBox = () => { measurements++; compute(); };
  adapter.group.position.set(20, 3, -40); adapter.group.rotation.y = .8;
  fleet.setColor('blue'); fleet.attach(adapter);
  const halo = adapter.body.getObjectByName('vehicle-underglow').children[0];
  adapter.group.updateWorldMatrix(true, true);
  const before = halo.getWorldPosition(new THREE.Vector3());
  adapter.body.position.y = .7; adapter.body.rotation.set(.12, 0, .2);
  for (let frame = 0; frame < 20; frame++) fleet.attach(adapter);
  adapter.group.updateWorldMatrix(true, true);
  assert.ok(halo.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-9);
  assert.ok(new THREE.Vector3(0, 0, 1).transformDirection(halo.matrixWorld).distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-9);
  assert.equal(measurements, 1);
  fleet.dispose();
});

test('Real wheel support controls the ground plane and airborne cars do not paint a floating halo', () => {
  const fleet = createFleetNeon(THREE), adapter = car();
  adapter.group.position.set(4, 8, 6); adapter.group.rotation.set(.3, .6, .2);
  const normal = new THREE.Vector3(0, 1, .2).normalize();
  const support = { grounded: true, airborne: false, wheelContacts: [-1, 1].flatMap(x => [-2, 2].map(z => ({
    grounded: true, point: { x: 4 + x, y: 2 - z * .2, z: 6 + z }, normal,
  }))) };
  fleet.setColor('cyan'); fleet.attach(adapter, support); adapter.group.updateWorldMatrix(true, true);
  const root = adapter.body.getObjectByName('vehicle-underglow'), halo = root.children[0];
  const point = halo.getWorldPosition(new THREE.Vector3());
  assert.ok(point.distanceTo(new THREE.Vector3(4, 2, 6)) < .05);
  assert.ok(new THREE.Vector3(0, 0, 1).transformDirection(halo.matrixWorld).distanceTo(normal) < 1e-9);
  fleet.attach(adapter, { grounded: false, airborne: true, wheelContacts: [] }); assert.equal(root.visible, false);
  fleet.setColor('red'); assert.equal(root.visible, false, 'changing color cannot reveal an airborne plane');
  fleet.attach(adapter, support); assert.equal(root.visible, true);
  fleet.dispose();
});

test('Normalized parked-car fallback stays above the rendered road surface', () => {
  const fleet = createFleetNeon(THREE), adapter = car();
  adapter.body.children[0].position.y = .55;
  adapter.metadata = { bounds: { min: [-1, .05, -2], max: [1, 1.05, 2] }, groundClearance: .05 };
  // Real parked normalization puts wheel bottoms at the road's .02 render lift.
  adapter.group.position.y = -.03;
  fleet.setColor('red'); fleet.attach(adapter); adapter.group.updateWorldMatrix(true, true);
  const halo = adapter.body.getObjectByName('vehicle-underglow').children[0];
  const y = halo.getWorldPosition(new THREE.Vector3()).y;
  assert.ok(y >= .045 && y <= .07, `halo at ${y} must clear the road at .02`);
  fleet.dispose();
});

test('An explicit pedestal plane stays level and at its top while the displayed car tilts and bobs', () => {
  const fleet = createFleetNeon(THREE), adapter = car();
  const support = { groundPlane: { point: { x: 4, y: 2.2, z: 6 }, normal: { x: 0, y: 1, z: 0 } } };
  fleet.setColor('cyan');
  for (const phase of [0, .25, .5, 1]) {
    adapter.group.position.set(4, 3 + Math.sin(phase), 6);
    adapter.group.rotation.set(.4 * phase, phase, -.3 * phase);
    adapter.body.position.y = phase * .4; adapter.body.rotation.z = phase * .2;
    fleet.attach(adapter, support); adapter.group.updateWorldMatrix(true, true);
    const halo = adapter.body.getObjectByName('vehicle-underglow').children[0];
    const point = halo.getWorldPosition(new THREE.Vector3());
    assert.ok(point.distanceTo(new THREE.Vector3(4, 2.235, 6)) < 1e-9, 'halo rests on the pedestal');
    assert.ok(new THREE.Vector3(0, 0, 1).transformDirection(halo.matrixWorld).distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-9, 'halo stays horizontal');
  }
  fleet.dispose();
});

test('Fleet shares halo resources and releases each once without touching car resources', () => {
  const fleet = createFleetNeon(THREE), cars = [car(), car()];
  fleet.setColor('red'); cars.forEach(adapter => fleet.attach(adapter));
  const halos = cars.map(adapter => adapter.body.getObjectByName('vehicle-underglow').children.find(mesh => mesh.material.map));
  assert.equal(halos[0].geometry, halos[1].geometry); assert.equal(halos[0].material, halos[1].material);
  const resources = [halos[0].geometry, halos[0].material, halos[0].material.map]; let disposed = 0, carDisposed = 0;
  resources.forEach(resource => resource.addEventListener('dispose', () => disposed++));
  cars.forEach(adapter => adapter.geometry.addEventListener('dispose', () => carDisposed++));
  fleet.clear(); assert.equal(disposed, 0); cars.forEach(adapter => fleet.attach(adapter));
  fleet.dispose(); fleet.dispose(); assert.equal(disposed, resources.length); assert.equal(carDisposed, 0);
});
