import {getRapier} from './rapier-runtime.js';

export const PHYSICS_FIXED_STEP = 1 / 60;
export const PHYSICS_CHUNK_SIZE = 128;
const MAX_FRAME_DELTA = .1;
const MAX_STEPS = 6;
const CITY_SURFACES = new Map([
  ['Continuous 30m-wide road', 'road'],
  ['Closed continuous terrain foundation', 'ground'],
  ['Single-car bridge underdecks', 'support'],
  ['Continuous storefront residences', 'wall'],
  ['Massive biome barriers', 'wall'],
  ['Road pit walls', 'wall'],
  ['Road pit floors', 'ground'],
  ['Road jump ramps', 'road'],
]);
const GARAGE_PART = /^(?:Garage floor|Flush roadside entrance apron|Garage (?:left wall|right wall|front left wall|front right wall|rear wall|door lintel|roof)|Open door (?:left trim|right trim|threshold)|Reward pedestal (?:foundation|silver rim|top))$/;
const CANYON_SURFACE = /^(?:Canyon (?:asphalt|left shoulder|right shoulder|approach asphalt|basin floor)|Entrance curved shoulders)$/;
const CANYON_WALL = /^(?:Canyon steel guardrails(?: \d+)?|Canyon guardrail posts|Canyon (?:approach )?sandstone stratum \d+|Barrier post)$/;
const supportTags = new Set(['road', 'ground', 'support']);

