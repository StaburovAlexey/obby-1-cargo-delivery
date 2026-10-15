#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import * as N from '../dist/route-network.js';
import {buildCity,createRoadFootprintIndex,polygonIntersectionArea,clipBridgeSurfaces} from '../dist/network-scene.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {createVehicleRig} from '../dist/vehicle-rig.js';
const report={generatedAt:new Date().toISOString(),threeRevision:THREE.REVISION,scope:'Actual Three.js CPU triangles, source-shader inspection and vehicle-rig compatibility. No browser/WebGL/GPU/mobile/FPS verification.',checks:[]};
const check=(name,fn)=>{const t=performance.now();try{const detail=fn();report.checks.push({name,passed:true,milliseconds:Math.round(performance.now()-t),detail});console.log('PASS',name);}catch(e){report.checks.push({name,passed:false,error:e.stack});console.error('FAIL',name,e.message);}};
const near=(a,b,eps=1e-5)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=eps,`${a} vs ${b}, tolerance ${eps}`);
const city=buildCity(THREE,{seed:42});city.group.updateMatrixWorld(true);
const road=city.group.getObjectByName('Continuous 30m-wide road'),terrain=city.group.getObjectByName('Closed continuous terrain foundation'),homes=city.group.getObjectByName('Continuous storefront residences');
const getData=mesh=>({positions:mesh.geometry.attributes.position.array,indices:mesh.geometry.index.array});
function triangles(mesh){const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,result=[];for(let i=0;i<ix.count;i+=3)result.push([0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+k))));return result;}
const roadTriangles=triangles(road),groundTriangles=triangles(terrain);
const cutRoad=clipBridgeSurfaces(N.ROAD_MESH),cutGround=clipBridgeSurfaces(N.GROUND_MESH,{terrain:true});
check('Graph union has exact bridge cuts, opaque up-facing metric road and unchanged start',()=>{
 assert.ok(N.ROUTE_LENGTH>10000&&N.ROUTE_LENGTH<11000);assert.equal(city.stats.forks,4);assert.equal(city.stats.biomes,5);assert.equal(city.stats.roadWidth,30);assert.ok(city.stats.drawCalls<=10);
 assert.equal(road.geometry.index.count,cutRoad.indices.length);assert.equal(terrain.geometry.index.count,cutGround.indices.length);
 let samples=0,minNormalY=1,minArea=Infinity,maxHeightError=0;
 for(const mesh of [road,terrain]){const data=mesh===road?cutRoad:cutGround,p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
  for(let i=0;i<p.count;i++){near(p.getX(i),data.positions[i*3],.0005);near(p.getZ(i),data.positions[i*3+2],.0005);near(p.getY(i),data.positions[i*3+1]+N.ROAD_SURFACE_OFFSET,.000004);near(uv.getX(i),p.getX(i)/4,.0001);near(uv.getY(i),-p.getZ(i)/4,.0001);samples++;}
  for(const tri of mesh===road?roadTriangles:groundTriangles){const v=tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])),area=v.length()/2;minArea=Math.min(minArea,area);assert.ok(area>1e-9,`Degenerate surface area ${area}`);v.normalize();minNormalY=Math.min(minNormalY,v.y);assert.ok(v.y>.95,`Down-facing surface normal ${v.y}`);}
  assert.equal(mesh.material.side,THREE.FrontSide);assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.polygonOffset,false);
 }
 const spawn=N.routePointAtProgress(0),start=N.routePointAtProgress(N.ROUTE.start);near(spawn.x,0);near(spawn.z,6);near(start.z,23);
 return {samples,minNormalY,minArea,stats:city.stats};
});
check('Fifteen single-car bridges replace wide road and remove all terrain support',()=>{
 assert.equal(BRIDGES.length,15);assert.equal(city.stats.bridges,15);
 const p=road.geometry.attributes.roadProgress,a=road.geometry.attributes.roadAcross,ix=road.geometry.index;
 const gp=terrain.geometry.attributes.roadProgress,gi=terrain.geometry.index;let bridgeTriangles=0;
 for(const bridge of BRIDGES){
  let count=0,lo=Infinity,hi=-Infinity;
  for(let i=0;i<ix.count;i+=3){const ids=[0,1,2].map(j=>ix.getX(i+j)),q=ids.reduce((n,j)=>n+p.getX(j),0)/3;
   if(q<=bridge.from+1e-5||q>=bridge.to-1e-5)continue;
   for(const j of ids){assert.ok(Math.abs(a.getX(j)-bridge.offset)<=bridge.halfWidth+1e-5);lo=Math.min(lo,p.getX(j));hi=Math.max(hi,p.getX(j));}count++;
  }
  assert.ok(count>10);near(lo,bridge.from,.001);near(hi,bridge.to,.001);bridgeTriangles+=count;
  for(let i=0;i<gi.count;i+=3){const q=[0,1,2].reduce((n,j)=>n+gp.getX(gi.getX(i+j)),0)/3;assert.ok(q<=bridge.from+1e-5||q>=bridge.to-1e-5,'Terrain supports a bridge gap');}
  for(const direction of [-1,1]){const q=(direction<0?bridge.from:bridge.to)+direction*25;assert.ok(!BRIDGES.some(b=>q>b.from&&q<b.to));const approach=N.routePointAtProgress(q);assert.equal(approach.branch,'main');}
 }
 assert.ok(city.group.getObjectByName('Single-car bridge underdecks'));assert.ok(city.group.getObjectByName('Flat yellow bridge edge markings'));
 for(const f of city.features.filter(f=>f.type==='building'||f.type==='barrier'&&f.side))assert.ok(!BRIDGES.some(b=>f.progressFrom<b.to&&f.progressTo>b.from));
 return {bridges:BRIDGES.length,bridgeTriangles,widthMeters:5,spanMeters:24,guardrails:0,terrainTrianglesWithinGaps:0};
});
check('Road union has no self-overlap and terrain never covers asphalt',()=>{
 const index=createRoadFootprintIndex(getData(road));let checked=0,maxSelfOverlap=0,maxGroundOverlap=0;
 for(let i=0;i<index.triangles.length;i++){const a=index.triangles[i],refs=index.candidates(a.p);for(const b of refs){const j=b.id;if(j<=i)continue;const overlap=polygonIntersectionArea(a.p,b.p);maxSelfOverlap=Math.max(maxSelfOverlap,overlap);assert.ok(overlap<.002,`Road self-overlap ${overlap} at ${i}/${j}`);checked++;}}
 for(const tri of groundTriangles){const p=tri.map(v=>({x:v.x,z:v.z}));for(const r of index.candidates(p)){const overlap=polygonIntersectionArea(p,r.p);maxGroundOverlap=Math.max(maxGroundOverlap,overlap);assert.ok(overlap<.004,`Terrain overlaps asphalt ${overlap}`);}}
 return {roadTrianglePairs:checked,maxSelfOverlapSquareMeters:maxSelfOverlap,maxRoadGroundOverlapSquareMeters:maxGroundOverlap};
});
check('Every road/terrain boundary shares the same actual Float32 height with no riser or daylight',()=>{
 const collect=mesh=>{const p=mesh.geometry.attributes.position,m=new Map();for(let i=0;i<p.count;i++)m.set(`${p.getX(i)},${p.getZ(i)}`,p.getY(i));return m;};
 const r=collect(road),g=collect(terrain);let checked=0,maxSeam=0;
 for(const segment of N.ROAD_BOUNDARY_SEGMENTS)for(const p of [segment.a,segment.b]){
  if(BRIDGES.some(b=>p.progress>b.from-1e-6&&p.progress<b.to+1e-6))continue;
  const key=`${Math.fround(p.x)},${Math.fround(p.z)}`;assert.ok(r.has(key),`Road boundary vertex missing ${key}`);assert.ok(g.has(key),`Ground boundary vertex missing ${key}`);
  const seam=Math.abs(r.get(key)-g.get(key));maxSeam=Math.max(maxSeam,seam);near(seam,0,1e-8);checked++;
 }
 return {boundaryEndpoints:checked,maxVerticalSeamMeters:maxSeam};
});
check('Height queries agree with actual road triangles including curved grades and both branches',()=>{
 let samples=0,maxHeightError=0,maxNormalDifference=0;
 for(let i=0;i<roadTriangles.length;i+=3){const tri=roadTriangles[i],p=tri.reduce((n,v)=>n.add(v),new THREE.Vector3()).multiplyScalar(1/3),surface=N.getSurface(p.x,p.z);
  const normal=tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])).normalize(),heightError=Math.abs(surface.height+N.ROAD_SURFACE_OFFSET-p.y);maxHeightError=Math.max(maxHeightError,heightError);assert.ok(heightError<.0002,`Surface triangle height mismatch ${heightError}`);
  const normError=normal.distanceTo(new THREE.Vector3(surface.normal.x,surface.normal.y,surface.normal.z));maxNormalDifference=Math.max(maxNormalDifference,normError);assert.ok(normError<.002,`Surface normal mismatch ${normError}`);samples++;
 }
 return {samples,maxHeightError,maxNormalDifference};
});
check('Physical 18m city storefront rows share cuts outside bridge gaps and never overlap',()=>{
 const features=city.features.filter(f=>f.type==='building'),parts=homes.geometry.userData.parts,p=homes.geometry.attributes.position;assert.ok(features.length>200);assert.equal(parts.length,features.length);assert.equal(homes.geometry.index.count/3,features.length*12);
 const index=createRoadFootprintIndex(getData(road));let joins=0,maxOverlap=0,maxSeam=0,minFrontage=Infinity,maxFrontage=0;
 const footprints=new Map();
 for(const feature of features){const part=parts.find(p=>p.name===`Residence ${feature.index}`),unique=new Map();for(let i=part.start;i<part.start+part.count;i++)unique.set(`${p.getX(i)},${p.getZ(i)}`,{x:p.getX(i),z:p.getZ(i)});
  const footprint=feature.footprint.map(q=>({x:Math.fround(q.x),z:Math.fround(-q.y)}));footprints.set(feature.index,footprint);assert.equal(unique.size,4);assert.ok(!index.intersects(footprint,.001),`House ${feature.index} enters asphalt`);
  assert.ok(feature.frontage>17.8&&feature.frontage<18.2);near(feature.heightScale,2);near(feature.depth,7.5);minFrontage=Math.min(minFrontage,feature.frontage);maxFrontage=Math.max(maxFrontage,feature.frontage);
  for(const q of footprint){assert.ok(N.getSurface(q.x,q.z).height>feature.position[2]+.14,'House bottom must be buried');}
 }
 for(const side of [-1,1]){const row=features.filter(f=>f.side===side).sort((a,b)=>a.from-b.from);near(row[0].progressFrom,N.ROUTE.start);near(row.at(-1).progressTo,2000);
  for(let i=1;i<row.length;i++){if(row[i].progressFrom-row[i-1].progressTo>1e-5){assert.ok(BRIDGES.some(b=>b.from<row[i].progressFrom&&b.to>row[i-1].progressTo));continue;}const a=footprints.get(row[i-1].index),b=footprints.get(row[i].index);for(const [u,v] of [[a[3],b[0]],[a[2],b[1]]]){const seam=Math.hypot(u.x-v.x,u.z-v.z);maxSeam=Math.max(maxSeam,seam);near(seam,0,1e-8);}const overlap=polygonIntersectionArea(a,b);maxOverlap=Math.max(maxOverlap,overlap);assert.ok(overlap<.00001);joins++;}}
 let allPairs=0;for(let i=0;i<features.length;i++)for(let j=i+1;j<features.length;j++){
  const a=footprints.get(features[i].index),b=footprints.get(features[j].index),overlap=polygonIntersectionArea(a,b);maxOverlap=Math.max(maxOverlap,overlap);assert.ok(overlap<.00001,`Houses ${i}/${j} overlap`);allPairs++;
 }
 return {houses:features.length,joins,allPairs,maxSeam,maxOverlap,minFrontage,maxFrontage};
});
check('All massive biome envelopes clear actual asphalt including fork islands and rejoin mouths',()=>{
 const index=createRoadFootprintIndex(getData(road));let checked=0;for(const f of city.features.filter(f=>f.type==='barrier'&&f.side)){
  const p=f.footprint.map(q=>({x:Math.fround(q.x),z:Math.fround(-q.y)}));assert.ok(!index.intersects(p,.001),`Barrier ${f.index} ${f.biome} enters road`);assert.ok(f.top-f.bottom>=12);checked++;
 }
 for(const id of ['forest','desert','snow','volcanic'])assert.ok(city.features.some(f=>f.type==='barrier'&&f.biome===id&&f.branch==='alternate'));
 const bases=city.features.filter(f=>f.type==='barrier'&&f.side);let crossEdgePairs=0,maxBarrierOverlap=0;
 for(let i=0;i<bases.length;i++)for(let j=i+1;j<bases.length;j++){
  const a=bases[i],b=bases[j];if(a.edgeId===b.edgeId)continue;
  const area=polygonIntersectionArea(a.footprint.map(p=>({x:Math.fround(p.x),z:Math.fround(-p.y)})),b.footprint.map(p=>({x:Math.fround(p.x),z:Math.fround(-p.y)})));
  maxBarrierOverlap=Math.max(maxBarrierOverlap,area);assert.ok(area<.005,`Different fork rows overlap ${a.index}/${b.index}: ${area}`);crossEdgePairs++;
 }
 return {checked,crossEdgePairs,maxBarrierOverlap,omittedJunctionSections:city.stats.omittedJunctionSections};
});
check('Existing square/stud/storefront shader uses metric faces; graph paint uses explicit progress',()=>{
 for(const mesh of [road,terrain,homes,city.group.getObjectByName('Massive biome barriers')]){const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};mesh.material.onBeforeCompile(shader);
  if(mesh===road||mesh===terrain){assert.match(shader.vertexShader,mesh===terrain?/urRoadMeters=vec2\(abs\(roadAcross\),roadProgress\)/:/urRoadMeters=vec2\(roadAcross,roadProgress\)/);assert.match(shader.vertexShader,/urRoadDistance=roadDistance/);assert.doesNotMatch(shader.vertexShader,/urRoadMeters=vec2\(roadAcross,-position.z\)/);}else{assert.match(shader.vertexShader,/vec3 urMeters = urPrismMeters/);assert.match(shader.vertexShader,/vec3 urSize = urPrismSize/);assert.match(shader.vertexShader,/vec3 urFace = abs\(urPrismFace\)/);}
 }
 let metricEdges=0,maxMetricError=0;const p=homes.geometry.attributes.position,m=homes.geometry.attributes.urPrismMeters,face=homes.geometry.attributes.urPrismFace;
 for(let i=0;i<p.count;i+=4){if(Math.abs(face.getY(i))>.5)continue;const axis=Math.abs(face.getX(i))>.5?2:0;
  for(let j=0;j<4;j++){const a=i+j,b=i+(j+1)%4;if(Math.abs(p.getY(a)-p.getY(b))>1e-8)continue;const actual=Math.hypot(p.getX(a)-p.getX(b),p.getZ(a)-p.getZ(b)),metric=Math.abs(m.array[a*3+axis]-m.array[b*3+axis]);maxMetricError=Math.max(maxMetricError,Math.abs(actual-metric));assert.ok(Math.abs(actual-metric)<.0003);metricEdges++;}}
 return {metricEdges,maxMetricError,shaderCompilation:'Not run; source expansion only'};
});
check('City contains no legacy truck while independent contact rigs need no geometry',()=>{
 assert.equal(city.group.getObjectByName('Orange delivery truck'),undefined);assert.ok(!city.features.some(feature=>feature.type==='truck'));
 const stats={...city.stats},root=new THREE.Group(),rig=createVehicleRig(THREE,root);
 try{assert.equal(rig.wheels.length,4);rig.update({position:[0,0,6],quaternion:[0,0,0,1],steerAngle:.12,wheelSpin:2});
  assert.deepEqual(root.position.toArray(),[0,0,6]);assert.equal(root.children.length,0);
  for(const wheel of rig.wheels){assert.equal(wheel.parts,undefined);assert.equal(wheel.mesh,undefined);near(wheel.steerAngle,wheel.front?.12:0);near(wheel.wheelSpin,2);}
  rig.reset();assert.deepEqual(root.position.toArray(),[0,0,0]);assert.deepEqual(city.stats,stats);
 }finally{rig.dispose();}
 return {generatedVehicleMeshes:0,contactWheels:4};
});
city.dispose();report.passed=report.checks.every(c=>c.passed);fs.writeFileSync(new URL('../qa/network-scene/report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');process.exitCode=report.passed?0:1;
