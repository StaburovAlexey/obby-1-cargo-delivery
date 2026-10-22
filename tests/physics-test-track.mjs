import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {PHYSICS_TEST_TRACK,physicsTestApproachPoint,physicsTestClearanceQuads,physicsTestGroundCuts,containsPhysicsTestTrack,physicsTestCheckpoint,physicsTestHeight,createPhysicsTestTrack} from '../dist/physics-test-track.js';
import {canyonApproachPoint} from '../dist/canyon-approach.js';
import {buildCity,createRoadFootprintIndex,polygonIntersectionArea} from '../dist/network-scene.js';
import {ROAD_MESH} from '../dist/route-network.js';
import {polygonIndex} from '../dist/surface-cut.js';
const world=(u,v)=>({x:-125-u,z:-135-v});
const meshData=mesh=>({positions:mesh.geometry.attributes.position.array,indices:mesh.geometry.index?.array||Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i)});
const triangles=data=>Array.from({length:data.indices.length/3},(_,i)=>[0,1,2].map(j=>{const k=data.indices[i*3+j]*3;return {x:data.positions[k],y:data.positions[k+1],z:data.positions[k+2]};}));
function supportHeights(track,u,v){
 const {x,z}=world(u,v),hits=[];
 for(const c of track.colliders){
  if(c.type==='box'){
   const [cx,cy,cz]=c.position,[hx,hy,hz]=c.halfExtents;
   if(!c.quaternion&&Math.abs(x-cx)<hx-1e-5&&Math.abs(z-cz)<hz-1e-5)hits.push(cy+hy);
   continue;
  }
  for(const [a,b,d] of triangles({positions:c.vertices,indices:c.indices})){
   const den=(b.z-d.z)*(a.x-d.x)+(d.x-b.x)*(a.z-d.z);if(Math.abs(den)<1e-8)continue;
   const wa=((b.z-d.z)*(x-d.x)+(d.x-b.x)*(z-d.z))/den,wb=((d.z-a.z)*(x-d.x)+(a.x-d.x)*(z-d.z))/den,wc=1-wa-wb;
   if(Math.min(wa,wb,wc)>-1e-6)hits.push(wa*a.y+wb*b.y+wc*d.y);
  }
 }
 return hits;
}

test('west fork is smooth, level and continuous into the large pad',()=>{
 assert.ok(Object.isFrozen(PHYSICS_TEST_TRACK)&&Object.isFrozen(PHYSICS_TEST_TRACK.pad));
 for(let s=0;s<=250;s+=.5){
  const p=physicsTestApproachPoint(s),c=canyonApproachPoint(s);assert.ok(Math.abs(p.x+c.x)<1e-8&&Math.abs(p.z-c.z)<1e-8);assert.equal(p.height,.008);assert.equal(p.heading,-c.heading);
  assert.ok(containsPhysicsTestTrack(p.x,p.z));
 }
 const end=physicsTestApproachPoint(250);assert.ok(Math.abs(end.x+139.268)<.001&&Math.abs(end.z+217.223)<.001);
 assert.ok(containsPhysicsTestTrack(-200,-220,{includeApproach:false}));
 assert.ok(!containsPhysicsTestTrack(0,-50,{includeApproach:false}));
 assert.ok(!containsPhysicsTestTrack(150,-200));
 for(const p of [...physicsTestGroundCuts(),...physicsTestClearanceQuads(2)].flat())assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z));
});

