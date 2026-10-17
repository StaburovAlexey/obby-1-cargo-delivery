import {CANYON_TRACK,canyonPointAt} from './canyon-track.js';

export function createCanyonScene(THREE){
 const group=new THREE.Group();group.name='Downhill sandstone drift canyon';
 const geometries=new Set(),materials=new Set(),instances=[];let disposed=false;
 const mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.94,...extra});materials.add(m);return m;};
 const box=new THREE.BoxGeometry(1,1,1);geometries.add(box);
 function strip(name,left,right,material,lift=0){
  const positions=[],indices=[];let i=0;
  for(let s=0;s<=CANYON_TRACK.length;s+=2){const p=canyonPointAt(s);for(const w of [left,right])positions.push(p.x+p.right.x*w,p.height+lift,p.z+p.right.z*w);if(i>0)indices.push(i-2,i-1,i,i-1,i+1,i);i+=2;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometries.add(geometry);
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;group.add(mesh);return mesh;
 }
 strip('Canyon asphalt',-9,9,mat(0x3e4349));strip('Canyon left shoulder',-15,-9,mat(0xc49461),-.04);strip('Canyon right shoulder',9,15,mat(0xd3a576),-.04);
 strip('Canyon left edge paint',-8.65,-8.48,mat(0xf9e9c5),.02);strip('Canyon right edge paint',8.48,8.65,mat(0xf9e9c5),.02);
 const object=new THREE.Object3D();
 function batch(name,geometry,material,parts){
  const mesh=new THREE.InstancedMesh(geometry,material,parts.length);mesh.name=name;
  parts.forEach((p,i)=>{object.position.set(...p.position);object.rotation.set(0,p.heading||0,0);object.scale.set(...p.scale);object.updateMatrix();mesh.setMatrixAt(i,object.matrix);if(p.color!==undefined)mesh.setColorAt(i,new THREE.Color(p.color));});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);instances.push(mesh);return mesh;
 }
 const rails=[],posts=[],dashes=[],chevrons=[];
 for(let s=4;s<CANYON_TRACK.length-2;s+=6){const p=canyonPointAt(s);for(const side of [-1,1])rails.push({position:[p.x+p.right.x*9.25*side,p.height+.78,p.z+p.right.z*9.25*side],scale:[.22,.5,6.1],heading:p.heading});}
 for(let s=0;s<CANYON_TRACK.length;s+=12){const p=canyonPointAt(s);for(const side of [-1,1])posts.push({position:[p.x+p.right.x*9.25*side,p.height+.48,p.z+p.right.z*9.25*side],scale:[.25,.95,.25]});}
 for(let s=8;s<CANYON_TRACK.length;s+=14){const p=canyonPointAt(s);dashes.push({position:[p.x,p.height+.024,p.z],scale:[.14,.028,5],heading:p.heading});}
 batch('Canyon steel guardrails',box,mat(0xbfc3bd,{metalness:.3}),rails);batch('Canyon guardrail posts',box,mat(0x6d7478),posts);batch('Canyon center dashes',box,mat(0xe9b94e),dashes);
 const rock=new THREE.CylinderGeometry(1,1,1,7,1);geometries.add(rock);
 for(let layer=0;layer<3;layer++){
  const parts=[];
  for(let s=0,index=0;s<=CANYON_TRACK.length;s+=19,index++){
   const p=canyonPointAt(s);
   for(const side of [-1,1]){const wobble=Math.sin(index*3.1+side)*3.5,top=p.height+20+Math.sin(index*.7)*12,total=top+45,h=total/3;
    parts.push({position:[p.x+p.right.x*(34+wobble)*side,-45+h*(layer+.5),p.z+p.right.z*(34+wobble)*side],scale:[17+Math.sin(index*2.3)*3,h+.2,17+Math.cos(index*1.3)*3],heading:index*.3,color:[0xa45f3a,0xc88650,0xe0a56c][layer]});}
  }
  batch('Canyon sandstone stratum '+layer,rock,mat(0xffffff,{flatShading:true}),parts);
 }
 for(const [distance,name]of [[5,'Canyon start'],[CANYON_TRACK.finish,'Canyon finish']]){
  const p=canyonPointAt(distance),parts=[];
  for(const side of [-1,1])parts.push({position:[p.x+p.right.x*10.4*side,p.height+4,p.z+p.right.z*10.4*side],scale:[.65,8,.65]});
  parts.push({position:[p.x,p.height+8,p.z],scale:[21.5,1.3,.6],heading:p.heading});batch(name+' arch',box,mat(name.includes('finish')?0xf4d16f:0x4ac1d4),parts);
 }
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(1800,2800),mat(0xa87952));geometries.add(floor.geometry);floor.rotation.x=-Math.PI/2;floor.position.set(CANYON_TRACK.origin.x,-45,CANYON_TRACK.origin.z-650);group.add(floor);
 return {group,dispose(){if(disposed)return;disposed=true;instances.forEach(i=>i.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();}};
}
