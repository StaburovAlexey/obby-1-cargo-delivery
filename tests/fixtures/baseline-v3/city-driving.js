import { routeHeight, routeCenter } from "./scene.js";


export function projectRoad(x, z) {
  const yy = -z;
  let y = yy;
  for (let i = 0; i < 8; i++) {
    const d = (routeCenter(y + 0.01) - routeCenter(y - 0.01)) / 0.02;
    const dd =
      (routeCenter(y + 0.01) - 2 * routeCenter(y) + routeCenter(y - 0.01)) /
      0.0001;
    const f = (routeCenter(y) - x) * d + y - yy;
    const df = d * d + (routeCenter(y) - x) * dd + 1;
    y -= f / df;
  }
  const d = (routeCenter(y + 0.01) - routeCenter(y - 0.01)) / 0.02;
  const n = 1 / Math.hypot(1, d);
  return { y, offset: (x - routeCenter(y)) * n - (yy - y) * d * n };
}


export function groundHeight(x, z) {
  const p = projectRoad(x, z),
    a = Math.abs(p.offset),
    yy = -z;
  if (a >= 4.98 && a <= 5.31) return routeHeight(p.y) + 0.402;
  if (a <= 5.05) {
    const road = routeHeight(p.y) + 0.061;
    return p.y >= 12.5 && p.y <= 15.5
      ? Math.max(road, routeHeight(14) + 0.0925)
      : road;
  }
  if (a <= 8.03) return routeHeight(p.y) + 0.229;
  if (Math.abs(x) >= 7.94 && Math.abs(x) <= 24.06 && yy >= -17.8 && yy <= 17.2)
    return 0.1765;
  return routeHeight(yy) - 0.28;
}


export function fitTruckToGround(THREE, x, z, heading) {
  const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
  const right = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const sample = (dx, dz) =>
    groundHeight(
      x + right.x * dx - forward.x * dz,
      z + right.z * dx - forward.z * dz,
    );
  const front = (sample(-1.32, -1.63) + sample(1.32, -1.63)) / 2;
  const rear = (sample(-1.32, 1.73) + sample(1.32, 1.73)) / 2;
  const left = (sample(-1.32, -1.63) + sample(-1.32, 1.73)) / 2;
  const rightH = (sample(1.32, -1.63) + sample(1.32, 1.73)) / 2;
  forward.y = (front - rear) / 3.36;
  forward.normalize();
  right.y = (rightH - left) / 2.64;
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  right.crossVectors(forward, up).normalize();
  const back = forward.clone().negate();
  const matrix = new THREE.Matrix4().makeBasis(right, up, back);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
  const centers = [];
  let height = -Infinity;
  const radiusVertical = 0.68 * Math.sqrt(Math.max(0, 1 - right.y * right.y));

  const supportHeight = 0.68 / Math.max(0.2, up.y);
  for (const dx of [-1.32, 1.32])
    for (const dz of [-1.63, 1.73]) {
      const local = new THREE.Vector3(dx, 0.73, dz).applyQuaternion(quaternion);
      const surface = groundHeight(x + local.x, z + local.z);
      height = Math.max(height, surface - local.y + supportHeight);
      centers.push({ local, surface });
    }
  return {
    position: new THREE.Vector3(x, height, z),
    quaternion,
    normal: up,
    clearances: centers.map(
      (c) => height + c.local.y - supportHeight - c.surface,
    ),
  };
}

const OBSTACLE =
  /^(Residence |Terrace plinth|Depot rear$|Depot side$|Portal pier$|Mini mart$|Fuel canopy column$|Canopy column$|Pump red base$|Tree planter$|Low planter$|Lamp base$|Fuel totem$|Forklift body$|Fuel island$|Dock$|Pallet deck$)/;

