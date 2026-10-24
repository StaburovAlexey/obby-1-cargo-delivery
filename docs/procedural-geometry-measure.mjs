// CPU construction/accounting only: no renderer, browser or physics simulation.
// Run from the repository root with: node docs/procedural-geometry-measure.mjs
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCity} from '../dist/network-scene.js';
import {buildRoadPits,roadPitReservations} from '../dist/road-pits.js';
import {createRoadHazards} from '../dist/road-hazards.js';
import {createRoadHazardsScene} from '../dist/road-hazards-scene.js';
import {createCanyonScene} from '../dist/canyon-scene.js';
import {createGarageScene} from '../dist/garage-scene.js';

const seed=42,pits=buildRoadPits(seed),city=buildCity(THREE,{seed,roadPits:pits});
const canyon=createCanyonScene(THREE),garage=createGarageScene(THREE,city,{document:undefined});
const hazards=createRoadHazards(seed,{reservedIntervals:roadPitReservations(pits)});
const hazardScene=createRoadHazardsScene(THREE,{system:hazards});
const digest=arrays=>{
 const hash=createHash('sha256');
 for(const array of arrays)hash.update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));
 return hash.digest('hex');
};
function account(root){
 const rows=[];
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const geometry=mesh.geometry,source=mesh.userData.physicsGeometry||geometry.userData.physicsGeometry;
  const positions=source?.positions||geometry.attributes.position.array;
  const indices=source?.indices||geometry.index?.array||new Uint32Array(Array.from({length:positions.length/3},(_,i)=>i));
  // Normalize index storage so changing visual vertex counts cannot change
  // index width alone in otherwise identical canonical collision sources.
  const physicsHash=digest([positions,new Uint32Array(indices)]);
  rows.push({name:mesh.name,triangles:(geometry.index?.count||geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1),
   vertices:geometry.attributes.position.count,instances:mesh.isInstancedMesh?mesh.count:1,
   canonicalTriangles:indices.length/3,canonicalHash:physicsHash,
   ...(mesh.userData.physicsCliffEdges?{cliffEdges:mesh.userData.physicsCliffEdges.length/6,cliffEdgeHash:digest([mesh.userData.physicsCliffEdges])}:{}),
   ...(geometry.userData.hazards?{patchIds:geometry.userData.hazards.map(h=>h.id)}:{})});
 });
 return {triangles:rows.reduce((n,row)=>n+row.triangles,0),meshes:rows};
}
try{
 console.log(JSON.stringify({scope:'CPU geometry construction and immutable source accounting; no tests, renderer, device FPS or visual validation',seed,pits:pits.length,
  city:account(city.group),canyon:account(canyon.group),garage:account(garage.group),hazards:account(hazardScene.group)},null,2));
}finally{hazardScene.dispose();garage.dispose();canyon.dispose();city.dispose();}
