// Approved compact-route actual Three.js mesh and mover regression. CPU only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import * as N from '../dist/route-network.js';
import {buildCity,createRoadFootprintIndex,polygonIntersectionArea} from '../dist/network-scene.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {createRoadHazards} from '../dist/road-hazards.js';
import {createRoadHazardsScene} from '../dist/road-hazards-scene.js';
import {freshCareer,sanitizeCareer} from '../dist/career-save.js';
const out=new URL('../qa/compact-route/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const report={scope:'Offline actual Three.js scene meshes, CPU raycasts, overlap checks, live mover matrices and resource reuse. No browser, WebGL, GPU, mobile, human-playtest or FPS claim.'};
const city=buildCity(T),road=city.group.getObjectByName('Continuous 30m-wide road'),ground=city.group.getObjectByName('Closed continuous terrain foundation');city.group.updateMatrixWorld(true);
assert.equal(city.stats.drawCalls,8);assert.equal(city.stats.bridges,25);assert.equal(city.stats.forks,4);assert.equal(city.stats.biomes,5);
const ray=new T.Raycaster();let deck=0,gaps=0,meshValues=0;
city.group.traverse(o=>{if(o.geometry)for(const a of Object.values(o.geometry.attributes))for(const v of a.array){assert(Number.isFinite(v));meshValues++;}});
for(const b of BRIDGES)for(const dq of [-8,0,8]){
 const p=N.routePointAtProgress((b.from+b.to)/2+dq);
 for(const offset of [b.offset,b.offset-4,b.offset+4]){
  ray.set(new T.Vector3(p.x+p.right.x*offset,p.height+100,p.z+p.right.z*offset),new T.Vector3(0,-1,0));
  const hits=ray.intersectObject(road,false);if(offset===b.offset){assert(hits.length>0,b.id+' deck');deck++;}else{assert.equal(hits.length,0,b.id+' no full-width road');gaps++;}
  assert.equal(ray.intersectObject(ground,false).length,0,b.id+' no terrain under gap');
 }
}
const getData=mesh=>({positions:mesh.geometry.attributes.position.array,indices:mesh.geometry.index.array});
const overlapFindings=[],terrainFindings=[];const index=createRoadFootprintIndex(getData(road));let roadPairs=0,terrainPairs=0,maxSelfOverlap=0,maxGroundOverlap=0,maxForkOverlap=0;
for(const a of index.triangles)for(const b of index.candidates(a.p)){if(b.id<=a.id)continue;const overlap=polygonIntersectionArea(a.p,b.p);maxSelfOverlap=Math.max(maxSelfOverlap,overlap);const q=road.geometry.attributes.roadProgress.getX(road.geometry.index.getX(a.id*3));if(N.FORKS.some(f=>q>=f.from&&q<=f.to))maxForkOverlap=Math.max(maxForkOverlap,overlap);if(overlap>=.002)overlapFindings.push({a:a.id,b:b.id,overlap,p:a.p,q:b.p});roadPairs++;}
const gp=ground.geometry.attributes.position,gi=ground.geometry.index;
for(let i=0;i<gi.count;i+=3){const p=[0,1,2].map(k=>({x:gp.getX(gi.getX(i+k)),z:gp.getZ(gi.getX(i+k))}));for(const r of index.candidates(p)){const overlap=polygonIntersectionArea(p,r.p);maxGroundOverlap=Math.max(maxGroundOverlap,overlap);if(overlap>=.004)terrainFindings.push({i,r:r.id,overlap,p,q:r.p});terrainPairs++;}}
report.overlapFindings=overlapFindings;report.terrainFindings=terrainFindings;// Every repeated fork boundary position must share one actual Float32 Y.
// A nearly zero median width must never amplify the ridge/valley height blend.
const forkVertices=new Map();let sharedForkVertexChecks=0,maximumSharedForkHeightGap=0;
for(const mesh of [N.ROAD_MESH,N.GROUND_MESH])for(let i=0;i<mesh.positions.length;i+=3){
 const q=mesh.progress[i/3];if(!N.FORKS.some(f=>q>=f.from&&q<=f.to))continue;
 const x=mesh.positions[i],y=mesh.positions[i+1],z=mesh.positions[i+2],key=x+','+z;
 if(forkVertices.has(key)){maximumSharedForkHeightGap=Math.max(maximumSharedForkHeightGap,Math.abs(forkVertices.get(key)-y));sharedForkVertexChecks++;}else forkVertices.set(key,y);
}
// Check the authoritative Float32 collision triangles, not only analytic
// centerline frames: a shared tip can be watertight but still form a ramp.
let maximumRoadTriangleGrade=0;
const collisionRoad=N.ROAD_MESH;
for(let i=0;i<collisionRoad.indices.length;i+=3){
 const [a,b,c]=collisionRoad.indices.slice(i,i+3).map(k=>({x:collisionRoad.positions[k*3],y:collisionRoad.positions[k*3+1],z:collisionRoad.positions[k*3+2]}));
 const area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);if(Math.abs(area)<1e-9)continue;
 const gx=((b.y-a.y)*(c.z-a.z)-(c.y-a.y)*(b.z-a.z))/area;
 const gz=((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/area;
 maximumRoadTriangleGrade=Math.max(maximumRoadTriangleGrade,Math.hypot(gx,gz));
}
let maximumMidpointHeightError=0;
for(const f of N.FORKS)for(const branch of ['main','alternate']){
 const p=N.routePointAtProgress((f.from+f.to)/2,{branch}),s=N.queryRoadSurface(p.x,p.z,p);
 maximumMidpointHeightError=Math.max(maximumMidpointHeightError,Math.abs(p.height-s.height));
}
report.world={...city.stats,deckRays:deck,sideGapRays:gaps,finiteMeshValues:meshValues,roadPairs,terrainPairs,maxSelfOverlap,maxGroundOverlap,maxForkOverlap,sharedForkVertexChecks,maximumSharedForkHeightGap,maximumRoadTriangleGrade,maximumMidpointHeightError};
console.log('PASS world scene',JSON.stringify(report.world));
const oldIds=BRIDGES.filter(b=>/-[123]$/.test(b.id)).map(b=>b.id);assert.equal(oldIds.length,15);for(const id of oldIds){const c=freshCareer();c.retention.missionSequence=1;c.retention.missionProgress=1;c.retention.missionBridgeIds=[id];const restored=sanitizeCareer(c);assert.deepEqual(restored.retention.missionBridgeIds,[id]);assert.equal(restored.retention.missionProgress,1);}report.preservedSavedBridgeIds=oldIds;
const system=createRoadHazards(42),groundHeight=(x,z)=>N.queryRoadSurface(x,z).height+N.ROAD_SURFACE_OFFSET,visual=createRoadHazardsScene(T,{system,groundHeight});
const player={x:0,z:0,heading:0};let frames=0,moverMatrixChecks=0,maximumPositionError=0,minimumFreePassage=Infinity;
const originals=visual.group.children.map(mesh=>[mesh,mesh.geometry,mesh.material,mesh.instanceMatrix?.array]),matrix=new T.Matrix4();
for(let frame=0;frame<900;frame++){
 system.update(.05,player,true);visual.update(.05);frames++;
 for(const mesh of visual.group.children.filter(m=>m.isInstancedMesh))for(let i=0;i<mesh.count;i++){
  const h=system.poseFor(mesh.userData.hazardIds[i]);if(!h?.motion)continue;mesh.getMatrixAt(i,matrix);const err=Math.max(Math.abs(matrix.elements[12]-h.x),Math.abs(matrix.elements[14]-h.z));maximumPositionError=Math.max(maximumPositionError,err);assert(err<.002);assert(h.offset>=h.motion.minOffset-1e-8&&h.offset<=h.motion.maxOffset+1e-8);minimumFreePassage=Math.min(minimumFreePassage,15-h.width/2+Math.abs(h.offset));assert(minimumFreePassage>=8);moverMatrixChecks++;
 }
}
originals.forEach(([m,g,material,buffer],i)=>{assert.equal(visual.group.children[i],m);assert.equal(m.geometry,g);assert.equal(m.material,material);assert.equal(m.instanceMatrix?.array,buffer)});
assert.equal(visual.stats.hazards,30);assert.equal(visual.stats.movers,20);assert.equal(visual.stats.drawCalls,8);assert(visual.stats.rockCapacity<=24);assert.equal(visual.stats.visibleWarnings,0);
report.hazards={...visual.stats,frames,moverMatrixChecks,maximumPositionError,minimumFreePassage};
console.log('PASS hazard scene',JSON.stringify(report.hazards));
visual.dispose();visual.dispose();city.dispose();assert.equal(visual.stats.drawCalls,0);report.status=overlapFindings.length||terrainFindings.length||maxForkOverlap>1e-6||maximumSharedForkHeightGap>1e-6||maximumRoadTriangleGrade>.1271||maximumMidpointHeightError>.003?'FAIL':'PASS';fs.writeFileSync(new URL('scene.json',out),JSON.stringify(report,null,2)+'\n');assert.equal(report.status,'PASS','Road mesh overlap regression');
