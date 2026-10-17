import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createCanyonEntrance} from '../dist/canyon-entrance.js';
import {canyonApproachPoint,CANYON_APPROACH_LENGTH,projectCanyonApproach} from '../dist/canyon-approach.js';
import {pointInRoad} from '../dist/road-layout.js';
import {createDrivingModel} from '../dist/driving-model.js';

test('the fork starts tangent to the main road and bends continuously toward the canyon',()=>{
 let prev=canyonApproachPoint(0);assert.equal(prev.heading,0);assert.ok(pointInRoad(prev.x,prev.z));
 for(let s=.25;s<CANYON_APPROACH_LENGTH;s+=.25){const p=canyonApproachPoint(s);assert.ok(Math.hypot(p.x-prev.x,p.z-prev.z)<=.25001);assert.ok(Math.abs(p.heading-prev.heading)<.008);assert.ok(projectCanyonApproach(p.x,p.z).distance<.005);prev=p;}
 assert.equal(prev.heading,-Math.PI/2);assert.ok(prev.x>109);
});

test('BMW footprint clears the entire curved fork and the straight road remains open',()=>{
 const gate=createCanyonEntrance(THREE);gate.updateAccess({}, {developerMode:true});
 try{
  for(let s=0;s<CANYON_APPROACH_LENGTH-5;s+=.5){const p=canyonApproachPoint(s);assert.equal(gate.contact(p.x,p.z,p.heading,{halfWidth:1.7,halfLength:4.05}),undefined,`fork at ${s}`);}
  for(let z=-20;z>-90;z-=.5)assert.equal(gate.contact(0,z,0,{halfWidth:1.7,halfLength:4.05}),undefined,`main road ${z}`);
  assert.ok(gate.contact(65,-74,-Math.PI/2));
  const road=gate.group.getObjectByName('Canyon approach asphalt');const normals=road.geometry.getAttribute('normal');for(let i=0;i<normals.count;i++)assert.ok(normals.getY(i)>.99,'asphalt faces upwards');
 }finally{gate.dispose();}
});

test('the physical BMW can drive through the fork into the canyon at 30, 60 and 120 FPS',()=>{
const gate=createCanyonEntrance(THREE);gate.updateAccess({}, {developerMode:true});
for(const fps of [30,60,120]){let collisions=0;const m=createDrivingModel({...canyonApproachPoint(0),vehicleId:'bmwreward',maxSpeed:42,contact:(...a)=>{const h=gate.contact(...a);if(h)collisions++;return h;}});let progress=0;
for(let i=0;i<fps*50;i++){let best=Infinity;for(let s=progress;s<Math.min(progress+20,CANYON_APPROACH_LENGTH);s+=.5){const p=canyonApproachPoint(s),d=Math.hypot(p.x-m.state.x,p.z-m.state.z);if(d<best){best=d;progress=s;}}
const p=canyonApproachPoint(progress+8),heading=Math.atan2(-(p.x-m.state.x),-(p.z-m.state.z)),err=Math.atan2(Math.sin(heading-m.state.heading),Math.cos(heading-m.state.heading));m.setInput({active:true,steering:Math.max(-1,Math.min(1,-err*2)),speedDemand:8/42});m.step(1/fps);if(gate.shouldEnter(m.state,'bmwreward'))break;}
assert.equal(collisions,0,`no fork collision at ${fps} FPS`);assert.equal(gate.shouldEnter(m.state,'bmwreward'),true,`reached entry at ${fps} FPS`);}
gate.dispose();

});
