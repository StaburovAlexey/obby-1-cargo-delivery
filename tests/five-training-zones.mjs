#!/usr/bin/env node


import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { createGarageScene, CLASSROOM_DESKS, CLASSROOM_ENTRIES, CLASSROOM_ENTRY, CHARACTER_STANDS, GARAGE_LAYOUT } from '../dist/garage-scene.js';
import { CHARACTER_CATALOG } from '../dist/character-catalog.js';
import { createGameplay } from '../dist/gameplay.js';

let checks=0;
const check=(name,run)=>{run();checks++;console.log(`PASS ${name}`);};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const city={group:new THREE.Group()};
const garage=createGarageScene(THREE,city);
const shell=garage.hangar.getObjectByName('Garage shell and flush bay markings');
const ids=['school-1','school-2','school-3','school-4','school-5'];

function shellParts(predicate){
  const rows=[],matrix=new THREE.Matrix4(),color=new THREE.Color();
  shell.userData.partNames.forEach((name,index)=>{
    if(!predicate(name,index))return;
    shell.getMatrixAt(index,matrix);shell.getColorAt(index,color);
    rows.push({name,matrix:matrix.toArray(),color:color.toArray()});
  });
  return rows;
}
function groupSnapshot(group){
  group.updateMatrixWorld(true);
  const out=[];
  group.traverse(object=>out.push({
    name:object.name,type:object.type,position:object.position.toArray(),rotation:object.rotation.toArray(),scale:object.scale.toArray(),
    geometry:object.geometry?{
      position:Array.from(object.geometry.attributes.position.array),normal:Array.from(object.geometry.attributes.normal?.array||[]),
      uv:Array.from(object.geometry.attributes.uv?.array||[]),index:Array.from(object.geometry.index?.array||[]),
    }:null,
    matrices:object.instanceMatrix?Array.from(object.instanceMatrix.array):null,
    colors:object.instanceColor?Array.from(object.instanceColor.array):null,partNames:object.userData.partNames||null,
  }));
  return out;
}

check('five immutable school entries have unique IDs, colors, anchors and safe shared exit',()=>{
  assert.deepEqual(CLASSROOM_ENTRIES.map(entry=>entry.id),ids);
  assert.deepEqual(CLASSROOM_ENTRIES.map(entry=>entry.x),[-51,-46,-41,-36,-31]);
  assert.equal(new Set(CLASSROOM_ENTRIES.map(entry=>entry.color)).size,5);
  assert.ok(Object.isFrozen(CLASSROOM_ENTRIES));
  for(const entry of CLASSROOM_ENTRIES){
    assert.ok(Object.isFrozen(entry)&&Object.isFrozen(entry.exit)&&Object.isFrozen(entry.labelAnchor));
    assert.equal(entry.z,64);assert.equal(entry.radius,1.6);assert.equal(entry.rearmRadius,2.1);
    assert.deepEqual(entry.exit,{x:-22,z:65.5,heading:0});
    assert.deepEqual(entry.labelAnchor,{x:entry.x,y:3.6,z:entry.z});
    assert.ok(entry.labelAnchor.y<GARAGE_LAYOUT.roofHeight);
    for(const other of CLASSROOM_ENTRIES){
      if(entry===other)continue;
      const distance=Math.hypot(entry.x-other.x,entry.z-other.z);
      assert.ok(distance>entry.radius+other.radius,'trigger circles are disjoint');
      assert.ok(distance>entry.rearmRadius+other.rearmRadius,'rearm regions are disjoint');
      assert.ok(distance>2*2.05,'two largest jumping footprints fit at adjacent centers');
    }
  }
  assert.equal(CLASSROOM_ENTRY,CLASSROOM_ENTRIES[0]);
  assert.equal(garage.classroomEntries,CLASSROOM_ENTRIES);
  assert.equal(garage.classroomEntry,CLASSROOM_ENTRY);
});

check('all twenty stable desk IDs share one pool with original desk and seat poses',()=>{
  assert.equal(CLASSROOM_DESKS.length,20);
  assert.equal(new Set(CLASSROOM_DESKS.map(desk=>desk.id)).size,20);
  CLASSROOM_DESKS.forEach((desk,index)=>{
    const column=index%5,row=Math.floor(index/5),x=-51+column*5,z=38+row*6;
    assert.deepEqual(desk,{
      id:`desk-${String(index+1).padStart(2,'0')}`,row:row+1,column:column+1,
      x,z,width:2.4,depth:2,seat:{x,z:z+1.5,heading:0,height:.50},
      bounds:{minX:x-1.2,maxX:x+1.2,minZ:z-1,maxZ:z+1,minY:0,maxY:1.35},
    });
    assert.ok(Object.isFrozen(desk)&&Object.isFrozen(desk.seat)&&Object.isFrozen(desk.bounds));
  });
  assert.ok(CLASSROOM_DESKS.every(desk=>!Object.hasOwn(desk,'schoolId')),'furniture has no entrance assignment');
});

