#!/usr/bin/env node
// Renderer-free executable contracts. Actual four-tire solver; no browser claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildRoadHazards, createRoadHazards, roadHazardContact, ROAD_HAZARD_RULES as R, ROAD_HAZARD_EXCLUSIONS } from '../dist/road-hazards.js';
import { BIOME_SEQUENCE, VEHICLE_CONFIG, DELIVERY_CHECKPOINTS } from '../dist/economy-config.js';
import { ROUTE, ROUTE_LENGTH, routePointAtDistance, routeDistanceAt, pointOnEdge, projectRoad, corridorContact, NETWORK_EDGES, pointInRoad, routePointAtProgress } from '../dist/route-network.js';
import { BIOME_DESTINATIONS } from '../dist/biome-travel.js';
import { biomeSurfaceAt, surfaceForBiome } from '../dist/biome-surfaces.js';
import { createDrivingModel, VEHICLE_DYNAMICS as P } from '../dist/driving-model.js';
const near = (a,b,e=1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a-b)<=e, `${a} != ${b} +/- ${e}`);
const ZERO={speed:0,handling:0,grip:0,fuel:0},FULL={speed:3,handling:3,grip:3,fuel:3};
let groups=0;
const check=(name,fn)=>{const details=fn();groups++;console.log(`PASS ${name}${details?`: ${JSON.stringify(details)}`:''}`);};
const at=(h,x,z)=>({x:h.x+Math.cos(h.heading)*x+Math.sin(h.heading)*z,z:h.z-Math.sin(h.heading)*x+Math.cos(h.heading)*z,heading:h.heading});
const corners=(x,z,heading,width,length)=>{const h={x,z,heading};return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>at(h,a*width/2,b*length/2));};
function overlaps(a,b){
  for(const polygon of [a,b])for(let i=0;i<4;i++){
    const p=polygon[i],q=polygon[(i+1)%4],ax=-(q.z-p.z),az=q.x-p.x;
    const pa=a.map(v=>v.x*ax+v.z*az),pb=b.map(v=>v.x*ax+v.z*az);
    if(Math.max(...pa)<=Math.min(...pb)+1e-8||Math.max(...pb)<=Math.min(...pa)+1e-8)return false;
  }
  return true;
}
const finite=s=>{for(const [key,value]of Object.entries(s))if(typeof value==='number')assert.ok(Number.isFinite(value),key);};
const tick=(system,seconds,player,active=true)=>{for(let i=0;i<Math.round(seconds*120);i++)system.update(1/120,player,active);};
const playerAt=(distance,sign=1,branch='main')=>{const p=routePointAtDistance(distance,{branch});return {...p,velocityX:-Math.sin(p.heading)*10*sign,velocityZ:-Math.cos(p.heading)*10*sign};};
const getRock=(s,h)=>s.rocks.find(r=>r.id===h.id);
function landRocks(system){for(const h of system.hazards.filter(h=>h.type==='rock')){const p=playerAt(h.distance-170,1,h.branch);system.update(.01,p,true);tick(system,7,p);assert.equal(getRock(system,h).phase,'landed');}}

check('256 seeds keep 68 frozen deterministic hazards in five varied patterns and both fork arms',()=>{
  const signatures=new Set();
  for(let seed=0;seed<256;seed++){
    const a=buildRoadHazards(seed);assert.ok(Object.isFrozen(a));assert.equal(a.length,R.count);assert.equal(new Set(a.map(h=>h.id)).size,a.length);
    assert.deepEqual(a,buildRoadHazards(seed));signatures.add(JSON.stringify(a));
    assert.deepEqual(BIOME_SEQUENCE.map(b=>a.filter(h=>h.biome===b.id).length),[12,12,16,12,16]);
    assert.equal(new Set(a.map(h=>h.pattern)).size,5);
    for(const [i,h]of a.entries()){
      assert.ok(Object.isFrozen(h));if(i)assert.ok(h.distance>=a[i-1].distance);
      for(const k of ['x','z','station','progress','distance','edgeDistance','width','length','height','offset','heading','groundHeight'])assert.ok(Number.isFinite(h[k]),k);
      near(routeDistanceAt(h.progress),h.distance);assert.equal(routePointAtDistance(h.distance,{branch:h.branch}).biome,h.biome);
      assert.ok(h.width>0&&h.width<8.5&&h.length<24&&h.height<3);if(h.type==='dune')assert.ok(h.height>=.12&&h.height<=.18);
      for(const e of ROAD_HAZARD_EXCLUSIONS)assert.ok(Math.abs(h.distance-e.distance)>=e.radius+Math.hypot(h.width,h.length)/2+1);
    }
    for(const e of NETWORK_EDGES.filter(e=>e.forkId))assert.ok(a.some(h=>h.edgeId===e.id));
    assert.ok(a.filter(h=>h.type==='log').every(h=>Math.abs(h.headingDelta)>=.2));
  }
  assert.equal(signatures.size,256);assert.deepEqual(buildRoadHazards('same'),buildRoadHazards('same'));assert.notDeepEqual(buildRoadHazards(42),buildRoadHazards(43));
  assert.throws(()=>{buildRoadHazards()[0].width=99;},TypeError);
  return {seeds:256,count:R.count,patterns:5,forkArms:8};
});