export function collectObstacles(THREE, city) {
  const result = [],
    m = new THREE.Matrix4(),
    world = new THREE.Matrix4();
  city.group.updateMatrixWorld(true);
  city.group.traverse((o) => {
    if (!o.isInstancedMesh || o.parent?.name === "Orange delivery truck")
      return;
    for (let i = 0; i < o.count; i++) {
      const name = o.userData.partNames?.[i] || "";
      if (!OBSTACLE.test(name)) continue;
      o.getMatrixAt(i, m);
      world.multiplyMatrices(o.matrixWorld, m);
      const b = new THREE.Box3()
        .setFromBufferAttribute(o.geometry.attributes.position)
        .applyMatrix4(world);
      result.push({
        name,
        minX: b.min.x,
        maxX: b.max.x,
        minZ: b.min.z,
        maxZ: b.max.z,
        minY: b.min.y,
        maxY: b.max.y,
      });
    }
  });
  return result;
}

export function overlapsTruck(x, z, heading, obstacle, padding = 0.03) {
  const c = Math.cos(heading),
    s = Math.sin(heading),
    rx = c,
    rz = -s,
    fx = -s,
    fz = -c;
  const halfWidth = 1.55,
    halfLength = 2.88;
  const bx = (obstacle.minX + obstacle.maxX) / 2,
    bz = (obstacle.minZ + obstacle.maxZ) / 2;
  const ex = (obstacle.maxX - obstacle.minX) / 2 + padding,
    ez = (obstacle.maxZ - obstacle.minZ) / 2 + padding;
  const dx = x - bx,
    dz = z - bz;
  for (const [ax, az] of [
    [1, 0],
    [0, 1],
    [rx, rz],
    [fx, fz],
  ]) {
    const separation = Math.abs(dx * ax + dz * az);
    const car =
      halfWidth * Math.abs(rx * ax + rz * az) +
      halfLength * Math.abs(fx * ax + fz * az);
    const block = ex * Math.abs(ax) + ez * Math.abs(az);
    if (separation >= car + block) return false;
  }
  return true;
}
export function canPlaceTruck(x, z, heading, obstacles) {
  const yy = -z;
  if (x < -29 || x > 29 || yy < -19 || yy > 82) return false;
  return !obstacles.some((o) => overlapsTruck(x, z, heading, o));
}


export function getTruckContact(x, z, heading, obstacles) {
  let deepest;
  const keep = (c) => {
    if (!deepest || c.depth > deepest.depth) deepest = c;
  };
  if (x < -28.5) keep({ normalX: 1, normalZ: 0, depth: -28.5 - x });
  if (x > 28.5) keep({ normalX: -1, normalZ: 0, depth: x - 28.5 });
  if (z > 19) keep({ normalX: 0, normalZ: -1, depth: z - 19 });
  if (z < -82) keep({ normalX: 0, normalZ: 1, depth: -82 - z });
  const c = Math.cos(heading),
    s = Math.sin(heading),
    rx = c,
    rz = -s,
    fx = -s,
    fz = -c;
  for (const o of obstacles) {
    const dx = x - (o.minX + o.maxX) / 2,
      dz = z - (o.minZ + o.maxZ) / 2;
    const ex = (o.maxX - o.minX) / 2 + 0.03,
      ez = (o.maxZ - o.minZ) / 2 + 0.03;
    let minimum = Infinity,
      normalX = 0,
      normalZ = 0,
      overlap = true;
    for (const [ax, az] of [
      [1, 0],
      [0, 1],
      [rx, rz],
      [fx, fz],
    ]) {
      const projected = dx * ax + dz * az;
      const reach =
        1.55 * Math.abs(rx * ax + rz * az) +
        2.88 * Math.abs(fx * ax + fz * az) +
        ex * Math.abs(ax) +
        ez * Math.abs(az);
      const depth = reach - Math.abs(projected);
      if (depth <= 0) {
        overlap = false;
        break;
      }
      if (depth < minimum) {
        minimum = depth;
        const sign = projected < 0 ? -1 : 1;
        normalX = ax * sign;
        normalZ = az * sign;
      }
    }
    if (overlap) keep({ normalX, normalZ, depth: minimum, name: o.name });
  }
  return deepest;
}