check('five numbered colored entrances remain without colored lanes or furniture partitions',()=>{
  assert.equal(garage.classMarkers.length,5);
  assert.equal(garage.classMarker,garage.classMarkers[0]);
  assert.equal(new Set(garage.classMarkers.map(marker=>marker.geometry)).size,1,'one shared ring geometry');
  assert.equal(new Set(garage.classMarkers.map(marker=>marker.material)).size,5,'state colors can change independently');
  assert.ok(!shell.userData.partNames.some(name=>name.startsWith('Classroom entry arrow')));
  assert.ok(!shell.userData.partNames.some(name=>/lane (border|end)$/.test(name)),'all fifteen colored lane shapes are removed');
  for(const [index,entry] of CLASSROOM_ENTRIES.entries()){
    const marker=garage.classMarkers[index];
    assert.ok(marker.isMesh&&marker.visible&&marker.userData.nonBlocking);
    assert.equal(marker.userData.schoolId,entry.id);assert.equal(marker.parent,garage.hangar);
    assert.equal(marker.material.color.getHex(),entry.color);
    assert.equal(marker.position.x,entry.x);assert.equal(marker.position.z,entry.z);
    assert.equal(marker.geometry.parameters.outerRadius,entry.radius);
    assert.equal(marker.userData.labelAnchor,entry.labelAnchor);
    const paint=shellParts(name=>name.startsWith(`School ${entry.id} `));
    assert.ok(paint.every(part=>part.name===`School ${entry.id} floor number ${index+1}`),'only entrance number strokes remain');
    assert.ok(paint.some(part=>part.name===`School ${entry.id} floor number ${index+1}`));
    for(const part of paint){
      const matrix=new THREE.Matrix4().fromArray(part.matrix),scale=new THREE.Vector3(),position=new THREE.Vector3(),rotation=new THREE.Quaternion();
      matrix.decompose(position,rotation,scale);
      assert.ok(position.y+scale.y/2<.05,'school markings stay flat');
      new THREE.Color(0xfff4d6).toArray().forEach((value,index)=>near(part.color[index],value));
    }
  }
  assert.equal(garage.classroomSolids.length,40,'paint and markers add no collision solids');
});

check('all seventeen characters reach every entry via a clear rear aisle, including airborne Jandel',()=>{
  let samples=0;
  for(const character of CHARACTER_CATALOG){
    const gameplay=createGameplay({vehicles:garage.vehicles,stations:garage.stations,desks:garage.desks,
      stands:garage.stands,solids:garage.classroomSolids,characterId:character.id});
    for(const airborne of [false,true]){
      gameplay.state.jump.airborne=airborne;
      for(const target of CLASSROOM_ENTRIES){


        const route=[GARAGE_LAYOUT.spawn,{x:0,z:70},{x:target.x,z:70},target];
        for(let segment=1;segment<route.length;segment++){
          const a=route[segment-1],b=route[segment],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.2);
          for(let step=0;step<=steps;step++){
            const x=a.x+(b.x-a.x)*step/steps,z=a.z+(b.z-a.z)*step/steps;
            assert.ok(gameplay.canWalk(x,z),`${character.id} airborne=${airborne}: blocked route to ${target.id} at ${x},${z}`);
            assert.ok(CLASSROOM_ENTRIES.every(other=>other===target||Math.hypot(x-other.x,z-other.z)>other.radius),`${target.id}: crosses another trigger`);
            samples++;
          }
        }
        assert.ok(gameplay.canWalk(target.exit.x,target.exit.z),'shared standing exit remains safe');
        assert.ok(CLASSROOM_ENTRIES.every(other=>Math.hypot(target.exit.x-other.x,target.exit.z-other.z)>other.rearmRadius),'exit does not retrigger');
        for(const radius of [target.radius,target.rearmRadius])for(let angle=0;angle<Math.PI*2;angle+=Math.PI/24){
          assert.ok(gameplay.canWalk(target.x+Math.cos(angle)*radius,target.z+Math.sin(angle)*radius),`${character.id}: unsafe edge of ${target.id}`);
          samples++;
        }
      }
    }
  }
  assert.ok(samples>60000);
  console.log(`  ${samples} collision-safe route/marker samples, grounded and jumping`);
});

