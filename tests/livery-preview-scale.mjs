import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { loadCosmoVehicle } from '../dist/cosmo-vehicles.js';
import { loadBMWVehicle } from '../dist/bmw-vehicle.js';
import { createVehicleLiveryPreview } from '../dist/vehicle-livery-preview.js';
import { VEHICLE_LIVERY_IDS, clearVehicleLiveryTextureCache } from '../dist/vehicle-livery-materials.js';

// Exercise the real preview scene with every imported mesh. Image decoding is not
// needed for vertex projection; texture/material correctness has separate tests.
const originalFetch = globalThis.fetch;
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), close() {} };
};
globalThis.fetch = async request => {
  const url = typeof request === 'string' ? request : request.url;
  return url.startsWith('blob:') ? originalFetch(request) : new Response(fs.readFileSync(new URL(url)), { status: 200 });
};

// Mobile CSS subtracts 16px outer padding, 6px panel border and 14px list
// padding; include a further 15px scrollbar. Height is clamp(195px,29dvh,250px).
// Also cover direct reusable-canvas widths and desktop/landscape row heights.
const widths = [...new Set([280, 320, 360, 400].flatMap(width => [width, width - 36, width - 51]))];
const viewports = widths.flatMap(width => [195, 230, 250].map(height => [width, height]))
  .concat([[410, 230], [640, 230], [640, 165]]);
const phases = [...Array.from({ length: 10 }, (_, index) => index / 10), -.001, .001, 4.999, 5.001, -1.001, -1, -.999];
const point = new THREE.Vector3(), projection = new THREE.Matrix4(), transform = new THREE.Matrix4();
const spin = new THREE.Matrix4();
const report = { baseline: '7c15472635975ee04ac68184e30b98d192abd11a', spinStepDegrees: 5, viewports, vehicles: [] };

// Deduplicate real vertices once. Bounds use vertices, not enclosing box corners,
// so measured screen dimensions are the actual mesh extent at each orientation.
function verticesInTurntable(car) {
  const turntable = car.children[0], inverse = turntable.matrixWorld.clone().invert();
  const seen = new Set(), vertices = [];
  turntable.traverse(mesh => {
    const positions = mesh.geometry?.attributes.position;
    if (!mesh.isMesh || !positions) return;
    const matrix = inverse.clone().multiply(mesh.matrixWorld);
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(matrix);
      const key = point.toArray().join(',');
      if (!seen.has(key)) { seen.add(key); vertices.push(...point.toArray()); }
    }
  });
  return vertices;
}
function projectedBounds(vertices, matrix, viewProjection) {
  projection.multiplyMatrices(viewProjection, matrix);
  const e = projection.elements;
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (let index = 0; index < vertices.length; index += 3) {
    const x = vertices[index], y = vertices[index + 1], z = vertices[index + 2];
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    const px = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    const py = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    left = Math.min(left, px); right = Math.max(right, px);
    bottom = Math.min(bottom, py); top = Math.max(top, py);
  }
  return { left, right, bottom, top, width: right - left, height: top - bottom };
}

