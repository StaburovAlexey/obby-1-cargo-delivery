#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import * as N from '../dist/route-network.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {buildCity} from '../dist/network-scene.js';
import {fitTruckToGround,groundHeight} from '../dist/city-driving.js';
import {roadGroundGradient,roadGroundSurface} from '../dist/driving-ground.js';
import {createGarageScene,CLASSROOM_DESKS,CLASSROOM_ENTRIES} from '../dist/garage-scene.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {VEHICLE_CONFIG,DELIVERY_CHECKPOINTS,ECONOMY_CONFIG} from '../dist/economy-config.js';
import {SKIN_CONFIG} from '../dist/progression-config.js';
import {FOLLOW_CAMERA,computeFollowOffset} from '../dist/follow-camera.js';
const dir=new URL('../qa/network-independent/',import.meta.url);fs.mkdirSync(dir,{recursive:true});
const runtimeFiles=['route-network.js','route-network-config.js','network-scene.js','city-driving.js','driving-ground.js','garage-scene.js','gameplay.js','economy-config.js','app.js','road-hazards.js','road-material.js','follow-camera.js','character-seat-pose.js','character-seat-calibration.js','vehicle-input.js'];
const hashes=()=>Object.fromEntries(runtimeFiles.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(new URL('../dist/'+name,import.meta.url))).digest('hex')]));
const report={generatedAt:new Date().toISOString(),runtimeHashesAtStart:hashes(),scope:'Independent actual Float32 triangle geometry and real app code under mock DOM/renderer. No browser, WebGL, GPU or Android verification.',checks:[]};
const check=(name,fn)=>{const start=performance.now();try{const details=fn();report.checks.push({name,passed:true,milliseconds:Math.round(performance.now()-start),details});console.log('PASS',name,JSON.stringify(details));}catch(error){report.checks.push({name,passed:false,milliseconds:Math.round(performance.now()-start),error:error.stack});console.error('FAIL',name,error.message);}};
const near=(a,b,tol=1e-7,msg='')=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol,`${msg}: ${a} vs ${b} (tol ${tol})`);
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.z-a.z*b.x;},0)/2;
function clipArea(p,q){p=p.map(v=>({...v}));if(area(q)<0)q=[...q].reverse();for(let i=0;i<q.length&&p.length;i++){const a=q[i],b=q[(i+1)%q.length],old=p;p=[];for(let j=0;j<old.length;j++){const u=old[j],v=old[(j+1)%old.length],du=cross(a,b,u),dv=cross(a,b,v);if(du>=0)p.push(u);if((du>=0)!==(dv>=0)){const t=du/(du-dv);p.push({x:u.x+(v.x-u.x)*t,z:u.z+(v.z-u.z)*t});}}}return p.length>=3?Math.abs(area(p)):0;}
function bounds(v){return {minX:Math.min(...v.map(p=>p.x)),maxX:Math.max(...v.map(p=>p.x)),minZ:Math.min(...v.map(p=>p.z)),maxZ:Math.max(...v.map(p=>p.z))};}
const overlap=(a,b)=>a.minX<=b.maxX&&b.minX<=a.maxX&&a.minZ<=b.maxZ&&b.minZ<=a.maxZ;
function meshIndex(mesh){
 const a=mesh.geometry.attributes.position,ix=mesh.geometry.index,triangles=[],bins=new Map(),cell=24;
 for(let i=0;i<ix.count;i+=3){const v=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(a,ix.getX(i+j)).applyMatrix4(mesh.matrixWorld)),b=bounds(v),normal=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize(),tri={v,b,normal,index:i/3};triangles.push(tri);for(let x=Math.floor(b.minX/cell);x<=Math.floor(b.maxX/cell);x++)for(let z=Math.floor(b.minZ/cell);z<=Math.floor(b.maxZ/cell);z++){const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(tri);}}
 const at=(x,z)=>{for(const tri of bins.get(`${Math.floor(x/cell)},${Math.floor(z/cell)}`)||[]){const[a,b,c]=tri.v,ar=cross(a,b,c),p={x,z},u=cross(p,b,c)/ar,v=cross(a,p,c)/ar,w=1-u-v;if(u>=-1e-9&&v>=-1e-9&&w>=-1e-9)return {...tri,height:u*a.y+v*b.y+w*c.y};}return null;};
 const candidates=p=>{const b=bounds(p),found=new Set();for(let x=Math.floor(b.minX/cell);x<=Math.floor(b.maxX/cell);x++)for(let z=Math.floor(b.minZ/cell);z<=Math.floor(b.maxZ/cell);z++)for(const triangle of bins.get(`${x},${z}`)||[])found.add(triangle);return [...found];};
 return{triangles,at,candidates};
}
const city=buildCity(THREE,{seed:42});city.group.updateMatrixWorld(true);
const road=meshIndex(city.group.getObjectByName('Continuous 30m-wide road')),terrain=meshIndex(city.group.getObjectByName('Closed continuous terrain foundation'));
check('Actual rendered road and terrain have continuous shared support and exact gradients',()=>{
 let samples=0,maxHeight=0,maxNormal=0;
 for(const [kind,index]of [['road',road],['terrain',terrain]])for(let i=0;i<index.triangles.length;i+=2){const tri=index.triangles[i];for(const w of [[.21,.31,.48],[.51,.18,.31]]){const p=tri.v.reduce((s,v,j)=>s.addScaledVector(v,w[j]),new THREE.Vector3()),hit=index.at(p.x,p.z);assert.ok(hit,`${kind} triangle ${i} not found`);const s=N.getSurface(p.x,p.z),g=roadGroundGradient(p.x,p.z),heightError=Math.abs(groundHeight(p.x,p.z)-p.y),nError=new THREE.Vector3(s.normal.x,s.normal.y,s.normal.z).distanceTo(tri.normal);maxHeight=Math.max(maxHeight,heightError);maxNormal=Math.max(maxNormal,nError);assert.ok(heightError<.0001,`${kind} triangle ${i} height ${heightError}`);assert.ok(nError<.002,`${kind} normal ${nError}`);near(g.x,-tri.normal.x/tri.normal.y,.002);near(g.z,-tri.normal.z/tri.normal.y,.002);assert.ok(tri.normal.y>.95);samples++;}}


 let seams=0,maxStep=0;
 for(const s of N.ROAD_BOUNDARY_SEGMENTS){const q=N.projectRoad((s.a.x+s.b.x)/2,(s.a.z+s.b.z)/2);if(q.progress<N.ROUTE.start+.1||q.progress>N.ROUTE.end-.1||BRIDGES.some(b=>q.progress>=b.from&&q.progress<=b.to))continue;const x=(s.a.x+s.b.x)/2,z=(s.a.z+s.b.z)/2,e=.0005,a=road.at(x+s.normalX*e,z+s.normalZ*e),b=terrain.at(x-s.normalX*e,z-s.normalZ*e);assert.ok(a,`Missing rendered road at ${x},${z}`);assert.ok(b,`Missing rendered terrain at ${x},${z}`);const step=Math.abs(a.height-b.height);maxStep=Math.max(maxStep,step);assert.ok(step<.0002,`Road-ground seam step ${step}`);seams++;}
 return{samples,seams,maxHeightError:maxHeight,maxNormalError:maxNormal,maxSeamStep:maxStep};
});
check('Independent concave-median footprint samples agree with full-body boundary contacts',()=>{
 let cases=0,detected=0,cornersOnlyWouldMiss=0;
 for(const f of N.FORKS)for(const tip of [f.splitOverlapEnd,f.mergeOverlapStart])for(const delta of [-4,-2,-1,0,1,2,4])for(const lateral of [-3,-1.5,0,1.5,3])for(const yaw of [-.65,-.3,0,.3,.65]){
  const q=tip+delta,a=N.routePointAtProgress(q),b=N.routePointAtProgress(q,{branch:'alternate'}),heading=N.routePointAtProgress(f.from).heading+yaw,x=(a.x+b.x)/2+a.right.x*lateral,z=(a.z+b.z)/2+a.right.z*lateral,c=Math.cos(heading),s=Math.sin(heading),corners=N.truckFootprint(x,z,heading);let hole=false;
  for(let i=0;i<=10&&!hole;i++)for(let j=0;j<=12;j++){const dx=(i/10*2-1)*N.TRUCK_HALF_WIDTH,dz=(j/12*2-1)*N.TRUCK_HALF_LENGTH;if(!road.at(x+dx*c+dz*s,z-dx*s+dz*c)){hole=true;break;}}
  const contact=N.corridorContact(x,z,heading,a);if(hole){assert.ok(contact,`Undetected median footprint ${f.id} q=${q} yaw=${yaw}`);detected++;if(corners.every(p=>road.at(p.x,p.z)))cornersOnlyWouldMiss++;}if(contact){assert.ok(Number.isFinite(contact.depth)&&contact.depth>0);near(Math.hypot(contact.normalX,contact.normalZ),1,1e-8);}cases++;
 }
 assert.ok(cornersOnlyWouldMiss>=8);return{cases,detected,cornersOnlyWouldMiss};
});
check('Ground-fit tires and normals remain finite and supported on both arms and five curved grades',()=>{
 let fits=0,minClearance=Infinity,maxClearance=0,minUp=1,maxHeadingError=0;
 for(const edge of N.NETWORK_EDGES)for(let d=3;d<edge.length-3;d+=17.3)for(const lateral of [-10,0,10]){
  const p=N.pointOnEdge(edge.id,d),x=p.x+p.right.x*lateral,z=p.z+p.right.z*lateral;
  for(const direction of [0,Math.PI]){const heading=p.heading+direction,fit=fitTruckToGround(THREE,x,z,heading,p);assert.ok(fit.position.toArray().every(Number.isFinite));near(fit.quaternion.length(),1,1e-10);for(const c of fit.clearances){minClearance=Math.min(minClearance,c);maxClearance=Math.max(maxClearance,c);assert.ok(c>=.011999&&c<.045,`Tire clearance ${c} ${edge.id} ${d}`);}minUp=Math.min(minUp,fit.normal.y);assert.ok(fit.normal.y>.99);const forward=new THREE.Vector3(0,0,-1).applyQuaternion(fit.quaternion),actual=Math.atan2(-forward.x,-forward.z),error=Math.abs(Math.atan2(Math.sin(actual-heading),Math.cos(actual-heading)));maxHeadingError=Math.max(maxHeadingError,error);assert.ok(error<1e-9);fits++;}
 }
 return{fits,minClearance,maxClearance,minUp,maxHeadingError};
});
check('Actual scenic solids are closed, locally outward and clear of rendered asphalt',()=>{
 let prisms=0,sweeps=0,triangles=0,maxRoadOverlap=0;const defects=[];
 for(const name of ['Continuous storefront residences','Massive biome barriers']){
  const mesh=city.group.getObjectByName(name),a=mesh.geometry.attributes.position,ix=mesh.geometry.index;
  for(const part of mesh.geometry.userData.parts){
   const points=Array.from({length:part.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(a,part.start+i)),center=points.reduce((s,v)=>s.add(v),new THREE.Vector3()).multiplyScalar(1/points.length),edges=new Map(),n=part.sectionCount;
   // Sweeps can be globally concave. Outward orientation belongs to each
   // neighboring pair of cross-sections, not to the centroid of the whole row.
   const centers=part.continuous?Array.from({length:n},(_,i)=>[points[i*2],points[i*2+1],points[n*2+i*2],points[n*2+i*2+1]].reduce((v,p)=>v.add(p),new THREE.Vector3()).multiplyScalar(.25)):null;
   let signedVolume=0;
   for(let i=part.indexStart;i<part.indexStart+part.indexCount;i+=3){
    const v=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(a,ix.getX(i+j))),normal=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])),face=v.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/3);
    let localCenter=center;
    if(part.continuous){const quad=Math.floor((i-part.indexStart)/6),segment=quad<4*(n-1)?quad%(n-1):quad===4*(n-1)?0:n-2;localCenter=centers[segment].clone().add(centers[segment+1]).multiplyScalar(.5);}
    assert.ok(normal.length()>1e-7);assert.ok(normal.dot(face.sub(localCenter))>0,`Inward ${part.name}, triangle ${(i-part.indexStart)/3}`);signedVolume+=v[0].dot(v[1].clone().cross(v[2]))/6;
    for(let j=0;j<3;j++){const u=v[j].toArray().join(','),w=v[(j+1)%3].toArray().join(','),key=[u,w].sort().join('|');edges.set(key,(edges.get(key)||0)+1);}triangles++;
   }
   assert.ok(signedVolume>0,`Non-positive volume ${part.name}`);assert.ok([...edges.values()].every(n=>n===2),`Open/non-manifold ${part.name}`);
   const footprints=part.continuous?Array.from({length:n-1},(_,i)=>[points[i*2],points[n*2+i*2+1],points[n*2+(i+1)*2+1],points[(i+1)*2]]):[points.slice(16,20)];
   for(const footprint of footprints)for(const t of road.candidates(footprint)){
    const overlapArea=clipArea(footprint,t.v);maxRoadOverlap=Math.max(maxRoadOverlap,overlapArea);if(overlapArea>.003)defects.push({name:part.name,triangle:t.index,overlapArea});
   }
   if(part.continuous)sweeps++;else prisms++;
  }
 }
 assert.ok(sweeps>0);assert.equal(defects.length,0,JSON.stringify(defects.slice(0,5)));return{prisms,sweeps,triangles,maxRoadOverlap};
});
check('Separate barrier sections never overlap coplanar roof or floor Float32 faces',()=>{
 const mesh=city.group.getObjectByName('Massive biome barriers'),a=mesh.geometry.attributes.position,axes=mesh.geometry.attributes.urPrismFace,ix=mesh.geometry.index,faces=[],bins=new Map(),cell=24;
 for(const part of mesh.geometry.userData.parts){
  const feature=part.name.match(/^Biome barrier (\S+) (\d+) /);if(!feature)continue;
  for(let i=part.indexStart;i<part.indexStart+part.indexCount;i+=3){
   const ids=[0,1,2].map(j=>ix.getX(i+j)),direction=axes.getY(ids[0]);if(Math.abs(direction)<.5||!ids.every(id=>axes.getY(id)===direction))continue;
   const p=ids.map(id=>new THREE.Vector3().fromBufferAttribute(a,id)),normal=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize(),b=bounds(p),segment=part.continuous?Math.floor((i-part.indexStart)/6)%(part.sectionCount-1):null;
   const face={id:faces.length,name:part.name,feature:part.continuous?`${part.name}:section-${segment}`:`${feature[1]}-${feature[2]}`,side:direction>0?'roof':'floor',normal,plane:normal.dot(p[0]),p,b};faces.push(face);
   for(let x=Math.floor(b.minX/cell);x<=Math.floor(b.maxX/cell);x++)for(let z=Math.floor(b.minZ/cell);z<=Math.floor(b.maxZ/cell);z++){const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(face);}
  }
 }
 const overlaps=[];let tested=0,maxOverlap=0;
 for(const a of faces){const candidates=new Set();for(let x=Math.floor(a.b.minX/cell);x<=Math.floor(a.b.maxX/cell);x++)for(let z=Math.floor(a.b.minZ/cell);z<=Math.floor(a.b.maxZ/cell);z++)for(const b of bins.get(`${x},${z}`)||[])candidates.add(b);
  for(const b of candidates){if(b.id<=a.id||a.feature===b.feature||a.side!==b.side||!overlap(a.b,b.b))continue;
   if(Math.abs(a.normal.dot(b.normal))<1-1e-8||b.p.some(p=>Math.abs(a.normal.dot(p)-a.plane)>.0001))continue;
   const area=clipArea(a.p,b.p);tested++;maxOverlap=Math.max(maxOverlap,area);if(area>.005)overlaps.push({a:a.name,b:b.name,side:a.side,area});
  }
 }
 assert.ok(faces.length>1000,'all actual sweep roof/floor triangles are inspected');assert.ok(tested>0,'coplanar neighboring sweep sections were compared');
 fs.writeFileSync(new URL('barrier-coplanar-overlaps.json',dir),JSON.stringify(overlaps,null,2)+'\n');assert.equal(overlaps.length,0,`${overlaps.length} coplanar face overlaps: ${JSON.stringify(overlaps.slice(0,4))}`);return{faces:faces.length,tested,maxOverlap};
});
const garage=createGarageScene(THREE,city);garage.group.updateMatrixWorld(true);
check('All 22 checkpoint surfaces conform to rendered grades and preserve left/right physical gates',()=>{
 let vertices=0,triangles=0,minLift=Infinity,maxLift=0;assert.equal(garage.stations.length,11);assert.equal(garage.deliveries.length,11);
 for(const list of [garage.deliveries,garage.stations])for(const gate of list){const p=N.routePointAtDistance(gate.distance),dx=gate.x-p.x,dz=gate.z-p.z;near(dx*p.right.x+dz*p.right.z,gate.kind==='delivery'?-8:8);near(dx*p.tangent.x+dz*p.tangent.z,0);assert.ok(N.truckInRoad(gate.x,gate.z,p.heading,p));assert.ok(!N.FORKS.some(f=>p.progress>f.from&&p.progress<f.to));near(gate.reward,DELIVERY_CHECKPOINTS.find(g=>g.distance===gate.distance).reward);
  for(const mesh of gate.group.children.filter(x=>x.isMesh)){const index=meshIndex(mesh),a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){const v=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld),under=road.at(v.x,v.z);assert.ok(under,`Gate vertex leaves road ${gate.id}`);const lift=v.y-under.height;minLift=Math.min(minLift,lift);maxLift=Math.max(maxLift,lift);assert.ok(lift>.024&&lift<.046,`Gate lift ${lift}`);vertices++;}for(const tri of index.triangles){const v=tri.v.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/3),under=road.at(v.x,v.z);assert.ok(under);const lift=v.y-under.height;minLift=Math.min(minLift,lift);maxLift=Math.max(maxLift,lift);assert.ok(lift>.021&&lift<.05,`Gate triangle ${gate.id} lift ${lift}`);triangles++;}}
 }
 return{gates:22,vertices,triangles,minLift,maxLift};
});
check('Actual app preserves per-car graph context through every preview, garage return and rebuild',()=>{
 const career={...freshCareer(),money:7000,brains:123,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)},app=createAppDom({career,startDriving:false});let previews=0,entries=0;
 try{let d=app.debug;assert.equal(d.garage.vehicles.length,10);assert.equal(d.garage.desks.length,20);assert.equal(d.garage.stands.length,17);assert.equal(CLASSROOM_ENTRIES.length,5);assert.equal(SKIN_CONFIG.length,17);
  for(const spec of VEHICLE_CONFIG){d.gameplay.state.cooldown=0;assert.ok(d.enterVehicle(spec.id));entries++;for(const biome of ['volcanic','forest','snow','desert','city']){const selected=d.garage.vehicles.find(v=>v.id===spec.id),saved=d.gameplay.snapshot(),fork=N.FORKS[previews%N.FORKS.length],old=N.routePointAtProgress((fork.from+fork.to)/2,{branch:'alternate'});Object.assign(d.model.state,{x:old.x,z:old.z,heading:old.heading});selected.routeContext=old;d.model.state.routeContext=old;d.applyTruckPose();assert.equal(selected.routeContext.edgeId,fork.id+'-alternate');d.cameraState.lookBegin();d.cameraState.lookDelta(1.1,.1);d.cameraState.lookEnd();assert.ok(d.setBiomeMenu(true));assert.ok(d.travelToBiome(biome));const p=N.projectRoad(d.model.state.x,d.model.state.z);assert.equal(selected.routeContext.biome,biome);near(selected.routeContext.progress,p.progress,1e-6);assert.equal(d.model.state.routeContext,selected.routeContext);assert.equal(d.gameplay.state.testMode,true);assert.equal(d.gameplay.state.run,null);near(d.model.state.pathDistance,0);assert.deepEqual(d.gameplay.snapshot(),saved);assert.equal(d.model.state.gear,'D');assert.equal(d.input.state.active,false);assert.equal(d.biomeMenuOpen,false);for(const v of d.garage.vehicles.filter(v=>v!==selected)){near(v.model.state.x,v.park.x);near(v.model.state.z,v.park.z);assert.ok(v.routeContext.progress<0);assert.notEqual(v.routeContext,selected.routeContext);}d.followTruck(0,true);const expected=new THREE.Vector3(computeFollowOffset(d.cameraState.state).x,computeFollowOffset(d.cameraState.state).y,computeFollowOffset(d.cameraState.state).z).multiplyScalar(1.2),target=d.rig.root.position.clone().add(new THREE.Vector3(0,1.7,0));near(d.camera.position.distanceTo(target),FOLLOW_CAMERA.driving.radius*1.2,1e-7);assert.ok(d.camera.position.clone().sub(target).distanceTo(expected)<1e-7);for(let i=0;i<3;i++)app.frame();assert.deepEqual(d.gameplay.snapshot(),saved);previews++;}
   const saved=d.gameplay.snapshot();d.returnToGarage();assert.equal(d.gameplay.state.mode,'walking');for(const v of d.garage.vehicles){near(v.model.state.x,v.park.x);near(v.model.state.z,v.park.z);assert.ok(v.routeContext.progress<0);}assert.deepEqual(d.gameplay.snapshot(),saved);
  }
  const saved=d.gameplay.snapshot();d.rebuild(702);d=app.debug;assert.deepEqual(d.gameplay.snapshot(),saved);assert.equal(d.garage.vehicles.length,10);assert.equal(d.garage.desks.length,20);assert.equal(d.garage.stands.length,17);assert.equal(d.gameplay.state.mode,'walking');return{entries,previews,desks:20,skins:17,schools:5};
 }finally{app.dispose();}
});
check('Overview frames the complete actual road at six desktop and phone aspect ratios',()=>{
 const rows=[];
 for(const [width,height]of [[320,480],[320,844],[390,844],[568,320],[844,390],[1366,768]]){
  const app=createAppDom({width,height});try{app.views.find(v=>v.dataset.view==='overview').dispatch('click');app.frame(2100);const d=app.debug;assert.equal(d.playing,false);assert.equal(d.controls.enabled,true);assert.ok(d.camera.far>1800);assert.equal(d.scene.fog.far,d.camera.far);assert.ok(d.camera.position.distanceTo(d.controls.target)<=d.controls.maxDistance);


   d.camera.lookAt(d.controls.target);d.camera.updateMatrixWorld(true);const p=d.city.group.getObjectByName('Continuous 30m-wide road').geometry.attributes.position;let maxX=0,maxY=0,minZ=Infinity,maxZ=-Infinity,maxDepth=0;
   for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).project(d.camera);maxX=Math.max(maxX,Math.abs(v.x));maxY=Math.max(maxY,Math.abs(v.y));minZ=Math.min(minZ,v.z);maxZ=Math.max(maxZ,v.z);const world=new THREE.Vector3().fromBufferAttribute(p,i);maxDepth=Math.max(maxDepth,-world.applyMatrix4(d.camera.matrixWorldInverse).z);}
   rows.push({width,height,maxX,maxY,minZ,maxZ,maxDepth,near:d.camera.near,far:d.camera.far});assert.ok(maxX<=.98&&maxY<=.98,`Overview clips at ${width}×${height}: |NDC x|=${maxX}, |y|=${maxY}`);assert.ok(minZ>-1&&maxZ<1);assert.ok(maxDepth<d.scene.fog.near,'Overview road is hidden in distance fog');app.views.find(v=>v.dataset.view==='fuel').dispatch('click');app.frame(3200);near(d.camera.near,5);near(d.camera.far,18000);near(d.scene.fog.far,18000);d.setDriving(true);near(d.camera.near,.5);near(d.camera.far,1800);near(d.scene.fog.far,1600);assert.equal(d.controls.enabled,false);
  }finally{app.dispose();}
 }
 fs.writeFileSync(new URL('overview-viewports.json',dir),JSON.stringify(rows,null,2)+'\n');return{viewports:rows,scope:'Actual projection math using the real view targets; no browser rendering'};
});
check('Every preview blocks all delivery reward shortcuts and normal left/right gates remain one-shot',()=>{
 const app=createAppDom();let checks=0;
 try{const d=app.debug,g=d.gameplay;
  for(const biome of ['city','forest','desert','snow','volcanic']){assert.ok(d.setBiomeMenu(true));assert.ok(d.travelToBiome(biome));const saved=g.snapshot();for(const gate of d.garage.deliveries){g.drive(0,gate.x,gate.z);assert.deepEqual(g.snapshot(),saved);assert.equal(g.state.run,null);assert.equal(g.state.testMode,true);checks++;}}
  for(const gate of d.garage.deliveries){d.returnToGarage();g.state.cooldown=0;assert.ok(d.enterVehicle('pickup'));const money=g.state.money,runs=g.state.completedRuns;g.drive(0,gate.x,gate.z);assert.equal(g.state.money,money+gate.reward);assert.equal(g.state.completedRuns,runs+1);g.drive(0,gate.x,gate.z);assert.equal(g.state.money,money+gate.reward);assert.equal(g.state.completedRuns,runs+1);checks++;}
  return{checks};
 }finally{app.dispose();}
});
garage.dispose();city.dispose();report.runtimeHashesAtEnd=hashes();report.runtimeFilesChangedDuringRun=runtimeFiles.filter(name=>report.runtimeHashesAtStart[name]!==report.runtimeHashesAtEnd[name]);report.passed=report.checks.every(c=>c.passed)&&report.runtimeFilesChangedDuringRun.length===0;fs.writeFileSync(new URL('report.json',dir),JSON.stringify(report,null,2)+'\n');console.log(`${report.checks.filter(c=>c.passed).length}/${report.checks.length} independent groups passed.`);process.exitCode=report.passed?0:1;