check('all 340 calibrated furniture parts and forty collision solids stay unchanged',()=>{
  let inFurniture=false;
  const furniture=shellParts(name=>{
    if(name==='Classroom desk-01 tabletop')inFurniture=true;
    if(name==='PDD classroom board')inFurniture=false;
    return inFurniture;
  });
  assert.equal(furniture.length,340);
  assert.equal(hash(furniture),'f89ade88797c9a749f18f04127d3f5a4010b36ca8811b177b878dcb30ecb1635');
  assert.deepEqual(garage.classroomSolids,CLASSROOM_DESKS.flatMap(desk=>[
    {...desk.bounds,id:desk.id,type:'desk'},
    {id:desk.id,type:'chair',minX:desk.x-.92,maxX:desk.x+.92,minZ:desk.seat.z-.12,maxZ:desk.seat.z+.92,minY:0,maxY:2.05},
  ]));
});

check('spawn, shell, board, stands and ten parked vehicles match Site28; road services expand to eleven pairs',()=>{
  assert.deepEqual(GARAGE_LAYOUT.spawn,{x:0,z:60});
  assert.equal(garage.vehicles.length,10);assert.equal(CHARACTER_STANDS.length,17);
  for(const [index,stand] of CHARACTER_STANDS.entries())assert.deepEqual(stand,{index,x:-41+index*3.5,z:85,heading:0,triggerRadius:1.25,trigger:{x:-41+index*3.5,z:82}});
  for(const [index,bay] of GARAGE_LAYOUT.bays.entries()){
    assert.equal(bay.x,24);near(bay.z,30+index*4.4);assert.equal(bay.heading,Math.PI/2);
  }
  const stands=shellParts(name=>/^Character stand |^Character approach marker/.test(name));
  assert.equal(hash(stands),'f9edc960ca0ad213ebfacd7dd1cbf8796a086bc744b38298d055d7681ba83c0b');
  const preserved=shellParts(name=>!name.startsWith('School ')&&!name.startsWith('Classroom entry arrow')&&!(name.startsWith('Classroom desk')||/^(Desk leg|Chair |Separate classroom floor)/.test(name)));
  assert.equal(hash(preserved),'c92f226afdeb93426b91f930f80020cd70011f409d922d0b77cea6036692be38');
  assert.equal(hash(garage.vehicles.map(vehicle=>({id:vehicle.id,park:vehicle.park,group:groupSnapshot(vehicle.group)}))),'03b9a08fb7bc6c65f7cfdae820de015340035ca293d9d2c5235e0b8bff3beb36');
  assert.equal(garage.stations.length,11);assert.equal(garage.deliveries.length,11);
  for(const stop of [...garage.stations,...garage.deliveries])assert.ok([stop.x,stop.z,stop.distance].every(Number.isFinite));
});

check('five-school scene adds bounded resources and disposes every shared resource exactly once',()=>{
  const geometries=new Set(),materials=new Set(),batches=[];let meshes=0,instances=0;
  garage.group.traverse(object=>{
    if(!object.isMesh)return;
    meshes++;geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);
    if(object.isInstancedMesh){instances+=object.count;batches.push(object);}
  });
  assert.equal(meshes,124,'11 checkpoint pairs plus unchanged five school markers');
  assert.equal(instances,1090,'3 new checkpoint pairs add39 cargo/canister primitives');
  assert.equal(geometries.size,69,'18 added unique checkpoint ring meshes');
  assert.equal(materials.size,22,'baseline18 plus4 independent marker colors');
  const disposal=new Map([...geometries,...materials,...batches].map(resource=>[resource,0]));
  for(const resource of disposal.keys())resource.addEventListener('dispose',()=>disposal.set(resource,disposal.get(resource)+1));
  const originalCityChildren=city.group.children.slice();
  const parent=new THREE.Group();parent.add(garage.group);
  garage.dispose();garage.dispose();garage.animate(10);
  assert.equal(garage.group.parent,null);
  assert.deepEqual(city.group.children,originalCityChildren);
  for(const [resource,count] of disposal)assert.equal(count,1,`${resource.type}: disposal must happen exactly once`);
});

console.log(`Five training entrances: ${checks} checks passed; Node/Three only, no browser.`);
