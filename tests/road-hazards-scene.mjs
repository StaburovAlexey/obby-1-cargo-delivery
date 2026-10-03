#!/usr/bin/env node
// Offline actual Three.js geometry, state and resource checks. No browser,
// WebGL shader execution, device screenshot, frame-time or mobile claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {createRoadHazards,ROAD_HAZARD_RULES} from '../dist/road-hazards.js';
import {createRoadHazardsScene,ROAD_HAZARD_VISUALS} from '../dist/road-hazards-scene.js';
import {queryRoadSurface,ROAD_SURFACE_OFFSET} from '../dist/route-network.js';
const groundHeight=(x,z)=>queryRoadSurface(x,z).height+ROAD_SURFACE_OFFSET;
import {routePointAtDistance} from '../dist/route-network.js';
import {CITY_SURFACE} from '../dist/biome-surfaces.js';
const near=(a,b,t=7e-4)=>assert.ok(Math.abs(a-b)<=t,`${a} differs from ${b} by ${Math.abs(a-b)}`);
const report={kind:'Offline actual Three.js road-hazard visual checks',limitations:'No browser, WebGL shader compilation, GPU performance or Android validation.',checks:[]};
function check(name,fn){fn();report.checks.push({name,passed:true});console.log(`PASS ${name}`);}
const system=createRoadHazards(42),visual=createRoadHazardsScene(THREE,{system,groundHeight});
const meshNamed=name=>visual.group.getObjectByName(name);
const instanceVertices=(mesh,i)=>{const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);return Array.from({length:mesh.geometry.attributes.position.count},(_,j)=>new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,j).applyMatrix4(matrix));};
const local=(h,v)=>{const dx=v.x-h.x,dz=v.z-h.z,c=Math.cos(h.heading),s=Math.sin(h.heading);return {x:c*dx-s*dz,z:s*dx+c*dz};};
function assertFootprint(h,vertices){const vv=vertices.map(v=>local(h,v));near(Math.min(...vv.map(v=>v.x)),-h.width/2);near(Math.max(...vv.map(v=>v.x)),h.width/2);near(Math.min(...vv.map(v=>v.z)),-h.length/2);near(Math.max(...vv.map(v=>v.z)),h.length/2);}
check('68 hazards use six bounded instanced pools and two merged patch meshes',()=>{
 assert.equal(system.hazards.length,68);
 const pools=visual.group.children.filter(m=>m.isInstancedMesh),merged=visual.group.children.filter(m=>m.isMesh&&!m.isInstancedMesh);
 assert.equal(pools.length,6);assert.equal(merged.length,2);assert.equal(new Set(visual.group.children.map(m=>m.geometry)).size,8);
 assert.equal(meshNamed('Yellow black repair blocks').count,12);assert.equal(meshNamed('Forest log bodies').count,12);assert.equal(meshNamed('Forest cut log ends').count,24);
 assert.equal(meshNamed('Volcanic falling and landed rocks').userData.capacity,16);
 assert.equal(meshNamed('Rock warning perimeter').userData.capacity,16);
 assert.equal(visual.stats.drawCalls,5);assert.ok(visual.stats.triangles<8000);
 assert.ok(!visual.group.userData.roadHazards.raisedStudGeometry);
 const repairMap=meshNamed('Yellow black repair blocks').material.map,sandMap=meshNamed('Road-conforming sand dunes').material.map;
 assert.equal(repairMap,sandMap);assert.equal(repairMap.image.width,128);assert.equal(repairMap.image.height,128);
 assert.equal(repairMap.userData.generatedLocally,true);assert.equal(visual.stats.sharedTextures,1);
 for(const mesh of pools){assert.ok(mesh.count<=mesh.userData.capacity);assert.equal(mesh.instanceMatrix.count,Math.max(1,mesh.userData.capacity));}
});
check('yellow repair faces have code-native black stripes and outward-facing normals',()=>{
 const g=meshNamed('Yellow black repair blocks').geometry,p=g.attributes.position,n=g.attributes.normal,colors=g.attributes.color;
 let black=0,yellow=0;
 for(let i=0;i<p.count;i++){if(colors.getX(i)<.1)black++;else yellow++;const outward=new THREE.Vector3(p.getX(i),p.getY(i)-.5,p.getZ(i)).dot(new THREE.Vector3().fromBufferAttribute(n,i));assert.ok(outward>.15);}
 assert.ok(black>20&&yellow>20);assert.ok(!g.userData.externalModel);
});
check('solid horizontal bounds match their exact OBBs and sit into the curved road',()=>{
 for(const name of ['Yellow black repair blocks','Forest log bodies']){
  const mesh=meshNamed(name);
  for(let i=0;i<mesh.count;i++){
   const h=system.hazards.find(h=>h.id===mesh.userData.hazardIds[i]),vertices=instanceVertices(mesh,i);assertFootprint(h,vertices);
   const base=mesh.geometry.attributes.position;
   for(let j=0;j<base.count;j++)if(Math.abs(base.getY(j))<1e-5){const v=vertices[j];assert.ok(v.y<=groundHeight(v.x,v.z)+3e-4,`${h.id}: daylight gap`);assert.ok(v.y>groundHeight(v.x,v.z)-.035,`${h.id}: excessive burial`);}
  }
 }
 const caps=meshNamed('Forest cut log ends');
 for(let i=0;i<caps.count;i++){const matrix=new THREE.Matrix4();caps.getMatrixAt(i,matrix);assert.ok(matrix.determinant()>0,'Instancing never uses unsupported negative scale');}
});
check('sand and ice use their full local soft-physics footprint with ground-conforming vertices',()=>{
 for(const name of ['Road-conforming sand dunes','Road-conforming clear ice']){
  const mesh=meshNamed(name),g=mesh.geometry,p=g.attributes.position;
  assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.depthWrite,true);assert.equal(mesh.material.polygonOffset,true);
  assert.equal(g.userData.hazards.length,system.hazards.filter(h=>h.type===g.userData.hazards[0].type).length);
  for(const rec of g.userData.hazards){
   const h=system.hazards.find(h=>h.id===rec.id),vertices=Array.from({length:rec.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,rec.start+i));assertFootprint(h,vertices);
   vertices.forEach((v,i)=>{const q=local(h,v),edge=Math.min(h.width/2-Math.abs(q.x),h.length/2-Math.abs(q.z)),lift=v.y-groundHeight(v.x,v.z);assert.ok(lift>=.0217&&lift<h.height+.024);if(h.type==='ice'||edge<.001)near(lift,ROAD_HAZARD_VISUALS.surfaceNormalOffset,.00012);if(edge<.001){const outside={x:v.x+(Math.abs(q.x)>h.width/2-.001?Math.sign(q.x)*.002*Math.cos(h.heading):Math.sign(q.z)*.002*Math.sin(h.heading)),z:v.z+(Math.abs(q.x)>h.width/2-.001?-Math.sign(q.x)*.002*Math.sin(h.heading):Math.sign(q.z)*.002*Math.cos(h.heading))};assert.equal(system.surfaceAt(outside.x,outside.z,CITY_SURFACE),CITY_SURFACE);}});
   assert.notEqual(system.surfaceAt(h.x,h.z,CITY_SURFACE),CITY_SURFACE);
   assert.equal(system.contact(h.x,h.z,h.heading),undefined);
  }
  // Triangulated interiors cannot dip through road/paint between sampled rows.
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),q=new THREE.Vector3();
  for(let i=0;i<g.index.count;i+=3){a.fromBufferAttribute(p,g.index.getX(i));b.fromBufferAttribute(p,g.index.getX(i+1));c.fromBufferAttribute(p,g.index.getX(i+2));q.copy(a).add(b).add(c).multiplyScalar(1/3);assert.ok(q.y-groundHeight(q.x,q.z)>.0205);}
 }
});
check('warning rock and footprint appear before the drop at 170m with no hidden collider',()=>{
 const h=system.hazards.find(h=>h.type==='rock'),p=routePointAtDistance(h.distance-170,{branch:h.branch}),player={x:p.x,z:p.z,heading:p.heading,velocityX:-Math.sin(p.heading)*20,velocityZ:-Math.cos(p.heading)*20,edgeId:p.edgeId,progress:p.progress};
 assert.equal(system.contact(h.x,h.z,h.heading),undefined);
 assert.equal(visual.stats.visibleRocks,0);assert.equal(visual.stats.visibleWarnings,0);
 system.update(.1,player,true);visual.update(.1);
 const state=system.rocks.find(s=>s.id===h.id),rock=meshNamed('Volcanic falling and landed rocks'),ring=meshNamed('Rock warning perimeter'),shadow=meshNamed('Rock impact shadow');
 assert.equal(state.phase,'warning');assert.equal(state.rockVisible,true);assert.equal(state.shadowVisible,true);
 assert.ok(rock.userData.hazardIds.includes(h.id));assert.ok(ring.userData.hazardIds.includes(h.id));assert.ok(shadow.userData.hazardIds.includes(h.id));
 assert.equal(system.contact(h.x,h.z,h.heading),undefined);
 const vi=rock.userData.hazardIds.indexOf(h.id),rv=instanceVertices(rock,vi);assertFootprint(h,rv);
 assert.ok(Math.min(...rv.map(v=>v.y-groundHeight(v.x,v.z)))>ROAD_HAZARD_RULES.rockAltitude-.05);
 const ri=ring.userData.hazardIds.indexOf(h.id);assertFootprint(h,instanceVertices(ring,ri));
 for(const v of instanceVertices(ring,ri))assert.ok(v.y-groundHeight(v.x,v.z)>.016&&v.y-groundHeight(v.x,v.z)<.03);
 const pulse=ring.material.emissiveIntensity;visual.update(.13);assert.notEqual(ring.material.emissiveIntensity,pulse);
 const vertices=ring.geometry.attributes.position;assert.equal(vertices.count,8,'One hollow perimeter, not extra coincident glow layers');
 // Advance the authoritative model only. The visual must follow its exact pose.
 for(let i=0;i<46;i++){system.update(.1,player,true);visual.update(.1);}
 assert.equal(state.phase,'falling');
 system.update(.1,player,true);visual.update(.1);
 const mat=new THREE.Matrix4();rock.getMatrixAt(rock.userData.hazardIds.indexOf(h.id),mat);const fallingY=mat.elements[13];
 assert.ok(fallingY<groundHeight(h.x,h.z)+ROAD_HAZARD_RULES.rockAltitude);
 assert.equal(system.contact(h.x,h.z,h.heading),undefined);
 for(let i=0;i<20;i++){system.update(.1,player,true);visual.update(.1);}
 assert.equal(state.phase,'landed');assert.ok(system.contact(h.x,h.z,h.heading));assert.ok(rock.userData.hazardIds.includes(h.id));assert.ok(!ring.userData.hazardIds.includes(h.id));
 assertFootprint(h,instanceVertices(rock,rock.userData.hazardIds.indexOf(h.id)));
 for(const hazard of system.hazards.filter(h=>h.solid)){if(!system.contact(hazard.x,hazard.z,hazard.heading))continue;const mesh=hazard.type==='repair'?meshNamed('Yellow black repair blocks'):hazard.type==='log'?meshNamed('Forest log bodies'):rock;assert.ok(mesh.userData.hazardIds.includes(hazard.id),'Every active collider has a visible source mesh');}
 assert.ok(visual.stats.triangles<8000);
 system.reset();visual.update(0);assert.equal(visual.stats.visibleRocks,0);assert.equal(visual.stats.visibleWarnings,0);assert.equal(system.contact(h.x,h.z,h.heading),undefined);
});
check('repeated runs reuse every mesh, material, geometry and typed instance buffer',()=>{
 const before=visual.group.children.map(m=>[m,m.geometry,m.material,m.instanceMatrix?.array,m.instanceMatrix?.array.length]);
 for(let i=0;i<1500;i++)visual.update(1/60);
 before.forEach(([m,g,mat,a,n],i)=>{assert.equal(visual.group.children[i],m);assert.equal(m.geometry,g);assert.equal(m.material,mat);assert.equal(m.instanceMatrix?.array,a);assert.equal(m.instanceMatrix?.array.length,n);});
 assert.throws(()=>createRoadHazardsScene(THREE,{system:{hazards:Array(97).fill({}),rocks:[]}}),/capacity/);
});
check('multiple seeded curved/hilly layouts keep patch edges and solid footprints aligned',()=>{
 for(const seed of [0,1,17,2026,2027,4294967295]){
  const sys=createRoadHazards(seed),scene=createRoadHazardsScene(THREE,{system:sys,groundHeight});
  for(const mesh of scene.group.children){if(mesh.isInstancedMesh){if(!['Yellow black repair blocks','Forest log bodies'].includes(mesh.name))continue;for(let i=0;i<mesh.count;i++){const h=sys.hazards.find(h=>h.id===mesh.userData.hazardIds[i]);assertFootprint(h,instanceVertices(mesh,i));}}
   else for(const r of mesh.geometry.userData.hazards){const h=sys.hazards.find(h=>h.id===r.id),p=mesh.geometry.attributes.position;assertFootprint(h,Array.from({length:r.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,r.start+i)));}
  }
  scene.dispose();assert.equal(scene.stats.disposed,true);
 }
});
check('dispose is idempotent and releases the shared checker only after its last owner',()=>{
 const other=createRoadHazardsScene(THREE,{system:createRoadHazards(7)});
 const texture=meshNamed('Yellow black repair blocks').material.map,geometries=new Set(visual.group.children.map(m=>m.geometry)),materials=new Set(visual.group.children.map(m=>m.material));
 let geometryDisposals=0,materialDisposals=0,textureDisposals=0;
 for(const g of geometries)g.addEventListener('dispose',()=>geometryDisposals++);for(const m of materials)m.addEventListener('dispose',()=>materialDisposals++);texture.addEventListener('dispose',()=>textureDisposals++);
 visual.dispose();visual.dispose();visual.update(.1);
 assert.equal(geometryDisposals,geometries.size);assert.equal(materialDisposals,materials.size);assert.equal(textureDisposals,0);assert.equal(visual.group.children.length,0);assert.equal(visual.stats.drawCalls,0);assert.equal(visual.stats.disposed,true);
 other.dispose();assert.equal(textureDisposals,1);
});
report.passed=report.checks.length;report.generatedAt=new Date().toISOString();
fs.mkdirSync(new URL('../qa/road-hazards/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/road-hazards/scene-checks.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`${report.passed} road hazard scene checks passed.`);
