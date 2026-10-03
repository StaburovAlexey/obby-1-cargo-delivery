#!/usr/bin/env node
// Renderer-free garage, reachability, resource and mesh-free contact-pose checks.
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { buildCity } from '../dist/scene.js';
import { createGarageScene, GARAGE_LAYOUT, FUEL_STATION_SPECS } from '../dist/garage-scene.js';
import { groundHeight } from '../dist/city-driving.js';
import { branchCenter, truckInRoad, roadIntervals, biomeAt, TRUCK_HALF_WIDTH, TRUCK_HALF_LENGTH } from '../dist/road-layout.js';

let count = 0; const failures = [];
const check = (name, run) => { count++; try { run(); console.log(`PASS ${name}`); } catch(error) { failures.push({name,error:error.message}); console.error(`FAIL ${name}: ${error.message}`); } };
const near = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const city = buildCity(THREE, { seed: 42 });
const originalSnapshots = [];
city.group.traverse(mesh => { if(mesh.isMesh) originalSnapshots.push({mesh,
  matrices:mesh.instanceMatrix?.array.slice(),colors:mesh.instanceColor?.array.slice(),positions:mesh.geometry.attributes.position.array.slice(),
  material:mesh.material,geometry:mesh.geometry}); });
const originalMap = city.group.getObjectByName('Single-car bridge underdecks').material.map;
const garage = createGarageScene(THREE, city);

check('eleven retained vehicle roots contain only hidden cargo anchors until GLBs arrive', () => {
  assert.equal(garage.vehicles.length,11);assert.equal(new Set(garage.vehicles.map(car=>car.id)).size,11);
  assert.equal(city.group.getObjectByName('Orange delivery truck'),undefined);assert.ok(!city.features.some(feature=>feature.type==='truck'));
  const roots=new Set(),poses=new Set(),wheels=new Set();
  for (const car of garage.vehicles) {
    assert.equal(car.rig.root,car.root);assert.equal(car.rig.wheels.length,4);assert.equal(car.rig.wheelRadius,.68);assert.equal(car.rig.wheelbase,3.36);
    near(car.rig.root.position.x,car.park.x);near(car.rig.root.position.z,car.park.z);
    assert.ok(!garage.getContact(car.park.x,car.park.z,car.park.heading));assert.ok(!truckInRoad(car.park.x,car.park.z,car.park.heading));
    assert.ok(!roots.has(car.root));roots.add(car.root);assert.ok(!poses.has(car.rig.pose));poses.add(car.rig.pose);
    assert.ok(car.cargo.isGroup);assert.equal(car.cargo.visible,false);assert.deepEqual(car.root.children,[car.cargo]);assert.equal(car.cargo.children.length,0);
    car.root.traverse(object=>assert.ok(!object.isMesh,`${car.id} unexpectedly owns generated vehicle geometry`));
    for(const wheel of car.rig.wheels){
      assert.ok(!wheels.has(wheel));wheels.add(wheel);assert.equal(wheel.parts,undefined);assert.equal(wheel.mesh,undefined);
      assert.deepEqual(wheel.localPosition.toArray(),[wheel.side==='left'?-1.32:1.32,.73,wheel.front?-1.63:1.73]);assert.equal(wheel.radius,.68);
    }
  }
  assert.equal(roots.size,11);assert.equal(poses.size,11);assert.equal(wheels.size,44);
});

check('all contact and suspension pose fields update without moving other vehicle roots', () => {
  const targets=garage.vehicles.map(car=>car.rig);
  for(const target of targets){
    const others=targets.filter(rig=>rig!==target).map(rig=>({rig,position:rig.root.position.toArray(),quaternion:rig.root.quaternion.toArray(),pose:{...rig.pose},wheels:rig.wheels.map(w=>({position:w.localPosition.toArray(),steerAngle:w.steerAngle,wheelSpin:w.wheelSpin}))}));
    const position=target.root.position.clone(),quaternion=target.root.quaternion.clone();
    target.update({steerAngle:.42,wheelSpin:1.3,bodyPitch:.07,bodyRoll:-.05,bodyBob:.08});
    assert.deepEqual(target.pose,{steerAngle:.42,wheelSpin:1.3,bodyPitch:.07,bodyRoll:-.05,bodyBob:.08});
    near(target.root.position.distanceTo(position),0);assert.ok(target.root.quaternion.angleTo(quaternion)<1e-7);
    for(const wheel of target.wheels){near(wheel.steerAngle,wheel.front?.42:0);near(wheel.wheelSpin,1.3);}
    for(const other of others){assert.deepEqual(other.rig.root.position.toArray(),other.position);assert.deepEqual(other.rig.root.quaternion.toArray(),other.quaternion);assert.deepEqual(other.rig.pose,other.pose);assert.deepEqual(other.rig.wheels.map(w=>({position:w.localPosition.toArray(),steerAngle:w.steerAngle,wheelSpin:w.wheelSpin})),other.wheels);}
    target.reset();assert.deepEqual(target.pose,{steerAngle:0,wheelSpin:0,bodyPitch:0,bodyRoll:0,bodyBob:0});
  }
});

