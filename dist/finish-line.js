/** Decorative final delivery approach. Road paint is clipped from the actual
 * rendered road triangles; no new collision, trigger, asset or update loop. */
import { DELIVERY_CHECKPOINTS } from './economy-config.js';
import { ROAD_MESH, ROAD_SURFACE_OFFSET, ROUTE, routePointAtDistance,
  queryRoadSurface } from './route-network.js';

export const FINISH_LINE_STYLE = Object.freeze({
  approachDistance: 28,
  lineWidth: ROUTE.halfWidth * 2 - .2,
  columns: 20,
  rows: 2,
  paintLift: .018,
  poleOffset: ROUTE.halfWidth + .16,
  poleWidth: .14,
  poleHeight: 9,
  baseWidth: .26,
  flagWidth: 4.2,
  flagHeight: 2.8,
  flagTop: 8.65,
});

export function finishLineSpec(checkpoint = DELIVERY_CHECKPOINTS.at(-1)) {
  const distance = checkpoint.distance - FINISH_LINE_STYLE.approachDistance;
  const point = routePointAtDistance(distance, { branch: 'main' });
  return Object.freeze({
    id: 'final-delivery-finish', checkpointId: checkpoint.id,
    checkpointProgress: checkpoint.progress, checkpointDistance: checkpoint.distance,
    distance, ...point, lineWidth: FINISH_LINE_STYLE.lineWidth,
    lineDepth: FINISH_LINE_STYLE.rows * FINISH_LINE_STYLE.lineWidth / FINISH_LINE_STYLE.columns,
    approachDistance: FINISH_LINE_STYLE.approachDistance,
  });
}
export const FINISH_LINE_SPEC = finishLineSpec();

function clip(polygon, key, value, direction) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = direction * (a[key] - value), db = direction * (b[key] - value);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

function bufferGeometry(THREE, positions, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Exact clipping preserves triangle seams even on a curved, graded or crowned
 * road. A single flat rectangle would either float or disappear into a slope. */
function paintGeometry(THREE, spec) {
  const positions = [], colors = [], c = Math.cos(spec.heading), s = Math.sin(spec.heading);
  const white = new THREE.Color(0xffffff), black = new THREE.Color(0x13151a);
  const size = spec.lineWidth / FINISH_LINE_STYLE.columns;
  const halfWidth = spec.lineWidth / 2, halfDepth = spec.lineDepth / 2;
  for (let i = 0; i < ROAD_MESH.indices.length; i += 3) {
    const ids = ROAD_MESH.indices.slice(i, i + 3);
    // A conservative progress prefilter only; clipping uses real X/Y/Z.
    const progress = ids.map(id => ROAD_MESH.progress[id]);
    if (Math.min(...progress) > spec.progress + 12 || Math.max(...progress) < spec.progress - 12) continue;
    const source = ids.map(id => {
      const x = ROAD_MESH.positions[id * 3] - spec.x, z = ROAD_MESH.positions[id * 3 + 2] - spec.z;
      return { x: c * x - s * z, y: ROAD_MESH.positions[id * 3 + 1] + ROAD_SURFACE_OFFSET + FINISH_LINE_STYLE.paintLift,
        z: s * x + c * z };
    });
    for (let row = 0; row < FINISH_LINE_STYLE.rows; row++) for (let column = 0; column < FINISH_LINE_STYLE.columns; column++) {
      const left = -halfWidth + column * size, rear = -halfDepth + row * size;
      let cell = clip(source, 'x', left, 1);
      cell = clip(cell, 'x', left + size, -1);
      cell = clip(cell, 'z', rear, 1);
      cell = clip(cell, 'z', rear + size, -1);
      const color = (row + column) % 2 ? black : white;
      for (let j = 1; j < cell.length - 1; j++) {
        const triangle = [cell[0], cell[j], cell[j + 1]];
        const [a, b, d] = triangle;
        if (Math.abs((b.x - a.x) * (d.z - a.z) - (b.z - a.z) * (d.x - a.x)) < 1e-10) continue;
        for (const p of triangle) { positions.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b); }
      }
    }
  }
  const geometry = bufferGeometry(THREE, positions, colors);
  geometry.userData.surfaceLift = FINISH_LINE_STYLE.paintLift;
  geometry.userData.source = 'Clipped authoritative road triangles';
  return geometry;
}

/** A small pair of rigid, faceted LEGO-style cloths; their shared checker
 * colours are geometry, so no canvas, texture download or animation is needed. */
