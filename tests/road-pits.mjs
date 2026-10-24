import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {buildRoadHazards,createRoadHazards} from '../dist/road-hazards.js';
import {BIOME_DEFINITIONS,NETWORK_EDGES,pointOnEdge,projectRoad,routeDistanceAt,CHECKPOINT_PROGRESS,PREVIEW_PROGRESS,ROAD_MESH,surfaceHeight,ROAD_SURFACE_OFFSET} from '../dist/route-network.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {HAZARD_FREE_DRIVING_SECTIONS} from '../dist/route-network-config.js';
assert.ok(existsSync(new URL('../dist/road-pits.js',import.meta.url)),'Road pit catalog must exist');
const {buildRoadPits,roadPitAt,roadPitRampHeight,roadPitReservations}=await import('../dist/road-pits.js');
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const at=(h,across=0,forward=0)=>({x:h.x+Math.cos(h.heading)*across-Math.sin(h.heading)*forward,z:h.z-Math.sin(h.heading)*across-Math.cos(h.heading)*forward});
test('catalog gives each biome two avoidable mouths and a forward jump with immutable canonical poses',()=>{
 for(const seed of [0,17,42,2026,'same']){
  const pits=buildRoadPits(seed);assert.equal(pits.length,15);assert.ok(Object.isFrozen(pits));assert.deepEqual(pits,buildRoadPits(seed));
  assert.equal(new Set(pits.map(p=>p.id)).size,15);
  for(const biome of BIOME_DEFINITIONS){const local=pits.filter(p=>p.biome===biome.id);assert.equal(local.filter(p=>p.type==='pit').length,2);assert.equal(local.filter(p=>p.type==='jump').length,1);assert.deepEqual(local.filter(p=>p.type==='pit').map(p=>p.offset).sort((a,b)=>a-b),[-4.5,4.5]);}
  for(const p of pits){
   const canonical=pointOnEdge(p.edgeId,p.edgeDistance);near(canonical.distance,p.distance);near(routeDistanceAt(p.progress),p.distance);near(p.height,canonical.height);near(p.x,canonical.x+canonical.right.x*p.offset);near(p.z,canonical.z+canonical.right.z*p.offset);
   assert.equal(NETWORK_EDGES.find(e=>e.id===p.edgeId).forkId,null);assert.equal(p.depth,20);
   for(const value of [p,p.cutFootprint,...p.cutFootprint,p.reservation,p.reservationFootprint,...p.reservationFootprint,...(p.ramp?[p.ramp,p.ramp.footprint,...p.ramp.footprint]:[])])assert.ok(Object.isFrozen(value));
   assert.equal(roadPitAt(pits,p.x,p.z),p);assert.equal(roadPitAt(pits,...Object.values(at(p,p.cutWidth/2+1))),null);
   if(p.type==='pit'){assert.equal(p.width,21);assert.equal(p.cutWidth,21);assert.equal(p.length,12);assert.equal(p.ramp,null);near(15+Math.abs(p.offset)-p.width/2,9);}
   else{
    assert.equal(p.width,30);assert.equal(p.cutWidth,224);assert.equal(p.length,6);assert.equal(p.ramp.length,24);assert.equal(p.ramp.height,2.4);assert.equal(p.ramp.width,5.3);assert.equal(Math.abs(p.ramp.offset),7.5);
    near(p.distance-3-24-40,p.reservation.from);near(p.distance+3+100,p.reservation.to);
    for(let d=-67;d<=103;d+=1){const q=pointOnEdge(p.edgeId,p.edgeDistance+d);assert.ok(Math.hypot(q.gradient.x,q.gradient.z)<=.05+1e-9);assert.ok(Math.abs(q.curvature)<=.003+1e-9);if(d>=-27&&d<=33){assert.ok(Math.hypot(q.gradient.x,q.gradient.z)<=.02+1e-9);assert.ok(Math.abs(q.curvature)<=.0015+1e-9);}}
    const rampMid=pointOnEdge(p.edgeId,p.edgeDistance-15),x=rampMid.x+rampMid.right.x*p.ramp.offset,z=rampMid.z+rampMid.right.z*p.ramp.offset;assert.equal(roadPitAt(pits,x,z),null);near(roadPitRampHeight(pits,x,z),rampMid.height+1.208,.002);
   }
   for(const b of BRIDGES)assert.ok(p.reservation.to<routeDistanceAt(b.from)-10||p.reservation.from>routeDistanceAt(b.to)+10,`${p.id} overlaps ${b.id}`);
   for(const q of [...CHECKPOINT_PROGRESS,...PREVIEW_PROGRESS.map(p=>p.progress)])assert.ok(p.reservation.to<routeDistanceAt(q)-15||p.reservation.from>routeDistanceAt(q)+15,`${p.id} overlaps checkpoint/preview ${q}`);
   for(const section of HAZARD_FREE_DRIVING_SECTIONS){const from=routeDistanceAt(section.from)-section.recovery,to=routeDistanceAt(section.to)+section.recovery;assert.ok(p.reservation.to<from||p.reservation.from>to,`${p.id} overlaps ${section.id}`);}
  }
 }
 assert.equal(roadPitAt(buildRoadPits(),NaN,0),null);assert.equal(roadPitRampHeight(buildRoadPits(),0,0),undefined);
});
test('reservation calls retain every mover identity and pattern while full swept envelopes avoid pits',()=>{
 for(const seed of [0,17,42,2026]){
  const original=buildRoadHazards(seed),pits=buildRoadPits(seed),reservedIntervals=roadPitReservations(pits),hazards=buildRoadHazards(seed,{reservedIntervals});
  assert.equal(hazards.length,90);assert.deepEqual(hazards.map(h=>h.id).sort(),original.map(h=>h.id).sort());
  for(const biome of BIOME_DEFINITIONS){const extra=hazards.filter(h=>h.motion.path!=='lateral'),imports=extra.some(h=>h.biome===biome.id&&original.find(o=>o.id===h.id).biome!==biome.id),exports=extra.some(h=>h.biome!==biome.id&&original.find(o=>o.id===h.id).biome===biome.id);assert.ok(!(imports&&exports),`${biome.id} should fill its own extra mover slots before accepting surplus`);}
  for(const [i,h] of hazards.entries()){const old=original.find(o=>o.id===h.id);assert.equal(h.type,old.type);assert.deepEqual(h.motion,old.motion);assert.equal(h.pattern,old.pattern);assert.equal(pointOnEdge(h.edgeId,h.edgeDistance).biome,h.biome);
   for(const other of hazards.slice(i+1)){assert.ok(other.distance-h.distance>=60-1e-7,`${h.id}/${other.id} minimum spacing`);if(h.motion.path==='lateral'&&other.motion.path==='lateral')assert.ok(other.distance-h.distance>=180-1e-7,`${h.id}/${other.id} base spacing`);}
   const halfAlong=Math.hypot(h.width,h.length)/2+(h.motion.alongAmplitude||0)+1;
   for(const r of reservedIntervals)assert.ok(h.distance+halfAlong<r.from||h.distance-halfAlong>r.to,`${h.id} reservation envelope`);
   const p=pointOnEdge(h.edgeId,h.edgeDistance),c=Math.cos(h.heading),s=Math.sin(h.heading);
   for(const offset of [h.motion.minOffset,h.motion.maxOffset])for(const along of [-h.motion.alongAmplitude,h.motion.alongAmplitude])for(const a of [-1,1])for(const b of [-1,1]){
    const x=p.x+p.right.x*offset+s*along+c*a*h.width/2+s*b*h.length/2,z=p.z+p.right.z*offset+c*along-s*a*h.width/2+c*b*h.length/2,q=projectRoad(x,z,h);
    for(const r of reservedIntervals)assert.ok(q.distance<r.from||q.distance>r.to,`${h.id} projected swept corner`);
   }
  }
  assert.deepEqual(createRoadHazards(seed,{reservedIntervals}).hazards,hazards);assert.deepEqual(buildRoadHazards(seed,{reservedIntervals}),hazards);
 }
});
test('empty reservations preserve legacy output even after cached reserved builds',()=>{
 const hash=hs=>createHash('sha256').update(JSON.stringify(hs)).digest('hex');
 assert.equal(hash(buildRoadHazards(42)),'bce66152416f78598ae0af8bc3a8e2552b107789ef4d58840a0bc9790cc40db0');
 assert.deepEqual(buildRoadHazards(42,{reservedIntervals:[]}),buildRoadHazards(42));
 const a=buildRoadHazards(42,{reservedIntervals:roadPitReservations(buildRoadPits(42))});
 const b=buildRoadHazards(42,{reservedIntervals:[{from:1300,to:1600}]});assert.notDeepEqual(a,b);
 assert.equal(hash(buildRoadHazards(42)),'bce66152416f78598ae0af8bc3a8e2552b107789ef4d58840a0bc9790cc40db0');
});
test('all biomes allocate their own base crossings before importing surplus from another biome',()=>{
 const hazards=buildRoadHazards(42,{reservedIntervals:roadPitReservations(buildRoadPits(42))});
 assert.equal(hazards.length,90);
 const ice=hazards.find(h=>h.id==='snow-ice-spaced-static-1');assert.equal(ice.biome,'snow','Snow ice must keep its available protected Snow crossing');
 assert.equal(pointOnEdge(ice.edgeId,ice.edgeDistance).biome,'snow');
});
test('critical jumps keep their physically calibrated stations across seeds while ordinary pits vary',()=>{
 const expected=[['city',1437],['forest',1187],['desert',1432],['snow',752],['volcanic',372]];
 for(const seed of [0,17,42,2026])assert.deepEqual(buildRoadPits(seed).filter(p=>p.type==='jump').map(p=>[p.biome,p.edgeDistance]),expected);
 assert.notDeepEqual(buildRoadPits(0).filter(p=>p.type==='pit').map(p=>p.edgeDistance),buildRoadPits(2026).filter(p=>p.type==='pit').map(p=>p.edgeDistance));
});
test('seeded takeoffs stay wholly in one road half and support the widest car with lateral clearance',()=>{
 const observed=new Map(BIOME_DEFINITIONS.map(b=>[b.id,new Set()]));
 for(let seed=0;seed<32;seed++){
  const pits=buildRoadPits(seed);assert.deepEqual(pits,buildRoadPits(seed));
  for(const pit of pits.filter(p=>p.type==='jump')){
   const ramp=pit.ramp;assert.ok(ramp.side===-1||ramp.side===1);near(ramp.offset,ramp.side*7.5);near((ramp.width-4.1)/2,.6);observed.get(pit.biome).add(ramp.side);
   for(const [i,d] of [[0,ramp.fromEdgeDistance],[1,ramp.fromEdgeDistance],[2,ramp.toEdgeDistance],[3,ramp.toEdgeDistance]]){const p=pointOnEdge(pit.edgeId,d),v=ramp.footprint[i],across=(v.x-p.x)*p.right.x+(v.z-p.z)*p.right.z;assert.ok(across*ramp.side>=4.85-1e-7&&across*ramp.side<=10.15+1e-7,'complete takeoff belongs to its chosen 15 m road half');}
   for(const t of [.1,.5,.9]){const p=pointOnEdge(pit.edgeId,ramp.fromEdgeDistance+ramp.length*t);
    assert.equal(roadPitRampHeight(pits,p.x,p.z),undefined,'road centre remains flat outside the side takeoff');
    assert.equal(roadPitAt(pits,p.x,p.z),null);
    for(const edge of [-2.05,2.05]){const x=p.x+p.right.x*(ramp.offset+edge),z=p.z+p.right.z*(ramp.offset+edge);assert.ok(Number.isFinite(roadPitRampHeight(pits,x,z)),'both sides of a 4.1 m car remain supported');}
   }
  }
 }
 for(const [biome,sides] of observed)assert.deepEqual([...sides].sort(),[-1,1],`${biome}: seed must vary the chosen side`);
});
test('mouth margins expand and contract the actual convex footprint',()=>{
 const pit={cutFootprint:[{x:0,z:0},{x:8,z:0},{x:8,z:12},{x:0,z:12}]};
 assert.equal(roadPitAt([pit],-.4,6,.5),pit);assert.equal(roadPitAt([pit],-.6,6,.5),null);
 assert.equal(roadPitAt([pit],.4,6,-.5),null);assert.equal(roadPitAt([pit],.6,6,-.5),pit);
 assert.equal(roadPitAt([pit],-.4,-.4,.5),null,'dilation uses distance to the corner rather than square half-plane expansion');
 assert.equal(roadPitAt([pit],-.3,-.3,.5),pit);
});
test('concave mouths preserve solid notches and apply signed nearest-boundary margins in both windings',()=>{
 const boundary=[{x:0,z:0},{x:8,z:0},{x:8,z:8},{x:6,z:8},{x:6,z:2},{x:2,z:2},{x:2,z:8},{x:0,z:8}];
 for(const cutFootprint of [boundary,boundary.slice().reverse()]){const pit={cutFootprint};
  for(const [x,z] of [[1,6],[7,6],[4,1]])assert.equal(roadPitAt([pit],x,z),pit);
  assert.equal(roadPitAt([pit],4,6),null,'solid centre of the U stays supported');
  assert.equal(roadPitAt([pit],2.3,6,.4),pit);assert.equal(roadPitAt([pit],4,6,.4),null);
  assert.equal(roadPitAt([pit],1,6,-.9),pit);assert.equal(roadPitAt([pit],.7,6,-.8),null);
  assert.equal(roadPitAt([pit],2.6,2.6,.5),null);assert.equal(roadPitAt([pit],2.3,2.3,.5),pit);
 }
});
test('wide ordinary mouths have seeded simple jagged concavities inside their exact 21 by 12 envelope',()=>{
 const local=p=>p.cutFootprint.map(v=>({x:Math.cos(p.heading)*(v.x-p.x)-Math.sin(p.heading)*(v.z-p.z),z:-Math.sin(p.heading)*(v.x-p.x)-Math.cos(p.heading)*(v.z-p.z)}));
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const on=(a,b,p)=>Math.abs(cross(a,b,p))<1e-8&&p.x>=Math.min(a.x,b.x)-1e-8&&p.x<=Math.max(a.x,b.x)+1e-8&&p.z>=Math.min(a.z,b.z)-1e-8&&p.z<=Math.max(a.z,b.z)+1e-8;
 const intersects=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
 for(const seed of [0,17,42,2026])for(const pit of buildRoadPits(seed).filter(p=>p.type==='pit')){
  const points=local(pit),n=points.length;assert.ok(n>=14&&n<=18,'bank uses a natural many-point outline');
  near(Math.min(...points.map(p=>p.x)),-10.5);near(Math.max(...points.map(p=>p.x)),10.5);near(Math.min(...points.map(p=>p.z)),-6);near(Math.max(...points.map(p=>p.z)),6);
  const turns=points.map((p,i)=>Math.sign(cross(p,points[(i+1)%n],points[(i+2)%n])));assert.ok(turns.includes(-1)&&turns.includes(1),'positive inward jaggedness creates actual concavity');
  assert.ok(points.some((p,i)=>Math.hypot(p.x+points[(i+Math.floor(n/2))%n].x,p.z+points[(i+Math.floor(n/2))%n].z)>.25),'outline has no artificial central symmetry');
  for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;assert.ok(!intersects(points[i],points[(i+1)%n],points[j],points[(j+1)%n]),`${pit.id}: bank cannot self-intersect`);}
  for(let forward=-6;forward<=6;forward+=.5)for(const distance of [6.01,8,10,14.99]){const roadOffset=-Math.sign(pit.offset)*distance,p=at(pit,roadOffset-pit.offset,forward);assert.equal(roadPitAt([pit],p.x,p.z),null,'continuous opposite 9 m bypass stays solid');}
 }
 const outline=seed=>local(buildRoadPits(seed).find(p=>p.id==='city-pit-1')).map(p=>({x:+p.x.toFixed(6),z:+p.z.toFixed(6)}));
 assert.notDeepEqual(outline(0),outline(17),'seed changes the physical bank shape');
});
test('ramp support reaches the same wedge height across the complete curved takeoff lip',()=>{
 for(const pit of buildRoadPits().filter(p=>p.ramp)){
  const f=pit.ramp.footprint;
  for(const t of [0,.25,.5,.75,1])for(const across of [.01,.25,.5,.75,.99]){
   const left={x:f[0].x+(f[3].x-f[0].x)*t,z:f[0].z+(f[3].z-f[0].z)*t},right={x:f[1].x+(f[2].x-f[1].x)*t,z:f[1].z+(f[2].z-f[1].z)*t},x=left.x+(right.x-left.x)*across,z=left.z+(right.z-left.z)*across;
   near(roadPitRampHeight([pit],x,z),surfaceHeight(x,-z)+ROAD_SURFACE_OFFSET+t*2.4,1e-7);
  }
 }
});
test('advertisement reservation hull contains the entire curved approach and landing width',()=>{
 for(const pit of buildRoadPits())for(let d=pit.reservation.from;d<=pit.reservation.to;d+=2){
  const p=pointOnEdge(pit.edgeId,pit.edgeDistance+d-pit.distance);
  for(const across of [-15,0,15]){const x=p.x+p.right.x*across,z=p.z+p.right.z*across,f=pit.reservationFootprint;let sign=0;
   for(let i=0;i<f.length;i++){const a=f[i],b=f[(i+1)%f.length],v=(b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x);if(Math.abs(v)<1e-7)continue;if(sign)assert.equal(Math.sign(v),sign,pit.id+' route outside reservation hull');sign=Math.sign(v);}
  }
 }
});
test('full width cuts do not remove any remote road or fork arm',()=>{
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const contains=(poly,p)=>Math.abs(poly.reduce((sum,a,i)=>{const b=poly[(i+1)%poly.length];return sum+Math.atan2(cross(p,a,b),(a.x-p.x)*(b.x-p.x)+(a.z-p.z)*(b.z-p.z));},0))>Math.PI;
 const intersection=(a,b)=>{
  for(const key of ['x','z'])if(Math.max(...a.map(p=>p[key]))<=Math.min(...b.map(p=>p[key]))+1e-7||Math.max(...b.map(p=>p[key]))<=Math.min(...a.map(p=>p[key]))+1e-7)return false;
  if(a.some(p=>contains(b,p))||b.some(p=>contains(a,p)))return true;
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];if(cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0)return true;}return false;
 };
 for(const seed of [0,17,42,2026])for(const pit of buildRoadPits(seed))for(let i=0;i<ROAD_MESH.indices.length;i+=3){const ids=ROAD_MESH.indices.slice(i,i+3),tri=ids.map(id=>({x:ROAD_MESH.positions[id*3],z:ROAD_MESH.positions[id*3+2]}));if(!intersection(pit.cutFootprint,tri))continue;for(const id of ids)assert.ok(Math.abs(ROAD_MESH.progress[id]-pit.progress)<20,`${pit.id} cuts remote triangle at ${ROAD_MESH.progress[id]}`);}
});
