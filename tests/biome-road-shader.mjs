#!/usr/bin/env node


import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { GRASS_CHECKER_TEXTURE,createGrassCheckerTextureData } from '../dist/square-stud-texture.js';
import { buildCity,clipBridgeSurfaces } from '../dist/network-scene.js';
import { BIOMES, ROUTE, ROAD_MESH, GROUND_MESH, ROAD_SURFACE_OFFSET, FORKS, routePointAtProgress } from '../dist/route-network.js';
import { BIOME_SURFACES, SURFACE_BOUNDS, SURFACE_TRANSITION_METERS, biomeSurfaceBlend } from '../dist/biome-surfaces.js';
import { createPaintedRoadMaterial, roadSurfaceAppearanceAt, ROAD_PAINT, roadPaintAt } from '../dist/road-material.js';
const near = (a,b,e=1e-9) => assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,`${a} != ${b}`);
const shaderOf = m => {const s={uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(s);return s;};
let checks=0;
function check(name,fn){const details=fn();checks++;console.log(`PASS ${name}${details?`: ${JSON.stringify(details)}`:''}`);}
const city=buildCity(THREE,{seed:42});
const cutRoad=clipBridgeSurfaces(ROAD_MESH),cutGround=clipBridgeSurfaces(GROUND_MESH,{terrain:true});
try{
 const road=city.group.getObjectByName('Continuous 30m-wide road'),terrain=city.group.getObjectByName('Closed continuous terrain foundation');
 check('Road and terrain render the canonical curved graph with exact narrow bridge cuts',()=>{
  for(const [mesh,data]of [[road,cutRoad],[terrain,cutGround]]){
   const p=mesh.geometry.attributes.position;assert.equal(p.count,data.positions.length/3);assert.deepEqual(Array.from(mesh.geometry.index.array),data.indices);
   for(let i=0;i<p.count;i++){near(p.getX(i),Math.fround(data.positions[i*3]),1e-6);near(p.getZ(i),Math.fround(data.positions[i*3+2]),1e-6);near(p.getY(i),data.positions[i*3+1]+ROAD_SURFACE_OFFSET,4e-6);}
  }
  assert.equal(city.stats.roadWidth,30);assert.equal(city.stats.roadUnion,true);assert.equal(city.stats.nonOverlappingGround,true);
 });
 check('One opaque standard road material uses five palettes and the exact shared LEGO tile without geometry layers',()=>{
  assert.ok(road.material.isMeshStandardMaterial);assert.ok(road.material.map?.isDataTexture);assert.equal(road.material.map,terrain.material.map);assert.equal(road.material.normalMap,null);
  assert.equal(road.material.bumpMap,null);assert.equal(road.material.displacementMap,null);assert.equal(road.material.color.getHex(),0xffffff);
  assert.equal(road.material.transparent,false);assert.equal(road.material.depthWrite,true);assert.equal(road.material.depthTest,true);assert.equal(road.material.polygonOffset,false);
  assert.equal(road.material.side,THREE.FrontSide);assert.equal(road.material.userData.biomeSurfaces.fringe,false);
  assert.equal(terrain.material.userData.biomeSurfaces.fringe,true);assert.ok(terrain.material.map?.isDataTexture);
  assert.equal(city.group.getObjectByName('Flush road markings'),undefined);
 });
 check('Exact v26 grass checker pixels, metric UVs and mip policy are reused in all five road colors',()=>{
  const t=road.material.map,expected=createGrassCheckerTextureData();
  assert.deepEqual(t.image.data,expected.data);assert.equal(t.image.width,128);assert.equal(t.image.height,128);
  assert.equal(t.colorSpace,THREE.SRGBColorSpace);assert.equal(t.wrapS,THREE.RepeatWrapping);assert.equal(t.wrapT,THREE.RepeatWrapping);
  assert.equal(t.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(t.magFilter,THREE.LinearFilter);assert.equal(t.generateMipmaps,true);assert.equal(t.anisotropy,4);
  assert.equal(GRASS_CHECKER_TEXTURE.studPitch,.4);assert.equal(GRASS_CHECKER_TEXTURE.studSize,.2);
  for(const mesh of[road,terrain]){const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;

   for(let i=0;i<p.count;i++){if(mesh===terrain&&(p.getY(i)<=-1.79||Math.abs(mesh.geometry.attributes.roadAcross.getX(i))>17.5))continue;
    near(uv.getX(i),p.getX(i)/4,1e-4);near(uv.getY(i),-p.getZ(i)/4,1e-4);}
  }
  assert.match(shaderOf(road.material).fragmentShader,/urRoadColor=urSurfaceColor\*urLegoPattern/);
  return {sharedTileBytes:t.image.data.length,addedGeometry:0};
 });
 check('Five logical biomes cover full road width with continuous linear-light palette blends',()=>{
  assert.deepEqual(BIOMES.map(b=>b.id),['city','forest','desert','snow','volcanic']);
  assert.deepEqual(Object.values(BIOME_SURFACES).map(s=>s.color),[0x72747a,0x99734e,0xe7bd63,0xddeef4,0x45434d]);
  for(const b of BIOMES){const s=roadSurfaceAppearanceAt(THREE,(b.from+b.to)/2);assert.equal(s.from,b.id);assert.equal(s.to,b.id);assert.equal(s.color.getHex(),BIOME_SURFACES[b.id].color);}
  for(const y of SURFACE_BOUNDS){const {from,to}=biomeSurfaceBlend(y),actual=roadSurfaceAppearanceAt(THREE,y),expected=new THREE.Color(BIOME_SURFACES[from].color).lerp(new THREE.Color(BIOME_SURFACES[to].color),.5);
    assert.deepEqual(actual.color.toArray(),expected.toArray());
    const a=roadSurfaceAppearanceAt(THREE,y-1e-6).color.toArray(),b=roadSurfaceAppearanceAt(THREE,y+1e-6).color.toArray();a.forEach((v,i)=>near(v,b[i],1e-7));}
  const source=shaderOf(road.material).fragmentShader;
  assert.match(source,/diffuseColor\.rgb=mix\(diffuseColor\.rgb,urRoadColor,urSurfaceMask\)/);
  assert.match(source,/float urSurfaceMask=1\.0/);
 });
 check('Actual road and fringe shader uniforms share the dynamic sampler bounds and cheap metric pattern',()=>{
  const a=shaderOf(road.material),b=shaderOf(terrain.material);
  assert.deepEqual(a.uniforms.urSurfaceColors.value.map(c=>c.toArray()),b.uniforms.urSurfaceColors.value.map(c=>c.toArray()));
  assert.equal(a.uniforms.urSurfaceDetails,undefined);assert.equal(b.uniforms.urSurfaceDetails,undefined);
  for(const s of [a,b]){
    assert.match(s.vertexShader,s===b?/urRoadMeters=vec2\(abs\(roadAcross\),roadProgress\)/:/urRoadMeters=vec2\(roadAcross,roadProgress\)/);
    assert.match(s.vertexShader,/urRoadDistance=roadDistance/);assert.match(s.vertexShader,/urRoadPaintMask=roadPaintMask/);
    assert.equal((s.vertexShader.match(/attribute float roadAcross/g)||[]).length,1);
    assert.equal(s.uniforms.urSurfaceColors.value.length,5);
    for(const [i,y]of SURFACE_BOUNDS.entries())assert.ok(s.fragmentShader.includes(`float urBiomeBlend${i}=smoothstep(${(y-SURFACE_TRANSITION_METERS/2).toFixed(1)},${(y+SURFACE_TRANSITION_METERS/2).toFixed(1)},urRoadMeters.y)`));
    assert.doesNotMatch(s.fragmentShader,/undefined|NaN|Infinity/);
    assert.match(s.fragmentShader,/fwidth\(urRoadMeters\)/);assert.match(s.fragmentShader,/urLegoPattern=sampledDiffuseColor\.rgb/);
    assert.doesNotMatch(s.fragmentShader,/urGrain|urRipple|urSlabCell/);
  }
  assert.notEqual(road.material.customProgramCacheKey(),terrain.material.customProgramCacheKey());
 });
 check('Road paint remains embedded; the pre-existing terrain fringe gets no paint and preserves outside terrain',()=>{
  const roadShader=shaderOf(road.material),fringeShader=shaderOf(terrain.material);
  assert.match(roadShader.fragmentShader,/float edge=/);assert.match(roadShader.fragmentShader,/float dash=/);
  assert.doesNotMatch(fringeShader.fragmentShader,/float edge=|float dash=/);
  assert.match(fringeShader.fragmentShader,/step\(abs\(urRoadMeters\.x\),17\.5\)/);
  assert.ok(fringeShader.fragmentShader.includes(`step(${ROUTE.start.toFixed(1)},urRoadMeters.y)`));
  assert.ok(fringeShader.fragmentShader.includes(`1.0-step(${ROUTE.end.toFixed(1)},urRoadMeters.y)`));
  assert.match(fringeShader.fragmentShader,/#include <map_fragment>/);assert.match(fringeShader.fragmentShader,/#include <color_fragment>/);
  assert.match(fringeShader.fragmentShader,/roughnessFactor=mix\(roughnessFactor,\.86,urSurfaceMask\)/);
  for(const [x,y,value]of [[14.88,100,true],[-14.88,100,true],[14.7,100,false],[0,ROAD_PAINT.dashStart+1,true],[0,ROAD_PAINT.dashStart+4,false]])assert.equal(roadPaintAt(x,y),value);
 });
 check('Graph attributes locate every curved road and terrain seam without world-Z biome assumptions',()=>{
  for(const mesh of [road,terrain]){
    const p=mesh.geometry.attributes.position,a=mesh.geometry.attributes.roadAcross;
    assert.ok(a);assert.equal(a.count,p.count);
    const data=mesh===road?cutRoad:cutGround;for(let i=0;i<p.count;i++){near(a.getX(i),data.across[i],1e-5);near(mesh.geometry.attributes.roadProgress.getX(i),data.progress[i],.0005);near(mesh.geometry.attributes.roadDistance.getX(i),data.distance[i],.0005);}
  }
  const p=terrain.geometry.attributes.position;let far=0,seam=0;
  for(let i=0;i<p.count;i++){const across=terrain.geometry.attributes.roadAcross.getX(i);if(Math.abs(across)>17.5)far++;else seam++;}
  assert.ok(far>1000&&seam>1000);
  return {existingTerrainVertices:p.count,seamVertices:seam,unchangedOutsideVertices:far};
 });
 check('Fork shoulders and median islands retain biome ground without an asphalt flood',()=>{
  const g=terrain.geometry,p=g.attributes.position,q=g.attributes.roadProgress,a=g.attributes.roadAcross,mask=g.attributes.roadFringeMask;
  let islandVertices=0,outerVertices=0,edgeVertices=0;
  for(let i=0;i<p.count;i++){
   const f=FORKS.find(f=>q.getX(i)>f.from+.001&&q.getX(i)<f.to-.001);if(!f)continue;
   if(mask.getX(i)===0){islandVertices++;continue;}
   const origin=routePointAtProgress(f.from),lateral=(p.getX(i)-origin.x)*origin.right.x+(p.getZ(i)-origin.z)*origin.right.z;
   if(Math.abs(lateral)>100){assert.ok(Math.abs(a.getX(i))>35,'Far fork shoulder must not receive asphalt');outerVertices++;}
   if(Math.abs(a.getX(i))>14.5&&Math.abs(a.getX(i))<15.5)edgeVertices++;
  }
  assert.ok(islandVertices>100&&outerVertices>100&&edgeVertices>100);
  assert.match(shaderOf(terrain.material).vertexShader,/urRoadMeters=vec2\(abs\(roadAcross\),roadProgress\)/);
  assert.match(shaderOf(terrain.material).fragmentShader,/\*clamp\(urRoadFringeMask,0\.0,1\.0\)/);
  return {islandVertices,outerVertices,edgeVertices,geometryAdded:0};
 });
 check('Independent road-material instances preserve legacy city-color override and deterministic shader setup',()=>{
  const m=createPaintedRoadMaterial(THREE,0x667788);try{const a=shaderOf(m),b=shaderOf(m);assert.equal(a.uniforms.urSurfaceColors.value[0].getHex(),0x667788);assert.equal(a.vertexShader,b.vertexShader);assert.equal(a.fragmentShader,b.fragmentShader);assert.equal(m.map,road.material.map);}finally{m.dispose();}
 });
}finally{city.dispose();}
console.log(`\n${checks} biome road material/geometry groups passed. Shader-source and CPU checks only, no WebGL/GPU claim.`);
