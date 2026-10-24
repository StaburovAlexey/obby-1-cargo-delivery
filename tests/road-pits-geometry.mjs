import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCity} from '../dist/network-scene.js';
import {createTerrainCliffExcluder} from '../dist/terrain-cliffs.js';
import {routePointAtProgress,ROAD_SURFACE_OFFSET,surfaceHeight} from '../dist/route-network.js';

// A straight, flat canonical fixture keeps the expected cut and wedge heights
// independent from procedural placement. Rotated catalog coverage is added below.
const ordinaryPoint=routePointAtProgress(400),jumpPoint=routePointAtProgress(480);
const rectangle=(p,width,from,to,offset=0)=>[[offset-width/2,from],[offset+width/2,from],[offset+width/2,to],[offset-width/2,to]].map(([r,f])=>({x:p.x+Math.cos(p.heading)*r-Math.sin(p.heading)*f,z:p.z-Math.sin(p.heading)*r-Math.cos(p.heading)*f}));
const ordinary={id:'fixture-pit',type:'pit',biome:'city',edgeId:ordinaryPoint.edgeId,edgeDistance:ordinaryPoint.edgeDistance,progress:400,distance:ordinaryPoint.distance,x:ordinaryPoint.x-Math.cos(ordinaryPoint.heading)*5,z:ordinaryPoint.z+Math.sin(ordinaryPoint.heading)*5,heading:ordinaryPoint.heading,height:0,offset:-5,width:8,length:12,depth:20,cutWidth:8,cutFootprint:rectangle(ordinaryPoint,8,-6,6,-5),ramp:null,reservation:{from:260,to:300}};
const jump={id:'fixture-jump',type:'jump',biome:'city',edgeId:jumpPoint.edgeId,edgeDistance:jumpPoint.edgeDistance,progress:480,distance:jumpPoint.distance,x:jumpPoint.x,z:jumpPoint.z,heading:jumpPoint.heading,height:0,offset:0,width:30,length:6,depth:20,cutWidth:224,cutFootprint:rectangle(jumpPoint,224,-3,3),ramp:{length:16,height:2.4,width:30,footprint:rectangle(jumpPoint,30,-19,-3),fromEdgeDistance:jumpPoint.edgeDistance-19,toEdgeDistance:jumpPoint.edgeDistance-3},reservation:{from:300,to:470}};
const world=(p,r=0,f=0)=>({x:p.x+Math.cos(p.heading)*r-Math.sin(p.heading)*f,z:p.z-Math.sin(p.heading)*r-Math.cos(p.heading)*f});
const city=buildCity(THREE,{roadPits:[ordinary,jump]});
city.group.updateMatrixWorld(true);
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
function hits(x,z,meshes,originY=10){ray.set(new THREE.Vector3(x,originY,z),down);ray.far=80;return ray.intersectObjects(meshes).map(h=>h.point.y);}
const road=city.group.getObjectByName('Continuous 30m-wide road'),ground=city.group.getObjectByName('Closed continuous terrain foundation');

test('pit mouths remove the original asphalt and every reachable jump shoulder',()=>{
 for(const {x,z} of [ordinary,jump,world(jump,-90),world(jump,90)])assert.deepEqual(hits(x,z,[road,ground]),[],`Original surface remains in a pit at ${x},${z}`);
 assert.ok(hits(world(ordinaryPoint,5).x,world(ordinaryPoint,5).z,[road])[0]>-.01,'ordinary pit keeps the opposite 8m bypass');
 assert.ok(hits(world(jump,0,-20).x,world(jump,0,-20).z,[road])[0]>-.01,'jump keeps original surface before takeoff');
});

test('a ramp replaces the flat support and has the intended forward wedge height',()=>{
 const ramps=city.group.getObjectByName('Road jump ramps');assert.ok(ramps,'City must render its physics ramp source');
 for(const [forward,want] of [[-18.9,.015],[-15, .6],[-11,1.2],[-7,1.8],[-3.1,2.385]]){
  const {x,z}=world(jump,0,forward);
  const support=hits(x,z,[road,ground,ramps]);
  assert.equal(support.length,1,`one support surface at wedge station ${forward}`);
  assert.ok(Math.abs(support[0]-ROAD_SURFACE_OFFSET-want)<.0001,`${support[0]} != ${want}`);
  assert.deepEqual(hits(x,z,[road,ground]),[],'no original flat road underneath wedge');
 }
});

