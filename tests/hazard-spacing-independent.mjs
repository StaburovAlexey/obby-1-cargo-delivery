#!/usr/bin/env node


import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from '../dist/vendor/three.module.js';
import * as N from '../dist/route-network.js';
import {buildRoadHazards,createRoadHazards,roadHazardContact,ROAD_HAZARD_RULES as R,ROAD_HAZARD_EXCLUSIONS} from '../dist/road-hazards.js';
import {createRoadHazardsScene} from '../dist/road-hazards-scene.js';
import {FOLLOW_CAMERA,computeFollowOffset} from '../dist/follow-camera.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {freshCareer,sanitizeCareer} from '../dist/career-save.js';
import {advanceCareerMission} from '../dist/career-missions.js';

const root=new URL('../',import.meta.url),out=new URL('../qa/hazard-spacing/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const hash=f=>createHash('sha256').update(fs.readFileSync(new URL('dist/'+f,root))).digest('hex');
const hashes=()=>Object.fromEntries(fs.readdirSync(new URL('dist/',root)).filter(f=>f.endsWith('.js')).sort().map(f=>[f,hash(f)]));
const report={generatedAt:new Date().toISOString(),scope:'Offline production descriptors, actual Three.js mesh vertices, live collision poses, mission compatibility and conservative perspective-frustum counts. No browser, GPU, occlusion, screenshot or human readability validation.',runtimeHashes:hashes(),checks:[],failures:[]};
const round=n=>Math.round(n*1000)/1000;
const groundHeight=(x,z)=>N.queryRoadSurface(x,z).height+N.ROAD_SURFACE_OFFSET;
const near=(a,b,e=1e-7)=>assert(Math.abs(a-b)<=e,`${a} != ${b}, tolerance ${e}`);
function check(name,fn){try{report.checks.push({name,passed:true,...fn()});console.log('PASS '+name);}catch(e){report.failures.push({name,error:e.stack});console.error('FAIL '+name,e.message);}}
function paths(items,branch){return items.filter(h=>{const e=N.NETWORK_EDGES.find(e=>e.id===h.edgeId);return !e.forkId||h.branch===branch;}).sort((a,b)=>a.distance-b.distance);}
function density(items,window){let maximum=0,worst=[];for(const branch of ['main','alternate']){const p=paths(items,branch);for(const start of p){const present=p.filter(h=>h.distance>=start.distance&&h.distance<start.distance+window);if(present.length>maximum){maximum=present.length;worst=present.map(h=>h.id);}}}return{maximum,worst};}
function layout(items){return{count:items.length,movers:items.filter(h=>h.motion).length,window180:density(items,180),window320:density(items,320),biomes:N.BIOME_DEFINITIONS.map(b=>{const local=items.filter(h=>h.biome===b.id),statics=local.filter(h=>!h.motion),gaps=[];for(const branch of ['main','alternate']){const p=paths(local,branch);for(let i=1;i<p.length;i++)gaps.push(p[i].distance-p[i-1].distance);}return{biome:b.id,count:local.length,statics:statics.length,offsets:[...new Set(statics.map(h=>round(h.offset)))].sort((a,b)=>a-b),first:round(Math.min(...local.map(h=>h.progress))),last:round(Math.max(...local.map(h=>h.progress))),fractionOfBiomeSpanned:round((Math.max(...local.map(h=>h.progress))-Math.min(...local.map(h=>h.progress)))/(b.to-b.from)),minimumGap:round(Math.min(...gaps)),maximumGap:round(Math.max(...gaps)),gapBins25m:[...new Set(gaps.map(x=>Math.round(x/25)*25))].sort((a,b)=>a-b),window180:density(local,180),window320:density(local,320)};})};}
const baseline=JSON.parse(fs.readFileSync(new URL('before.json',out),'utf8')),system=createRoadHazards(42),hazards=system.hazards;
report.before=layout(baseline);report.after=layout(hazards);
check('Reduced layout is irregular, sparse and spread across the route',()=>{
 assert.equal(hazards.length,26);assert.equal(hazards.length,R.count);assert.equal(hazards.filter(h=>h.motion).length,10);
 assert(report.after.window180.maximum<=3,'Maximum 3 hazards in a traversable 180 m window');
 assert(report.after.window320.maximum<=4,'Maximum 4 hazards in a traversable 320 m window');
 for(const b of report.after.biomes){assert(b.offsets.length>=Math.min(4,b.statics),b.biome+' needs varied lateral positions');assert(b.gapBins25m.length>=3,b.biome+' needs irregular gaps');assert(b.fractionOfBiomeSpanned>.55,b.biome+' needs whole-biome distribution');}
 return{beforeCount:baseline.length,afterCount:hazards.length,beforeMax180:report.before.window180.maximum,afterMax180:report.after.window180.maximum};
});
check('Seed determinism, graph poses, corridors and protected stops remain valid',()=>{
 let minimumExclusion=Infinity,minimumGap=Infinity,minimumRoadMargin=Infinity,centerClearance=Infinity;
 for(const seed of [0,1,17,42,12345,4294967295,'repeat']){
  const items=buildRoadHazards(seed);assert.deepEqual(items,buildRoadHazards(seed));assert.equal(items.length,R.count);assert.equal(new Set(items.map(h=>h.id)).size,items.length);
  for(const h of items){
   const p=N.pointOnEdge(h.edgeId,h.edgeDistance);near(h.x,p.x+p.right.x*h.offset);near(h.z,p.z+p.right.z*h.offset);near(h.heading,p.heading+(h.headingDelta||0));assert(Object.isFrozen(h));
   const extent=Math.hypot(h.width,h.length)/2+1;
   for(const e of ROAD_HAZARD_EXCLUSIONS){const margin=Math.abs(h.distance-e.distance)-e.radius-extent;minimumExclusion=Math.min(minimumExclusion,margin);assert(margin>=-1e-7,h.id+' overlaps '+e.id);}
   for(const o of items)if(o!==h&&o.edgeId===h.edgeId){const gap=Math.abs(h.edgeDistance-o.edgeDistance),required=!!h.motion!==!!o.motion?180:h.motion?R.moverSpacingMetres:150;minimumGap=Math.min(minimumGap,gap);assert(gap>=required-1e-7,h.id+' too close to '+o.id);}
   const offsets=h.motion?[h.motion.minOffset,h.motion.maxOffset,h.offset]:[h.offset];
   for(const offset of offsets)for(const a of [-1,1])for(const b of [-1,1]){
    const c=Math.cos(h.heading),s=Math.sin(h.heading),x=p.x+p.right.x*offset+c*a*h.width/2+s*b*h.length/2,z=p.z+p.right.z*offset-s*a*h.width/2+c*b*h.length/2,q=N.projectRoad(x,z,p),margin=15-Math.abs(q.offset);minimumRoadMargin=Math.min(minimumRoadMargin,margin);assert(margin>.35,h.id+' footprint outside road');
   }
   if(!h.motion){const half=Math.abs(Math.cos(h.headingDelta||0))*h.width/2+Math.abs(Math.sin(h.headingDelta||0))*h.length/2;centerClearance=Math.min(centerClearance,Math.abs(h.offset)-half);assert(15+Math.abs(h.offset)-half>=8,h.id+' lacks an 8 m bypass');const bypass=Math.sign(h.offset||1)*-10.4;assert(!roadHazardContact(h,p.x+p.right.x*bypass,p.z+p.right.z*bypass,p.heading),h.id+' lacks collision-free side bypass');}
  }
 }
 return{seeds:7,minimumExclusion,minimumGap,minimumRoadMargin,centerClearance};
});

function meshBounds(visual,sys){
 const boxes=new Map(),parts=new Map(),m=new T.Matrix4(),v=new T.Vector3();let vertices=0;
 function include(id,points){let box=boxes.get(id);if(!box)boxes.set(id,box=new T.Box3());for(const p of points){box.expandByPoint(p);vertices++;}parts.set(id,(parts.get(id)||0)+1);}
 for(const mesh of visual.group.children){const p=mesh.geometry.attributes.position;if(mesh.isInstancedMesh){for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);const points=[];for(let j=0;j<p.count;j++)points.push(new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(m));include(mesh.userData.hazardIds[i],points);}}
  else for(const rec of mesh.geometry.userData.hazards||[]){const points=[];for(let j=0;j<rec.count;j++)points.push(new T.Vector3().fromBufferAttribute(p,rec.start+j));include(rec.id,points);}}
 assert.equal(boxes.size,sys.hazards.length);return{boxes,parts,vertices};
}
const visual=createRoadHazardsScene(T,{system});visual.update();
check('Actual mesh footprints and live colliders share the same positions',()=>{
 const matrix=new T.Matrix4(),vertex=new T.Vector3(),original=visual.group.children.map(m=>[m,m.geometry,m.material,m.instanceMatrix?.array]);let vertices=0,poseChecks=0,maxPositionError=0,maxBoundOvershoot=0;
 for(let frame=0;frame<=900;frame++){
  if(frame){system.update(.05,{x:0,z:0,heading:0},true);visual.update(.05);}
  const full=frame%150===0;
  for(const mesh of visual.group.children){
   if(mesh.isInstancedMesh){for(let i=0;i<mesh.count;i++){
    const h=system.poseFor(mesh.userData.hazardIds[i]);mesh.getMatrixAt(i,matrix);
    if(mesh.name!=='Forest cut log ends'){const error=Math.max(Math.abs(matrix.elements[12]-h.x),Math.abs(matrix.elements[14]-h.z));maxPositionError=Math.max(maxPositionError,error);assert(error<.002);poseChecks++;if(h.solid)assert(system.contact(h.x,h.z,h.heading),h.id+' collider absent');}
    if(!full)continue;const p=mesh.geometry.attributes.position;for(let j=0;j<p.count;j++){
     vertex.fromBufferAttribute(p,j).applyMatrix4(matrix);const dx=vertex.x-h.x,dz=vertex.z-h.z,lx=Math.cos(h.heading)*dx-Math.sin(h.heading)*dz,lz=Math.sin(h.heading)*dx+Math.cos(h.heading)*dz;
     const over=Math.max(Math.abs(lx)-h.width/2,Math.abs(lz)-h.length/2);maxBoundOvershoot=Math.max(maxBoundOvershoot,over);assert(over<.003,h.id+' visible mesh exceeds collider');vertices++;
    }
   }}else if(full){const p=mesh.geometry.attributes.position;for(const rec of mesh.geometry.userData.hazards||[]){const h=system.poseFor(rec.id);assert(system.surfaceAt(h.x,h.z,{frictionFactor:1}).frictionFactor<1);for(let i=0;i<rec.count;i++){vertex.fromBufferAttribute(p,rec.start+i);const dx=vertex.x-h.x,dz=vertex.z-h.z,lx=Math.cos(h.heading)*dx-Math.sin(h.heading)*dz,lz=Math.sin(h.heading)*dx+Math.cos(h.heading)*dz;assert(Math.abs(lx)<=h.width/2+.003);assert(Math.abs(lz)<=h.length/2+.003);vertices++;}}}
  }
 }
 original.forEach(([m,g,mat,a],i)=>{assert.equal(visual.group.children[i],m);assert.equal(m.geometry,g);assert.equal(m.material,mat);assert.equal(m.instanceMatrix?.array,a);});
 return{frames:901,poseChecks,vertices,maxPositionError,maxBoundOvershoot,stats:{...visual.stats}};
});