function flagGeometry(THREE, bases) {
  const positions = [], colors = [], white = new THREE.Color(0xffffff), black = new THREE.Color(0x13151a);
  const { poleOffset, flagWidth, flagHeight, flagTop } = FINISH_LINE_STYLE;
  const columns = 6, rows = 4;
  for (const side of [-1, 1]) {
    const point = (u, v) => ({
      x: side * (poleOffset - u * flagWidth),
      y: bases.get(side) + flagTop - v * flagHeight - u * .14,
      z: Math.sin(u * Math.PI * 1.5) * .22,
    });
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const a = point(column / columns, row / rows), b = point((column + 1) / columns, row / rows);
      const c = point((column + 1) / columns, (row + 1) / rows), d = point(column / columns, (row + 1) / rows);
      const color = (row + column) % 2 ? black : white;
      for (const p of [a, b, c, a, c, d]) { positions.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b); }
    }
  }
  return bufferGeometry(THREE, positions, colors);
}

export function createFinishLine(THREE, { checkpoint = DELIVERY_CHECKPOINTS.at(-1) } = {}) {
  const spec = checkpoint === DELIVERY_CHECKPOINTS.at(-1) ? FINISH_LINE_SPEC : finishLineSpec(checkpoint);
  const group = new THREE.Group();
  group.name = 'Final delivery finish line';
  group.position.set(spec.x, 0, spec.z);
  group.rotation.y = spec.heading;
  group.userData = { nonBlocking: true, finishLine: spec };
  const geometries = new Set(), materials = new Set();
  const add = (name, geometry, material) => {
    geometries.add(geometry); materials.add(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.userData.nonBlocking = true; group.add(mesh);
    return mesh;
  };
  const paint = add('Road-conforming checkered finish paint', paintGeometry(THREE, spec),
    new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  paint.renderOrder = 2;

  const bases = new Map();
  for (const side of [-1, 1]) {
    const x = spec.x + spec.right.x * side * FINISH_LINE_STYLE.poleOffset;
    const z = spec.z + spec.right.z * side * FINISH_LINE_STYLE.poleOffset;
    bases.set(side, queryRoadSurface(x, z, spec).height + ROAD_SURFACE_OFFSET);
  }
  const flags = add('Two checkered finish flags', flagGeometry(THREE, bases),
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
  flags.userData.minimumRoadClearance = FINISH_LINE_STYLE.flagTop - FINISH_LINE_STYLE.flagHeight - .14;

  const supportGeometry = new THREE.BoxGeometry(1, 1, 1);
  const supportMaterial = new THREE.MeshStandardMaterial({ roughness: .38, metalness: .06 });
  geometries.add(supportGeometry); materials.add(supportMaterial);
  const supports = new THREE.InstancedMesh(supportGeometry, supportMaterial, 6);
  supports.name = 'Outside-road finish flag poles';
  supports.userData.nonBlocking = true;
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  let index = 0;
  for (const side of [-1, 1]) {
    const base = bases.get(side), x = side * FINISH_LINE_STYLE.poleOffset;
    for (const [y, width, height, depth, color] of [
      [base + .14, FINISH_LINE_STYLE.baseWidth, .28, .55, 0x252936],
      [base + FINISH_LINE_STYLE.poleHeight / 2, FINISH_LINE_STYLE.poleWidth, FINISH_LINE_STYLE.poleHeight, .14, 0xffc438],
      [base + FINISH_LINE_STYLE.poleHeight, .21, .21, .21, 0xffe384],
    ]) {
      matrix.compose(position.set(x, y, 0), rotation, scale.set(width, height, depth));
      supports.setMatrixAt(index, matrix); supports.setColorAt(index++, new THREE.Color(color));
    }
  }
  supports.instanceMatrix.needsUpdate = true;
  supports.instanceColor.needsUpdate = true;
  supports.computeBoundingBox(); supports.computeBoundingSphere();
  supports.castShadow = false;
  group.add(supports);
  const stats = { drawCalls: 3, triangles: paint.geometry.attributes.position.count / 3 +
    flags.geometry.attributes.position.count / 3 + 6 * 12, textures: 0, flags: 2, disposed: false };
  return {
    group, spec, stats,
    dispose() {
      if (stats.disposed) return;
      stats.disposed = true;
      supports.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.removeFromParent(); group.clear();
      stats.drawCalls = 0; stats.triangles = 0;
    },
  };
}