test('pit geology owns twenty metre walls and upward floors without default cliff duplicates',()=>{
 const walls=city.group.getObjectByName('Road pit walls'),floors=city.group.getObjectByName('Road pit floors'),cliffs=city.group.getObjectByName('Layered earth and rock cliffs');
 assert.ok(walls&&floors,'City needs dedicated visible pit geology');
 for(const p of [ordinary,jump]){
  const h=hits(p.x,p.z,[floors]);assert.ok(h.length);assert.ok(Math.abs(h[0]+20-ROAD_SURFACE_OFFSET)<.00001);
  ray.set(new THREE.Vector3(p.x,-5,p.z),new THREE.Vector3(Math.sin(p.heading),0,Math.cos(p.heading)));ray.far=p.length/2+.1;
  assert.ok(ray.intersectObject(walls).length,'inward visible near wall');
  assert.equal(ray.intersectObject(cliffs).length,0,'no forty eight metre default wall owns this pit');
 }
 const edges=cliffs.userData.physicsCliffEdges;
 for(let i=0;i<edges.length;i+=6){const x=(edges[i]+edges[i+3])/2,z=(edges[i+2]+edges[i+5])/2;const dx=x-ordinary.x,dz=z-ordinary.z,r=dx*Math.cos(ordinary.heading)-dz*Math.sin(ordinary.heading),f=-dx*Math.sin(ordinary.heading)-dz*Math.cos(ordinary.heading);assert.ok(!(Math.abs(r)<=4.001&&Math.abs(f)<=6.001),'pit boundary became default cliff collider');}
});

test('all pit visuals are bounded static indexed batches with shared material and disposal',()=>{
 const meshes=[];city.group.traverse(o=>{if(o.isMesh&&/^Road (pit|jump)/.test(o.name))meshes.push(o);});
 assert.equal(meshes.length,4,'walls, floors, ramps and merged warning paint/signs');
 assert.equal(new Set(meshes.map(m=>m.material)).size,1,'all additions share one vertex colour material');
 for(const mesh of meshes){assert.ok(mesh.userData.spatialStatic);assert.ok(mesh.geometry.index);assert.ok(mesh.geometry.boundingSphere);assert.ok(mesh.geometry.index.count/3<12000);for(const value of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value));}
 const warnings=city.group.getObjectByName('Road pit warnings');const warningPositions=warnings.geometry.attributes.position;let earliest=Infinity;for(let i=0;i<warningPositions.count;i++){const dx=warningPositions.getX(i)-jump.x,dz=warningPositions.getZ(i)-jump.z;earliest=Math.min(earliest,-dx*Math.sin(jump.heading)-dz*Math.cos(jump.heading));}assert.ok(earliest<=-60,'warning signage/paint is visible sixty metres before gap');
 let disposed=0;for(const mesh of meshes)mesh.geometry.addEventListener('dispose',()=>disposed++);city.dispose();assert.equal(disposed,4);
});