test('ramp gaps and bridge pit have real negative-depth floors without invisible support',()=>{
 const track=createPhysicsTestTrack(THREE,{document:null});
 try{
  for(const [u,v,depth] of [[88.5,85,4],[93,115,4],[111,145,8]]){
   const hits=supportHeights(track,u,v);assert.ok(hits.length,`floor exists ${u},${v}`);assert.ok(Math.max(...hits)<-.5,`no cover across pit ${u},${v}: ${hits}`);assert.ok(hits.some(h=>Math.abs(h-(.008-depth))<.001));
   assert.ok(containsPhysicsTestTrack(...Object.values(world(u,v))),'mode remains active during a fall');
  }
  for(const [u,v,h] of [[81,85,.758],[82,115,1.508],[95,155,2.008],[112,155,3.008],[130,155,2.008],[180,85,.008],[150,35,.008]]){
   assert.ok(Math.abs(Math.max(...supportHeights(track,u,v))-h)<.001,`${u},${v} has exact support ${h}`);
   const p=world(u,v);assert.ok(Math.abs(physicsTestHeight(p.x,p.z)-h)<.001);
  }
  const materials=new Set();let trianglesCount=0;
  track.group.traverse(m=>{if(!m.isMesh)return;for(const v of m.geometry.attributes.position.array)assert.ok(Number.isFinite(v));for(const mat of Array.isArray(m.material)?m.material:[m.material])materials.add(mat);trianglesCount+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;});
  assert.ok(trianglesCount<15000&&materials.size<14,'shared compact geometry/materials');
  assert.ok(track.colliders.some(c=>c.tag==='obstacle')&&track.colliders.some(c=>c.tag==='road'));
  for(const c of track.colliders)if(c.type==='trimesh'){assert.ok(c.vertices instanceof Float32Array&&c.indices instanceof Uint32Array);for(const v of c.vertices)assert.ok(Number.isFinite(v));}
 }finally{track.dispose();track.dispose();}
});

test('recovery selects nearby safe exercise starts and never a pit or ramp edge',()=>{
 for(const [u,v,id] of [[88,85,'small-ramp'],[92,115,'large-ramp'],[112,145,'bridge'],[150,25,'drift']]){
  const p=world(u,v),c=physicsTestCheckpoint(p.x,p.z);assert.equal(c.id,id);assert.ok(Number.isFinite(c.heading));assert.ok(Math.abs(physicsTestHeight(c.x,c.z)-.008)<1e-8);assert.ok(Math.hypot(c.x-p.x,c.z-p.z)<65);
 }
 const p=physicsTestApproachPoint(125),c=physicsTestCheckpoint(p.x,p.z);assert.equal(c.id,'approach');assert.ok(Math.hypot(c.x-p.x,c.z-p.z)<25);
});

test('pad and branch own their asphalt once while city terrain, walls and facades stay clear',()=>{
 const city=buildCity(THREE),track=createPhysicsTestTrack(THREE,{document:null}),road=createRoadFootprintIndex(ROAD_MESH),clearance=polygonIndex(physicsTestClearanceQuads(1)),terrain=createRoadFootprintIndex(meshData(city.group.getObjectByName('Closed continuous terrain foundation')));
 try{
  const pad=track.group.getObjectByName('Physics test pad'),approach=track.group.getObjectByName('Physics test approach asphalt');
  assert.ok(pad&&approach);
  const padIndex=createRoadFootprintIndex(meshData(pad));
  for(const mesh of [pad,approach])for(const tri of triangles(meshData(mesh))){
   assert.ok(!road.intersects(tri,1e-5),'no main asphalt covered');assert.ok(!terrain.intersects(tri,.0002),'old terrain removed under track');
   if(mesh===approach)assert.ok(!padIndex.intersects(tri,.0001),'pad/branch ownership is disjoint');
  }
  for(const b of city.features.filter(f=>f.type==='building')){const p=b.footprint.map(p=>({x:p.x,z:-p.y}));for(const q of clearance.candidates(p))assert.ok(polygonIntersectionArea(p,q)<1e-6,'facades respect actual branch/pad corridor');}
  const west=city.features.filter(f=>f.type==='building'&&f.edgeId==='city--17-3000'&&f.side===-1&&f.from>=72&&f.to<=145);assert.equal(west.length,0,'four west facades open at the new fork');
  // A cliff crossing the branch would be a visible wall in the seamless fork.
  const cliffs=city.group.getObjectByName('Layered earth and rock cliffs'),p=cliffs.geometry.attributes.position;
  for(let i=0;i<p.count;i++)if(p.getY(i)>-.1&&p.getY(i)<.1){const a=physicsTestApproachPoint(100);assert.ok(Math.hypot(p.getX(i)-a.x,p.getZ(i)-a.z)>8.8,'no cliff cap blocks the branch');}
 }finally{city.dispose();track.dispose();}
});

