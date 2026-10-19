import assert from 'node:assert/strict';
import {buildRoadHazards,createRoadHazards,ROAD_HAZARD_RULES as R,ROAD_HAZARD_EXCLUSIONS} from '../dist/road-hazards.js';
import {pointOnEdge,pointInRoad,queryRoadSurface,projectRoad} from '../dist/route-network.js';
let perimeter=0;
for(const seed of [0,17,42,2026]){
 const hs=buildRoadHazards(seed);assert.equal(hs.length,30);assert.equal(hs.filter(h=>h.motion).length,30);assert.equal(new Set(hs.map(h=>h.id)).size,30);assert.equal(new Set(hs.map(h=>h.biome)).size,5);assert.deepEqual(hs,buildRoadHazards(seed));
 for(const h of hs){
  assert.equal(h.motion.travelSeconds,8);assert.equal(h.motion.pauseSeconds,1.4);assert.equal(h.motion.period,18.8);assert(h.motion.minOffset<0&&h.motion.maxOffset>0);assert(h.motion.maxOffset-h.motion.minOffset>=20);
  const p=pointOnEdge(h.edgeId,h.edgeDistance),c=Math.cos(h.heading),s=Math.sin(h.heading);
  for(const o of [h.motion.minOffset,0,h.motion.maxOffset])for(const a of [-1,0,1])for(const b of [-1,0,1]){
   const x=p.x+p.right.x*o+c*a*h.width/2+s*b*h.length/2,z=p.z+p.right.z*o-s*a*h.width/2+c*b*h.length/2;
   assert(pointInRoad(x,z,.4),h.id);const q=projectRoad(x,z,h);assert(15-Math.abs(q.offset)>.5,h.id);
   for(const e of ROAD_HAZARD_EXCLUSIONS)assert(Math.abs(q.distance-e.distance)>=e.radius-1e-6,`${h.id} overlaps ${e.id}`);perimeter++;
  }
  for(const other of hs)if(other!==h&&other.edgeId===h.edgeId)assert(Math.abs(other.edgeDistance-h.edgeDistance)>=180-1e-6);
 }
}
const sys=createRoadHazards(42),player={x:0,z:0,heading:0},initial=JSON.stringify(sys.poses),extents=new Map(sys.poses.map(h=>[h.id,[Infinity,-Infinity]]));
const base={frictionFactor:1,lateralDampingFactor:1,rollingFactor:1,engineFactor:1,speedFactor:1,coastingFactor:1,vibration:0};
for(let i=0;i<430;i++){
 sys.update(.05,player,true);
 for(const h of sys.poses){const e=extents.get(h.id);e[0]=Math.min(e[0],h.offset);e[1]=Math.max(e[1],h.offset);const p=pointOnEdge(h.edgeId,h.edgeDistance);assert(Math.abs(h.x-p.x-p.right.x*h.offset)<1e-8);assert(Math.abs(h.groundHeight-queryRoadSurface(h.x,h.z,p).height)<1e-8);
  if(h.solid)assert(sys.contact(h.x,h.z,h.heading),h.id+' collider');else assert.notEqual(sys.surfaceAt(h.x,h.z,base),base,h.id+' moving surface');
 }
}
for(const h of sys.poses){const e=extents.get(h.id);assert(Math.abs(e[0]-h.motion.minOffset)<1e-4);assert(Math.abs(e[1]-h.motion.maxOffset)<1e-4);}
const frozen=JSON.stringify(sys.poses);sys.update(1000,player,false);assert.equal(JSON.stringify(sys.poses),frozen);const t=sys.elapsed;sys.update(1000,player,true);assert(Math.abs(sys.elapsed-t-.1)<1e-8);sys.reset();assert.equal(JSON.stringify(sys.poses),initial);assert(sys.rocks.every(r=>r.altitude===0&&r.phase==='landed'));
console.log('PASS all30 moving hazards, five biomes, eight-second crossings, 1.4s dwell, 4 seeds, footprints/exclusions, live collisions and moving surfaces, bounded pause/reset.',{perimeter});
