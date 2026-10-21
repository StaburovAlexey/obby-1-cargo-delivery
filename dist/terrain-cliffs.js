// Extrude only exposed land edges. The road and shoulders share a boundary,
// so collect both before cancelling internal edges; bridge decks are excluded.
export function createTerrainCliffs(THREE,surfaces,{heightOffset=0,biomeAt}={}){
 const edges=new Map(),positions=[],colors=[],indices=[];
 const key=p=>p.map(v=>Math.round(v*10000)).join(',');
 for(const data of surfaces)for(let i=0;i<data.indices.length;i+=3){
  for(let j=0;j<3;j++){
   const ia=data.indices[i+j],ib=data.indices[i+(j+1)%3];
   const a=data.positions.slice(ia*3,ia*3+3),b=data.positions.slice(ib*3,ib*3+3),ka=key(a),kb=key(b);
   if(ka===kb)continue;
   const id=ka<kb?ka+'|'+kb:kb+'|'+ka;
   if(edges.has(id))edges.delete(id);
   else edges.set(id,{a,b,qa:data.progress[ia],qb:data.progress[ib]});
  }
 }
 const palettes={
  city:[0x766044,0x9b7350,0x7e7162,0x5b5550],
  forest:[0x514734,0x886342,0x716858,0x494b43],
  desert:[0xba8e58,0xce9b63,0xa87146,0x795540],
  snow:[0xc4c9c8,0x8c9396,0x727e86,0x4c5865],
  volcanic:[0x51423c,0x665047,0x474249,0x302f37],
 };
 const depths=[0,.65,3,7,13,22,34,48];
 const color=new THREE.Color();
 const noise=(x,z)=>Math.sin(x*.31+z*.17)*Math.cos(z*.23-x*.13);
 // World-space displacement makes adjacent segments meet, including corners.
 function point(p,depth){
  const relief=Math.min(1,depth/3),wave=noise(p[0],p[2]);
  return [p[0]+relief*.65*Math.sin(p[2]*.21+depth*.5),p[1]+heightOffset-depth+relief*.45*wave,p[2]+relief*.65*Math.sin(p[0]*.19+depth*.5)];
 }
 for(const {a,b,qa,qb} of edges.values()){
  const length=Math.hypot(b[0]-a[0],b[2]-a[2]);
  if(length<.001)continue;
  const steps=Math.ceil(length/4),palette=palettes[biomeAt?.((qa+qb)/2)?.id]||palettes.city;
  const sample=t=>a.map((v,i)=>v+(b[i]-v)*t);
  for(let step=0;step<steps;step++){
   const left=sample(step/steps),right=sample((step+1)/steps);
   for(let layer=0;layer<depths.length-1;layer++){
    const top=depths[layer],bottom=depths[layer+1],base=positions.length/3;
    const vertices=[point(right,top),point(left,top),point(left,bottom),point(right,bottom)];
    color.setHex(palette[layer===0?0:layer<3?1:layer<5?2:3]);
    color.multiplyScalar(1+noise((left[0]+right[0])/2,(left[2]+right[2])/2+layer*9)*.13);
    for(const v of vertices){positions.push(...v);colors.push(color.r,color.g,color.b);}
    indices.push(base,base+1,base+2,base,base+2,base+3);
   }
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Layered earth and rock cliffs';
 mesh.receiveShadow=true;mesh.castShadow=true;
 return mesh;
}
