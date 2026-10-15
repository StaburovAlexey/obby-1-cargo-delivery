import { queryRoadSurface, projectRoad, ROAD_SURFACE_OFFSET, corridorContact, truckInRoad, obstacleIntersectsRoad } from "./road-layout.js";
export { projectRoad } from "./road-layout.js";




export const SUPPORT_CLEARANCE = 0.012;



export function groundHeight(x, z, history) {
  return queryRoadSurface(x, z, history).height + ROAD_SURFACE_OFFSET;
}


export function fitTruckToGround(THREE, x, z, heading, history, visual) {
  if(visual?.wheelContacts?.length===4)return fitImportedWheelsToGround(THREE,x,z,heading,history,visual.wheelContacts);
  const chassis=projectRoad(x,z,history);
  const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
  const right = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const sample = (dx, dz) =>
    groundHeight(
      x + right.x * dx - forward.x * dz,
      z + right.z * dx - forward.z * dz,
      chassis,
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

  const supportHeight = 0.68 / Math.max(0.2, up.y);
  for (const dx of [-1.32, 1.32])
    for (const dz of [-1.63, 1.73]) {
      const local = new THREE.Vector3(dx, 0.73, dz).applyQuaternion(quaternion);
      const surface = groundHeight(x + local.x, z + local.z, chassis);
      height = Math.max(height, surface - local.y + supportHeight + SUPPORT_CLEARANCE);
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
  /^(Residence |Terrace plinth|Depot rear$|Depot side$|Portal pier$|Mini mart$|Fuel canopy column$|Canopy column$|Pump red base$|Tree planter$|Tree trunk$|Low planter$|Lamp base$|Fuel totem$|Forklift body$|Fuel island$|Dock$|Pallet deck$)/;

export function collectObstacles(THREE, city) {
  const result = [],
    m = new THREE.Matrix4(),
    world = new THREE.Matrix4();
  city.group.updateMatrixWorld(true);
  city.group.traverse((o) => {
    if (!o.isInstancedMesh)
      return;
    for (let i = 0; i < o.count; i++) {
      const name = o.userData.partNames?.[i] || "";
      if (!OBSTACLE.test(name)) continue;
      o.getMatrixAt(i, m);
      world.multiplyMatrices(o.matrixWorld, m);
      const b = new THREE.Box3()
        .setFromBufferAttribute(o.geometry.attributes.position)
        .applyMatrix4(world);
      const obstacle = {
        name,
        minX: b.min.x,
        maxX: b.max.x,
        minZ: b.min.z,
        maxZ: b.max.z,
        minY: b.min.y,
        maxY: b.max.y,
      };


      if (!obstacleIntersectsRoad(obstacle)) result.push(obstacle);
    }
  });
  return result;
}

export function overlapsTruck(x, z, heading, obstacle, padding = 0.03, footprint) {
  const c = Math.cos(heading),
    s = Math.sin(heading),
    rx = c,
    rz = -s,
    fx = -s,
    fz = -c;
  const halfWidth = footprint?.halfWidth ?? 1.55,
    halfLength = footprint?.halfLength ?? 2.88;
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
export function canPlaceTruck(x, z, heading, obstacles = [], footprint) {
  return truckInRoad(x, z, heading, undefined, footprint) && !obstacles.some((o) => overlapsTruck(x, z, heading, o, 0.03, footprint));
}


export function getTruckContact(x, z, heading, obstacles = [], history, footprint) {
  let deepest;
  const keep = (c) => {
    if (!deepest || c.depth > deepest.depth) deepest = c;
  };
  const roadContact = corridorContact(x, z, heading, history, footprint);
  if (roadContact) keep(roadContact);
  const c = Math.cos(heading),
    s = Math.sin(heading),
    rx = c,
    rz = -s,
    fx = -s,
    fz = -c;
  const halfWidth = footprint?.halfWidth ?? 1.55,
    halfLength = footprint?.halfLength ?? 2.88;
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
        halfWidth * Math.abs(rx * ax + rz * az) +
        halfLength * Math.abs(fx * ax + fz * az) +
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



function fitImportedWheelsToGround(THREE,x,z,heading,history,wheels){
  const chassis=projectRoad(x,z,history),c=Math.cos(heading),s=Math.sin(heading);
  const pos=w=>w.center;
  const sample=w=>{const p=pos(w);return groundHeight(x+c*p[0]+s*p[2],z-s*p[0]+c*p[2],chassis)};
  const mean=(items,fn)=>items.reduce((a,w)=>a+fn(w),0)/items.length;
  const front=wheels.filter(w=>w.front),rear=wheels.filter(w=>!w.front),left=wheels.filter(w=>pos(w)[0]<0),rightW=wheels.filter(w=>pos(w)[0]>=0);
  if(!front.length||!rear.length||!left.length||!rightW.length)throw new Error('Imported vehicle needs four unambiguous wheel contacts');
  const longitudinal=(mean(front,sample)-mean(rear,sample))/(mean(rear,w=>pos(w)[2])-mean(front,w=>pos(w)[2]));
  const lateral=(mean(rightW,sample)-mean(left,sample))/(mean(rightW,w=>pos(w)[0])-mean(left,w=>pos(w)[0]));
  const forward=new THREE.Vector3(-s,longitudinal,-c).normalize(),right=new THREE.Vector3(c,lateral,-s).normalize();
  const up=new THREE.Vector3().crossVectors(right,forward).normalize();right.crossVectors(forward,up).normalize();
  const quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward.clone().negate()));
  let height=-Infinity;const centers=[];
  for(const w of wheels){
    const local=new THREE.Vector3(...pos(w)).applyQuaternion(quaternion),surface=groundHeight(x+local.x,z+local.z,chassis);
    const supportHeight=w.radius/Math.max(.2,up.y);
    height=Math.max(height,surface-local.y+supportHeight+SUPPORT_CLEARANCE);centers.push({local,surface,supportHeight});
  }
  return {position:new THREE.Vector3(x,height,z),quaternion,normal:up,clearances:centers.map(w=>height+w.local.y-w.supportHeight-w.surface)};
}
