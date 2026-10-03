#!/usr/bin/env node
// Real Three.js environment, mesh-free vehicle roots, gameplay and storage. No renderer,
// network, browser, downloaded models or simulated performance claims.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { buildCity } from '../dist/scene.js';
import { createGarageScene, GARAGE_LAYOUT, CHARACTER_STANDS, CLASSROOM_DESKS, CLASSROOM_ENTRIES } from '../dist/garage-scene.js';
import { ECONOMY_CONFIG, VEHICLE_CONFIG, BIOME_SEQUENCE, vehicleConfig } from '../dist/economy-config.js';
import { freshCareer, sanitizeCareer, createCareerStore } from '../dist/career-save.js';
import { createGameplay, GAMEPLAY } from '../dist/gameplay.js';
import { createDrivingModel } from '../dist/driving-model.js';
import { fitTruckToGround } from '../dist/city-driving.js';

let checks = 0; const failures = [];
const check = (name, test) => { checks++; try { test(); console.log(`PASS ${name}`); } catch(error) { failures.push({name,error:error.message}); console.error(`FAIL ${name}: ${error.message}`); } };
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a-b) <= tolerance, `${a} != ${b}`);
const originalIds = ['pickup','rover','van'];
const ids = ['pickup','citycourier','rover','foresthauler','van','desertscout','snowgrip','snowrunner','lavacrawler','ashhauler'];
const bayOrder = ids;
// Stable storage order is retained while physical bay order defines the visible ladder.
const meshOrder = [...originalIds,'citycourier','foresthauler','desertscout','snowgrip','snowrunner','lavacrawler','ashhauler'];
const oldCareer = {version:1,money:93871,ownedVehicleIds:originalIds,characterId:'jandel',completedRuns:17};

check('ten immutable vehicles form five specialty pairs in the strict purchased-performance ladder', () => {
  assert.deepEqual(VEHICLE_CONFIG.map(v=>v.id), ids);
  assert.equal(new Set(ids).size, 10);
  assert.deepEqual(VEHICLE_CONFIG.map(({price,capacity,range,maxSpeed,acceleration})=>[price,capacity,range,maxSpeed,acceleration]),
    [[0,100,520,11,11/1.8],[900,125,700,12.5,6.9],[1200,140,1000,14.2,7.8],[3200,190,1420,16.2,8.8],
     [3600,180,1800,18.4,10],[4800,150,2250,21,11.3],[5200,145,2800,23.9,12.8],[5600,185,3500,27.2,14.5],
     [6200,165,4400,31,16.4],[7200,210,5500,35.4,18.6]]);
  assert.ok(Object.isFrozen(VEHICLE_CONFIG));
  for (const [index,spec] of VEHICLE_CONFIG.entries()) {
    assert.ok(Object.isFrozen(spec));
    assert.ok(spec.name && Number.isSafeInteger(spec.price) && spec.price >= 0);
    assert.equal(spec.price===0, spec.id==='pickup');
    assert.equal(spec.consumption, spec.capacity/spec.range);
    assert.equal(spec.progressionOrder,index+1);
    assert.equal(spec.pairRole,index%2?'advanced':'standard');
    assert.equal(spec.handling,.5*1.08**index);assert.equal(spec.grip,.5*1.08**index);
    assert.ok(spec.range>0 && spec.capacity>0 && spec.maxSpeed>0);
    if(index>0)for(const key of ['price','range','maxSpeed','acceleration','handling','grip'])
      assert.ok(spec[key]>VEHICLE_CONFIG[index-1][key],`${spec.id}: ${key} must improve over the previous tier`);
  }
  for (const [index,biome] of BIOME_SEQUENCE.entries()) {
    const pair = VEHICLE_CONFIG.filter(v=>v.specialty===biome.id);
    assert.deepEqual(pair.map(v=>v.id),ids.slice(index*2,index*2+2),biome.id);
    assert.deepEqual(pair.map(v=>v.pairRole),['standard','advanced']);
    assert.ok(pair[1].range>pair[0].range);
  }
  assert.equal(vehicleConfig('unknown'), VEHICLE_CONFIG[0]);
});

