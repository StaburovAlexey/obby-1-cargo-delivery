import assert from 'node:assert/strict';
import test from 'node:test';
import {buildRoadHazards,createRoadHazards,ROAD_HAZARD_EXCLUSIONS} from '../dist/road-hazards.js';
import {pointOnEdge,pointInRoad,queryRoadSurface,projectRoad} from '../dist/route-network.js';
import {HAZARD_FREE_DRIVING_SECTIONS} from '../dist/route-network-config.js';
import {routeDistanceAt,getEdge} from '../dist/route-network.js';
const recovery=HAZARD_FREE_DRIVING_SECTIONS.map(s=>({from:routeDistanceAt(s.from)-s.recovery,to:routeDistanceAt(s.to)+s.recovery}));
const player={x:0,z:0,heading:0};
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const baseSurface={frictionFactor:1,lateralDampingFactor:1,rollingFactor:1,engineFactor:1,speedFactor:1,coastingFactor:1,vibration:0};

test('ninety seeded movers keep thirty original-speed crossings and add two faster motion styles',()=>{
 for(const seed of [0,17,42,2026]){
  const hs=buildRoadHazards(seed);assert.equal(hs.length,90);assert.equal(new Set(hs.map(h=>h.id)).size,90);assert.deepEqual(hs,buildRoadHazards(seed));assert.ok(Object.isFrozen(hs));
  assert.deepEqual(['city','forest','desert','snow','volcanic'].map(id=>hs.filter(h=>h.biome===id).length),[18,15,11,16,30]);
  for(const [path,speed] of [['lateral',1],['diagonal',1.5],['oval',2]]){
   const group=hs.filter(h=>h.motion.path===path);assert.equal(group.length,30,path);
   for(const h of group){assert.ok(Object.isFrozen(h)&&Object.isFrozen(h.motion));assert.equal(h.motion.speedMultiplier,speed);near(h.motion.travelSeconds,8/speed);near(h.motion.pauseSeconds,1.4/speed);near(h.motion.period,18.8/speed);assert.equal(h.motion.startPause,1.2);}
  }
  assert.ok(new Set(hs.map(h=>Math.round(h.offset*100))).size>20,'crossings must not run in sync');
 }
});

test('whole motion envelopes keep footprints on the road and clear of bridges, stops and each other',()=>{
 let perimeter=0;
 for(const seed of [0,17,42,2026]){
  const hs=buildRoadHazards(seed);
  for(const h of hs){
   assert.ok(!getEdge(h.edgeId).forkId,'forks remain free for steering');
   const p=pointOnEdge(h.edgeId,h.edgeDistance),c=Math.cos(h.heading),s=Math.sin(h.heading),amp=h.motion.alongAmplitude;
   for(const offset of [h.motion.minOffset,0,h.motion.maxOffset])for(const along of [-amp,0,amp])for(const a of [-1,0,1])for(const b of [-1,0,1]){
    const x=p.x+p.right.x*offset+s*along+c*a*h.width/2+s*b*h.length/2,z=p.z+p.right.z*offset+c*along-s*a*h.width/2+c*b*h.length/2;
    assert.ok(pointInRoad(x,z,.4),h.id+' footprint');const q=projectRoad(x,z,h);assert.ok(15-Math.abs(q.offset)>.5,h.id+' road margin');
    for(const zone of recovery)assert.ok(q.distance<zone.from||q.distance>zone.to,h.id+' recovery clearance');
    for(const e of ROAD_HAZARD_EXCLUSIONS)assert.ok(Math.abs(q.distance-e.distance)>=40-1e-6,`${h.id} overlaps ${e.id}`);perimeter++;
   }
   for(const other of hs)if(other!==h)assert.ok(Math.abs(other.distance-h.distance)>=60-1e-6,`${h.id} too close to ${other.id}`);
  }
 }
 console.log({perimeter});
});

test('straight, diagonal and oval movement stays continuous and synchronized with live collisions',()=>{
 const sys=createRoadHazards(42),origins=new Map(sys.poses.map(h=>[h.id,pointOnEdge(h.edgeId,h.edgeDistance)]));
 const previous=new Map(sys.poses.map(h=>[h.id,{x:h.x,z:h.z,offset:h.offset,along:h.alongOffset}]));
 const observed=new Map(sys.poses.map(h=>[h.id,{min:Infinity,max:-Infinity,alongMin:Infinity,alongMax:-Infinity,area:0}])),peak={1:0,1.5:0,2:0};
 for(let frame=0;frame<800;frame++){
  sys.update(.05,player,true);
  for(const h of sys.poses){
   const p=origins.get(h.id),before=previous.get(h.id),o=observed.get(h.id);
   near(h.x,p.x+p.right.x*h.offset+Math.sin(h.heading)*h.alongOffset);near(h.z,p.z+p.right.z*h.offset+Math.cos(h.heading)*h.alongOffset);near(h.groundHeight,queryRoadSurface(h.x,h.z,p).height);
   const speed=Math.hypot(h.x-before.x,h.z-before.z)/.05;assert.ok(speed<=9,h.id+' jumped');peak[h.motion.speedMultiplier]=Math.max(peak[h.motion.speedMultiplier],speed);
   o.min=Math.min(o.min,h.offset);o.max=Math.max(o.max,h.offset);o.alongMin=Math.min(o.alongMin,h.alongOffset);o.alongMax=Math.max(o.alongMax,h.alongOffset);o.area+=before.offset*h.alongOffset-h.offset*before.along;
   Object.assign(before,{x:h.x,z:h.z,offset:h.offset,along:h.alongOffset});
   if(h.solid)assert.ok(sys.contact(h.x,h.z,h.heading),h.id+' live collider');else assert.notEqual(sys.surfaceAt(h.x,h.z,baseSurface),baseSurface,h.id+' live surface');
  }
 }
 for(const h of sys.poses){const o=observed.get(h.id);near(o.min,h.motion.minOffset,1e-4);near(o.max,h.motion.maxOffset,1e-4);
  if(h.motion.path==='lateral'){assert.equal(o.alongMin,0);assert.equal(o.alongMax,0);}else{assert.ok(o.alongMin< -5.9&&o.alongMax>5.9,h.id+' needs longitudinal motion');if(h.motion.path==='diagonal')assert.ok(Math.abs(o.area)<1e-6,'diagonal must stay straight');else assert.ok(Math.abs(o.area)>100,'oval must circle instead of retracing');}
 }
 assert.ok(peak[1]>3.9&&peak[1]<=4.01);assert.ok(peak[1.5]>5.9&&peak[1.5]<7);assert.ok(peak[2]>7.8&&peak[2]<9);console.log({peakSpeed:peak});
});

test('pause, bounded resume and reset preserve all ninety live object identities and initial poses',()=>{
 const sys=createRoadHazards(17),initial=JSON.stringify(sys.poses),identities=[...sys.poses];for(let i=0;i<73;i++)sys.update(.05,player,true);
 const frozen=JSON.stringify(sys.poses),elapsed=sys.elapsed;for(const dt of [1,1000,NaN,-1])sys.update(dt,player,false);assert.equal(JSON.stringify(sys.poses),frozen);assert.equal(sys.elapsed,elapsed);
 sys.update(1000,player,true);near(sys.elapsed,elapsed+.1);sys.reset();assert.equal(JSON.stringify(sys.poses),initial);assert.equal(sys.elapsed,0);identities.forEach((h,i)=>assert.equal(sys.poses[i],h));assert.ok(sys.rocks.every(r=>r.altitude===0&&r.phase==='landed'));
});