// The real catalog exercises rotated, graded mouths across every biome rather
// than sharing expected geometry with the rendering implementation.
test('the real fifteen-pit catalog removes canonical support and owns every wedge across all biomes',async()=>{
 const {buildRoadPits,roadPitAt,roadPitRampHeight}=await import('../dist/road-pits.js');
 const pits=buildRoadPits(),actual=buildCity(THREE,{roadPits:pits});actual.group.updateMatrixWorld(true);
 const asphalt=actual.group.getObjectByName('Continuous 30m-wide road'),land=actual.group.getObjectByName('Closed continuous terrain foundation'),rampMesh=actual.group.getObjectByName('Road jump ramps'),floorMesh=actual.group.getObjectByName('Road pit floors');
 try{
  assert.equal(actual.roadPits,pits,'city exposes the shared immutable catalog');
  for(const pit of pits){
   const reference=surfaceHeight(pit.x,-pit.z)+ROAD_SURFACE_OFFSET;
   assert.deepEqual(hits(pit.x,pit.z,[asphalt,land],reference+10),[],`${pit.id} still has original road`);
   assert.ok(Math.abs(hits(pit.x,pit.z,[floorMesh],reference+10)[0]-(reference-20))<.03,`${pit.id} floor depth`);
   if(!pit.ramp){
    const outline=pit.cutFootprint,sign=Math.sign(outline.reduce((sum,a,i)=>{const b=outline[(i+1)%outline.length];return sum+a.x*b.z-b.x*a.z;},0));
    for(const edge of [0,Math.floor(outline.length/3),Math.floor(outline.length*2/3),outline.length-2]){
     const a=outline[edge],b=outline[(edge+1)%outline.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
     for(const direction of [-1,1]){
      const x=(a.x+b.x)/2-dz/length*sign*.1*direction,z=(a.z+b.z)/2+dx/length*sign*.1*direction;
      const label=`${pit.id} seeded edge ${edge}, side ${direction}`,inside=direction===1;
      assert.equal(roadPitAt(pits,x,z)===pit,inside,label+' helper membership');
      const support=hits(x,z,[asphalt,land],reference+10),floor=hits(x,z,[floorMesh],reference+10);
      if(inside){assert.deepEqual(support,[],label+' hidden mouth support');assert.ok(floor.length,label+' missing deep floor');}
      else{assert.ok(support.length,label+' removed solid bank');assert.deepEqual(floor,[],label+' floor extends into solid bank');}
     }
    }
    continue;
   }
   for(const t of [.1,.5,.9]){
    const p=pit.ramp.footprint,a={x:(p[0].x+p[1].x)/2,z:(p[0].z+p[1].z)/2},b={x:(p[2].x+p[3].x)/2,z:(p[2].z+p[3].z)/2},x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    const support=hits(x,z,[asphalt,land,rampMesh],reference+10);
    assert.equal(support.length,1,`${pit.id} duplicate/missing wedge support`);
    assert.ok(Math.abs(support[0]-roadPitRampHeight(pits,x,z))<.003,`${pit.id} support helper disagrees with wedge`);
    assert.deepEqual(hits(x,z,[asphalt,land],reference+10),[],`${pit.id} hidden flat floor under wedge`);
   }
  }
 }finally{actual.dispose();}
});

// Preserve the old perimeter even when a cut splits an exposed edge, while
// suppressing subtraction-created internal diagonals and the new mouth wall.
test('cliff ownership retains unchanged and split original perimeter without adding interior curtains',()=>{
 const source={positions:[0,0,0,10,0,0,10,0,10,0,0,10],indices:[0,2,1,0,3,2],progress:[0,0,10,10]};
 const excludes=createTerrainCliffExcluder([source]);
 assert.equal(excludes([0,0,0],[10,0,0]),false,'unchanged original perimeter');
 assert.equal(excludes([0,0,0],[4,0,0]),false,'split original perimeter');
 assert.equal(excludes([0,0,0],[10,0,10]),true,'triangulation interior diagonal');
 assert.equal(excludes([4,0,0],[4,0,6]),true,'new pit boundary');
 assert.equal(excludes([0,-20,0],[4,-20,0]),true,'pit floor does not inherit tall perimeter walls');
});

// A U-shaped mouth has two real open arms and a solid road notch. A convex
// half-plane cut or a triangle fan cannot represent this independent fixture.
const jaggedLocal=[[-15,-6],[6,-6],[6,6],[-1,6],[-1,-2],[-8,-2],[-8,6],[-15,6]];
let jagged;
function jaggedFixture(){
 if(jagged)return jagged;
 const center=world(ordinaryPoint,-4.5),pit={...ordinary,id:'fixture-concave-mouth',...center,width:21,offset:-4.5,cutFootprint:jaggedLocal.map(([r,f])=>world(ordinaryPoint,r,f))};
 const built=buildCity(THREE,{roadPits:[pit]});built.group.updateMatrixWorld(true);
 jagged={pit,city:built,road:built.group.getObjectByName('Continuous 30m-wide road'),ground:built.group.getObjectByName('Closed continuous terrain foundation'),floor:built.group.getObjectByName('Road pit floors'),walls:built.group.getObjectByName('Road pit walls'),warnings:built.group.getObjectByName('Road pit warnings'),cliffs:built.group.getObjectByName('Layered earth and rock cliffs')};
 return jagged;
}
test.after(()=>jagged?.city.dispose());

test('concave mouths cut both arms while keeping a solid notch and the nine-metre bypass',()=>{
 const g=jaggedFixture();
 for(const [r,f] of [[-11,2],[2,2],[-4.5,-4]]){const p=world(ordinaryPoint,r,f);assert.deepEqual(hits(p.x,p.z,[g.road,g.ground]),[],`uncut concave mouth at ${r},${f}`);}
 for(const [r,f] of [[-4.5,2],[6.2,0],[10.5,0],[14.8,0]]){const p=world(ordinaryPoint,r,f);assert.ok(Math.abs(hits(p.x,p.z,[g.road])[0]-ROAD_SURFACE_OFFSET)<.00001,`solid notch/bypass was removed at ${r},${f}`);}
});

test('concave floors follow the same outline without filling the solid notch',()=>{
 const g=jaggedFixture();
 for(const [r,f] of [[-11,2],[2,2],[-4.5,-4]]){const p=world(ordinaryPoint,r,f);assert.ok(Math.abs(hits(p.x,p.z,[g.floor])[0]-(ROAD_SURFACE_OFFSET-20))<.00001,`missing concave floor at ${r},${f}`);}
 const notch=world(ordinaryPoint,-4.5,2);assert.deepEqual(hits(notch.x,notch.z,[g.floor]),[],'triangle fan filled retained road notch');
});

test('every concave boundary wall faces into its actual mouth without default cliff duplicates',()=>{
 const g=jaggedFixture(),polygon=g.pit.cutFootprint;
 const signed=polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a.x*b.z-b.x*a.z;},0),sign=Math.sign(signed);
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),inward=new THREE.Vector3(-dz/length*sign,0,dx/length*sign),middle=new THREE.Vector3((a.x+b.x)/2,-5,(a.z+b.z)/2);
  ray.set(middle.clone().addScaledVector(inward,.2),inward.clone().negate());ray.far=.4;
  const wallHits=ray.intersectObject(g.walls);assert.ok(wallHits.length,`concave edge ${i} faces away from the hole`);assert.ok(wallHits[0].face.normal.dot(inward)>.999,`concave edge ${i} has an outward-facing normal`);
  assert.equal(ray.intersectObject(g.cliffs).length,0,`concave edge ${i} acquired a forty-eight-metre cliff`);
 }
});