check('version-1 career migrates to schema 2 with old money, selected skin and every original purchase', () => {
  assert.equal(ECONOMY_CONFIG.saveVersion,2);
  assert.equal(ECONOMY_CONFIG.saveKey,'urban-route-career-v1');
  const migrated={...freshCareer('jandel'),money:oldCareer.money,ownedVehicleIds:originalIds,completedRuns:oldCareer.completedRuns};
  assert.deepEqual(sanitizeCareer(oldCareer),migrated);
  assert.deepEqual(freshCareer().ownedVehicleIds,['pickup']);
  assert.equal(freshCareer().money,0);
  const values=new Map([[ECONOMY_CONFIG.saveKey,JSON.stringify(oldCareer)]]);
  const store=createCareerStore({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}});
  assert.deepEqual(store.load(),migrated);
  const fullCareer={...migrated,ownedVehicleIds:[...ids]};
  assert.equal(store.save(fullCareer),true);
  assert.deepEqual(store.load(),fullCareer);
  const noisy={...fullCareer,ownedVehicleIds:['unknown','__proto__',...ids,...ids]};
  assert.deepEqual(sanitizeCareer(noisy),fullCareer);
  assert.deepEqual(JSON.parse(values.get(ECONOMY_CONFIG.saveKey)),fullCareer);
});

const city=buildCity(THREE,{seed:42});
const originalResources=[];city.group.traverse(mesh=>{if(mesh.isMesh)originalResources.push({mesh,geometry:mesh.geometry,material:mesh.material,
  positions:mesh.geometry.attributes.position.array.slice(),matrices:mesh.instanceMatrix?.array.slice(),colors:mesh.instanceColor?.array.slice()});});
const garage=createGarageScene(THREE,city);
const parameters={vehicles:garage.vehicles,stations:garage.stations,deliveries:garage.deliveries,
  desks:garage.desks,stands:garage.stands,solids:garage.classroomSolids};

check('all eleven retained vehicles have independent mesh-free roots while GLBs are pending', () => {
  assert.equal(garage.vehicles.length,11);
  assert.equal(garage.group.userData.vehicleCount,11);
  assert.deepEqual(garage.vehicles.map(v=>v.id),[...meshOrder,'bmwreward']);
  assert.deepEqual([...garage.vehicles].filter(v=>!v.rewardDisplay).sort((a,b)=>a.park.z-b.park.z).map(v=>v.id),bayOrder);
  assert.deepEqual(new Set(garage.vehicles.filter(v=>!v.rewardDisplay).map(v=>v.parkingId)),new Set(GARAGE_LAYOUT.bays.map(v=>v.id)));
  const roots=new Set(),poses=new Set(),wheelRecords=new Set();
  for (const car of garage.vehicles) {
    assert.equal(car.config,vehicleConfig(car.id));assert.equal(car.name,car.config.name);
    assert.equal(car.root.userData.vehicleId,car.id);assert.equal(car.root.userData.specialty,car.config.specialty);assert.equal(car.root.userData.pairRole,car.config.pairRole);
    assert.equal(car.rig.root,car.root);assert.equal(car.rig.wheels.length,4);assert.equal(car.rig.wheelRadius,.68);assert.equal(car.rig.wheelbase,3.36);
    assert.ok(!roots.has(car.root));roots.add(car.root);assert.ok(!poses.has(car.rig.pose));poses.add(car.rig.pose);
    assert.equal(car.park.x,24);near(car.park.heading,Math.PI/2);assert.ok(!garage.getContact(car.park.x,car.park.z,car.park.heading));
    assert.equal(car.priceAnchor.x,car.park.x);assert.equal(car.priceAnchor.z,car.park.z);assert.ok(car.priceAnchor.y>5);
    if(!car.rewardDisplay)assert.ok(Math.hypot(car.approach.x-car.park.x,car.approach.z-car.park.z)<GAMEPLAY.entryRadius);
    assert.equal(car.cargo.visible,false);assert.ok(car.cargo.isGroup);assert.deepEqual(car.root.children,[car.cargo]);assert.equal(car.cargo.children.length,0);
    car.root.traverse(object=>assert.ok(!object.isMesh,`${car.id}: pending vehicle must not allocate fallback geometry`));
    for(const wheel of car.rig.wheels){assert.ok(!wheelRecords.has(wheel));wheelRecords.add(wheel);assert.equal(wheel.parts,undefined);assert.equal(wheel.mesh,undefined);assert.equal(wheel.radius,.68);}
  }
  assert.equal(roots.size,11);assert.equal(poses.size,11);assert.equal(wheelRecords.size,44);
  assert.equal(garage.vehicles.filter(v=>v.rewardDisplay).length,1);assert.equal(garage.vehicles.find(v=>v.rewardDisplay).id,'bmwreward');
});

