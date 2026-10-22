import {ROAD_MESH} from './route-network.js';
import {canyonApproachPoint} from './canyon-approach.js';
import {polygonIndex,meshFootprints,subtractFootprints} from './surface-cut.js';

const deepFreeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;};
const Y=.008;
// u points west, v points north. Every solid below is described in these metres,
// and the same geometry is passed to the renderer and the physics world.
export const PHYSICS_TEST_TRACK=deepFreeze({
 id:'physics-test',name:'Физический полигон',height:Y,
 approach:{length:250,halfWidth:9,shoulder:1},
 pad:{minX:-365,maxX:-125,minZ:-310,maxZ:-135,width:240,length:175,height:Y},
 drift:{u0:50,u1:225,v0:10,v1:60},
 ramps:[
  {id:'small-ramp',u0:75,u1:87,v0:78,v1:92,rise:1.5,gapEnd:90,depth:4},
  {id:'large-ramp',u0:75,u1:89,v0:108,v1:122,rise:3,gapEnd:97,depth:4},
 ],
 bridge:{u0:100,u1:125,v0:140,v1:165,centerV:155,width:5,rise:3,approach:15,depth:8},
 checkpoints:[
  {id:'entry',u:28,v:80},{id:'drift',u:135,v:35},
  {id:'small-ramp',u:60,v:85},{id:'large-ramp',u:60,v:115},
  {id:'obstacles',u:25,v:137},{id:'bridge',u:75,v:155},{id:'bridge-landing',u:155,v:155},
 ],
});
const local=(x,z)=>({u:-125-x,v:-135-z});
const world=(u,v)=>({x:-125-u,z:-135-v});
const rect=(u0,u1,v0,v1)=>[world(u0,v0),world(u1,v0),world(u1,v1),world(u0,v1)];
const padFootprint=rect(0,240,0,175);
export function physicsTestApproachPoint(s){
 const p=canyonApproachPoint(Math.max(0,Math.min(250,Number.isFinite(s)?s:0))),heading=-p.heading;
 return {...p,x:-p.x,heading,right:{x:Math.cos(heading),z:-Math.sin(heading)}};
}
const samples=Array.from({length:251},(_,s)=>physicsTestApproachPoint(s));
function approachQuads(width){
 const edge=(p,side)=>({x:p.x+p.right.x*width*side,z:p.z+p.right.z*width*side});
 return samples.slice(1).map((b,i)=>{const a=samples[i];return [edge(a,-1),edge(b,-1),edge(b,1),edge(a,1)];});
}
export function physicsTestClearanceQuads(padding=0){
 padding=Math.max(0,Number.isFinite(padding)?padding:0);
 return [...approachQuads(10+padding),rect(-padding,240+padding,-padding,175+padding)];
}
export function physicsTestGroundCuts(){return physicsTestClearanceQuads();}
function projectApproach(x,z){
 let best={distance:Infinity,progress:0};
 for(let i=1;i<samples.length;i++){
  const a=samples[i-1],b=samples[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz))),px=a.x+t*dx,pz=a.z+t*dz,distance=Math.hypot(x-px,z-pz);
  if(distance<best.distance)best={distance,progress:i-1+t,x:px,z:pz};
 }
 return best;
}
export function containsPhysicsTestTrack(x,z,{includeApproach=true}={}){
 if(!Number.isFinite(x)||!Number.isFinite(z))return false;
 const {u,v}=local(x,z);
 // Retain the mode for cars falling beside the exercises or outside a pad edge.
 if(u>=-6&&u<=246&&v>=-6&&v<=181)return true;
 if(!includeApproach||z>-21)return false;
 const p=projectApproach(x,z),end=samples.at(-1),forward={x:-Math.sin(end.heading),z:-Math.cos(end.heading)};
 return p.distance<=12&&(x-end.x)*forward.x+(z-end.z)*forward.z<=6;
}
const inRect=(u,v,r)=>u>=r.u0&&u<=r.u1&&v>=r.v0&&v<=r.v1;
export function physicsTestHeight(x,z){
 const {u,v}=local(x,z),bridge=PHYSICS_TEST_TRACK.bridge;
 if(u>=0&&u<=240&&v>=0&&v<=175){
  for(const r of PHYSICS_TEST_TRACK.ramps)if(v>=r.v0&&v<=r.v1){
   if(u>=r.u0&&u<=r.u1)return Y+r.rise*(u-r.u0)/(r.u1-r.u0);
   if(u>r.u1&&u<r.gapEnd)return Y-r.depth;
  }
  if(inRect(u,v,bridge)){
   if(Math.abs(v-bridge.centerV)<=bridge.width/2)return Y+bridge.rise;
   return Y-bridge.depth;
  }
  if(Math.abs(v-bridge.centerV)<=bridge.width/2){
   if(u>=bridge.u0-bridge.approach&&u<bridge.u0)return Y+bridge.rise*(u-bridge.u0+bridge.approach)/bridge.approach;
   if(u>bridge.u1&&u<=bridge.u1+bridge.approach)return Y+bridge.rise*(bridge.u1+bridge.approach-u)/bridge.approach;
  }
  return Y;
 }
 return z<=-21&&projectApproach(x,z).distance<=10?Y:undefined;
}
export function physicsTestCheckpoint(x,z){
 const {u,v}=local(x,z);
 if(u<0||v<0||u>240||v>175){const p=projectApproach(x,z),safe=physicsTestApproachPoint(Math.max(60,Math.min(230,p.progress)));return {id:'approach',x:safe.x,y:Y,z:safe.z,heading:safe.heading};}
 let id;
 if(v>=72&&v<=98&&u>=45)id='small-ramp';
 else if(v>=102&&v<=128&&u>=45)id='large-ramp';
 else if(v>=138&&u>=75&&u<=142)id='bridge';
 else if(inRect(u,v,PHYSICS_TEST_TRACK.drift))id='drift';
 let checkpoint=id&&PHYSICS_TEST_TRACK.checkpoints.find(p=>p.id===id);
 if(!checkpoint)checkpoint=PHYSICS_TEST_TRACK.checkpoints.reduce((a,b)=>Math.hypot(u-a.u,v-a.v)<=Math.hypot(u-b.u,v-b.v)?a:b);
 return {id:checkpoint.id,...world(checkpoint.u,checkpoint.v),y:Y,heading:Math.PI/2};
}

