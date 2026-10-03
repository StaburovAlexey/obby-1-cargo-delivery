import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../dist/vendor/three.module.js';
import {createAppDom} from '../../../tests/fixtures/app-dom.mjs';
import {createRoadHazards,ROAD_HAZARD_RULES as R} from '../../../dist/road-hazards.js';
import {createRoadHazardsScene} from '../../../dist/road-hazards-scene.js';
import {routePointAtDistance} from '../../../dist/road-layout.js';
import {groundHeight} from '../../../dist/city-driving.js';
import {freshCareer} from '../../../dist/career-save.js';
import {VEHICLE_CONFIG} from '../../../dist/economy-config.js';
const results=[];
function check(name,fn){const apps=[];try{const detail=fn(opt=>{let a=createAppDom(opt);apps.push(a);return a});results.push({name,passed:true,detail});console.log('PASS',name,JSON.stringify(detail??''));}catch(e){results.push({name,passed:false,error:e.stack});console.error('FAIL',name,e.stack);}finally{apps.forEach(a=>a.dispose())}}
const snapshots=s=>JSON.stringify(s.rocks);
const pose=m=>Object.fromEntries(['x','z','heading','velocityX','velocityZ','angularVelocity','pathDistance'].map(k=>[k,m.state[k]]));
const career=()=>({...freshCareer(),money:100000,brains:10000,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)});
function arm(app){const d=app.debug;d.roadHazards.reset();const h=d.roadHazards.hazards.find(h=>h.type==='rock'),p=routePointAtDistance(h.distance-170);Object.assign(d.model.state,{x:p.x,z:p.z,heading:p.heading,velocityX:-Math.sin(p.heading)*10,velocityZ:-Math.cos(p.heading)*10});d.roadHazards.update(.05,d.model.state,true);d.roadHazardsScene.update(0);d.model.pause();assert.ok(d.roadHazards.rocks.some(r=>r.phase==='warning'));}
const advance=(a,n=1)=>{for(let i=0;i<n;i++)a.frame();};
check('production lifecycle freezes hazards/economy across all modal, focus and overview pauses without catch-up',make=>{
 const a=make({career:career()}),d=a.debug;let cases=0;
 for(const kind of ['biome','upgrade','hidden','blur','overview','pagehide']){
  arm(a);advance(a);if(kind==='biome')d.setBiomeMenu(true);if(kind==='upgrade')d.setUpgradeMenu(true);if(kind==='hidden'){a.doc.hidden=true;a.doc.dispatch('visibilitychange');}if(kind==='blur')a.win.dispatch('blur');if(kind==='overview')d.setDriving(false);if(kind==='pagehide')a.win.dispatch('pagehide');
  const initial=snapshots(d.roadHazards),car=pose(d.model),save=d.gameplay.snapshot(),fuels={...d.gameplay.state.fuels};advance(a,600);assert.equal(snapshots(d.roadHazards),initial,kind);assert.deepEqual(pose(d.model),car);assert.deepEqual(d.gameplay.snapshot(),save);assert.deepEqual(d.gameplay.state.fuels,fuels);
  if(kind==='biome')d.setBiomeMenu(false);if(kind==='upgrade')d.setUpgradeMenu(false);if(kind==='hidden'){a.doc.hidden=false;a.doc.dispatch('visibilitychange');}if(kind==='blur'||kind==='pagehide')a.win.dispatch('focus');if(kind==='overview')d.setDriving(true);
  advance(a);const prior=JSON.parse(initial),now=d.roadHazards.rocks;for(let i=0;i<now.length;i++)assert.ok(now[i].elapsed-prior[i].elapsed<=.05001,`${kind} catch-up`);cases++;
 }return{pauseCases:cases,frames:3606};
});
check('50 repeated biome travels reset rocks without fuel, cash, brain or cargo minting',make=>{
 const a=make({career:career()}),d=a.debug;let cases=0;
 for(const v of VEHICLE_CONFIG){d.returnToGarage();d.gameplay.state.cooldown=0;assert.ok(d.enterVehicle(v.id));d.gameplay.state.fuels[v.id]=17.32;const before=d.gameplay.snapshot();
  for(const biome of ['city','forest','desert','snow','volcanic']){arm(a);const fuels={...d.gameplay.state.fuels};d.setBiomeMenu(true);assert.ok(d.travelToBiome(biome));assert.ok(d.roadHazards.rocks.every(r=>r.phase==='dormant'&&!r.shadowVisible&&!r.rockVisible));assert.equal(d.roadHazardsScene.stats.visibleWarnings,0);assert.equal(d.roadHazardsScene.stats.visibleRocks,0);assert.deepEqual(d.gameplay.snapshot(),before);assert.deepEqual(d.gameplay.state.fuels,fuels);assert.equal(d.gameplay.state.run,null);assert.equal(d.gameplay.state.testMode,true);advance(a);assert.deepEqual(d.gameplay.snapshot(),before);assert.deepEqual(d.gameplay.state.fuels,fuels);cases++;}
 }
 return {switches:cases};
});
check('20 app rebuilds dispose every old hazard resource exactly once and retain one live pool',make=>{
 const a=make({startDriving:false,career:career()}),seen=[];let geometries=0,materials=0;
 for(let i=0;i<20;i++){const d=a.debug,visual=d.roadHazardsScene,g=new Set(),m=new Set();visual.group.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.material)m.add(o.material)});const counts=new Map();for(const r of [...g,...m]){counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));}const texture=[...m].find(m=>m.map)?.map;let textureDisposals=0;texture?.addEventListener('dispose',()=>textureDisposals++);d.rebuild(82+i);assert.equal(visual.stats.disposed,true);assert.equal(visual.group.children.length,0);visual.dispose();for(const n of counts.values())assert.equal(n,1);assert.equal(textureDisposals,0,'New world retains shared checker');assert.equal(a.debug.scene.children.filter(o=>o.name==='Low-poly road hazards').length,1);assert.equal(a.debug.roadHazards.hazards.length,25);geometries+=g.size;materials+=m.size;seen.push(counts);}
 return {rebuilds:20,geometries,materials};
});
check('warning mesh vertices and ground shadow stay visible in default cameras140–180m ahead in both travel directions',make=>{
 let cases=0,failures=[],extreme=-Infinity,minShadowClearance=Infinity;const projection=new THREE.Vector3(),world=new THREE.Vector3(),im=new THREE.Matrix4(),camP=new THREE.Vector3();
 for(const [width,height]of [[390,844],[1366,768],[501,320],[568,320],[667,375],[844,390]]){const a=make({width,height}),d=a.debug;
  for(const seed of [1,2,3,42,43,44,99,255,65535,4294967295]){const system=createRoadHazards(seed),visual=createRoadHazardsScene(THREE,{system});for(const s of system.rocks){s.phase='warning';s.shadowVisible=s.rockVisible=true;s.altitude=R.rockAltitude;}visual.update(0);visual.group.updateMatrixWorld(true);const rockMesh=visual.group.getObjectByName('Volcanic falling and landed rocks'),shadowMesh=visual.group.getObjectByName('Rock impact shadow');
   for(const [index,h]of system.hazards.filter(h=>h.type==='rock').entries())for(const distance of [140,160,180])for(const direction of [-1,1])for(const lane of [-8,0,8]){const p=routePointAtDistance(h.distance-distance*direction);Object.assign(d.model.state,{x:p.x+p.right.x*lane,z:p.z+p.right.z*lane,heading:p.heading+(direction<0?Math.PI:0)});d.applyTruckPose();d.followTruck(0,true);d.camera.updateMatrixWorld(true);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    rockMesh.getMatrixAt(index,im);for(let i=0;i<rockMesh.geometry.attributes.position.count;i++){world.fromBufferAttribute(rockMesh.geometry.attributes.position,i).applyMatrix4(im);projection.copy(world).project(d.camera);minX=Math.min(minX,projection.x);maxX=Math.max(maxX,projection.x);minY=Math.min(minY,projection.y);maxY=Math.max(maxY,projection.y);minZ=Math.min(minZ,projection.z);maxZ=Math.max(maxZ,projection.z);}extreme=Math.max(extreme,maxY);
    if(minY>=1||maxY>1||minX<-1||maxX>1||minZ<-1||maxZ>1)failures.push({seed,viewport:[width,height],id:h.id,distance,direction,lane,bounds:[minX,maxX,minY,maxY]});
    shadowMesh.getMatrixAt(index,im);
    if(height<=420&&width>=501){let sx0=Infinity,sx1=-Infinity,sy0=Infinity,sy1=-Infinity;for(let j=0;j<shadowMesh.geometry.attributes.position.count;j++){projection.fromBufferAttribute(shadowMesh.geometry.attributes.position,j).applyMatrix4(im).project(d.camera);sx0=Math.min(sx0,(projection.x+1)*width/2);sx1=Math.max(sx1,(projection.x+1)*width/2);sy0=Math.min(sy0,(1-projection.y)*height/2);sy1=Math.max(sy1,(1-projection.y)*height/2);}const bounds=[{x0:(minX+1)*width/2,x1:(maxX+1)*width/2,y0:(1-maxY)*height/2,y1:(1-minY)*height/2},{x0:sx0,x1:sx1,y0:sy0,y1:sy1}];for(const bottom of [0,21,34])for(const rect of [{x0:width/2-52,x1:width/2-4,y0:height-bottom-188,y1:height-bottom-140},{x0:width/2+4,x1:width/2+52,y0:height-bottom-188,y1:height-bottom-140},{x0:width/2-120,x1:width/2+120,y0:height-bottom-208,y1:height-bottom-194}])for(const b of bounds)assert.equal(b.x1>rect.x0&&b.x0<rect.x1&&b.y1>rect.y0&&b.y0<rect.y1,false,`${h.id}/${seed}/${width}x${height}/${direction}/${lane}/${distance}: HUD warning occlusion`);}
    world.set(0,0,0).applyMatrix4(im);projection.copy(world).project(d.camera);assert.ok(Math.abs(projection.x)<1&&Math.abs(projection.y)<1&&Math.abs(projection.z)<1,`shadow clipped ${h.id}/${direction}`);
    // Analytic height-ray check, excluding the final inset to the warning plane.
    camP.copy(d.camera.position);for(let j=1;j<40;j++){const t=j/40,x=camP.x+(world.x-camP.x)*t,z=camP.z+(world.z-camP.z)*t,y=camP.y+(world.y-camP.y)*t;const clearance=y-groundHeight(x,z);minShadowClearance=Math.min(minShadowClearance,clearance);assert.ok(clearance>0,'Ground shadow occluded by road grade');}cases++;
   }visual.dispose();
  }
 }
 fs.writeFileSync(new URL('./warning-projection-cases.json',import.meta.url),JSON.stringify({cases,altitude:R.rockAltitude,extreme,minShadowClearance,failures},null,2));assert.equal(failures.length,0,`${failures.length} clipped warning mesh cases; first:${JSON.stringify(failures[0])}`);return {cases,altitude:R.rockAltitude,maxNdcY:extreme,minShadowClearance};
});
fs.writeFileSync(new URL('./hazard-app-renderer-report.json',import.meta.url),JSON.stringify({rendererFree:true,actualBrowser:false,passed:results.every(r=>r.passed),results},null,2));process.exitCode=results.every(r=>r.passed)?0:1;
