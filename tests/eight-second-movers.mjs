#!/usr/bin/env node
/** Deterministic offline contracts for the requested moving-road encounters. */
import assert from 'node:assert/strict';
import {buildRoadHazards,createRoadHazards,roadHazardContact,ROAD_HAZARD_RULES as R,ROAD_HAZARD_EXCLUSIONS} from '../dist/road-hazards.js';
import {BIOME_DEFINITIONS,NETWORK_EDGES,FORKS,pointOnEdge,truckInRoad,pointInRoad,routeDistanceAt} from '../dist/route-network.js';
import {BRIDGES} from '../dist/road-bridges.js';
const player={x:0,z:0,heading:0};
const near=(a,b,e=1e-8)=>assert(Math.abs(a-b)<=e,`${a} != ${b} (±${e})`);
const stepTo=(system,t)=>{while(t-system.elapsed>1e-10)system.update(Math.min(.05,t-system.elapsed),player,true);};
const checks=[];
function check(name,fn){const details=fn();checks.push(name);console.log(`PASS ${name} ${JSON.stringify(details||{})}`);}

check('Twenty actual cross-road movers replace six static encounters without dense chains',()=>{
 let minMoverGap=Infinity,minAnyGap=Infinity,maxWithin320=0;
 const snapshots=new Set();
 for(const seed of [0,1,17,42,2026,2027,4294967295,'repeatable']){
  const hazards=buildRoadHazards(seed),movers=hazards.filter(h=>h.motion),statics=hazards.filter(h=>!h.motion);
  assert.equal(hazards.length,30);assert.equal(movers.length,20);assert.equal(statics.length,10);assert.equal(new Set(hazards.map(h=>h.id)).size,30);
  assert.deepEqual(hazards,buildRoadHazards(seed));snapshots.add(JSON.stringify(hazards));
  assert.equal(statics.filter(h=>h.type==='rock').length,4);
  for(const b of BIOME_DEFINITIONS)assert.equal(movers.filter(h=>h.biome===b.id).length,4);
  for(const h of hazards){
   assert(Object.isFrozen(h));
   if(h.motion){assert(Object.isFrozen(h.motion));assert.equal(h.motion.travelSeconds,8);near(h.motion.period,2*(8+h.motion.pauseSeconds));near(h.motion.maxOffset-h.motion.minOffset,21.2);assert(h.motion.minOffset<0&&h.motion.maxOffset>0);}
   for(const exclusion of ROAD_HAZARD_EXCLUSIONS)assert(Math.abs(h.distance-exclusion.distance)>=exclusion.radius+Math.hypot(h.width,h.length)/2+1-1e-7,`${h.id} overlaps ${exclusion.id}`);
   for(const bridge of BRIDGES){const from=routeDistanceAt(bridge.from),to=routeDistanceAt(bridge.to),gap=h.distance<from?from-h.distance:h.distance>to?h.distance-to:0;assert(gap>80,`${h.id} too near ${bridge.id}`);}
   const edge=NETWORK_EDGES.find(e=>e.id===h.edgeId),fork=FORKS.find(f=>f.id===edge.forkId);
   if(fork){assert(h.progress>fork.splitOverlapEnd+R.forkTipExclusionMetres);assert(h.progress<fork.mergeOverlapStart-R.forkTipExclusionMetres);}
   for(const other of hazards){if(h.id===other.id)continue;const gap=Math.abs(other.distance-h.distance);minAnyGap=Math.min(minAnyGap,gap);const moving=h.motion||other.motion,minimum=moving?180:150;assert(gap>=minimum-1e-7,`${h.id}/${other.id} only ${gap}m`);if(moving)minMoverGap=Math.min(minMoverGap,gap);}
   const within=hazards.filter(other=>other.distance>=h.distance&&other.distance<h.distance+320).length;maxWithin320=Math.max(maxWithin320,within);assert(within<=2,'No three-obstacle chain inside 320 m');
  }
 }
 assert.equal(snapshots.size,8);return{seeds:8,total:30,moving:20,static:10,minMoverGap,minAnyGap,maxWithin320};
});

check('Every shuttle takes exactly eight active seconds in each direction, with separate endpoint dwell',()=>{
 const system=createRoadHazards(42),events=[];
 for(const h of system.movers){
  const m=h.motion,start=m.startPause+((m.pauseSeconds-m.phase*m.period+m.period)%m.period),end=start+8,back=end+m.pauseSeconds;
  const add=(time,expected,label)=>events.push({time,h,expected,label});
  add(start,m.minOffset,'left endpoint / departure');add(start+4,0,'outbound midpoint');
  events.push({time:end-.01,h,label:'still outbound before 8 s',before:'max'});
  add(end,m.maxOffset,'arrives right after exactly 8 s');add(end+m.pauseSeconds/2,m.maxOffset,'right dwell');
  add(back,m.maxOffset,'return departure');add(back+4,0,'return midpoint');
  events.push({time:back+8-.01,h,label:'still returning before 8 s',before:'min'});
  add(back+8,m.minOffset,'arrives left after exactly 8 s');add(back+8+m.pauseSeconds/2,m.minOffset,'left dwell');
 }
 events.sort((a,b)=>a.time-b.time);
 for(const event of events){stepTo(system,event.time);const offset=event.h.offset;if(event.before==='max')assert(offset<event.h.motion.maxOffset-1e-6);else if(event.before==='min')assert(offset>event.h.motion.minOffset+1e-6);else near(offset,event.expected,1e-7);}
 return{movers:20,directions:40,travelSeconds:8,endpointPauseSeconds:1.4,periodSeconds:18.8,events:events.length};
});