check('mesh-free contact pivots stay within the retained Tow footprint for all steering poses', () => {
  for(const {rig,park} of garage.vehicles){
    for(const steerAngle of[-.6,0,.6]){
      rig.update({quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),park.heading),steerAngle,wheelSpin:.48,bodyPitch:.1,bodyRoll:-.12});
      for(const wheel of rig.wheels){const center=wheel.localPosition.clone().applyMatrix4(rig.root.matrixWorld);
        assert.ok(center.x>=park.x-TRUCK_HALF_LENGTH&&center.x<=park.x+TRUCK_HALF_LENGTH);
        assert.ok(center.z>=park.z-TRUCK_HALF_WIDTH&&center.z<=park.z+TRUCK_HALF_WIDTH);
      }
      assert.equal(rig.root.children.length,1);
    }
    rig.reset();
  }
});

check('roadside hangar has ten outlined bays, three parked cars and seven empty spaces', () => {
  assert.equal(GARAGE_LAYOUT.bays.length, 10);
  assert.equal(new Set(GARAGE_LAYOUT.bays.map(bay => bay.id)).size, 10);
  assert.equal(garage.hangar.userData.parkingBayCount, 10);
  assert.equal(garage.group.userData.parkingBayCount, 10);
  assert.ok(GARAGE_LAYOUT.detached && !garage.hangar.userData.closed);
  assert.deepEqual(GARAGE_LAYOUT.bounds, { minX: -57, maxX: 31, minZ: 26, maxZ: 90 });
  assert.equal(garage.bounds, GARAGE_LAYOUT.bounds);
  assert.deepEqual(GARAGE_LAYOUT.center, { x: -13, z: 58 });
  assert.equal(GARAGE_LAYOUT.entranceHalfWidth, 8);
  const shell = garage.hangar.children[0], matrix = new THREE.Matrix4(), center = new THREE.Vector3();
  assert.deepEqual(shell.userData.parkingBayIds, GARAGE_LAYOUT.bays.map(bay => bay.id));
  for (const [index, bay] of GARAGE_LAYOUT.bays.entries()) {
    near(bay.x,24);
    near(bay.z,30+index*4.4);
    near(bay.heading,Math.PI/2);
    const prefix = `Parking bay ${bay.id} `;
    const edges = shell.userData.partNames.map((name, i) => ({ name, i })).filter(part => part.name.startsWith(prefix));
    assert.equal(edges.length, 4, `${bay.id}: every bay is a complete painted rectangle`);
    const positions = {};
    for (const edge of edges) {
      shell.getMatrixAt(edge.i, matrix); center.setFromMatrixPosition(matrix);
      positions[edge.name.slice(prefix.length)] = center.clone();
      near(center.y, groundHeight(bay.x, bay.z) + 0.009);
    }
    near(positions['left edge'].x, bay.x - bay.halfWidth);
    near(positions['right edge'].x, bay.x + bay.halfWidth);
    near(positions['front edge'].z, bay.z - bay.halfLength);
    near(positions['rear edge'].z, bay.z + bay.halfLength);
    assert.ok(bay.x - bay.halfWidth > GARAGE_LAYOUT.minX && bay.x + bay.halfWidth < GARAGE_LAYOUT.maxX);
    assert.ok(bay.z - bay.halfLength > GARAGE_LAYOUT.frontZ && bay.z + bay.halfLength < GARAGE_LAYOUT.rearZ);
  }
  assert.deepEqual(garage.vehicles.map(car => car.id), ['pickup', 'rover', 'van']);
  assert.deepEqual(garage.vehicles.map(car => car.parkingId), ['parking-03','parking-05','parking-07']);
  assert.deepEqual(garage.vehicles.map(car => [car.park.x, car.park.z, car.park.heading]), [2,4,6].map(i=>[24,30+i*4.4,Math.PI/2]));
  const occupied = new Set(garage.vehicles.map(car => car.parkingId));
  assert.equal(GARAGE_LAYOUT.bays.filter(bay => !occupied.has(bay.id)).length, 7);
  assert.deepEqual(GARAGE_LAYOUT.spawn, { x: 0, z: 60 });
  assert.ok(Math.min(...garage.vehicles.map(car => Math.hypot(car.park.x - garage.spawn.x, car.park.z - garage.spawn.z)))>20);
  near(GARAGE_LAYOUT.frontZ - 23, 3);
  for (const car of garage.vehicles) {
    const bounds = new THREE.Box3().setFromPoints(car.rig.wheels.map(w=>w.localPosition.clone().applyMatrix4(car.root.matrixWorld)));
    assert.ok(bounds.min.z > GARAGE_LAYOUT.frontZ, 'Pending wheel contacts stay clear of the doorway');
    assert.ok(bounds.min.x >= car.park.x - car.park.halfWidth && bounds.max.x <= car.park.x + car.park.halfWidth);
    assert.ok(bounds.min.z >= car.park.z - car.park.halfLength && bounds.max.z <= car.park.z + car.park.halfLength);
  }
});