check('Actual footprint perimeters respect arc exclusions, graph width and every actual service stop',()=>{
  const protectedPoints=[...DELIVERY_CHECKPOINTS.map(p=>p.distance),...BIOME_DESTINATIONS.map(p=>routeDistanceAt(p.progress)),...BIOME_SEQUENCE.slice(1).map(p=>routeDistanceAt(p.from)),0,ROUTE_LENGTH];
  let minimumArcGap=Infinity,minimumRoadGap=Infinity;
  for(const seed of [0,1,17,42,2026,2027,4294967295])for(const h of buildRoadHazards(seed)){
    const points=corners(h.x,h.z,h.heading,h.width,h.length);
    for(let i=0;i<4;i++)for(let j=0;j<=16;j++){
      const a=points[i],b=points[(i+1)%4],p={x:a.x+(b.x-a.x)*j/16,z:a.z+(b.z-a.z)*j/16},projection=projectRoad(p.x,p.z,h);
      const roadGap=15-Math.abs(projection.offset);minimumRoadGap=Math.min(minimumRoadGap,roadGap);assert.ok(roadGap>.5);assert.ok(pointInRoad(p.x,p.z,.4));
      for(const distance of protectedPoints){const gap=Math.abs(projection.distance-distance);minimumArcGap=Math.min(minimumArcGap,gap);assert.ok(gap>=100);}
    }
  }
  return {minimumArcGap,minimumRoadGap,protectedServiceStops:protectedPoints.length};
});

check('An 8m-wide vehicle-center bypass stays clear across all branches and all five biomes',()=>{
  let samples=0;
  for(const seed of [0,42]){
    const system=createRoadHazards(seed);landRocks(system);
    for(const edge of NETWORK_EDGES)for(let distance=5;distance<edge.length-5;distance+=4){
      const p=pointOnEdge(edge.id,distance);
      for(const offset of [-4,-2,0,2,4]){
        const x=p.x+p.right.x*offset,z=p.z+p.right.z*offset;
        assert.equal(system.contact(x,z,p.heading),undefined,`Bypass contact ${seed}/${edge.id}/${distance}/${offset}`);
        assert.equal(corridorContact(x,z,p.heading),undefined,`Road envelope ${seed}/${edge.id}/${distance}/${offset}`);
        const base=surfaceForBiome(p.biome);assert.equal(system.surfaceAt(x,z,base),base,'Bypass preserves exact road surface');samples++;
      }
    }
  }
  return {samples,clearCenterBandMetres:8,bodyWidth:R.bodyWidth,bodyLength:R.bodyLength};
});

check('OBB contacts agree with independent polygon SAT and never collide with empty AABB corners',()=>{
  let comparisons=0,emptyAabb=0;
  for(const seed of [0,1,42])for(const h of buildRoadHazards(seed).filter(h=>h.solid)){
    const obstacle=corners(h.x,h.z,h.heading,h.width,h.length);
    for(let i=0;i<180;i++){
      const heading=h.heading+(i%13-6)*.231,p=at(h,Math.sin(i*2.31)*9,Math.cos(i*1.77)*8),body=corners(p.x,p.z,heading,R.bodyWidth,R.bodyLength);
      const expected=overlaps(obstacle,body),hit=roadHazardContact(h,p.x,p.z,heading);
      assert.equal(!!hit,expected);comparisons++;
      if(hit){near(Math.hypot(hit.normalX,hit.normalZ),1);assert.ok(hit.depth>0);assert.equal(roadHazardContact(h,p.x+hit.normalX*(hit.depth+1e-6),p.z+hit.normalZ*(hit.depth+1e-6),heading),undefined);}
      const bounds=a=>({minX:Math.min(...a.map(p=>p.x)),maxX:Math.max(...a.map(p=>p.x)),minZ:Math.min(...a.map(p=>p.z)),maxZ:Math.max(...a.map(p=>p.z))});
      const a=bounds(obstacle),b=bounds(body);if(!expected&&a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ)emptyAabb++;
    }
  }
  assert.ok(emptyAabb>100);return {comparisons,emptyAabbCornersRejected:emptyAabb};
});