check('Pause, capped dt, uneven frame partitions and reset preserve the same visible simulation clock',()=>{
 const a=createRoadHazards(42),b=createRoadHazards(42),initial=JSON.stringify(a.poses),identity=[...a.poses],rocks=JSON.stringify(a.rocks);
 stepTo(a,1.2);assert.equal(JSON.stringify(a.poses),initial,'Initial pause must not move any object');
 a.reset();for(let i=0;i<160;i++)a.update(.025,player,true);for(let i=0;i<40;i++)b.update(.1,player,true);
 near(a.elapsed,b.elapsed);a.movers.forEach((h,i)=>near(h.offset,b.movers[i].offset));
 const paused=JSON.stringify(a.poses),time=a.elapsed;
 for(const dt of [0,-1,Infinity,NaN])a.update(dt,player,true);
 a.update(300,player,false);a.update(.05,{...player,x:NaN},true);a.update(.05,null,true);
 assert.equal(JSON.stringify(a.poses),paused);near(a.elapsed,time);
 a.update(300,player,true);b.update(.1,player,true);near(a.elapsed,time+.1);a.movers.forEach((h,i)=>near(h.offset,b.movers[i].offset));
 a.reset();assert.equal(JSON.stringify(a.poses),initial);identity.forEach((h,i)=>assert.equal(a.poses[i],h));assert.equal(JSON.stringify(a.rocks),rocks);
 assert(a.rocks.every(r=>r.phase==='landed'&&!r.shadowVisible&&r.altitude===0));
 return{capSeconds:R.maxDelta,resetStable:true,staticLavaRocks:4};
});

check('Full sweep stays within road, has a safe opposite-side car corridor and uses actual live collisions',()=>{
 const system=createRoadHazards(42),descriptors=JSON.stringify(system.hazards),previous=system.movers.map(h=>h.offset),centerCrossers=new Set();
 let maxSpeed=0,minOpening=Infinity,minRoadMargin=Infinity,samples=0;
 for(let frame=0;frame<1000;frame++){
  system.update(.025,player,true);
  for(const [i,h]of system.movers.entries()){
   const p=pointOnEdge(h.edgeId,h.edgeDistance);assert.equal(system.poseFor(h.id),h);
   near(h.x,p.x+p.right.x*h.offset);near(h.z,p.z+p.right.z*h.offset);
   assert(h.offset>=h.motion.minOffset-1e-8&&h.offset<=h.motion.maxOffset+1e-8);
   const speed=Math.abs(h.offset-previous[i])/.025;maxSpeed=Math.max(maxSpeed,speed);assert(speed<=4+1e-8);previous[i]=h.offset;
   assert(system.contact(h.x,h.z,h.heading));
   if(roadHazardContact(h,p.x,p.z,p.heading))centerCrossers.add(h.id);
   const opening=15-h.width/2+Math.abs(h.offset);minOpening=Math.min(minOpening,opening);assert(opening>=R.minimumFreeCorridor);
   const side=h.offset<=0?1:-1;assert.equal(h.bypassSide,side);const x=p.x+p.right.x*10.4*side,z=p.z+p.right.z*10.4*side;
   assert(truckInRoad(x,z,p.heading,p));assert.equal(system.contact(x,z,p.heading),undefined);assert(10.4*side>=h.bypassMin&&10.4*side<=h.bypassMax);
   for(const lx of [-h.width/2,h.width/2])for(const lz of [-h.length/2,h.length/2]){const x=h.x+Math.cos(h.heading)*lx+Math.sin(h.heading)*lz,z=h.z-Math.sin(h.heading)*lx+Math.cos(h.heading)*lz;assert(pointInRoad(x,z,.5));minRoadMargin=Math.min(minRoadMargin,15-Math.abs(h.offset+lx));}samples++;
  }
 }
 assert.equal(centerCrossers.size,20);assert.equal(JSON.stringify(system.hazards),descriptors);
 return{frames:1000,samples,maxSpeed,minOpening,minRoadMargin,centerCrossers:centerCrossers.size};
});
console.log(`${checks.length} eight-second mover groups passed. Offline physics/geometry only; no browser or human playtest claim.`);