check('pending catalog contact footprints stay inside their bays without claiming imported mesh bounds', () => {
  const boxes=[];
  for(const car of garage.vehicles.filter(v=>!v.rewardDisplay)){
    car.root.updateWorldMatrix(true,true);const b=new THREE.Box3();
    for(const wheel of car.rig.wheels){const center=wheel.localPosition.clone().applyMatrix4(car.root.matrixWorld),radius=new THREE.Vector3(wheel.radius,wheel.radius,wheel.radius);b.expandByPoint(center.clone().sub(radius));b.expandByPoint(center.clone().add(radius));}
    assert.ok(b.min.x>=car.park.x-car.park.halfWidth-1e-5&&b.max.x<=car.park.x+car.park.halfWidth+1e-5,car.id);
    assert.ok(b.min.z>=car.park.z-car.park.halfLength-1e-5&&b.max.z<=car.park.z+car.park.halfLength+1e-5,car.id);
    assert.ok(b.min.z>GARAGE_LAYOUT.frontZ&&b.max.z<GARAGE_LAYOUT.rearZ);assert.ok(b.max.y<GARAGE_LAYOUT.roofHeight);
    for(const other of boxes)assert.equal(b.intersectsBox(other.box),false,`${car.id} overlaps ${other.id}`);
    for(const desk of CLASSROOM_DESKS)assert.ok(b.min.x>desk.bounds.maxX+20,'Classroom separation');
    for(const stand of CHARACTER_STANDS)assert.ok(b.max.z<stand.z-3,'Rear character approach separation');
    boxes.push({id:car.id,box:b});
  }
  const byZ=boxes.sort((a,b)=>a.box.min.z-b.box.min.z),gap=Math.min(...byZ.slice(1).map((b,i)=>b.box.min.z-byZ[i].box.max.z));
  assert.ok(gap>0,'Pending contact footprints must not touch');console.log(`  Smallest contact-footprint gap: ${gap.toFixed(3)} m`);
});

check('walking and jumping routes stay clear for both collision sizes, all ten cars and classroom', () => {
  let samples=0;
  const route=(g,a,b)=>{
    const steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.2);
    for(let i=0;i<=steps;i++){
      const t=steps?i/steps:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      assert.ok(g.canWalk(x,z),`${g.state.characterId}/${g.state.jump.airborne}: blocked at ${x},${z}`);samples++;
    }
  };
  for(const characterId of ['bacon','jandel'])for(const airborne of [false,true]){
    const g=createGameplay({...parameters,characterId});g.state.jump.airborne=airborne;
    for(const car of garage.vehicles){
      route(g,GARAGE_LAYOUT.spawn,{x:0,z:car.park.z});
      route(g,{x:0,z:car.park.z},car.approach);
    }
    route(g,GARAGE_LAYOUT.spawn,{x:0,z:70});
    for(const entry of CLASSROOM_ENTRIES){route(g,{x:0,z:70},{x:entry.x,z:70});route(g,{x:entry.x,z:70},entry);}
    for(const z of [76,79,81.5])route(g,{x:-44,z},{x:28,z});
    route(g,{x:0,z:29},{x:0,z:79});
  }
  assert.ok(samples>9000);
  console.log(`  ${samples} on-foot collision samples`);
});

