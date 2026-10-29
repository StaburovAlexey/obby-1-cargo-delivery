import {CANYON_TRACK,canyonPointAt} from './canyon-track.js';
import {CANYON_TIMED_SECTIONS} from './canyon-checkpoints.js';

export function createCanyonCheckpointGates(THREE){
 const group=new THREE.Group();group.name='Canyon timed checkpoint gates';
 const geometry=new THREE.BoxGeometry(1,1,1);
 const material=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
 const postX=CANYON_TRACK.halfWidth+1,postWidth=.7,depth=.65,clearance=7,beamHeight=.8;
 // Split each post around a white band, keeping every face outside the road.
 const parts=[];
 for(const side of [-1,1]){
  for(const [bottom,top,band]of [[-.4,1.6,false],[1.6,2.1,true],[2.1,clearance,false]]){
   parts.push({x:postX*side,y:(bottom+top)/2,width:postWidth,height:top-bottom,band});
  }
 }
 parts.push({x:0,y:clearance+beamHeight/2,width:postX*2+postWidth,height:beamHeight,band:false});
 const object=new THREE.Object3D();
 const meshes=[0x39e7cc,0x91aebc].map((color,index)=>{
  const mesh=new THREE.InstancedMesh(geometry,material,parts.length);
  mesh.name=index===0?'Current canyon checkpoint':'Next canyon checkpoint';
  parts.forEach((part,i)=>{
   object.position.set(part.x,part.y,0);object.scale.set(part.width,part.height,depth);object.updateMatrix();
   mesh.setMatrixAt(i,object.matrix);mesh.setColorAt(i,new THREE.Color(part.band?0xf5fff8:color));
  });
  mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
  mesh.computeBoundingSphere();mesh.castShadow=false;mesh.receiveShadow=false;
  mesh.visible=false;mesh.matrixAutoUpdate=false;group.add(mesh);return mesh;
 });
 const right=new THREE.Vector3(),normal=new THREE.Vector3(),backward=new THREE.Vector3(),basis=new THREE.Matrix4();
 let target=null,disposed=false;
 function setTarget(indexOrNull){
  if(disposed)return;
  const nextTarget=Number.isInteger(indexOrNull)&&indexOrNull>=0&&indexOrNull<CANYON_TIMED_SECTIONS.length?indexOrNull:null;
  if(nextTarget===target)return;
  target=nextTarget;
  meshes.forEach((mesh,offset)=>{
   const index=target===null?-1:target+offset;
   // The final timed crossing already has the permanent finish arch.
   mesh.visible=index>=0&&index<CANYON_TIMED_SECTIONS.length-1;
   if(!mesh.visible)return;
   const point=canyonPointAt(CANYON_TIMED_SECTIONS[index].progress);
   right.set(point.right.x,0,point.right.z);normal.set(point.normal.x,point.normal.y,point.normal.z);
   backward.crossVectors(right,normal).normalize();basis.makeBasis(right,normal,backward);
   mesh.position.set(point.x,point.height,point.z);mesh.quaternion.setFromRotationMatrix(basis);mesh.updateMatrix();
  });
 }
 return {group,setTarget,dispose(){
  if(disposed)return;disposed=true;
  group.removeFromParent();meshes.forEach(mesh=>mesh.dispose());geometry.dispose();material.dispose();
 }};
}
