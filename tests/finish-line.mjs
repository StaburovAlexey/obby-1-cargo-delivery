// Actual Three.js CPU geometry, frustum and occlusion checks. No browser/GPU claim.
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createFinishLine, FINISH_LINE_SPEC, FINISH_LINE_STYLE } from '../dist/finish-line.js';
import { DELIVERY_CHECKPOINTS, ECONOMY_CONFIG } from '../dist/economy-config.js';
import { ROAD_SURFACE_OFFSET, routePointAtDistance, routePointAtProgress, routeDistanceAt,
  queryRoadSurface, projectRoad, pointInRoad } from '../dist/route-network.js';
import { BRIDGES } from '../dist/road-bridges.js';
import { createRoadHazards } from '../dist/road-hazards.js';
import { buildCity } from '../dist/network-scene.js';
import { computeFollowOffset, FOLLOW_CAMERA, drivingCameraScale } from '../dist/follow-camera.js';
import { TOW_DRIVING } from '../dist/driving-model.js';

let checks = 0;
const check = (name, action) => { action(); checks++; console.log('PASS', name); };
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const finish = createFinishLine(THREE), { group, spec } = finish;
group.updateMatrixWorld(true);
const paint = group.getObjectByName('Road-conforming checkered finish paint');
const flags = group.getObjectByName('Two checkered finish flags');
const poles = group.getObjectByName('Outside-road finish flag poles');
const worldVertex = (mesh, index) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld);
const checkpoint = DELIVERY_CHECKPOINTS.at(-1), station = routePointAtDistance(checkpoint.distance);
const delivery = { x: station.x - station.right.x * ECONOMY_CONFIG.checkpointOffset,
  z: station.z - station.right.z * ECONOMY_CONFIG.checkpointOffset };

check('Finish is 28 real route metres before the final left delivery trigger', () => {
  assert.equal(spec, FINISH_LINE_SPEC);
  assert.equal(spec.checkpointId, checkpoint.id);
  near(checkpoint.distance - spec.distance, 28);
  near(spec.progress, 15802);
  near(group.position.x, spec.x); near(group.position.z, spec.z);
  near(group.rotation.y, spec.heading);
  for (let i = 0; i < paint.geometry.attributes.position.count; i++) {
    const v = worldVertex(paint, i), road = projectRoad(v.x, v.z, spec);
    assert.ok(Math.abs(road.offset) <= 14.9001);
    assert.ok(road.progress < checkpoint.progress - ECONOMY_CONFIG.checkpointRadius - 20);
    assert.ok(Math.hypot(v.x - delivery.x, v.z - delivery.z) > ECONOMY_CONFIG.checkpointRadius + 20);
  }
  // A driver already in the unloading lane crosses the paint before any
  // sample could enter the authoritative 4.4 m centre-based delivery circle.
  let crossedAt = null, deliveryAt = null;
  for (let distance = spec.distance - 50; distance < checkpoint.distance + 1; distance += .1) {
    const p = routePointAtDistance(distance), x = p.x - p.right.x * ECONOMY_CONFIG.checkpointOffset,
      z = p.z - p.right.z * ECONOMY_CONFIG.checkpointOffset;
    if (crossedAt === null && distance >= spec.distance + spec.lineDepth / 2) crossedAt = distance;
    if (Math.hypot(x - delivery.x, z - delivery.z) <= ECONOMY_CONFIG.checkpointRadius) { deliveryAt = distance; break; }
  }
  assert.ok(deliveryAt > crossedAt + 20);
});

function checkPaintSurface(scene) {
  scene.group.updateMatrixWorld(true);
  const mesh = scene.group.getObjectByName('Road-conforming checkered finish paint'), p = mesh.geometry.attributes.position;
  const color = mesh.geometry.attributes.color, normals = mesh.geometry.attributes.normal;
  const colours = new Set();
  for (let i = 0; i < p.count; i++) {
    const v = worldVertex(mesh, i), surface = queryRoadSurface(v.x, v.z, scene.spec);
    assert.ok(surface.onRoad);
    near(v.y - surface.height - ROAD_SURFACE_OFFSET, FINISH_LINE_STYLE.paintLift, 5e-6);
    assert.ok(normals.getY(i) > .98);
    colours.add(color.getX(i).toFixed(6));
  }
  assert.equal(colours.size, 2);
  // Centroids and edge samples catch a flat tile cutting through an underlying
  // road seam, which checking vertices alone would miss.
  for (let i = 0; i < p.count; i += 3) {
    const vertices = [0, 1, 2].map(k => worldVertex(mesh, i + k));
    for (const [a, b, c] of [[1 / 3, 1 / 3, 1 / 3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5]]) {
      const v = vertices[0].clone().multiplyScalar(a).addScaledVector(vertices[1], b).addScaledVector(vertices[2], c);
      near(v.y - queryRoadSurface(v.x, v.z, scene.spec).height - ROAD_SURFACE_OFFSET, FINISH_LINE_STYLE.paintLift, 5e-6);
    }
  }
  near(mesh.geometry.boundingBox.max.x - mesh.geometry.boundingBox.min.x, scene.spec.lineWidth);
  near(mesh.geometry.boundingBox.max.z - mesh.geometry.boundingBox.min.z, scene.spec.lineDepth);
  assert.equal(mesh.material.side, THREE.FrontSide);
  assert.equal(mesh.material.transparent, false);
  assert.equal(mesh.material.polygonOffset, true);
}