check('hangar has a complete full-area roof, flush floor and genuinely open central doorway and finite walls', () => {
  const shell = garage.hangar.children[0], box = new THREE.Box3().setFromBufferAttribute(shell.geometry.attributes.position);
  const matrix = new THREE.Matrix4();
  const boxes = shell.userData.partNames.map((name, i) => { shell.getMatrixAt(i, matrix); return { name, bounds: box.clone().applyMatrix4(matrix) }; });
  const floor = boxes.find(part => part.name === 'Garage floor').bounds;
  const roof = boxes.find(part => part.name === 'Garage roof').bounds;
  near(floor.max.y, groundHeight(0, GARAGE_LAYOUT.center.z));
  for (const surface of [floor, roof]) {
    near(surface.min.x, -58); near(surface.max.x, 32);
    near(surface.min.z, 25); near(surface.max.z, 91);
    near((surface.max.x - surface.min.x) * (surface.max.z - surface.min.z), 90 * 66);
  }
  near(roof.min.y, GARAGE_LAYOUT.roofHeight);
  assert.equal(boxes.filter(part => part.name === 'Garage roof').length, 1);
  assert.equal(garage.walls.length, 5);
  for (const wall of garage.walls) {
    const solid = boxes.find(part => part.name === wall.name).bounds;
    near(solid.min.x, wall.minX); near(solid.max.x, wall.maxX);
    near(solid.min.z, wall.minZ); near(solid.max.z, wall.maxZ);
    assert.ok(solid.min.y <= floor.max.y && solid.max.y >= roof.min.y - 1e-5, `${wall.name}: floor-to-ceiling closure`);
  }
  // Sample every boundary and every heading using a walking-sized capsule.
  // Even the apparent front door remains a physically closed wall.
  const pedestrian = { halfWidth: 0.6, halfLength: 0.6 };
  for (let x = -57; x <= 31; x += 0.5) {
    for (const z of [26, 90]) for (let h = 0; h < Math.PI * 2; h += Math.PI / 8)
      if(z!==26||Math.abs(x)>8)assert.ok(garage.getContact(x,z,h,pedestrian),`Wall gap at ${x},${z}`);
  }
  for (let z = 26; z <= 90; z += 0.5) {
    for (const x of [-57, 31]) for (let h = 0; h < Math.PI * 2; h += Math.PI / 8)
      assert.ok(garage.getContact(x, z, h, pedestrian), `Open side wall at ${x}, ${z}, ${h}`);
  }
  for (let x = -27; x <= 27; x += 3) for (let z = 31; z <= 85; z += 3)
    assert.ok(!garage.getContact(x, z, 0), `Interior wall obstruction at ${x}, ${z}`);
  assert.ok(garage.getContact(30, 58, 0)?.normalX < 0);
  assert.ok(garage.getContact(-56, 58, 0)?.normalX > 0);
  assert.ok(garage.getContact(0, 88, 0)?.normalZ < 0);
  assert.ok(!garage.getContact(0,26,0,pedestrian),'Doorway must really be open');
  assert.ok(!garage.getContact(garage.spawn.x, garage.spawn.z, 0, pedestrian));
  assert.ok(!garage.getContact(0, 23, 0), 'Detached hangar does not block the finite road');
  assert.ok(!garage.getContact(31, -50, 0), 'Hangar walls never continue down the road');
  assert.ok(!garage.getContact(NaN, 58, 0));
});

