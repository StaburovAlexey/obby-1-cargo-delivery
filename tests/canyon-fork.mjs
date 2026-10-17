import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createCanyonEntrance} from '../dist/canyon-entrance.js';
import {canyonApproachPoint,CANYON_APPROACH_LENGTH,projectCanyonApproach} from '../dist/canyon-approach.js';
import {pointInRoad} from '../dist/road-layout.js';
import {groundHeight} from '../dist/city-driving.js';
import {createDrivingModel} from '../dist/driving-model.js';

test('the fork starts tangent to the main road and bends continuously toward the canyon',()=>{
 let prev=canyonApproachPoint(0);assert.equal(prev.heading,0);assert.ok(pointInRoad(prev.x,prev.z));
 for(let s=.25;s<CANYON_APPROACH_LENGTH;s+=.25){const p=canyonApproachPoint(s);assert.ok(Math.hypot(p.x-prev.x,p.z-prev.z)<=.25001);assert.ok(Math.abs(p.heading-prev.heading)<.008);assert.ok(projectCanyonApproach(p.x,p.z).distance<.005);prev=p;}
 assert.equal(prev.heading,-Math.PI/4);assert.ok(prev.x>80);
});

test('the Y departure is broad, 45 degrees, and has no hidden right-angle elbow',()=>{
 const end=canyonApproachPoint(CANYON_APPROACH_LENGTH);assert.equal(end.heading,-Math.PI/4);
 let maxCurvature=0;for(let s=0;s<110;s+=.25){const a=canyonApproachPoint(s),b=canyonApproachPoint(s+.25);maxCurvature=Math.max(maxCurvature,Math.abs(b.heading-a.heading)/.25);}
 assert.ok(maxCurvature<1/74,'the departure has at least a 74 m turning radius');
 for(const s of [110,150,200,250,300])assert.equal(canyonApproachPoint(s).heading,-Math.PI/4,'the visible exit keeps its diagonal heading');
 assert.ok(Math.abs(canyonApproachPoint(.25).heading)<1e-6,'zero-curvature start blends into the main road');
 assert.ok(Math.abs(canyonApproachPoint(110).heading-canyonApproachPoint(109.75).heading)<1e-6,'zero-curvature end blends into the diagonal');
});

test('BMW footprint clears the entire curved fork and the straight road remains open',()=>{
 const gate=createCanyonEntrance(THREE);gate.updateAccess({}, {developerMode:true});
 try{
  for(let s=0;s<CANYON_APPROACH_LENGTH-5;s+=.5){const p=canyonApproachPoint(s);assert.equal(gate.contact(p.x,p.z,p.heading,{halfWidth:1.7,halfLength:4.05}),undefined,`fork at ${s}`);}
  for(let z=-20;z>-280;z-=.5)assert.equal(gate.contact(0,z,0,{halfWidth:1.7,halfLength:4.05}),undefined,`main road ${z}`);
  const edge=canyonApproachPoint(145);assert.ok(gate.contact(edge.x+edge.right.x*9,edge.z+edge.right.z*9,edge.heading));
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

test('one physical model crosses the shared approach seam in both directions at 30, 60 and 120 FPS',async()=>{
 const {canyonContact,canyonSurface,canyonPointAt,projectCanyon}=await import('../dist/canyon-track.js');
 const gate=createCanyonEntrance(THREE);gate.updateAccess({}, {developerMode:true});
 try{
  for(const fps of [30,60,120])for(const direction of [-1,1]){
   let collisions=0,maxStep=0,maxHeightStep=0;
   const join=canyonApproachPoint(CANYON_APPROACH_LENGTH),start=canyonApproachPoint(CANYON_APPROACH_LENGTH-15),finish=canyonPointAt(35);
   const pose=direction>0?start:finish;
   const m=createDrivingModel({...pose,heading:pose.heading+(direction>0?0:Math.PI),vehicleId:'bmwreward',maxSpeed:42,
    groundGradient:(x,z)=>canyonSurface(x,z,5)?.gradient||{x:0,z:0},contact:(...a)=>{const hit=gate.contact(...a)||canyonContact(...a);if(hit)collisions++;return hit;}});
   const surface=(x,z)=>canyonSurface(x,z,8)?.height??groundHeight(x,z);
   for(let i=0;i<fps*12;i++){
    const old={x:m.state.x,z:m.state.z,height:surface(m.state.x,m.state.z)};
    const q=projectCanyon(m.state.x,m.state.z),target=direction>0?canyonPointAt(q.progress+8):canyonApproachPoint(CANYON_APPROACH_LENGTH-25),heading=Math.atan2(-(target.x-m.state.x),-(target.z-m.state.z)),error=Math.atan2(Math.sin(heading-m.state.heading),Math.cos(heading-m.state.heading));m.setInput({active:true,steering:Math.max(-1,Math.min(1,-error*2)),speedDemand:8/42});m.step(1/fps);if(direction<0&&m.state.x<join.x-10)break;
    maxStep=Math.max(maxStep,Math.hypot(m.state.x-old.x,m.state.z-old.z));maxHeightStep=Math.max(maxHeightStep,Math.abs(surface(m.state.x,m.state.z)-old.height));
   }
   assert.equal(collisions,0,`${fps} FPS direction ${direction}: no collision at the seam`);
   assert.ok(direction>0?m.state.x>join.x+25:m.state.x<join.x-10,`${fps} FPS direction ${direction}: drives through the join`);
   assert.ok(maxStep<.4,'position changes only by physical integration');assert.ok(maxHeightStep<.01,'the wheel surface remains smooth over the join');
  }
 }finally{gate.dispose();}
});

test('the entire downhill branch can be driven uphill back to the main-world approach',async()=>{
 const {CANYON_TRACK,canyonPointAt,projectCanyon,canyonContact,canyonSurface}=await import('../dist/canyon-track.js');
 const p=canyonPointAt(CANYON_TRACK.finish),m=createDrivingModel({...p,heading:p.heading+Math.PI,vehicleId:'bmwreward',maxSpeed:42,contact:canyonContact,groundGradient:(x,z)=>canyonSurface(x,z,5)?.gradient||{x:0,z:0}});
 let collisions=0,maxOffset=0;
 for(let i=0;i<60*300;i++){
  const q=projectCanyon(m.state.x,m.state.z),target=canyonPointAt(Math.max(0,q.progress-8));
  if(q.progress<8){const a=canyonApproachPoint(CANYON_APPROACH_LENGTH-8+q.progress);target.x=a.x;target.z=a.z;}
  const heading=Math.atan2(-(target.x-m.state.x),-(target.z-m.state.z)),error=Math.atan2(Math.sin(heading-m.state.heading),Math.cos(heading-m.state.heading));
  m.setInput({active:true,steering:Math.max(-1,Math.min(1,-error*2)),speedDemand:8/42});m.step(1/60);
  if(m.state.blocked)collisions++;maxOffset=Math.max(maxOffset,Math.abs(q.offset));if(m.state.x<canyonPointAt(0).x-4)break;
 }
 assert.ok(m.state.x<canyonPointAt(0).x-4,'returns to the original approach by continuous driving');assert.equal(collisions,0);assert.ok(maxOffset<1,'uphill steering remains controllable');
});
