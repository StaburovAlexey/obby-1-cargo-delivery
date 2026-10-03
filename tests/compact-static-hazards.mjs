#!/usr/bin/env node
// Renderer-free executable contracts. Actual four-tire solver; no browser claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {createRoadHazardsScene,ROAD_HAZARD_VISUALS} from '../dist/road-hazards-scene.js';
import { buildRoadHazards, createRoadHazards, roadHazardContact, ROAD_HAZARD_RULES as R, ROAD_HAZARD_EXCLUSIONS } from '../dist/road-hazards.js';
import { BIOME_SEQUENCE, VEHICLE_CONFIG, DELIVERY_CHECKPOINTS } from '../dist/economy-config.js';
import { ROUTE, ROUTE_LENGTH, routePointAtDistance, routeDistanceAt, pointOnEdge, projectRoad, corridorContact, NETWORK_EDGES, pointInRoad, routePointAtProgress,queryRoadSurface,ROAD_SURFACE_OFFSET } from '../dist/route-network.js';
import { BIOME_DESTINATIONS } from '../dist/biome-travel.js';
import { biomeSurfaceAt, surfaceForBiome } from '../dist/biome-surfaces.js';
import { createDrivingModel, VEHICLE_DYNAMICS as P } from '../dist/driving-model.js';
const near = (a,b,e=1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a-b)<=e, `${a} != ${b} +/- ${e}`);
const ZERO={speed:0,handling:0,grip:0,fuel:0},FULL={speed:10,handling:10,grip:10,fuel:10};
let groups=0;const checks=[];
const check=(name,fn)=>{const details=fn();groups++;checks.push({name,passed:true,...details});console.log(`PASS ${name}${details?`: ${JSON.stringify(details)}`:''}`);};
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

check('Static hazards leave a wide side corridor through every local approach',()=>{
 let bodySamples=0;
 for(const seed of [0,42,2026]){
  const system=createRoadHazards(seed),statics=system.hazards.filter(h=>!h.motion);
  for(const h of statics)for(let d=-20;d<=20;d+=2)for(const lane of [7,9,11]){
   const offset=h.offset>0?-lane:lane;
   const p=pointOnEdge(h.edgeId,h.edgeDistance+d),x=p.x+p.right.x*offset,z=p.z+p.right.z*offset;
   for(const other of statics.filter(o=>o.solid))assert.equal(roadHazardContact(other,x,z,p.heading),undefined,`${other.id} blocks ${h.id} side bypass`);
   const base=surfaceForBiome(h.biome);assert.equal(system.surfaceAt(x,z,base),base);bodySamples++;
  }
 }
 return {bodySamples,vehicleWidth:R.bodyWidth,vehicleLength:R.bodyLength,minimumFreeCorridorMetres:8};
});
check('All static render footprints equal their physics bounds and grounded basalt remains visible',()=>{
 const system=createRoadHazards(42),groundHeight=(x,z)=>queryRoadSurface(x,z).height+ROAD_SURFACE_OFFSET;
 const scene=createRoadHazardsScene(THREE,{system,groundHeight}),matrix=new THREE.Matrix4(),v=new THREE.Vector3();
 let solids=0,vertices=0,maximumDaylight=-Infinity,maximumBurial=0;
 try{
  const byType={repair:'Yellow black repair blocks',log:'Forest log bodies',rock:'Volcanic static basalt rocks'};
  for(const h of system.hazards.filter(h=>!h.motion&&h.solid)){
   const mesh=scene.group.getObjectByName(byType[h.type]),index=mesh.userData.hazardIds.indexOf(h.id);assert(index>=0);mesh.getMatrixAt(index,matrix);
   const p=mesh.geometry.attributes.position,local=[];
   for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i).applyMatrix4(matrix);const dx=v.x-h.x,dz=v.z-h.z;local.push({x:Math.cos(h.heading)*dx-Math.sin(h.heading)*dz,z:Math.sin(h.heading)*dx+Math.cos(h.heading)*dz});
    if(Math.abs(p.getY(i))<1e-6){const gap=v.y-groundHeight(v.x,v.z);maximumDaylight=Math.max(maximumDaylight,gap);maximumBurial=Math.max(maximumBurial,-gap);assert(gap<.001,`${h.id}: daylight ${gap}`);assert(gap>-.06,`${h.id}: burial ${gap}`);}vertices++;
   }
   near(Math.min(...local.map(p=>p.x)),-h.width/2,.002);near(Math.max(...local.map(p=>p.x)),h.width/2,.002);near(Math.min(...local.map(p=>p.z)),-h.length/2,.002);near(Math.max(...local.map(p=>p.z)),h.length/2,.002);assert(system.contact(h.x,h.z,h.heading));solids++;
  }
  assert.equal(solids,8);assert.equal(scene.stats.visibleRocks,4);assert.equal(scene.stats.visibleWarnings,0);assert(system.rocks.every(r=>r.phase==='landed'&&r.altitude===0&&!r.shadowVisible));
  assert.equal(ROAD_HAZARD_VISUALS.maximumHazards,112);assert.equal(ROAD_HAZARD_VISUALS.maximumRocks,24);
  assert.throws(()=>createRoadHazardsScene(THREE,{system:{hazards:Array(113).fill({}),rocks:[]}}),/capacity/);
  assert.throws(()=>createRoadHazardsScene(THREE,{system:{hazards:[],rocks:Array(25).fill({})}}),/capacity/);
  return {solids,vertices,maximumDaylight,maximumBurial,maximumHazards:112,maximumRocks:24};
 }finally{scene.dispose()}
});
const report={generatedAt:new Date().toISOString(),scope:'Offline production solver, independent polygon SAT and actual Three.js geometry. No browser, GPU, mobile or human-playtest claim.',checks,runtimeHashes:Object.fromEntries(['road-hazards.js','road-hazards-scene.js','driving-model.js'].map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL('../dist/'+f,import.meta.url))).digest('hex')]))};
fs.mkdirSync(new URL('../qa/compact-hazard-integration/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/compact-hazard-integration/static-contracts.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`${groups} compact static-hazard groups passed.`);
