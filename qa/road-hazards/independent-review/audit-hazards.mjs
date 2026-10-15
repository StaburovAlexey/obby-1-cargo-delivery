import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRoadHazards,buildRoadHazards,roadHazardContact,ROAD_HAZARD_RULES as R,ROAD_HAZARD_EXCLUSIONS} from '../../../dist/road-hazards.js';
import {createDrivingModel,VEHICLE_DYNAMICS} from '../../../dist/driving-model.js';
import {VEHICLE_CONFIG,BIOME_SEQUENCE,DELIVERY_CHECKPOINTS} from '../../../dist/economy-config.js';
import {getVehiclePerformance} from '../../../dist/vehicle-upgrades.js';
import {routePointAtDistance,routeDistanceAt,projectRoad,corridorContact,truckInRoad,ROUTE_LENGTH} from '../../../dist/road-layout.js';
import {roadGroundSurface,roadGroundGradient} from '../../../dist/driving-ground.js';
import {BIOME_DESTINATIONS} from '../../../dist/biome-travel.js';
const results=[];
function check(name,fn){try{const details=fn();results.push({name,passed:true,details});console.log('PASS',name,JSON.stringify(details??''));}catch(e){results.push({name,passed:false,error:e.stack});console.error('FAIL',name,e.stack);}}
const max={speed:3,handling:3,grip:3,fuel:3};
const point=(h,u,v)=>({x:h.x+Math.cos(h.heading)*u+Math.sin(h.heading)*v,z:h.z-Math.sin(h.heading)*u+Math.cos(h.heading)*v});
function corners(x,z,heading,w,l){const c=Math.cos(heading),s=Math.sin(heading);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[x+a*w/2*c+b*l/2*s,z-a*w/2*s+b*l/2*c]);}
function intersect(a,b){for(const p of [a,b])for(let i=0;i<4;i++){const q=p[(i+1)%4],e=p[i],ax=-(q[1]-e[1]),az=q[0]-e[0],aa=a.map(v=>v[0]*ax+v[1]*az),bb=b.map(v=>v[0]*ax+v[1]*az);if(Math.max(...aa)<=Math.min(...bb)+1e-9||Math.max(...bb)<=Math.min(...aa)+1e-9)return false;}return true;}
check('1000 deterministic seeds preserve count, types, complete footprint exclusions and8m common bypass band',()=>{
 let samples=0,minProtected=Infinity,minCenterBand=Infinity,seenSides=new Set();
 const protectedDs=[0,routeDistanceAt(-23),ROUTE_LENGTH,...DELIVERY_CHECKPOINTS.map(c=>c.distance),...BIOME_DESTINATIONS.map(p=>routeDistanceAt(-p.z)),...BIOME_SEQUENCE.slice(1).map(b=>routeDistanceAt(b.from))];
 for(let seed=1;seed<=1000;seed++){
  const hs=buildRoadHazards(seed);assert.equal(hs.length,25);assert.equal(new Set(hs.map(h=>h.id)).size,25);assert.deepEqual(hs,buildRoadHazards(seed));seenSides.add(hs[0].bypassSide);
  for(const type of ['repair','log','dune','ice','rock'])assert.equal(hs.filter(h=>h.type===type).length,5);
  for(const h of hs){assert.ok(Object.isFrozen(h));let radius=Math.hypot(h.width,h.length)/2;for(const d of protectedDs){minProtected=Math.min(minProtected,Math.abs(h.distance-d)-radius);assert.ok(Math.abs(h.distance-d)-radius>=100,h.id);}
   const bandEdge=12-(Math.max(0,-h.bypassSide*h.offset+h.width/2)+1.55);if(h.type==='repair')minCenterBand=Math.min(minCenterBand,bandEdge);

   for(const along of [-h.length/2-4,0,h.length/2+4])for(const lane of [3.8,7.8,11.8]){const p=routePointAtDistance(h.distance+along),x=p.x+p.right.x*h.bypassSide*lane,z=p.z+p.right.z*h.bypassSide*lane;assert.ok(truckInRoad(x,z,p.heading));assert.equal(roadHazardContact(h,x,z,p.heading),undefined);samples++;}
  }
 }
 assert.equal(seenSides.size,2);return {seeds:1000,hazards:25000,poses:samples,minimumProtectedClearance:minProtected,minimumCityCenterBand:minCenterBand};
});
check('independent polygon projections agree with contacts for randomized rotated body and hazard footprints',()=>{
 let s=736291,n=0;const random=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);
 for(const h of buildRoadHazards(42).filter(h=>h.solid))for(let i=0;i<1800;i++){
  const x=h.x+(random()-.5)*20,z=h.z+(random()-.5)*20,heading=(random()-.5)*Math.PI*2;
  const hit=roadHazardContact(h,x,z,heading),expected=intersect(corners(x,z,heading,3.1,5.76),corners(h.x,h.z,h.heading,h.width,h.length));assert.equal(!!hit,expected,`${h.id} SAT mismatch`);
  if(hit){assert.ok(Math.abs(Math.hypot(hit.normalX,hit.normalZ)-1)<1e-12);assert.ok(hit.depth>0);const px=x+hit.normalX*(hit.depth+1e-6),pz=z+hit.normalZ*(hit.depth+1e-6);assert.equal(intersect(corners(px,pz,heading,3.1,5.76),corners(h.x,h.z,h.heading,h.width,h.length)),false);}
  n++;
 }return {poses:n};
});
check('600 stock/max ten-car D/R solid impacts cannot tunnel and retreat cleanly after contact',()=>{
 const rows=[];let steps=0,maxStep=0;const system=createRoadHazards(42);for(const r of system.rocks)r.phase='landed';
 const contact=(x,z,h)=>{const a=corridorContact(x,z,h),b=system.contact(x,z,h);return !a?b:!b?a:a.depth>b.depth?a:b;};
 for(const v of VEHICLE_CONFIG)for(const upgrades of [{},max])for(const h of system.hazards.filter(h=>h.solid))for(const gear of ['D','R']){
  const direction=gear==='D'?1:-1,p=point(h,0,direction*(h.length/2+5));
  const m=createDrivingModel({...p,heading:h.heading,vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>upgrades,contact,groundGradient:roadGroundGradient,groundSurface:(x,z,id)=>system.surfaceAt(x,z,roadGroundSurface(x,z,id))});
  m.setGear(gear);m.setInput({active:true});const speed=getVehiclePerformance(v.id,upgrades).maxSpeed*roadGroundSurface(p.x,p.z,v.id).speedFactor;Object.assign(m.state,{velocityX:-Math.sin(h.heading)*speed*direction,velocityZ:-Math.cos(h.heading)*speed*direction});
  let blocked=false;for(let i=0;i<90;i++){const before={...m.state};m.step(.05);steps++;blocked||=m.state.blocked;maxStep=Math.max(maxStep,Math.hypot(m.state.x-before.x,m.state.z-before.z));assert.equal(intersect(corners(m.state.x,m.state.z,m.state.heading,3.1,5.76),corners(h.x,h.z,h.heading,h.width,h.length)),false,`${v.id}/${h.id}/${gear}: penetration`);assert.ok(truckInRoad(m.state.x,m.state.z,m.state.heading));for(const k of ['x','z','heading','velocityX','velocityZ','angularVelocity'])assert.ok(Number.isFinite(m.state[k]));}
  assert.ok(blocked,`${v.id}/${h.id}/${gear} missed impact`);const stopped={...m.state};m.setGear(gear==='D'?'R':'D');let escapeFrames=0;while(Math.hypot(m.state.x-stopped.x,m.state.z-stopped.z)<=2&&escapeFrames++<160){m.step(.05);steps++;}
  assert.ok(Math.hypot(m.state.x-stopped.x,m.state.z-stopped.z)>2,`${v.id}/${h.id}/${gear}: stuck`);assert.equal(roadHazardContact(h,m.state.x,m.state.z,m.state.heading),undefined,`${v.id}/${h.id}/${gear}: lingering target blockage`);rows.push({car:v.id,max:!!upgrades.speed,type:h.type,gear});
 }
 return {cases:rows.length,frames:steps,maxStep};
});
check('surface patch semantics remain localized, continuous and reduce intended traction/speed across10cars',()=>{
 let cases=0;
 const system=createRoadHazards(42);
 for(const v of VEHICLE_CONFIG)for(const h of system.hazards.filter(h=>!h.solid)){
  const base=roadGroundSurface(h.x,h.z,v.id),serialized=JSON.stringify(base),center=system.surfaceAt(h.x,h.z,base);
  assert.equal(JSON.stringify(base),serialized);assert.notEqual(center,base);assert.ok(center.frictionFactor<base.frictionFactor);assert.ok(center.lateralDampingFactor<base.lateralDampingFactor);
  if(h.type==='dune'){assert.ok(center.speedFactor<base.speedFactor);assert.ok(center.rollingFactor>base.rollingFactor);assert.ok(center.engineFactor<base.engineFactor);}else assert.equal(center.speedFactor,base.speedFactor);
  for(const u of [-1,1]){const outer=point(h,u*(h.width/2+.001),0),edge=point(h,u*h.width/2,0),inner=point(h,u*(h.width/2-.001),0);assert.equal(system.surfaceAt(outer.x,outer.z,base),base);for(const key of ['frictionFactor','engineFactor','speedFactor'])assert.ok(Math.abs(system.surfaceAt(inner.x,inner.z,base)[key]-system.surfaceAt(edge.x,edge.z,base)[key])<1e-6);}
  cases++;
 }return {carPatchCases:cases};
});
check('rocks honor warning/fall clocks, inactive pause, overlap deferral, fixed-pool persistence and reset',()=>{
 let cases=0;
 for(const direction of [-1,1])for(const h of buildRoadHazards(42).filter(h=>h.type==='rock')){
  const s=createRoadHazards(42),r=s.rocks.find(r=>r.id===h.id),p=routePointAtDistance(h.distance-160*direction),player={x:p.x,z:p.z,heading:p.heading,velocityX:-Math.sin(p.heading)*10*direction,velocityZ:-Math.cos(p.heading)*10*direction};
  s.update(.05,player,true);assert.equal(r.phase,'warning');assert.ok(r.rockVisible&&r.shadowVisible);let snapshot=JSON.stringify(s.rocks);for(let i=0;i<50;i++)s.update(.1,player,false);assert.equal(JSON.stringify(s.rocks),snapshot);
  for(let i=0;i<89;i++)s.update(.05,player,true);assert.equal(r.phase,'warning');s.update(.051,player,true);assert.equal(r.phase,'falling');for(let i=0;i<23;i++)s.update(.05,player,true);assert.equal(r.phase,'falling');s.update(.051,player,true);assert.equal(r.phase,'landed');assert.ok(s.contact(h.x,h.z,h.heading));const ref=r;s.reset();assert.equal(r,ref);assert.equal(r.phase,'dormant');assert.equal(s.contact(h.x,h.z,h.heading),undefined);
  s.update(.05,player,true);Object.assign(player,{x:h.x,z:h.z,heading:h.heading,velocityX:0,velocityZ:0});for(let i=0;i<300;i++)s.update(.05,player,true);assert.equal(r.phase,'warning');assert.equal(r.deferred,true);assert.equal(s.contact(h.x,h.z,h.heading),undefined);
  const safe=point(h,-h.bypassSide*24,0);Object.assign(player,safe);for(let i=0;i<130;i++)s.update(.05,player,true);assert.equal(r.phase,'landed');cases++;
 }return {directionRockCases:cases};
});
fs.writeFileSync(new URL('./hazard-system-report.json',import.meta.url),JSON.stringify({rendererFree:true,passed:results.every(r=>r.passed),results},null,2));process.exitCode=results.every(r=>r.passed)?0:1;