check('nine locked cars require an explicit buy, reject repeat charges and preserve all old career fields', () => {
  const money=VEHICLE_CONFIG.reduce((sum,v)=>sum+v.price,0)+137;
  const g=createGameplay({...parameters,career:{...oldCareer,money,ownedVehicleIds:['pickup']}});
  let spent=0;
  for(const car of garage.vehicles.filter(v=>v.id!=='pickup')){
    Object.assign(g.state.player,car.approach);g.state.cooldown=0;g.walk(0,{});
    assert.equal(g.state.purchaseCandidateId,car.id);
    assert.equal(g.isOwned(car.id),false);
    assert.equal(g.enter(car.id),false);
    assert.equal(g.state.money,money-spent,'Proximity cannot charge currency');
    assert.equal(g.buy(car.id),true);spent+=car.config.price;
    assert.equal(g.state.mode,'walking','Buying must not board');
    assert.equal(g.state.money,money-spent);
    assert.equal(g.buy(car.id),false);
    assert.equal(g.state.money,money-spent,'Repeat click cannot charge twice');
  }
  assert.equal(g.state.money,137);
  assert.equal(g.state.characterId,oldCareer.characterId);
  assert.equal(g.state.completedRuns,oldCareer.completedRuns);
  assert.deepEqual(g.snapshot().ownedVehicleIds,ids);
  const poor=createGameplay(parameters), car=garage.vehicles.find(v=>v.id==='ashhauler');
  Object.assign(poor.state.player,car.approach);assert.equal(poor.buy(car.id),false);
  assert.equal(poor.state.money,0);assert.equal(poor.isOwned(car.id),false);
});

check('every vehicle can start a loaded run and all ten fuel tanks reset together', () => {
  const g=createGameplay({...parameters,career:{...oldCareer,ownedVehicleIds:ids}});
  for(const car of garage.vehicles){
    g.state.cooldown=0;assert.equal(g.enter(car.id),true);
    assert.equal(g.state.run.vehicleId,car.id);assert.equal(g.state.run.loaded,true);
    g.drive(1,0,0);near(g.state.fuels[car.id],car.config.capacity-car.config.consumption);
    g.returnToGarage('catalog-test');
    assert.equal(g.state.mode,'walking');assert.equal(g.state.selectedId,null);assert.equal(g.state.run,null);
    assert.deepEqual(g.state.player,GAMEPLAY.spawn);
    for(const spec of VEHICLE_CONFIG)assert.equal(g.state.fuels[spec.id],spec.capacity);
    assert.equal(g.state.money,oldCareer.money);assert.equal(g.state.completedRuns,oldCareer.completedRuns);
  }
});

check('all eleven root/contact poses update independently and model reset retains parking coordinates', () => {
  const snapshots=new Map(garage.vehicles.map(v=>[v.id,{position:v.root.position.toArray(),quaternion:v.root.quaternion.toArray(),scale:v.root.scale.toArray(),pose:{...v.rig.pose},wheels:v.rig.wheels.map(w=>({steerAngle:w.steerAngle,wheelSpin:w.wheelSpin}))}]));
  const assertRest=car=>{const initial=snapshots.get(car.id);assert.deepEqual(car.root.position.toArray(),initial.position);assert.ok(car.root.quaternion.angleTo(new THREE.Quaternion().fromArray(initial.quaternion))<1e-7);assert.deepEqual(car.root.scale.toArray(),initial.scale);assert.deepEqual(car.rig.pose,initial.pose);assert.deepEqual(car.rig.wheels.map(w=>({steerAngle:w.steerAngle,wheelSpin:w.wheelSpin})),initial.wheels);};
  for(const car of garage.vehicles){
    const model=createDrivingModel({...car.park,maxSpeed:car.config.maxSpeed});
    car.rig.update({position:new THREE.Vector3(0,0,6),quaternion:new THREE.Quaternion(),steerAngle:.42,wheelSpin:1.3,bodyPitch:.07,bodyRoll:-.05,bodyBob:.08});
    for(const wheel of car.rig.wheels){near(wheel.steerAngle,wheel.front?.42:0);near(wheel.wheelSpin,1.3);}
    assert.deepEqual(car.rig.pose,{steerAngle:.42,wheelSpin:1.3,bodyPitch:.07,bodyRoll:-.05,bodyBob:.08});
    garage.vehicles.filter(v=>v!==car).forEach(assertRest);
    Object.assign(model.state,{x:200,z:-800,heading:.3});model.reset();
    assert.equal(model.state.x,car.park.x);assert.equal(model.state.z,car.park.z);assert.equal(model.state.heading,car.park.heading);
    car.rig.reset();assertRest(car);
    car.rig.update(fitTruckToGround(THREE,model.state.x,model.state.z,model.state.heading));
    near(car.root.position.x,car.park.x);near(car.root.position.z,car.park.z);assert.ok(car.root.quaternion.angleTo(fitTruckToGround(THREE,car.park.x,car.park.z,car.park.heading).quaternion)<1e-6);
    car.cargo.visible=true;assert.ok(garage.vehicles.filter(v=>v!==car).every(v=>!v.cargo.visible));car.cargo.visible=false;car.rig.reset();
  }
});