test('static polygon rendering stays within twelve draw calls including the live sign',()=>{
 let language='ru';const words=[],context={fillRect(){},strokeRect(){},fillText(value){words.push(value);}},document={createElement(){return {getContext(){return context;}};}};
 const track=createPhysicsTestTrack(THREE,{document,language:()=>language});
 try{
  let drawCalls=0;track.group.traverseVisible(mesh=>{if(mesh.isMesh)drawCalls+=Array.isArray(mesh.material)?mesh.geometry.groups.length:1;});
  assert.ok(drawCalls<=12,`at most 12 submitted draw calls, got ${drawCalls}`);
  assert.ok(words.includes('Физический полигон'));
  language='en';track.refreshSign();assert.ok(words.includes('Physics Test Track'),'dynamic sign still refreshes independently');
 }finally{track.dispose();}
});

test('static batches preserve every canonical triangle and its world transform',()=>{
 const track=createPhysicsTestTrack(THREE,{document:null}),point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3(),actualWorld=new THREE.Vector3();
 try{
  track.group.position.set(23,4,-11);track.group.rotation.y=.37;track.group.updateMatrixWorld(true);
  const sources=[];track.group.traverse(mesh=>{if(mesh.userData.physicsBatch)sources.push(mesh);});
  assert.ok(sources.length>25,'canonical named sources remain available for gameplay inspection');
  const seen=new Map();
  for(const source of sources){
   assert.equal(source.visible,false,'only the merged proxy submits geometry');
   const part=source.userData.physicsBatch,batch=track.group.getObjectByName(part.batchName),g=source.geometry,bg=batch.geometry;
   assert.ok(batch.userData.spatialStatic&&batch.visible,'batches remain eligible for the existing spatial renderer');
   source.updateMatrix();normalMatrix.getNormalMatrix(source.matrix);
   const p=g.attributes.position,n=g.attributes.normal;
   for(let i=0;i<p.count;i++){
    point.fromBufferAttribute(p,i).applyMatrix4(source.matrix);normal.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();
    for(const [j,k] of ['x','y','z'].entries()){
     assert.equal(bg.attributes.position.array[(part.vertexStart+i)*3+j],Math.fround(point[k]),`exact transformed vertex ${source.name}`);
     assert.ok(Math.abs(bg.attributes.normal.array[(part.vertexStart+i)*3+j]-normal[k])<1e-6,`normal preserved ${source.name}`);
    }
    point.fromBufferAttribute(p,i).applyMatrix4(source.matrixWorld);actualWorld.fromBufferAttribute(bg.attributes.position,part.vertexStart+i).applyMatrix4(batch.matrixWorld);
    assert.ok(actualWorld.distanceTo(point)<.00003,`world transform preserved ${source.name}`);
   }
   for(let i=0;i<part.indexCount;i++)assert.equal(bg.index.getX(part.indexStart+i),part.vertexStart+(g.index?g.index.getX(i):i));
   seen.set(batch,(seen.get(batch)||0)+part.indexCount);
  }
  for(const [batch,count] of seen)assert.equal(batch.geometry.index.count,count,'batch contains exactly the original triangles, with no new covering surface');
  for(const name of ['Physics test pad','Physics test approach asphalt'])assert.ok(track.group.getObjectByName(name).userData.physicsBatch,'named source geometry remains inspectable');
 }finally{track.dispose();}
});