check('Soft patches preserve full base profiles, blend over 2.5m and leave all other asphalt untouched',()=>{
  const s=createRoadHazards(42);let profiles=0;
  for(const h of s.hazards.filter(h=>h.edgeBlend))for(const car of VEHICLE_CONFIG){
    const base={...surfaceForBiome(h.biome,car.id),specialUnchanged:17,detail:{tag:'retained'},fuelFactor:.777};
    const full=s.surfaceAt(h.x,h.z,base);assert.equal(full.id,base.id);assert.equal(full.detail,base.detail);assert.equal(full.specialUnchanged,17);assert.equal(full.fuelFactor,.777);
    assert.deepEqual(Object.keys(full).sort(),Object.keys(base).sort());assert.deepEqual(base,{...surfaceForBiome(h.biome,car.id),specialUnchanged:17,detail:{tag:'retained'},fuelFactor:.777});
    if(h.type==='dune'){near(full.speedFactor,base.speedFactor*.8);near(full.rollingFactor,base.rollingFactor*1.28);assert.ok(full.engineFactor<base.engineFactor);}
    else{near(full.frictionFactor,base.frictionFactor*.62);near(full.lateralDampingFactor,base.lateralDampingFactor*.5);near(full.speedFactor,base.speedFactor);}
    let last=base.frictionFactor;
    for(let i=0;i<=100;i++){const p=at(h,h.width/2-i*.025,0),surface=s.surfaceAt(p.x,p.z,base);assert.ok(surface.frictionFactor<=last+1e-12);last=surface.frictionFactor;}
    near(last,full.frictionFactor);
    for(const [x,z]of [[h.width/2+1e-6,0],[-h.width/2-1e-6,0],[0,h.length/2+1e-6],[0,-h.length/2-1e-6]]){const p=at(h,x,z);assert.equal(s.surfaceAt(p.x,p.z,base),base);}
    for(const side of [-1,1])for(const edge of [h.width/2,h.width/2-2.5]){const a=at(h,side*(edge-1e-5),0),b=at(h,side*(edge+1e-5),0);near(s.surfaceAt(a.x,a.z,base).frictionFactor,s.surfaceAt(b.x,b.z,base).frictionFactor,1e-8);}
    profiles++;
  }
  assert.equal(s.surfaceAt(NaN,0,null),null);return {profiles,edgeBlendMetres:2.5};
});

check('200 stock/max car-biome D/R solid-fixture impacts slow through normal impulses and all can reverse away',()=>{
  const system=createRoadHazards(42);landRocks(system);let cases=0,maxStep=0;
  for(const v of VEHICLE_CONFIG)for(const biome of BIOME_SEQUENCE)for(const upgrades of [ZERO,FULL])for(const gear of ['D','R']){
    const h=system.hazards.find(h=>h.biome===biome.id&&h.solid)||system.hazards[0],sign=gear==='D'?1:-1;
    const start=at(h,0,sign*(h.length/2+P.halfLength+.8)),base=surfaceForBiome(biome.id,v.id);
    const m=createDrivingModel({...start,vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>upgrades,groundSurface:()=>base,contact:system.contact});
    m.setGear(gear);m.setInput({active:true});const speed=Math.min(3,v.maxSpeed*base.speedFactor);
    m.state.velocityX=-Math.sin(h.heading)*speed*sign;m.state.velocityZ=-Math.cos(h.heading)*speed*sign;
    let blocked=false;
    for(let i=0;i<360;i++){
      const old={...m.state};m.step(P.fixedStep);finite(m.state);blocked ||= m.state.blocked;
      const step=Math.hypot(m.state.x-old.x,m.state.z-old.z);maxStep=Math.max(maxStep,step);assert.ok(step<.1,'No forced teleport');assert.equal(system.contact(m.state.x,m.state.z,m.state.heading),undefined);
    }
    assert.ok(blocked,`${v.id}/${biome.id}/${gear} must reach block`);assert.ok(Math.abs(m.state.speed)<.015,'Normal impulse removes impact velocity');
    const stopped={...m.state};m.setGear(gear==='D'?'R':'D');
    for(let i=0;i<960;i++){m.step(P.fixedStep);finite(m.state);assert.equal(system.contact(m.state.x,m.state.z,m.state.heading),undefined);}
    assert.ok(Math.hypot(m.state.x-stopped.x,m.state.z-stopped.z)>4,`${v.id}/${biome.id} can retreat`);cases++;
  }
  return {cases,maximumFixedStepMetres:maxStep};
});