try {
  for (const id of VEHICLE_LIVERY_IDS) {
    const source = id === 'bmwreward' ? await loadBMWVehicle(THREE) : await loadCosmoVehicle(THREE, id);
    const sourceTransform = source.group.matrix.clone();
    const host = { clientWidth: 320, clientHeight: 230, carouselPosition: 0, append() {},
      ownerDocument: { hidden: false, defaultView: { requestAnimationFrame: () => 1, cancelAnimationFrame() {} }, addEventListener() {}, removeEventListener() {} } };
    let scene, camera;
    const preview = createVehicleLiveryPreview(THREE, host, {
      textureLoader: async () => new THREE.Texture(),
      createRenderer: () => ({ domElement: { setAttribute() {}, remove() {} }, setPixelRatio() {}, setSize() {}, setClearColor() {},
        render(nextScene, nextCamera) { scene = nextScene; camera = nextCamera; }, dispose() {} }),
    });
    try {
      await preview.show(source, id);
      for (let flush = 0; flush < 10; flush++) await Promise.resolve();
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const cars = scene.children[0].children, vertices = verticesInTurntable(cars[0]);
      const result = { id, vertices: vertices.length / 3, maximumFrameEdge: 0, minimumNeighborGap: Infinity, sizes: [] };
      for (const [width, height] of viewports) {
        host.clientWidth = width; host.clientHeight = height; host.carouselPosition = 0;
        await preview.show(source, id);
        scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        // Freeze the prior deployed camera framing as a regression baseline.
        const before = camera.clone(), distance = Math.max(2.8, 5.4 / before.aspect) / Math.tan(THREE.MathUtils.degToRad(before.fov / 2));
        before.position.set(distance * .65, distance * .36, distance * .67); before.lookAt(0, .15, 0); before.updateMatrixWorld(true);
        const beforeProjection = new THREE.Matrix4().multiplyMatrices(before.projectionMatrix, before.matrixWorldInverse);
        spin.makeRotationY(-.5);
        const old = projectedBounds(vertices, spin, beforeProjection), enlarged = projectedBounds(vertices, spin, viewProjection);
        for (const axis of ['width', 'height']) {
          const ratio = enlarged[axis] / old[axis];
          assert.ok(ratio >= 1.25 && ratio <= 1.35, `${id} focused ${axis} grows 25–35% at ${width}×${height}: ${ratio}`);
        }
        result.sizes.push({ width, height, beforeWidth: old.width * width / 2, afterWidth: enlarged.width * width / 2,
          beforeHeight: old.height * height / 2, afterHeight: enlarged.height * height / 2 });
        for (const phase of phases) {
          host.carouselPosition = phase; await preview.show(source, id);
          // Layout comes from the real renderer; control only the spin angle so
          // the full idle revolution is covered without waiting twenty seconds.
          for (const car of cars) car.updateMatrix();
          for (let angle = 0; angle < 72; angle++) {
            spin.makeRotationY(-.5 + angle * Math.PI / 36);
            const bounds = new Map();
            for (const car of cars) {
              if (!car.visible) continue;
              transform.multiplyMatrices(car.matrix, spin);
              const box = projectedBounds(vertices, transform, viewProjection), index = car.userData.vehicleLiveryPreview.index;
              bounds.set(index, box);
              const edge = Math.max(-box.left, box.right, -box.bottom, box.top);
              result.maximumFrameEdge = Math.max(result.maximumFrameEdge, edge);
              assert.ok(edge < 1, `${id}/${index} clips ${width}×${height}, phase ${phase}, spin ${angle * 5}°: ${edge}`);
            }
            if (phase === 0 || phase === -1) {
              const selected = phase === 0 ? 0 : 4, center = bounds.get(selected), left = bounds.get((selected + 4) % 5), right = bounds.get((selected + 1) % 5);
              assert.equal(bounds.size, 3, `${id} retains the three real visible finishes`);
              const gap = Math.min(center.left - left.right, right.left - center.right);
              result.minimumNeighborGap = Math.min(result.minimumNeighborGap, gap);
              assert.ok(gap > 0, `${id} neighbors remain separate through the full turn at ${width}×${height}: ${gap}`);
              assert.ok(center.width > left.width && center.width > right.width, `${id} keeps the largest car in focus`);
            }
          }
        }
      }
      assert.deepEqual(source.group.matrix.elements, sourceTransform.elements, `${id} hangar transform is unchanged`);
      report.vehicles.push(result);
    } finally { preview.dispose(); source.dispose(); clearVehicleLiveryTextureCache(); }
  }
} finally { globalThis.fetch = originalFetch; }
if (process.env.LIVERY_SCALE_REPORT) fs.writeFileSync(process.env.LIVERY_SCALE_REPORT, `${JSON.stringify(report, null, 2)}\n`);
const sizes = report.vehicles.flatMap(vehicle => vehicle.sizes);
const growth = axis => sizes.map(size => size[`after${axis}`] / size[`before${axis}`]);
console.log(`All 11 real models grow ${(100 * (Math.min(...growth('Width')) - 1)).toFixed(1)}–${(100 * (Math.max(...growth('Width')) - 1)).toFixed(1)}% wide and ${(100 * (Math.min(...growth('Height')) - 1)).toFixed(1)}–${(100 * (Math.max(...growth('Height')) - 1)).toFixed(1)}% high; ${viewports.length} actual-size viewports, 72 spin angles, 17 fractional/wrap phases, no clipping or settled overlap.`);