check('Checker paint follows the actual road triangles with a small stable lift', () => checkPaintSurface(finish));
check('The same paint construction conforms to a curved and sloped route section', () => {
  const sample = routePointAtProgress(15200);
  assert.ok(Math.abs(sample.curvature) > .0001);
  assert.ok(Math.hypot(sample.gradient.x, sample.gradient.z) > .001);
  const alternate = createFinishLine(THREE, { checkpoint: { id: 'geometry-test', progress: 15228,
    distance: routeDistanceAt(sample.progress) + FINISH_LINE_STYLE.approachDistance } });
  checkPaintSurface(alternate);
  assert.ok(alternate.group.children[0].geometry.boundingBox.max.y - alternate.group.children[0].geometry.boundingBox.min.y > .01);
  alternate.dispose();
});

check('All posts remain outside the full 30 m road and cloth clears cars overhead', () => {
  const matrix = new THREE.Matrix4(), p = poles.geometry.attributes.position;
  for (let instance = 0; instance < poles.count; instance++) {
    poles.getMatrixAt(instance, matrix);
    for (let i = 0; i < p.count; i++) {
      const local = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(matrix);
      assert.ok(Math.abs(local.x) >= 15.0299);
      assert.ok(Math.abs(local.x) <= 15.3001, 'Slim supports fit before the volcanic wall setback');
      const world = local.applyMatrix4(poles.matrixWorld);
      assert.equal(pointInRoad(world.x, world.z), false);
    }
  }
  const p2 = flags.geometry.attributes.position;
  for (let i = 0; i < p2.count; i++) {
    const v = worldVertex(flags, i);
    assert.ok(Math.abs(p2.getX(i)) >= 10.9599);
    assert.ok(v.y - queryRoadSurface(v.x, v.z).height > 5.7, 'Flags stay above the road vehicle envelope');
  }
  assert.equal(flags.material.side, THREE.DoubleSide);
  group.traverse(object => assert.equal(object.userData.nonBlocking, true));
  assert.equal(finish.contact, undefined);
  assert.equal(finish.update, undefined);
});

check('Finish apron does not overlap bridges, hazards or the last unloading circle', () => {
  for (const bridge of BRIDGES) assert.ok(spec.progress + 4 < bridge.from || spec.progress - 4 > bridge.to);
  const hazards = createRoadHazards(42);
  for (const hazard of hazards.hazards) assert.ok(Math.abs(hazard.distance - spec.distance) > 60 + hazard.length / 2);
  for (const offset of [-12, -8, 0, 8, 12]) {
    const x = spec.x + spec.right.x * offset, z = spec.z + spec.right.z * offset;
    assert.equal(hazards.contact(x, z, spec.heading), undefined);
  }
});

const city = buildCity(THREE);
city.group.updateMatrixWorld(true);
check('Both flags and checker paint are visible on the final approach in CPU camera/occlusion checks', () => {
  const blockers = ['Massive biome barriers', 'Continuous 30m-wide road', 'Closed continuous terrain foundation']
    .map(name => city.group.getObjectByName(name));
  const targets = [new THREE.Vector3(0, spec.height + ROAD_SURFACE_OFFSET + FINISH_LINE_STYLE.paintLift, 0),
    new THREE.Vector3(-13, spec.height + 7.2, .1), new THREE.Vector3(13, spec.height + 7.2, .1)]
    .map(p => p.applyMatrix4(group.matrixWorld));
  for (const aspect of [16 / 9, 9 / 19.5]) for (const distance of [100, 70, 45]) {
    const p = routePointAtDistance(spec.distance - distance), camera = new THREE.PerspectiveCamera(TOW_DRIVING.cameraFov, aspect, .5, 1800);
    const offset = computeFollowOffset({ ...FOLLOW_CAMERA.driving, yaw: p.heading }), scale = drivingCameraScale(aspect);
    const target = new THREE.Vector3(p.x, queryRoadSurface(p.x, p.z).height + 1.7, p.z);
    camera.position.set(target.x + offset.x * scale, target.y + offset.y * scale, target.z + offset.z * scale);
    camera.lookAt(target); camera.updateMatrixWorld(true);
    for (const end of targets) {
      const projected = end.clone().project(camera);
      assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && projected.z > -1 && projected.z < 1,
        `Finish target outside approach frustum: ${aspect}, ${distance}, ${projected.toArray()}`);
      const direction = end.clone().sub(camera.position), range = direction.length();
      const ray = new THREE.Raycaster(camera.position, direction.normalize(), 0, range - .01);
      assert.equal(ray.intersectObjects(blockers, false).length, 0, 'Approach marker is not hidden behind road or volcanic walls');
    }
  }
});

check('Bounded geometry has three draw calls, no textures and idempotent disposal', () => {
  assert.equal(finish.stats.flags, 2); assert.equal(finish.stats.drawCalls, 3);
  assert.ok(finish.stats.triangles < 500); assert.equal(finish.stats.textures, 0);
  const geometries = new Set(), materials = new Set();
  group.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
  let geometryDisposals = 0, materialDisposals = 0, instanceDisposals = 0;
  poles.addEventListener('dispose', () => instanceDisposals++);
  for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
  for (const material of materials) { assert.equal(material.map, null); material.addEventListener('dispose', () => materialDisposals++); }
  const parent = new THREE.Group(); parent.add(group);
  finish.dispose(); finish.dispose();
  assert.equal(geometryDisposals, geometries.size); assert.equal(materialDisposals, materials.size);
  assert.equal(instanceDisposals, 1);
  assert.equal(group.children.length, 0); assert.equal(group.parent, null);
  assert.equal(finish.stats.disposed, true); assert.equal(finish.stats.drawCalls, 0);
});
city.dispose();
console.log(`${checks} finish-line checks passed. CPU only; no browser, GPU, FPS or device verification.`);