check('All 80 stock/max dune-and-ice D/R crossings leave the patch and regain their exact base surface',()=>{
  const system=createRoadHazards(42);let cases=0;
  for(const type of ['dune','ice'])for(const v of VEHICLE_CONFIG)for(const upgrades of [ZERO,FULL])for(const gear of ['D','R']){
    const h=system.hazards.find(h=>h.type===type&&h.pattern==='single'),sign=gear==='D'?1:-1,base=surfaceForBiome(h.biome,v.id),start=at(h,0,sign*(h.length/2+3));
    const model=createDrivingModel({...start,vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>upgrades,groundSurface:(x,z)=>system.surfaceAt(x,z,base)});
    model.setGear(gear);model.setInput({active:true});let entered=false,exited=false;
    for(let i=0;i<7200;i++){
      model.step(P.fixedStep);finite(model.state);const surface=system.surfaceAt(model.state.x,model.state.z,base);
      if(surface!==base)entered=true;
      const dx=model.state.x-h.x,dz=model.state.z-h.z,along=Math.sin(h.heading)*dx+Math.cos(h.heading)*dz;
      if(entered&&-sign*along>h.length/2+8){assert.equal(surface,base);exited=true;break;}
    }
    assert.ok(entered&&exited,`${v.id}/${type}/${gear} safely exits`);assert.equal(Math.sign(model.state.speed),sign);assert.ok(Math.abs(model.state.speed)>1);cases++;
  }
  return {cases};
});

check('Swept solver stops both gears at thin logs even at 40m/s, without corner tunnelling',()=>{
  const system=createRoadHazards(42),h=system.hazards.find(h=>h.type==='log');let cases=0;
  for(const gear of ['D','R'])for(const angle of [0,.2,-.2]){
    const sign=gear==='D'?1:-1,heading=h.heading+angle,reach=P.halfLength*Math.abs(Math.cos(angle))+P.halfWidth*Math.abs(Math.sin(angle));
    const p=at(h,0,sign*(h.length/2+reach+.15)),m=createDrivingModel({...p,heading,maxSpeed:40,contact:system.contact});
    m.setGear(gear);m.state.velocityX=-Math.sin(h.heading)*40*sign;m.state.velocityZ=-Math.cos(h.heading)*40*sign;
    m.step(.1);finite(m.state);assert.equal(system.contact(m.state.x,m.state.z,m.state.heading),undefined);assert.ok(m.state.blocked);assert.ok(Math.abs(m.state.speed)<20);
    const dx=m.state.x-h.x,dz=m.state.z-h.z;assert.ok(sign*(Math.sin(h.heading)*dx+Math.cos(h.heading)*dz)>0);cases++;
  }
  return {cases,logThicknessMetres:h.length,sweepStepMetres:P.maxSweepDistance};
});