check('all eleven fuel stations fit entirely in driveable circles on their intended branches', () => {
  assert.equal(garage.stations.length, 11);
  assert.equal(FUEL_STATION_SPECS.length, 11);
  for (const station of garage.stations) {
    near(station.x, branchCenter(station.branch, station.distance));
    assert.equal(station.biome, biomeAt(station.x, station.distance).id);
    assert.ok(station.nonBlocking && station.group.userData.nonBlocking);
    assert.equal(station.radius, 4.4);
    const delta = 0.001;
    const derivative = (branchCenter(station.branch, station.distance + delta) - branchCenter(station.branch, station.distance - delta)) / (2 * delta);
    assert.ok(truckInRoad(station.x, station.z, -Math.atan(derivative)), station.id);
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 36) {
      const x = station.x + Math.cos(angle) * 4.85, z = station.z + Math.sin(angle) * 4.85;
      assert.ok(roadIntervals(-z).some(interval => x > interval.min && x < interval.max), station.id);
    }
  }
});

check('all eleven fuel canisters have red bodies and deep-red emission while circles stay green', () => {
  assert.deepEqual(FUEL_STATION_SPECS.map(({ id, branch, distance }) => [id, branch, distance]), [
    ['city-start', 'main', 5],
    ['forest-entry', 'left', 180], ['desert-entry', 'right', 180],
    ['forest-return', 'left', 290], ['desert-return', 'right', 290],
    ['middle-link', 'main', 340],
    ['snow-entry', 'left', 435], ['volcanic-entry', 'right', 435],
    ['snow-return', 'left', 535], ['volcanic-return', 'right', 535],
    ['final-link', 'main', 605],
  ]);
  const color = new THREE.Color();
  for (const station of garage.stations) {
    const mesh = station.canister.children[0];
    for (const name of ['Fuel canister body', 'Fuel canister spout']) {
      const index = mesh.userData.partNames.indexOf(name);
      assert.ok(index >= 0); mesh.getColorAt(index, color);
      assert.equal(color.getHex(), 0xe83b32, station.id);
      assert.ok(color.r > color.g * 5 && color.r > color.b * 5, `${station.id}: red channel dominates`);
    }
    assert.equal(mesh.material.emissive.getHex(), 0x720d09);
    assert.ok(mesh.material.emissive.r > mesh.material.emissive.g * 5);
    assert.equal(station.circle.material.color.getHex(), 0x6dffd1);
    assert.equal(station.glow.material.color.getHex(), 0x54ffc9);
    assert.ok(station.circle.material.color.g > station.circle.material.color.r);
  }
});

check('fuel rings follow road height exactly, including ramps and snow descent', () => {
  for (const station of garage.stations) {
    for (const mesh of station.group.children.filter(child => child.isMesh)) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) near(positions.getY(i), groundHeight(station.x + positions.getX(i), station.z + positions.getZ(i)) + mesh.userData.groundLift, 2e-6);
      assert.ok(mesh.userData.nonBlocking);
    }
  }
});

