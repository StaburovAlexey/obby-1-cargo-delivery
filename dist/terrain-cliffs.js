function boundaryEdges(surfaces){
 const edges=new Map();
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
 return edges;
}

// Triangle subtraction can split internal edges on extended clip planes. Only
// surviving original perimeter edges own tall cliffs, including physical walls.
export function createTerrainCliffExcluder(surfaces){
 const cells=new Map(),cell=32;
 const visit=(a,b,fn)=>{for(let x=Math.floor((Math.min(a[0],b[0])-.001)/cell);x<=Math.floor((Math.max(a[0],b[0])+.001)/cell);x++)for(let z=Math.floor((Math.min(a[2],b[2])-.001)/cell);z<=Math.floor((Math.max(a[2],b[2])+.001)/cell);z++)fn(`${x},${z}`);};
 for(const edge of boundaryEdges(surfaces).values())visit(edge.a,edge.b,key=>{if(!cells.has(key))cells.set(key,[]);cells.get(key).push(edge);});
 return (a,b)=>{
  const candidates=new Set();visit(a,b,key=>{for(const edge of cells.get(key)||[])candidates.add(edge);});
  for(const edge of candidates){
   const p=edge.a,q=edge.b,dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2],length=dx*dx+dy*dy+dz*dz;if(length<1e-12)continue;
   const on=v=>{const t=((v[0]-p[0])*dx+(v[1]-p[1])*dy+(v[2]-p[2])*dz)/length;return t>=-1e-5&&t<=1+1e-5&&Math.hypot(v[0]-p[0]-t*dx,v[1]-p[1]-t*dy,v[2]-p[2]-t*dz)<.0002;};
   if(on(a)&&on(b))return false;
  }
  return true;
 };
}

// Extrude only exposed land edges. The road and shoulders share a boundary,
// so collect both before cancelling internal edges; bridge decks are excluded.
export function createTerrainCliffs(THREE,surfaces,{heightOffset=0,biomeAt,bridges=[],bankMargin=10,excludeEdge}={}){
 const edges=boundaryEdges(surfaces),positions=[],colors=[],indices=[],physicsEdges=[];
 const palettes={
  city:[0x766044,0x9b7350,0x7e7162,0x5b5550],
  forest:[0x514734,0x886342,0x716858,0x494b43],
  desert:[0xba8e58,0xce9b63,0xa87146,0x795540],
  snow:[0xc4c9c8,0x8c9396,0x727e86,0x4c5865],
  volcanic:[0x51423c,0x665047,0x474249,0x302f37],
 };
 // Retain the soil lip and broad rock relief without seven deep visual bands.
 // The complete exposed top-edge source below remains independent of this LOD.
 const depths=[0,.65,13,48];
 const color=new THREE.Color();
 const noise=(x,z)=>Math.sin(x*.31+z*.17)*Math.cos(z*.23-x*.13);
 // World-space displacement makes adjacent segments meet, including corners.
 function point(p,depth){
  const relief=Math.min(1,depth/3),wave=noise(p[0],p[2]);
  return [p[0]+relief*.65*Math.sin(p[2]*.21+depth*.5),p[1]+heightOffset-depth+relief*.45*wave,p[2]+relief*.65*Math.sin(p[0]*.19+depth*.5)];
 }
 for(const {a,b,qa,qb} of edges.values()){
  // Removed road mouths and wedges have their own shallow geometry. Their new
  // boundaries must never acquire the landscape perimeter's 48m collider.
  if(excludeEdge?.(a,b))continue;
  const length=Math.hypot(b[0]-a[0],b[2]-a[2]);
  if(length<.001)continue;
  const steps=Math.ceil(length/4),palette=palettes[biomeAt?.((qa+qb)/2)?.id]||palettes.city;
  const lo=Math.min(qa,qb),hi=Math.max(qa,qb);
  // Keep whole boundary segments intersecting the bank margin. This avoids
  // seams at the corners of a bank; the ordinary mesh step is at most 6 m.
  const render=bridges.length===0||bridges.some(bridge=>[bridge.from,bridge.to].some(q=>hi>=q-bankMargin-1e-5&&lo<=q+bankMargin+1e-5));
  const sample=t=>a.map((v,i)=>v+(b[i]-v)*t);
  for(let step=0;step<steps;step++){
   const left=sample(step/steps),right=sample((step+1)/steps);
   // Preserve every original collision edge, including invisible perimeter
   // walls. Store only the two float32 top endpoints, independently of strata.
   physicsEdges.push(...point(right,0),...point(left,0));
   if(!render)continue;
   for(let layer=0;layer<depths.length-1;layer++){
    const top=depths[layer],bottom=depths[layer+1],base=positions.length/3;
    const vertices=[point(right,top),point(left,top),point(left,bottom),point(right,bottom)];
    color.setHex(palette[layer===0?0:layer===1?1:2]);
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
 mesh.userData.physicsCliffEdges=new Float32Array(physicsEdges);
 mesh.receiveShadow=true;mesh.castShadow=true;
 return mesh;
}