function cameraProxy(items){
 const sys={hazards:items,rocks:items.filter(h=>h.type==='rock')},scene=createRoadHazardsScene(T,{system:sys,groundHeight}),{boxes,parts,vertices}=meshBounds(scene,sys);
 const camera=new T.PerspectiveCamera(53,16/9,.5,1800),frustum=new T.Frustum(),matrix=new T.Matrix4(),target=new T.Vector3(),position=new T.Vector3();
 const modes=[];
 for(const aspect of [16/9,9/16])for(const pitch of [FOLLOW_CAMERA.driving.pitch,FOLLOW_CAMERA.minPitch]){
  camera.aspect=aspect;camera.updateProjectionMatrix();const mode={aspect:round(aspect),pitchDegrees:round(pitch*180/Math.PI),samples:0,maxUnique:0,maxParts:0,worst:null,byBiome:{}};
  for(const branch of ['main','alternate'])for(let q=0;q<N.ROUTE.end;q+=15){
   const p=N.routePointAtProgress(q,{branch}),scale=aspect<.8?1.2:1,offset=computeFollowOffset({yaw:p.heading,pitch,radius:FOLLOW_CAMERA.driving.radius});target.set(p.x,p.height+1.7,p.z);camera.position.set(offset.x*scale,offset.y*scale,offset.z*scale).add(target);camera.lookAt(target);camera.updateMatrixWorld(true);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
   let count=0,pieces=0,ids=[];
   for(const h of items){if(Math.hypot(h.x-p.x,h.z-p.z)>320)continue;if(!frustum.intersectsBox(boxes.get(h.id)))continue;count++;pieces+=parts.get(h.id);ids.push(h.id);}
   if(count>mode.maxUnique){mode.maxUnique=count;mode.worst={progress:round(q),branch,ids};}mode.maxParts=Math.max(mode.maxParts,pieces);mode.byBiome[p.biome]=Math.max(mode.byBiome[p.biome]||0,count);mode.samples++;
  }modes.push(mode);
 }
 scene.dispose();return{description:'Conservative frustum intersection of actual mesh bounding boxes within 320 world metres; includes both fork arms if in view. Camera target is road height + 1.7 m, no smoothing or depth occlusion. Default and minimum camera pitch, desktop and portrait. Parts count log body plus two caps separately.',actualMeshVertices:vertices,meshParts:[...parts.values()].reduce((a,b)=>a+b,0),uniqueDescriptors:items.length,modes};
}
check('Perspective-frustum density falls in representative camera modes',()=>{
 report.cameraBefore=cameraProxy(baseline);report.cameraAfter=cameraProxy(hazards);
 for(let i=0;i<report.cameraAfter.modes.length;i++)assert(report.cameraAfter.modes[i].maxUnique<=report.cameraBefore.modes[i].maxUnique,'Candidate increases camera proxy crowding');
 return{beforeMaximum:Math.max(...report.cameraBefore.modes.map(m=>m.maxUnique)),afterMaximum:Math.max(...report.cameraAfter.modes.map(m=>m.maxUnique))};
});
check('Bridge missions, economy and physical controls remain unchanged',()=>{
 const preserved=JSON.parse(fs.readFileSync(new URL('independent-preserved-before.json',out),'utf8')).hashes;for(const [f,h]of Object.entries(preserved))assert.equal(hash(f),h,f+' unexpectedly changed');
 assert.equal(BRIDGES.length,25);for(const b of BRIDGES){const c=freshCareer();c.retention.missionSequence=1;c.retention.missionProgress=1;c.retention.missionBridgeIds=[b.id];const restored=sanitizeCareer(c);assert.deepEqual(restored.retention.missionBridgeIds,[b.id]);assert.equal(restored.retention.missionProgress,1);}
 const mission=freshCareer().retention;mission.missionSequence=1;assert.equal(advanceCareerMission(mission,{clean:false,bridgeIds:BRIDGES.slice(0,2).map(b=>b.id)}),null);assert.equal(mission.missionProgress,0);assert.equal(advanceCareerMission(mission,{clean:true,bridgeIds:[BRIDGES[0].id,BRIDGES[0].id]}),null);assert.equal(mission.missionProgress,1);const reward=advanceCareerMission(mission,{clean:true,bridgeIds:[BRIDGES[1].id]});assert.equal(reward.id,'clean-bridges');assert.equal(reward.cash,120);assert.equal(reward.brains,30);assert.equal(mission.missionSequence,2);
 return{unchangedModules:Object.keys(preserved),bridges:25,savedBridgeIdsPreserved:25,cleanBridgeMissionReward:reward};
});
visual.dispose();report.runtimeHashesAtEnd=hashes();report.changedDuringRun=Object.keys(report.runtimeHashes).filter(f=>report.runtimeHashes[f]!==report.runtimeHashesAtEnd[f]);report.passed=report.failures.length===0&&report.changedDuringRun.length===0;report.complete=true;
fs.writeFileSync(new URL('independent.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failures:report.failures,changedDuringRun:report.changedDuringRun,before:report.before.count,after:report.after.count},null,2));process.exitCode=report.passed?0:1;