test('flat warning paint follows the concave notch and remains off the open mouth',()=>{
 const g=jaggedFixture(),marked=world(ordinaryPoint,-1.25,2),inside=world(ordinaryPoint,-.75,2);
 assert.ok(hits(marked.x,marked.z,[g.warnings]).some(y=>Math.abs(y-ROAD_SURFACE_OFFSET-.026)<.00001),'missing warning strip along the actual re-entrant edge');
 assert.deepEqual(hits(inside.x,inside.z,[g.warnings]),[],'warning paint floats above open mouth');
});

test('a narrow offset ramp replaces support only inside its independent footprint and guides that approach',()=>{
 const offset=7.5,ramp={...jump.ramp,width:5.3,offset,footprint:rectangle(jumpPoint,5.3,-19,-3,offset)},pit={...jump,id:'fixture-offset-ramp',ramp},built=buildCity(THREE,{roadPits:[pit]});built.group.updateMatrixWorld(true);
 try{
  const asphalt=built.group.getObjectByName('Continuous 30m-wide road'),terrain=built.group.getObjectByName('Closed continuous terrain foundation'),rampMesh=built.group.getObjectByName('Road jump ramps'),warnings=built.group.getObjectByName('Road pit warnings'),center=world(jumpPoint,offset,-11),beside=world(jumpPoint,0,-11),guide=world(jumpPoint,offset+2,-48.7);
  assert.deepEqual(hits(center.x,center.z,[asphalt,terrain]),[],'original road remains below offset ramp');
  assert.ok(Math.abs(hits(center.x,center.z,[rampMesh])[0]-ROAD_SURFACE_OFFSET-1.2)<.00001,'offset ramp has no physical top');
  assert.ok(Math.abs(hits(beside.x,beside.z,[asphalt])[0]-ROAD_SURFACE_OFFSET)<.00001,'narrow ramp removed the adjacent approach road');
  assert.ok(hits(guide.x,guide.z,[warnings]).some(y=>Math.abs(y-ROAD_SURFACE_OFFSET-.026)<.00001),'approach chevrons still point at pit center instead of offset ramp');
 }finally{built.dispose();}
});