check('each forward and reverse route can reach the next fuel within 220 m', () => {
  let longest = 0;
  for (const first of ['left', 'right']) for (const second of ['left', 'right']) {
    const sequence = garage.stations.filter(station => station.branch === 'main' || station.branch === (station.distance < 340 ? first : second));
    const routeBranch = distance => distance <= 74 || distance >= 590 || (distance >= 330 && distance <= 350) ? 'main' : distance < 340 ? first : second;
    const xs = distance => branchCenter(routeBranch(distance), distance);
    for (let i = 1; i < sequence.length; i++) {
      const start = sequence[i - 1].distance, end = sequence[i].distance;
      let length = 0, previous = [xs(start), groundHeight(xs(start), -start), start];
      for (let d = start + 0.5; d <= end + 1e-6; d += 0.5) {
        const next = [xs(d), groundHeight(xs(d), -d), d];
        length += Math.hypot(...next.map((value, axis) => value - previous[axis])); previous = next;
        assert.ok(truckInRoad(xs(d), -d, -Math.atan((xs(d + 0.001) - xs(d - 0.001)) / 0.002)));
      }
      assert.ok(length < 220, `${first}/${second}: ${length}`); longest = Math.max(length, longest);
    }
    assert.equal(sequence.length, 7);
  }
  console.log(`  Longest road-following fuel gap: ${longest.toFixed(2)} m (same paths in reverse)`);
});

check('all environment solids reuse the exact city checker texture with bounded geometry', () => {
  let instances = 0, drawCalls = 0;
  garage.group.traverse(mesh => {
    if (!mesh.isMesh) return;
    drawCalls++;
    if (mesh.isInstancedMesh) {
      instances += mesh.count;
      assert.equal(mesh.material.map, originalMap);
      assert.ok(mesh.material.userData.environmentPattern);
      assert.ok(!mesh.userData.partNames.some(name => /stud/i.test(name)));
    }
    for (const value of mesh.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
    if (mesh.instanceMatrix) for (const value of mesh.instanceMatrix.array) assert.ok(Number.isFinite(value));
  });
  assert.ok(drawCalls <= 55, drawCalls);
  assert.ok(instances <= 683, instances);
  console.log(`  Added draw batches: ${drawCalls}; instances: ${instances}`);
});

check('animation moves canisters above vehicle height, without deforming circles', () => {
  const circles = garage.stations.map(station => station.circle.geometry.attributes.position.array.slice());
  garage.animate(2.7);
  garage.stations.forEach((station, i) => {
    assert.ok(station.canister.position.y > station.y + 4.9);
    assert.ok(Number.isFinite(station.canister.rotation.y));
    assert.deepEqual(station.circle.geometry.attributes.position.array, circles[i]);
    const parts = station.canister.children[0].userData.partNames;
    assert.ok(parts.includes('Fuel canister handle top'));
    assert.ok(parts.includes('Fuel canister spout'));
  });
  garage.animate(NaN);
  garage.stations.forEach(station => assert.ok(Number.isFinite(station.canister.rotation.y)));
});

check('construction and disposal preserve city resources without requiring a city vehicle', () => {
  let sharedTextureDisposals=0,originalGeometryDisposals=0,originalMaterialDisposals=0;
  originalMap.addEventListener('dispose',()=>sharedTextureDisposals++);
  const ownGeometries=new Set(),ownMaterials=new Set();
  garage.group.traverse(mesh=>{if(mesh.geometry)ownGeometries.add(mesh.geometry);if(mesh.material)ownMaterials.add(mesh.material);});
  const counts={geometry:0,material:0};
  ownGeometries.forEach(geometry=>geometry.addEventListener('dispose',()=>counts.geometry++));
  ownMaterials.forEach(material=>material.addEventListener('dispose',()=>counts.material++));
  new Set(originalSnapshots.map(item=>item.geometry)).forEach(geometry=>geometry.addEventListener('dispose',()=>originalGeometryDisposals++));
  new Set(originalSnapshots.map(item=>item.material)).forEach(material=>material.addEventListener('dispose',()=>originalMaterialDisposals++));
  garage.dispose();garage.dispose();
  assert.equal(counts.geometry,ownGeometries.size);assert.equal(counts.material,ownMaterials.size);
  assert.equal(sharedTextureDisposals,0);assert.equal(originalGeometryDisposals,0);assert.equal(originalMaterialDisposals,0);
  for(const item of originalSnapshots){
    assert.deepEqual(item.mesh.instanceMatrix?.array,item.matrices);assert.deepEqual(item.mesh.instanceColor?.array,item.colors);
    assert.deepEqual(item.mesh.geometry.attributes.position.array,item.positions);assert.equal(item.mesh.material,item.material);assert.equal(item.mesh.geometry,item.geometry);
  }
});
city.dispose();

console.log(`\nGarage scene: ${count-failures.length}/${count} checks passed. Browser/WebGL visual QA was not run.`);
process.exitCode=failures.length?1:0;
