#!/usr/bin/env node
/** Production Three.js geometry and buffers on the CPU. These tests do not
 * create a browser, compile WebGL shaders, measure GPU FPS or test a phone. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import * as THREE from '../dist/vendor/three.module.js';
import {createRoadHazards} from '../dist/road-hazards.js';
import {createRoadHazardsScene,ROAD_HAZARD_VISUALS as V} from '../dist/road-hazards-scene.js';
import {groundHeight} from '../dist/city-driving.js';
import {queryRoadSurface,ROAD_SURFACE_OFFSET} from '../dist/route-network.js';

const player={x:0,z:0,heading:0},matrix=new THREE.Matrix4(),vertex=new THREE.Vector3();
const near=(a,b,e=.002)=>assert(Math.abs(a-b)<=e,`${a} differs from ${b} (tolerance ${e})`);
const report={scope:'Offline production Three.js vertices, matrices, resource identities and surface physics. No browser, GPU, mobile or human-playtest claim.',checks:[]};
function check(name,fn){const result=fn();report.checks.push({name,passed:true,...result});console.log('PASS '+name+' '+JSON.stringify(result||{}));}
function advance(system,seconds){while(seconds-system.elapsed>1e-9)system.update(Math.min(.05,seconds-system.elapsed),player,true);}
function resources(scene){return scene.group.children.map(mesh=>({mesh,geometry:mesh.geometry,material:mesh.material,index:mesh.geometry.index,position:mesh.geometry.attributes.position,normal:mesh.geometry.attributes.normal,uv:mesh.geometry.attributes.uv,color:mesh.geometry.attributes.color,instances:mesh.instanceMatrix,instanceArray:mesh.instanceMatrix?.array,instanceColor:mesh.instanceColor,box:mesh.geometry.boundingBox,sphere:mesh.geometry.boundingSphere}));}
function stableResources(scene,before){
 assert.equal(scene.group.children.length,before.length);
 before.forEach((r,i)=>{
  assert.equal(scene.group.children[i],r.mesh);assert.equal(r.mesh.geometry,r.geometry);assert.equal(r.mesh.material,r.material);
  assert.equal(r.geometry.index,r.index);assert.equal(r.geometry.attributes.position,r.position);assert.equal(r.geometry.attributes.normal,r.normal);assert.equal(r.geometry.attributes.uv,r.uv);assert.equal(r.geometry.attributes.color,r.color);
  assert.equal(r.mesh.instanceMatrix,r.instances);assert.equal(r.mesh.instanceMatrix?.array,r.instanceArray);assert.equal(r.mesh.instanceColor,r.instanceColor);
  assert.equal(r.geometry.boundingBox,r.box);assert.equal(r.geometry.boundingSphere,r.sphere);
 });
}
function allBuffers(scene){return scene.group.children.map(mesh=>({instances:mesh.instanceMatrix?Array.from(mesh.instanceMatrix.array):null,position:Array.from(mesh.geometry.attributes.position.array),normal:Array.from(mesh.geometry.attributes.normal.array),uv:mesh.geometry.attributes.uv?Array.from(mesh.geometry.attributes.uv.array):null}));}

check('All 30 hazard IDs have visible live geometry in the original eight bounded batches',()=>{
 const system=createRoadHazards(42),scene=createRoadHazardsScene(THREE,{system});
 assert.equal(system.hazards.length,30);assert.equal(system.movers.length,30);assert.equal(scene.stats.movers,30);
 assert.equal(scene.group.children.length,8);assert.equal(scene.stats.instancedMeshes,6);assert.equal(scene.stats.mergedMeshes,2);
 assert.equal(scene.stats.drawCalls,8);assert.equal(scene.stats.triangles,1944);assert.equal(scene.stats.activeInstances,32);
 const ids=new Set(scene.group.children.flatMap(mesh=>mesh.userData.hazardIds));assert.deepEqual([...ids].sort(),system.hazards.map(h=>h.id).sort());
 for(const mesh of scene.group.children.filter(m=>m.isInstancedMesh)){assert.equal(mesh.count,mesh.userData.capacity);assert.equal(mesh.instanceMatrix.count,Math.max(1,mesh.count));assert.equal(mesh.frustumCulled,false);}
 const names=scene.group.children.map(m=>m.name).join(' ');assert(!/falling|warning|impact shadow/i.test(names));
 assert.equal(scene.stats.visibleRocks,4);assert.equal(scene.stats.visibleWarnings,0);assert(system.rocks.every(r=>r.phase==='landed'&&r.altitude===0&&!r.shadowVisible));
 const paint=scene.group.getObjectByName('Yellow black repair blocks').material,sand=scene.group.getObjectByName('Road-conforming sand dunes').material;
 assert.equal(paint.map,sand.map);assert.equal(paint.map.image.width,128);assert.equal(paint.map.userData.generatedLocally,true);
 const result={hazards:ids.size,moving:scene.stats.movers,drawCalls:scene.stats.drawCalls,triangles:scene.stats.triangles,solidInstances:scene.stats.activeInstances};scene.dispose();return result;
});

check('A full movement cycle keeps every solid, both log caps and both patches on their live collision footprint',()=>{
 const system=createRoadHazards(42),scene=createRoadHazardsScene(THREE,{system}),before=resources(scene);
 const initial=new Map(system.poses.map(h=>[h.id,{x:h.x,z:h.z}])),moved=new Set(),patchTrailsCleared=new Set(),capChecks=new Set();
 const base={frictionFactor:1,lateralDampingFactor:1,rollingFactor:1,engineFactor:1,speedFactor:1,coastingFactor:1,vibration:0};
 let checkedVertices=0,solidPoseChecks=0,patchVertices=0,maxDaylight=-Infinity,maxBurial=0,maxHorizontalError=0;
 for(let frame=0;frame<=440;frame++){
  if(frame)system.update(.05,player,true);scene.update();
  const full=frame%40===0;
  for(const h of system.poses){const old=initial.get(h.id);if(Math.hypot(h.x-old.x,h.z-old.z)>1)moved.add(h.id);if(h.solid)assert(system.contact(h.x,h.z,h.heading));else {assert(system.surfaceAt(h.x,h.z,base).frictionFactor<1);if(Math.hypot(h.x-old.x,h.z-old.z)>h.width/2+.1){assert.equal(system.surfaceAt(old.x,old.z,base),base);patchTrailsCleared.add(h.id);}}}
  for(const mesh of scene.group.children){
   if(mesh.isInstancedMesh){
    for(let i=0;i<mesh.count;i++){
     const h=system.poseFor(mesh.userData.hazardIds[i]),c=Math.cos(h.heading),s=Math.sin(h.heading);mesh.getMatrixAt(i,matrix);
     const isCap=mesh.name==='Forest cut log ends',side=i%2?1:-1,centerOffset=isCap?side*h.width/2:0;
     near(matrix.elements[12],h.x+c*centerOffset);near(matrix.elements[14],h.z-s*centerOffset);
     if(isCap){const body=scene.group.getObjectByName('Forest log bodies'),bodyMatrix=new THREE.Matrix4();body.getMatrixAt(Math.floor(i/2),bodyMatrix);const expected=bodyMatrix.clone().multiply(new THREE.Matrix4().makeScale(1/h.width,1/h.height,1/h.length)).multiply(new THREE.Matrix4().makeTranslation(centerOffset,0,0)).multiply(new THREE.Matrix4().makeRotationY(side<0?Math.PI:0)).multiply(new THREE.Matrix4().makeScale(1,h.height,h.length));for(let j=0;j<16;j++)near(matrix.elements[j],expected.elements[j]);capChecks.add(h.id+':'+side);}
     else {near(matrix.elements[1]/h.width,c*h.groundGradientX-s*h.groundGradientZ,1e-7);near(matrix.elements[9]/h.length,s*h.groundGradientX+c*h.groundGradientZ,1e-7);solidPoseChecks++;}
     if(!full)continue;
     const p=mesh.geometry.attributes.position;let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
     for(let j=0;j<p.count;j++){
      vertex.fromBufferAttribute(p,j).applyMatrix4(matrix);const dx=vertex.x-h.x,dz=vertex.z-h.z,lx=c*dx-s*dz,lz=s*dx+c*dz;
      const over=Math.max(Math.abs(lx)-h.width/2,Math.abs(lz)-h.length/2);maxHorizontalError=Math.max(maxHorizontalError,over);assert(over<.003,h.id+' visual exceeds footprint');
      minX=Math.min(minX,lx);maxX=Math.max(maxX,lx);minZ=Math.min(minZ,lz);maxZ=Math.max(maxZ,lz);
      if(Math.abs(p.getY(j))<1e-5){const gap=vertex.y-groundHeight(vertex.x,vertex.z,h);maxDaylight=Math.max(maxDaylight,gap);maxBurial=Math.max(maxBurial,-gap);assert(gap<.001,h.id+' daylight gap');assert(gap>-.06,h.id+' excessive burial');}checkedVertices++;
     }
     if(!isCap){near(minX,-h.width/2);near(maxX,h.width/2);near(minZ,-h.length/2);near(maxZ,h.length/2);}
    }
   }else if(full){
    const g=mesh.geometry,p=g.attributes.position,uv=g.attributes.uv,n=g.attributes.normal;
    for(const r of g.userData.hazards){const h=system.poseFor(r.id),c=Math.cos(h.heading),s=Math.sin(h.heading);near(r.footprint.x,h.x,1e-10);near(r.footprint.z,h.z,1e-10);
     for(let i=0;i<r.count;i++){
      vertex.fromBufferAttribute(p,r.start+i);const k=i*3,lx=r.local[k],lz=r.local[k+2],x=h.x+c*lx+s*lz,z=h.z-s*lx+c*lz;
      near(vertex.x,x);near(vertex.z,z);const ground=queryRoadSurface(x,z,h),expected=ground.height+ROAD_SURFACE_OFFSET+V.surfaceNormalOffset/ground.normal.y+h.height*r.local[k+1];near(vertex.y,expected,.0001);
      near(uv.getX(r.start+i),x/4);near(uv.getY(r.start+i),-z/4);assert(n.getY(r.start+i)>.9);
      assert(g.boundingBox.containsPoint(vertex),'Moved patch has stale culling bounds');assert(vertex.distanceTo(g.boundingSphere.center)<=g.boundingSphere.radius+.001);
      if(lx===-h.width/2||lx===h.width/2||lz===-h.length/2||lz===h.length/2)near(r.local[k+1],0,1e-10);patchVertices++;
     }
    }
   }
  }
 }
 assert.equal(moved.size,30);assert.equal(patchTrailsCleared.size,2);assert.equal(capChecks.size,4);stableResources(scene,before);assert.equal(scene.stats.drawCalls,8);assert.equal(scene.stats.triangles,1944);
 scene.dispose();return{frames:441,movingHazards:moved.size,solidPoseChecks,checkedVertices,patchVertices,logCaps:capChecks.size,maxHorizontalError,maxDaylight,maxBurial};
});

check('Injected sloped and curved ground resamples moving patch height and normals instead of reusing the initial slope',()=>{
 const system=createRoadHazards(17),custom=(x,z)=>4+.03*x-.02*z+.25*Math.sin(x*.21)*Math.cos(z*.17),scene=createRoadHazardsScene(THREE,{system,groundHeight:custom}),before=resources(scene);
 let vertices=0,changedHeights=0;
 const initial=allBuffers(scene);
 for(const seconds of [2,5,9,13,19]){
  advance(system,seconds);scene.update();
  for(const mesh of scene.group.children.filter(m=>!m.isInstancedMesh))for(const r of mesh.geometry.userData.hazards){const h=system.poseFor(r.id),c=Math.cos(h.heading),s=Math.sin(h.heading),p=mesh.geometry.attributes.position;
   for(let i=0;i<r.count;i++){const k=i*3,lx=r.local[k],lz=r.local[k+2],x=h.x+c*lx+s*lz,z=h.z-s*lx+c*lz,e=.1,gx=(custom(x+e,z)-custom(x-e,z))/(2*e),gz=(custom(x,z+e)-custom(x,z-e))/(2*e),y=custom(x,z)+V.surfaceNormalOffset*Math.hypot(gx,1,gz)+h.height*r.local[k+1];near(p.getY(r.start+i),y,.0001);vertices++;}
  }
 }
 scene.group.children.forEach((mesh,i)=>{if(!mesh.isInstancedMesh)for(let j=1;j<mesh.geometry.attributes.position.array.length;j+=3)if(Math.abs(mesh.geometry.attributes.position.array[j]-initial[i].position[j])>.001)changedHeights++;});
 assert(changedHeights>100);stableResources(scene,before);scene.dispose();return{samples:5,vertices,changedHeights};
});

check('Pause, reset, late scene creation, descriptor-only previews and disposal retain correct geometry and bounded pools',()=>{
 const system=createRoadHazards(42),scene=createRoadHazardsScene(THREE,{system}),before=resources(scene),initial=allBuffers(scene);
 advance(system,4);scene.update();assert.notDeepEqual(allBuffers(scene),initial);
 const paused=allBuffers(scene),time=system.elapsed,patchVersions=scene.group.children.filter(m=>!m.isInstancedMesh).map(m=>m.geometry.attributes.position.version);
 for(let i=0;i<5;i++){system.update(100,player,false);scene.update();}near(system.elapsed,time,1e-10);assert.deepEqual(allBuffers(scene),paused);assert.deepEqual(scene.group.children.filter(m=>!m.isInstancedMesh).map(m=>m.geometry.attributes.position.version),patchVersions);
 const late=createRoadHazardsScene(THREE,{system});assert.deepEqual(allBuffers(late),allBuffers(scene));late.dispose();
 system.reset();scene.update();assert.deepEqual(allBuffers(scene),initial);stableResources(scene,before);
 // Read-only scene consumers may pass descriptors without a runtime pose API.
 const preview=createRoadHazardsScene(THREE,{system:{hazards:system.hazards,rocks:system.rocks}});for(const mesh of preview.group.children){assert(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));if(mesh.instanceMatrix)assert(Array.from(mesh.instanceMatrix.array).every(Number.isFinite));}preview.dispose();
 let geometryDisposals=0,materialDisposals=0;for(const r of before){r.geometry.addEventListener('dispose',()=>geometryDisposals++);r.material.addEventListener('dispose',()=>materialDisposals++);}
 scene.dispose();scene.dispose();scene.update();assert.equal(geometryDisposals,8);assert.equal(materialDisposals,8);assert.equal(scene.group.children.length,0);assert.equal(scene.stats.drawCalls,0);return{pauseChecks:5,lateSceneSynchronized:true,resetExact:true,disposedGeometries:geometryDisposals,disposedMaterials:materialDisposals};
});

check('Runtime CPU updates retain the same resources and no extra falling-rock pools',()=>{
 const system=createRoadHazards(42),scene=createRoadHazardsScene(THREE,{system,groundHeight}),before=resources(scene),times=[];
 for(let i=0;i<180;i++){const start=performance.now();system.update(1/60,player,true);scene.update();if(i>=30)times.push(performance.now()-start);}
 stableResources(scene,before);assert.equal(scene.stats.drawCalls,8);assert.equal(scene.stats.visibleRocks,4);assert.equal(scene.stats.visibleWarnings,0);times.sort((a,b)=>a-b);
 const result={frames:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:times[Math.floor(times.length*.95)],maximumMs:times.at(-1),limitation:'Shared Node CPU timing only, not GPU FPS'};scene.dispose();return result;
});

report.generatedAt=new Date().toISOString();report.runtimeHashes=Object.fromEntries(['road-hazards.js','road-hazards-scene.js'].map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL('../dist/'+f,import.meta.url))).digest('hex')]));
fs.mkdirSync(new URL('../qa/all-hazard-visuals/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/all-hazard-visuals/report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`${report.checks.length} all-moving hazard visual groups passed.`);