check('Rocks require a moving 160–180m approach, visible 4.5s warning, and persist only after a safe landing',()=>{
  const system=createRoadHazards(42),h=system.hazards.find(h=>h.type==='rock'),s=getRock(system,h);
  for(const distance of [h.distance-181,h.distance-159,h.distance-39,h.distance,h.distance+39]){system.reset();tick(system,10,playerAt(distance));assert.equal(s.phase,'dormant');}
  for(const sign of [-1,1])for(const ahead of [160,180]){system.reset();system.update(.01,playerAt(h.distance-sign*ahead,sign),true);assert.equal(s.phase,'warning',`Exact arming endpoint ${ahead}/${sign}`);}
  for(const sign of [-1,1])for(const ahead of [159.99,180.01]){system.reset();system.update(.01,playerAt(h.distance-sign*ahead,sign),true);assert.equal(s.phase,'dormant',`Outside arming endpoint ${ahead}/${sign}`);}
  system.reset();
  const player=playerAt(h.distance-160);tick(system,10,{...player,velocityX:0,velocityZ:0});assert.equal(s.phase,'dormant');
  system.update(.01,player,true);assert.equal(s.phase,'warning');assert.equal(s.rockVisible,true);assert.equal(s.shadowVisible,true);assert.equal(s.altitude,R.rockAltitude);
  tick(system,4.4,player);assert.equal(s.phase,'warning');assert.equal(system.contact(h.x,h.z,h.heading),undefined);
  const snapshot=JSON.stringify(system.rocks);tick(system,30,player,false);assert.equal(JSON.stringify(system.rocks),snapshot);
  tick(system,.2,player);assert.equal(s.phase,'falling');tick(system,1.3,player);assert.equal(s.phase,'landed');assert.ok(system.contact(h.x,h.z,h.heading));
  const landed=JSON.stringify(s);tick(system,60,player);assert.equal(JSON.stringify(s),landed);
  system.reset();assert.equal(s.phase,'dormant');assert.equal(s.rockVisible,false);assert.equal(s.shadowVisible,false);assert.equal(system.contact(h.x,h.z,h.heading),undefined);
  system.update(.01,playerAt(h.distance+160,-1),true);assert.equal(s.phase,'warning','Reverse route approach has the same fair warning');
  return {warningSeconds:s.warningSeconds,fallSeconds:s.fallSeconds,rocks:system.rocks.length};
});

check('Rock warning and falling both defer overlap, freeze on pause, clamp delayed frames and reset in place',()=>{
  const system=createRoadHazards(42),h=system.hazards.find(h=>h.type==='rock'),s=getRock(system,h),player=playerAt(h.distance-160),pool=system.rocks;
  system.update(.01,player,true);const overlapped={x:h.x,z:h.z,heading:h.heading,velocityX:0,velocityZ:0};
  tick(system,20,overlapped);assert.equal(s.phase,'warning');assert.equal(s.deferred,true);assert.equal(s.elapsed,4.5);assert.equal(system.contact(h.x,h.z,h.heading),undefined);
  system.update(1/120,player,true);assert.equal(s.phase,'falling');tick(system,.7,player);tick(system,10,overlapped);assert.equal(s.phase,'falling');assert.equal(s.deferred,true);assert.ok(s.altitude>=R.rockAltitude*.49-.01);assert.equal(system.contact(h.x,h.z,h.heading),undefined);
  const old=JSON.stringify(s);tick(system,20,overlapped,false);assert.equal(JSON.stringify(s),old);
  tick(system,2,player);assert.equal(s.phase,'landed');
  system.reset();assert.equal(system.rocks,pool);for(const r of pool){assert.equal(r.phase,'dormant');assert.equal(r.elapsed,0);assert.equal(r.fallProgress,0);}
  system.update(.01,player,true);system.update(999,player,true);near(s.elapsed,.1);
  const huge={...player,velocityX:1e100,velocityZ:1e100};tick(system,5,huge);finite(s);
  const before=JSON.stringify(s);for(const dt of [NaN,Infinity,-1,0])system.update(dt,player,true);system.update(.1,{x:NaN,z:0,heading:0},true);assert.equal(JSON.stringify(s),before);
});

check('Runtime owns no timers, renderer, random emission, economy mutations or body movement',()=>{
  const source=fs.readFileSync(new URL('../dist/road-hazards.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/Math\.random|setInterval|setTimeout|Date\.|performance\.|localStorage|document\.|window\.|THREE\./);
  assert.doesNotMatch(source,/player\.(?:x|z|heading|velocityX|velocityZ)\s*=(?!=)/);
  const system=createRoadHazards(42),player=playerAt(4300),before=structuredClone(player);tick(system,10,player);assert.deepEqual(player,before);
  assert.equal(system.hazards.length,R.count);assert.equal(system.rocks.length,16);assert.ok(Object.isFrozen(system));
});
console.log(`\n${groups} road hazard groups passed. Offline Node/actual solver only; browser, WebGL, visual readability and Android are unverified.`);