/** Build fixed colliders once from the final rendered meshes. Must follow initializeRapier(). */
export function createPhysicsWorld({THREE, city, garage, canyon, roadHazards} = {}) {
  if (!THREE) throw new TypeError('createPhysicsWorld requires THREE');
  const R = getRapier();
  const world = new R.World({x: 0, y: -9.81, z: 0});
  world.timestep = PHYSICS_FIXED_STEP;
  const stats = {chunks: 0, boxes: 0, staticTriangles: 0, staticColliders: 0, kinematicBodies: 0, steps: 0, disposed: false};
  const moving = [], gateColliders = [];
  let accumulator = 0, disposed = false, frameSeconds = 0;
  const parked = new Map();
  const vector = new THREE.Vector3();
  const identity = new THREE.Matrix4();

  function register(desc, tag, name, body) {
    desc.setFriction(supportTags.has(tag) ? .85 : .5).setRestitution(0);
    const collider = world.createCollider(desc, body);
    collider.userData = {tag, name, support: supportTags.has(tag)};
    collider.physicsTag = tag;
    if (!body) stats.staticColliders++;
    return collider;
  }

  // Every source triangle belongs to precisely one cell. Large triangles may
  // extend outside that cell; Rapier's collider AABB still covers the whole triangle.
  function addTrimesh(vertices, indices, tag = 'support', name = tag, matrix = identity) {
    if (!vertices?.length) return;
    const points = new Float32Array(vertices.length);
    for (let i = 0; i < vertices.length; i += 3) {
      vector.set(vertices[i], vertices[i + 1], vertices[i + 2]).applyMatrix4(matrix);
      points[i] = vector.x; points[i + 1] = vector.y; points[i + 2] = vector.z;
    }
    const source = indices || Array.from({length: points.length / 3}, (_, i) => i);
    const cells = new Map();
    for (let i = 0; i + 2 < source.length; i += 3) {
      const a = source[i], b = source[i + 1], c = source[i + 2];
      const x = (points[a * 3] + points[b * 3] + points[c * 3]) / 3;
      const z = (points[a * 3 + 2] + points[b * 3 + 2] + points[c * 3 + 2]) / 3;
      const key = `${Math.floor(x / PHYSICS_CHUNK_SIZE)},${Math.floor(z / PHYSICS_CHUNK_SIZE)}`;
      let cell = cells.get(key);
      if (!cell) { cell = {vertices: [], indices: [], remap: new Map()}; cells.set(key, cell); }
      for (const index of [a, b, c]) {
        let local = cell.remap.get(index);
        if (local === undefined) {
          local = cell.vertices.length / 3; cell.remap.set(index, local);
          cell.vertices.push(points[index * 3], points[index * 3 + 1], points[index * 3 + 2]);
        }
        cell.indices.push(local);
      }
    }
    for (const [key, cell] of cells) {
      if (!cell.indices.length) continue;
      register(R.ColliderDesc.trimesh(new Float32Array(cell.vertices), new Uint32Array(cell.indices)), tag, `${name} [${key}]`);
      stats.chunks++; stats.staticTriangles += cell.indices.length / 3;
    }
  }

  function addBox(halfExtents, position, quaternion, tag, name) {
    if (!halfExtents.every(n => Number.isFinite(n) && n > 0)) return;
    const desc = R.ColliderDesc.cuboid(...halfExtents).setTranslation(...position);
    if (quaternion) desc.setRotation(Array.isArray(quaternion) ? {x: quaternion[0], y: quaternion[1], z: quaternion[2], w: quaternion[3]} : quaternion);
    const collider = register(desc, tag, name); stats.boxes++;
    return collider;
  }

  function addMesh(mesh, tag, matrix = mesh.matrixWorld, name = mesh.name) {
    const geometry = mesh.geometry, p = geometry?.getAttribute('position');
    if (!p) return;
    // Box primitives remain cheap cuboids and preserve their actual transformed center.
    if (geometry.type === 'BoxGeometry') {
      geometry.computeBoundingBox();
      const center = geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(matrix);
      const size = geometry.boundingBox.getSize(new THREE.Vector3());
      const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      matrix.decompose(position, rotation, scale);
      const collider = addBox([Math.abs(size.x * scale.x) / 2, Math.abs(size.y * scale.y) / 2, Math.abs(size.z * scale.z) / 2], center.toArray(), rotation, tag, name);
      if (tag === 'gate' && collider) gateColliders.push(collider);
      return;
    }
    const positions = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {positions[i * 3] = p.getX(i); positions[i * 3 + 1] = p.getY(i); positions[i * 3 + 2] = p.getZ(i);}
    addTrimesh(positions, geometry.index?.array, tag, name, matrix);
  }

  function eachInstance(mesh, fn) {
    if (!mesh.isInstancedMesh) { fn(mesh.matrixWorld, mesh.name); return; }
    const local = new THREE.Matrix4(), matrix = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, local); matrix.multiplyMatrices(mesh.matrixWorld, local);
      fn(matrix, mesh.userData.partNames?.[i] || mesh.name);
    }
  }

  function addCliffWalls(mesh) {
    // The visual cliff has seven detailed strata per four-metre segment.
    // Keep its exact exposed top edge and replace those strata with one flat wall.
    const positions = [], indices = [];
    const addWall=(a,b)=>{
      const base = positions.length / 3;
      positions.push(...a, ...b, b[0], b[1] - 48, b[2], a[0], a[1] - 48, a[2]);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const edges=mesh.userData.physicsCliffEdges;
    if(edges){
      // Rendering may omit long perimeter walls while physics retains the
      // original float32 edge pairs, in their original section order.
      for(let i=0;i+5<edges.length;i+=6)addWall([edges[i],edges[i+1],edges[i+2]],[edges[i+3],edges[i+4],edges[i+5]]);
    }else{
      const p=mesh.geometry.getAttribute('position');
      if(!p||p.count%28!==0)return;
      // Without a separate physics source, respect cut visual indices so a
      // removed branch section does not become an invisible collision wall.
      const visibleSections=mesh.geometry.index?new Set(Array.from(mesh.geometry.index.array,index=>Math.floor(index/28))):null;
      for(let i=0;i<p.count;i+=28){
        if(visibleSections&&!visibleSections.has(i/28))continue;
        addWall([p.getX(i),p.getY(i),p.getZ(i)],[p.getX(i+1),p.getY(i+1),p.getZ(i+1)]);
      }
    }
    addTrimesh(positions, indices, 'wall', 'Simplified exposed terrain cliffs', mesh.matrixWorld);
  }

  if (city?.group) {
    city.group.updateWorldMatrix(true, true);
    city.group.traverse(mesh => {
      if (!mesh.isMesh || !mesh.visible) return;
      const tag = CITY_SURFACES.get(mesh.name);
      if (tag) eachInstance(mesh, matrix => addMesh(mesh, tag, matrix));
      else if (mesh.name === 'Layered earth and rock cliffs') addCliffWalls(mesh);
    });
  }
  if (garage?.group) {
    garage.group.updateWorldMatrix(true, true);
    garage.group.traverse(mesh => {
      if (!mesh.isMesh || !mesh.visible) return;
      eachInstance(mesh, (matrix, name) => {
        if (GARAGE_PART.test(name)) addMesh(mesh, /floor|apron|threshold|pedestal/.test(name) ? 'support' : 'wall', matrix, name);
      });
    });
  }
  const canyonRoots = new Set([canyon?.group, canyon?.entrance?.group, canyon?.environment?.group].filter(Boolean));
  for (const root of canyonRoots) {
    root.updateWorldMatrix(true, true);
    root.traverse(mesh => {
      if (!mesh.isMesh || !mesh.visible) return;
      if (CANYON_SURFACE.test(mesh.name)) eachInstance(mesh, matrix => addMesh(mesh, 'road', matrix));
      else if (CANYON_WALL.test(mesh.name)) eachInstance(mesh, matrix => addMesh(mesh, 'wall', matrix));
      else if (mesh.name === 'Closed red and white barrier arm') addMesh(mesh, 'gate');
    });
  }
  const hazardPose = h => roadHazards?.poseFor?.(h.id) || h;
  const hazardPosition = h => ({x: h.x, y: (h.groundHeight || 0) + h.height / 2, z: h.z});
  const hazardRotation = h => ({x: 0, y: Math.sin((h.heading || 0) / 2), z: 0, w: Math.cos((h.heading || 0) / 2)});
  const movers = new Set((roadHazards?.movers || []).map(h => h.id));
  for (const h of roadHazards?.poses || roadHazards?.movers || []) {
    if ((h.solid === false && !movers.has(h.id)) || ![h.width, h.height, h.length].every(n => n > 0)) continue;
    const pose = hazardPose(h), p = hazardPosition(pose), rotation = hazardRotation(pose);
    const desc = R.ColliderDesc.cuboid(h.width / 2, h.height / 2, h.length / 2);
    if (movers.has(h.id)) {
      const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z).setRotation(rotation));
      const collider = register(desc, h.solid === false ? 'support' : 'obstacle', `Road hazard ${h.id}`, body);
      collider.userData.hazardId = h.id;
      moving.push({h, body}); stats.kinematicBodies++;
    } else register(desc.setTranslation(p.x, p.y, p.z).setRotation(rotation), 'obstacle', `Road hazard ${h.id}`);
  }

  function updateGate(unlocked = canyon?.entrance?.unlocked ?? canyon?.unlocked ?? false) {
    if (disposed) return;
    for (const collider of gateColliders) collider.setEnabled(!unlocked);
  }
  updateGate();

  function syncParkedVehicles(selectedId=null){
    if(disposed)return;
    for(const vehicle of garage?.vehicles||[]){
      const root=vehicle.rig?.root||vehicle.root,bounds=vehicle.visual?.metadata?.bounds;
      if(!root||!bounds?.min||!bounds?.max)continue;
      let record=parked.get(vehicle.id);
      if(record?.bounds!==bounds){
        if(record)world.removeCollider(record.collider,true);
        const half=new THREE.Vector3(...bounds.max).sub(new THREE.Vector3(...bounds.min)).multiplyScalar(.5);
        const proxy=register(R.ColliderDesc.cuboid(Math.max(.1,half.x),Math.max(.1,half.y),Math.max(.1,half.z)),'obstacle',`Parked ${vehicle.id}`);
        record={bounds,collider:proxy,center:new THREE.Vector3(...bounds.max).add(new THREE.Vector3(...bounds.min)).multiplyScalar(.5),matrix:null};
        parked.set(vehicle.id,record);
      }
      record.collider.setEnabled(vehicle.id!==selectedId);
      if(vehicle.id===selectedId)continue;
      root.updateWorldMatrix(true,false);
      if(!record.matrix||!record.matrix.equals(root.matrixWorld)){
        const position=record.center.clone().applyMatrix4(root.matrixWorld),rotation=new THREE.Quaternion();root.getWorldQuaternion(rotation);
        record.collider.setTranslation(position);record.collider.setRotation(rotation);record.matrix=root.matrixWorld.clone();
      }
    }
  }

  function step(deltaSeconds, activeModel, {onBeforeStep, onAfterStep} = {}) {
    if (disposed) return undefined;
    frameSeconds=0;
    activeModel?.beginFrame?.();
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(MAX_FRAME_DELTA, deltaSeconds)) : 0;
    accumulator = Math.min(MAX_FRAME_DELTA, accumulator + delta);
    let iterations = 0;
    while (accumulator + 1e-10 >= PHYSICS_FIXED_STEP && iterations < MAX_STEPS) {
      activeModel?.beforeStep?.(PHYSICS_FIXED_STEP);
      onBeforeStep?.(PHYSICS_FIXED_STEP);
      // The manager accepts a finite player pose, including when the player is
      // temporarily outside a vehicle; hazards still advance on the same clock.
      const state = activeModel?.state || {};
      const position = state.position || state;
      roadHazards?.update?.(PHYSICS_FIXED_STEP, {x: Number.isFinite(position.x) ? position.x : 0, z: Number.isFinite(position.z) ? position.z : 0, heading: Number.isFinite(state.heading) ? state.heading : 0}, true);
      for (const {h, body} of moving) { const pose = hazardPose(h); body.setNextKinematicTranslation(hazardPosition(pose)); body.setNextKinematicRotation(hazardRotation(pose)); }
      world.step(); stats.steps++;frameSeconds+=PHYSICS_FIXED_STEP;
      activeModel?.afterStep?.(PHYSICS_FIXED_STEP);
      onAfterStep?.(PHYSICS_FIXED_STEP);
      accumulator = Math.max(0, accumulator - PHYSICS_FIXED_STEP); iterations++;
    }
    return activeModel?.getRenderState?.(Math.min(1 - Number.EPSILON, accumulator / PHYSICS_FIXED_STEP));
  }
  return {
    world, stats, step, updateGate, syncParkedVehicles,
    get alpha() { return Math.min(1 - Number.EPSILON, accumulator / PHYSICS_FIXED_STEP); },
    get frameSeconds(){return frameSeconds;},
    resetTime() { accumulator = 0;frameSeconds=0; },
    dispose() { if (disposed) return; disposed = true; accumulator = 0; world.free(); stats.disposed = true; },
  };
}
