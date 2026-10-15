#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCity} from '../dist/scene.js';
import {createGarageScene,GARAGE_LAYOUT,CHARACTER_STANDS,CLASSROOM_DESKS,CLASSROOM_ENTRY} from '../dist/garage-scene.js';
import {createGameplay} from '../dist/gameplay.js';
const city=buildCity(THREE,{seed:42}),garage=createGarageScene(THREE,city);
garage.group.updateMatrixWorld(true);
const shell=garage.hangar.children[0],matrix=new THREE.Matrix4();
const unit=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5));
const parts=shell.userData.partNames.map((name,i)=>{shell.getMatrixAt(i,matrix);const b=unit.clone().applyMatrix4(matrix).applyMatrix4(shell.matrixWorld);return{name,minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z};});
const parking=parts.filter(p=>p.name.startsWith('Parking bay ')),stands=parts.filter(p=>/^Character stand \d+$/.test(p.name));
assert.equal(parking.length,40);assert.equal(stands.length,17);assert.equal(garage.vehicles.length,3);
const gap=(a,b)=>Math.hypot(Math.max(a.minX-b.maxX,b.minX-a.maxX,0),Math.max(a.minZ-b.maxZ,b.minZ-a.maxZ,0));
const newGap=Math.min(...parking.flatMap(p=>stands.map(s=>gap(p,s))));
const newLongitudinalGap=Math.min(...stands.map(s=>s.minZ))-Math.max(...parking.map(p=>p.maxZ));


const oldGap=(85-1.8)-(32+9*5.4+2.45+.065);
assert.ok(newLongitudinalGap>11.7);assert.ok(newGap>12);assert.ok(oldGap<.1);
for(const bay of GARAGE_LAYOUT.bays){assert.equal(bay.x,24);assert.ok(bay.z-bay.halfLength>GARAGE_LAYOUT.frontZ);assert.ok(bay.z+bay.halfLength<72);}
for(const car of garage.vehicles){const b=new THREE.Box3().setFromObject(car.root,true);assert.ok(b.min.z>=car.park.z-car.park.halfLength&&b.max.z<=car.park.z+car.park.halfLength);assert.ok(b.min.x>=car.park.x-car.park.halfWidth&&b.max.x<=car.park.x+car.park.halfWidth);}
console.log(`PASS actual parking paint/platform clearance ${oldGap.toFixed(3)} -> ${newGap.toFixed(3)} m; front/back aisle ${newLongitudinalGap.toFixed(3)} m, all10 bays and3 real cars fit`);
let points=0;
for(const characterId of ['bacon','jandel'])for(const airborne of [false,true]){
 const g=createGameplay({vehicles:garage.vehicles,stations:garage.stations,desks:garage.desks,stands:garage.stands,solids:garage.classroomSolids,characterId});g.state.jump.airborne=airborne;
 for(let x=-44;x<=28;x+=.25)for(const z of [76,79,81.5]){assert.ok(g.canWalk(x,z),`${characterId}/${airborne}: blocked rear cross-aisle ${x},${z}`);points++;}
}
for(let i=1;i<CHARACTER_STANDS.length;i++){const a=CHARACTER_STANDS[i-1],b=CHARACTER_STANDS[i];assert.ok(b.x-a.x>a.triggerRadius+b.triggerRadius);assert.ok(stands[i].minX>stands[i-1].maxX);}
console.log(`PASS ${points} full rear-aisle samples with grounded/jumping Bacon and Jandel; 17 non-overlapping markers and platforms`);
if(process.argv.includes('--plan-data')){
 const data={bounds:GARAGE_LAYOUT.bounds,parts:parts.filter(p=>p.name.startsWith('Parking bay ')||/^Character stand \d+$/.test(p.name)||p.name==='Character approach marker'),cars:garage.vehicles.map(v=>{const b=new THREE.Box3().setFromObject(v.root,true);return{id:v.id,minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z};}),desks:CLASSROOM_DESKS,entry:CLASSROOM_ENTRY,spawn:GARAGE_LAYOUT.spawn,metrics:{oldGap,newGap,newLongitudinalGap}};
 fs.writeFileSync(new URL('../../qa-renders-compact-hangar/plan.json',import.meta.url),JSON.stringify(data,null,2));
}
garage.dispose();city.dispose();