export function createPhysicsTestTrack(THREE,{document:doc=globalThis.document,language=()=>'ru'}={}){
 const group=new THREE.Group();group.name='Physics test track';
 const geometries=new Set(),materials=new Map(),textures=new Set(),colliders=[];let disposed=false;
 const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.88}));return materials.get(color);};
 const addMesh=(name,geometry,color)=>{geometries.add(geometry);const mesh=new THREE.Mesh(geometry,material(color));mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=true;group.add(mesh);return mesh;};
 const triangle=(out,a,b,c)=>out.push(...a,...b,...c);
 const face=(out,a,b,c,d)=>{triangle(out,a,b,c);triangle(out,a,c,d);};
 function poly(out,polygon,height=Y){
  for(let i=1;i<polygon.length-1;i++){
   let a=polygon[0],b=polygon[i],c=polygon[i+1];
   const area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
   if(Math.abs(area)<1e-9)continue;if(area>0)[b,c]=[c,b];
   triangle(out,...[a,b,c].map(p=>[Math.fround(p.x),height,Math.fround(p.z)]));
  }
 }
 function trimesh(name,positions,color,tag='road'){
  const vertices=new Float32Array(positions),indices=Uint32Array.from({length:positions.length/3},(_,i)=>i),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeVertexNormals();
  addMesh(name,geometry,color);colliders.push({type:'trimesh',vertices,indices,tag,name});
 }
 function box(name,u,v,width,length,height,bottom,color,tag='obstacle'){
  const p=world(u,v),position=[p.x,bottom+height/2,p.z],halfExtents=[width/2,height/2,length/2];
  const mesh=addMesh(name,new THREE.BoxGeometry(width,height,length),color);mesh.position.set(...position);
  colliders.push({type:'box',position,halfExtents,tag,name});return mesh;
 }
 function wedge(name,u0,u1,v0,v1,h0,h1,color=0xb7b6ac){
  const out=[],a=world(u0,v0),b=world(u1,v0),c=world(u1,v1),d=world(u0,v1),bottom=Y-.5;
  const A=[a.x,h0,a.z],B=[b.x,h1,b.z],C=[c.x,h1,c.z],D=[d.x,h0,d.z];
  const aa=[a.x,bottom,a.z],bb=[b.x,bottom,b.z],cc=[c.x,bottom,c.z],dd=[d.x,bottom,d.z];
  face(out,A,D,C,B);face(out,aa,bb,cc,dd);face(out,A,B,bb,aa);face(out,B,C,cc,bb);face(out,C,D,dd,cc);face(out,D,A,aa,dd);
  trimesh(name,out,color);
 }
 const bridge=PHYSICS_TEST_TRACK.bridge,pits=PHYSICS_TEST_TRACK.ramps.map(r=>({id:r.id,u0:r.u1,u1:r.gapEnd,v0:r.v0,v1:r.v1,depth:r.depth})).concat({id:'bridge',...bridge});
 const rampCuts=PHYSICS_TEST_TRACK.ramps.map(r=>rect(r.u0,r.u1,r.v0,r.v1));
 rampCuts.push(rect(bridge.u0-bridge.approach,bridge.u0,bridge.centerV-bridge.width/2,bridge.centerV+bridge.width/2),rect(bridge.u1,bridge.u1+bridge.approach,bridge.centerV-bridge.width/2,bridge.centerV+bridge.width/2));
 const padCuts=polygonIndex([...pits.map(p=>rect(p.u0,p.u1,p.v0,p.v1)),...rampCuts]),pad=[];
 for(const p of subtractFootprints(padFootprint,padCuts))poly(pad,p);
 trimesh('Physics test pad',pad,0x555b60);
 const mainRoad=polygonIndex(meshFootprints(ROAD_MESH)),owners=polygonIndex([...meshFootprints(ROAD_MESH),padFootprint]);
 const approach=[];
 for(const quad of approachQuads(9))for(const p of subtractFootprints(quad,owners))poly(approach,p);
 trimesh('Physics test approach asphalt',approach,0x343b43);
 const shoulders=[];
 const edge=(p,width,side)=>({x:p.x+p.right.x*width*side,z:p.z+p.right.z*width*side});
 for(let i=1;i<samples.length;i++)for(const side of [-1,1]){
  const a=samples[i-1],b=samples[i],quad=[edge(a,9,side),edge(b,9,side),edge(b,10,side),edge(a,10,side)];
  for(const p of subtractFootprints(quad,owners))poly(shoulders,p);
 }
 trimesh('Physics test approach shoulders',shoulders,0xe4b771);
 // Vertical pit faces terminate precisely at the edge of the cut surface.
 for(const p of pits){
  box(`${p.id} pit floor`,(p.u0+p.u1)/2,(p.v0+p.v1)/2,p.u1-p.u0,p.v1-p.v0,.4,Y-p.depth-.4,0x33383d,'road');
  box(`${p.id} pit west wall`,p.u1+.15,(p.v0+p.v1)/2,.3,p.v1-p.v0,p.depth,Y-p.depth,0x8b887e,'road');
  box(`${p.id} pit east wall`,p.u0-.15,(p.v0+p.v1)/2,.3,p.v1-p.v0,p.depth,Y-p.depth,0x8b887e,'road');
  box(`${p.id} pit north wall`,(p.u0+p.u1)/2,p.v1+.15,p.u1-p.u0,.3,p.depth,Y-p.depth,0x8b887e,'road');
  box(`${p.id} pit south wall`,(p.u0+p.u1)/2,p.v0-.15,p.u1-p.u0,.3,p.depth,Y-p.depth,0x8b887e,'road');
 }
 for(const r of PHYSICS_TEST_TRACK.ramps)wedge(`${r.id} closed launch ramp`,r.u0,r.u1,r.v0,r.v1,Y,Y+r.rise);
 const v0=bridge.centerV-bridge.width/2,v1=bridge.centerV+bridge.width/2;
 wedge('Bridge ascending ramp',bridge.u0-bridge.approach,bridge.u0,v0,v1,Y,Y+bridge.rise);
 wedge('Bridge descending ramp',bridge.u1,bridge.u1+bridge.approach,v0,v1,Y+bridge.rise,Y);
 box('Narrow bridge open deck',(bridge.u0+bridge.u1)/2,bridge.centerV,bridge.u1-bridge.u0,bridge.width,.4,Y+bridge.rise-.4,0xc7b89a,'road');
 // No continuous bridge rails: the unguarded 2.5 m sides expose the deep pit.
 for(const u of [bridge.u0-1,bridge.u1+1])for(const v of [v0+.4,v1-.4])box('Bridge support pier',u,v,.8,.8,3,Y,0x8b887e,'road');
 for(const [i,u,v,w,l,h] of [[1,26,146,3,3,1.4],[2,43,141,3,3,1.7],[3,60,147,3,3,1.4]])box(`Slalom solid block ${i}`,u,v,w,l,h,Y,0xd58543);
 for(const [i,u,h] of [[1,35,.15],[2,50,.35],[3,65,.65]])box(`Stepped curb ${i}`,u,161,2,7,h,Y,0xe4b771);
 // Shared painted geometry carries lane guidance, drift rings and pit warnings.
 const paint=[];
 const paintRect=(u0,u1,v0,v1)=>poly(paint,rect(u0,u1,v0,v1),Y+.012);
 for(const v of [69,101,132])for(let u=8;u<232;u+=10)paintRect(u,u+5,v-.09,v+.09);
 for(const r of PHYSICS_TEST_TRACK.ramps){
  for(let u=8;u<70;u+=9)paintRect(u,u+4,(r.v0+r.v1)/2-.08,(r.v0+r.v1)/2+.08);
  for(let u=r.gapEnd;u<223;u+=9)paintRect(u,u+4,(r.v0+r.v1)/2-.08,(r.v0+r.v1)/2+.08);
  for(let v=r.v0;v<r.v1;v+=2)paintRect(r.gapEnd+.15,r.gapEnd+.55,v,v+1);
 }
 for(const radius of [12,22])for(let i=0;i<96;i++){
  const a=i*Math.PI*2/96,b=(i+1)*Math.PI*2/96;
  poly(paint,[world(135+Math.cos(a)*(radius-.07),35+Math.sin(a)*(radius-.07)),world(135+Math.cos(b)*(radius-.07),35+Math.sin(b)*(radius-.07)),world(135+Math.cos(b)*(radius+.07),35+Math.sin(b)*(radius+.07)),world(135+Math.cos(a)*(radius+.07),35+Math.sin(a)*(radius+.07))],Y+.012);
 }
 const paintGeometry=new THREE.BufferGeometry();paintGeometry.setAttribute('position',new THREE.Float32BufferAttribute(paint,3));paintGeometry.computeVertexNormals();addMesh('Physics test lane markings',paintGeometry,0xf4cf75);
 // City ownership also clips decorative approach dashes at the fork.
 for(let s=24;s<240;s+=10){
  const p=physicsTestApproachPoint(s),corners=[[-.08,-2],[.08,-2],[.08,2],[-.08,2]].map(([x,z])=>({x:p.x+Math.cos(p.heading)*x+Math.sin(p.heading)*z,z:p.z-Math.sin(p.heading)*x+Math.cos(p.heading)*z}));
  const out=[];for(const q of subtractFootprints(corners,mainRoad))for(const q2 of subtractFootprints(q,polygonIndex([padFootprint])))poly(out,q2,Y+.012);
  if(out.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(out,3));g.computeVertexNormals();addMesh('Physics test approach center dash',g,0xf4cf75);}
 }
 const signPoint=physicsTestApproachPoint(115),signU=local(signPoint.x+signPoint.right.x*12,signPoint.z+signPoint.right.z*12);
 box('Physics test sign upright',signU.u,signU.v,.45,.45,5,Y,0x555b60);
 const board=box('Physics test sign board',signU.u,signU.v,12,.6,2.6,Y+4,0x172d3a);board.rotation.y=signPoint.heading;
 // The rotated board uses the same world orientation for its collider.
 colliders.at(-1).quaternion=[0,Math.sin(signPoint.heading/2),0,Math.cos(signPoint.heading/2)];
 const canvas=doc?.createElement?.('canvas'),context=canvas?.getContext?.('2d');let signLanguage='';
 let texture,signMaterial;
 if(context){
  canvas.width=1024;canvas.height=256;texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);
  signMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:.88});board.material=[board.material,signMaterial];
  // The four frame faces share one draw; both painted faces share another.
  board.geometry.clearGroups();board.geometry.addGroup(0,24,0);board.geometry.addGroup(24,12,1);
 }
 function refreshSign(){
  if(!context||disposed)return;const value=typeof language==='function'?language():language,lang=value==='en'?'en':'ru';if(lang===signLanguage)return;signLanguage=lang;
  context.fillStyle='#172d3a';context.fillRect(0,0,1024,256);context.strokeStyle='#f4cf75';context.lineWidth=8;context.strokeRect(12,12,1000,232);context.textAlign='center';context.textBaseline='middle';context.fillStyle='#fff4cf';context.font='900 66px Arial, sans-serif';context.fillText(lang==='en'?'Physics Test Track':'Физический полигон',512,92,960);context.font='700 34px Arial, sans-serif';context.fillText(lang==='en'?'All vehicles · Ramps · Bridge · Drift':'Все машины · Трамплины · Мост · Дрифт',512,181,960);texture.needsUpdate=true;
 }
 refreshSign();
 // Keep named canonical geometry for inspection and collision correspondence.
 // Rendering uses one indexed batch per opaque material, baking each source's
 // local transform while retaining the group's eventual world transform.
 const batches=new Map(),point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
 for(const source of [...group.children]){
  if(!source.isMesh||source===board||Array.isArray(source.material))continue;
  if(!batches.has(source.material))batches.set(source.material,{positions:[],normals:[],uvs:[],indices:[],sources:[]});
  const data=batches.get(source.material),geometry=source.geometry,p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  const vertexStart=data.positions.length/3,indexStart=data.indices.length,indexCount=geometry.index?.count||p.count;
  source.updateMatrix();normalMatrix.getNormalMatrix(source.matrix);
  for(let i=0;i<p.count;i++){
   point.fromBufferAttribute(p,i).applyMatrix4(source.matrix);normal.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();
   data.positions.push(point.x,point.y,point.z);data.normals.push(normal.x,normal.y,normal.z);data.uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);
  }
  for(let i=0;i<indexCount;i++)data.indices.push(vertexStart+(geometry.index?geometry.index.getX(i):i));
  data.sources.push({source,vertexStart,vertexCount:p.count,indexStart,indexCount});
 }
 let batchIndex=0;
 for(const [batchMaterial,data] of batches){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));geometry.setIndex(data.indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries.add(geometry);
  const batch=new THREE.Mesh(geometry,batchMaterial);batch.name=`Physics test static batch ${batchIndex++}`;batch.receiveShadow=batch.castShadow=true;batch.matrixAutoUpdate=false;batch.userData.spatialStatic=true;batch.userData.physicsStaticBatch=true;group.add(batch);
  for(const {source,...part} of data.sources){source.visible=false;source.matrixAutoUpdate=false;source.userData.physicsBatch={...part,batchName:batch.name};}
 }
 group.userData.physicsTestTrack=true;
 return {group,colliders,contains:containsPhysicsTestTrack,recoveryFor:physicsTestCheckpoint,refreshSign,
  dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());signMaterial?.dispose();group.removeFromParent();},
 };
}