let metrics;
check('pending vehicles allocate zero render resources and leave city geometry intact', () => {
  const geometry=new Set(),vehicleGeometry=new Set(),material=new Set();let drawCalls=0,triangles=0,instances=0;
  garage.group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    geometry.add(mesh.geometry);material.add(mesh.material);drawCalls++;
    const copies=mesh.isInstancedMesh?mesh.count:1;
    triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*copies;
    if(mesh.isInstancedMesh)instances+=mesh.count;
  });
  for(const car of garage.vehicles)car.root.traverse(mesh=>{if(mesh.isMesh)vehicleGeometry.add(mesh.geometry);});
  assert.equal(vehicleGeometry.size,0,'GLB-pending roots and cargo anchors own no geometry');assert.ok(geometry.size>0&&material.size>0&&drawCalls>0);
  assert.equal(city.group.getObjectByName('Orange delivery truck'),undefined);assert.ok(!city.features.some(f=>f.type==='truck'));
  for(const before of originalResources){
    assert.equal(before.mesh.geometry,before.geometry);assert.equal(before.mesh.material,before.material);assert.deepEqual(before.mesh.geometry.attributes.position.array,before.positions);
    assert.deepEqual(before.mesh.instanceMatrix?.array,before.matrices);assert.deepEqual(before.mesh.instanceColor?.array,before.colors);
  }
  const source=fs.readFileSync(new URL('../dist/garage-scene.js',import.meta.url),'utf8');assert.equal(/GLTFLoader|TextureLoader|fetch\s*\(/.test(source),false);
  metrics={vehicles:garage.vehicles.length,occupiedBays:GARAGE_LAYOUT.bays.length,rewardDisplays:1,pendingVehicleGeometries:vehicleGeometry.size,environmentGeometries:geometry.size,materials:material.size,drawCalls,instances,triangles};
});

check('disposing mesh-free vehicle roots releases garage resources once and preserves the city', () => {
  const geometry=new Set(),materials=new Set(),counts=new Map(),cityDisposals=[];
  garage.group.traverse(mesh=>{if(mesh.isMesh){geometry.add(mesh.geometry);materials.add(mesh.material);}});
  for(const resource of [...geometry,...materials])resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1));
  for(const resource of new Set(originalResources.flatMap(r=>[r.geometry,r.material])))resource.addEventListener('dispose',()=>cityDisposals.push(resource));
  garage.dispose();garage.dispose();
  for(const resource of [...geometry,...materials])assert.equal(counts.get(resource),1);assert.equal(cityDisposals.length,0);
  for(const car of garage.vehicles){assert.equal(car.rig.disposed,true);assert.deepEqual(car.root.children,[car.cargo]);}
  for(const before of originalResources){assert.deepEqual(before.mesh.geometry.attributes.position.array,before.positions);assert.deepEqual(before.mesh.instanceMatrix?.array,before.matrices);assert.deepEqual(before.mesh.instanceColor?.array,before.colors);}
});
city.dispose();
console.log(`Vehicle catalog: ${checks-failures.length}/${checks} checks passed; ${JSON.stringify(metrics)}. Node/Three only.`);
process.exitCode=failures.length?1:0;
