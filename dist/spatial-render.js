// Keep canonical meshes for gameplay/inspection. Render one compacted batch per
// source instead of creating hundreds of draw calls or requiring multi-draw.
export function createSpatialRenderer(THREE,{roots=[],cellSize=128}={}){
 const records=[],candidates=new Set(),point=new THREE.Vector3(),matrix=new THREE.Matrix4();
 let disposed=false;
 const stats={sourceBatches:0,activeBatches:0,cells:0,sourceTriangles:0,submittedTriangles:0,uploads:0};
 for(const root of roots)root?.traverse(o=>{
  if(o.isMesh&&o.userData.spatialStatic&&!o.userData.spatialRenderProxy&&o.visible)candidates.add(o);
 });
 for(const source of candidates){
  const geometry=source.geometry,index=geometry.index;
  if(!source.parent||source.isSkinnedMesh||Array.isArray(source.material)||!index||
   geometry.drawRange.start!==0||geometry.drawRange.count<index.count||source.morphTargetInfluences?.length)continue;
  const cells=[],lookup=new Map(),runs=[],instanced=source.isInstancedMesh,positions=geometry.attributes.position;
  const cellFor=(x,z)=>{
   const key=Math.floor(x/cellSize)+','+Math.floor(z/cellSize);
   if(!lookup.has(key)){lookup.set(key,cells.length);cells.push({local:new THREE.Box3(),world:new THREE.Box3()});}
   return lookup.get(key);
  };
  const sourceCount=instanced?source.count:0,instanceCells=[],instanceMatrices=[],instanceColors=[];
  if(instanced){
   if(!geometry.boundingBox)geometry.computeBoundingBox();
   for(let i=0;i<sourceCount;i++){
    source.getMatrixAt(i,matrix);
    const box=geometry.boundingBox.clone().applyMatrix4(matrix),center=box.getCenter(point),id=cellFor(center.x,center.z);
    cells[id].local.union(box);instanceCells.push(id);
    instanceMatrices.push(source.instanceMatrix.array.subarray(i*16,i*16+16));
    if(source.instanceColor)instanceColors.push(source.instanceColor.array.subarray(i*source.instanceColor.itemSize,(i+1)*source.instanceColor.itemSize));
   }
  }else{
   for(let i=0;i<index.count;i+=3){
    let x=0,z=0;
    for(let j=0;j<3;j++){const v=index.getX(i+j);x+=positions.getX(v);z+=positions.getZ(v);}
    const id=cellFor(x/3,z/3);
    for(let j=0;j<3;j++){point.fromBufferAttribute(positions,index.getX(i+j));cells[id].local.expandByPoint(point);}
    const previous=runs.at(-1);
    if(previous?.cell===id)previous.end=i+3;else runs.push({cell:id,start:i,end:i+3});
   }
   for(const run of runs)run.values=index.array.subarray(run.start,run.end);
  }
  if(cells.length<2)continue;
  let proxy;
  if(instanced){
   proxy=new THREE.InstancedMesh(geometry,source.material,sourceCount);
   proxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);proxy.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0,sourceCount*16));
   if(source.instanceColor){
    proxy.instanceColor=new THREE.InstancedBufferAttribute(new source.instanceColor.array.constructor(sourceCount*source.instanceColor.itemSize),source.instanceColor.itemSize,source.instanceColor.normalized);
    proxy.instanceColor.setUsage(THREE.DynamicDrawUsage);proxy.instanceColor.array.set(source.instanceColor.array.subarray(0,proxy.instanceColor.array.length));
   }
   if(!source.boundingSphere)source.computeBoundingSphere();
   proxy.boundingSphere=source.boundingSphere.clone();
  }else{
   const renderGeometry=new THREE.BufferGeometry();
   for(const [name,attribute]of Object.entries(geometry.attributes))renderGeometry.setAttribute(name,attribute);
   const compact=new THREE.BufferAttribute(new index.array.constructor(index.array),1,index.normalized);
   compact.setUsage(THREE.DynamicDrawUsage);renderGeometry.setIndex(compact);
   if(!geometry.boundingSphere)geometry.computeBoundingSphere();
   renderGeometry.boundingSphere=geometry.boundingSphere.clone();
   proxy=new THREE.Mesh(renderGeometry,source.material);
  }
  if(source.matrixAutoUpdate)source.updateMatrix();
  proxy.matrix.copy(source.matrix);proxy.matrixAutoUpdate=false;
  proxy.name=source.name+' (spatial render)';proxy.userData.spatialRenderProxy=true;
  proxy.castShadow=source.castShadow;proxy.receiveShadow=source.receiveShadow;
  proxy.frustumCulled=source.frustumCulled;proxy.renderOrder=source.renderOrder;proxy.layers.mask=source.layers.mask;
  const auto=source.matrixAutoUpdate,visible=source.visible;
  source.matrixAutoUpdate=false;source.visible=false;source.parent.add(proxy);
  const triangles=index.count/3;
  records.push({source,proxy,cells,runs,instanced,sourceCount,instanceCells,instanceMatrices,instanceColors,auto,visible,
   mask:new Uint8Array(cells.length).fill(2),world:new THREE.Matrix4().set(...Array(16).fill(NaN)),triangles,submitted:triangles*(instanced?sourceCount:1)});
  stats.sourceTriangles+=triangles*(instanced?sourceCount:1);stats.cells+=cells.length;
 }
 stats.sourceBatches=records.length;
 const projection=new THREE.Matrix4(),view=new THREE.Frustum(),shadowViews=[],fogPlane=new THREE.Plane(),direction=new THREE.Vector3(),origin=new THREE.Vector3();
 function update({camera,shadowCameras=[],maxDistance=Infinity}={}){
  if(disposed||!camera)return;
  camera.updateWorldMatrix(true,false);
  view.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);
  const fogLimited=Number.isFinite(maxDistance)&&maxDistance>0;
  if(fogLimited){
   camera.getWorldDirection(direction);camera.getWorldPosition(origin).addScaledVector(direction,maxDistance);
   fogPlane.setFromNormalAndCoplanarPoint(direction.negate(),origin);
  }
  shadowViews.length=shadowCameras.length;
  for(let i=0;i<shadowCameras.length;i++){
   const c=shadowCameras[i];c.updateWorldMatrix(true,false);
   const entry=shadowViews[i]||(shadowViews[i]={frustum:new THREE.Frustum(),camera:c});
   entry.camera=c;entry.frustum.setFromProjectionMatrix(projection.multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse),c.coordinateSystem,c.reversedDepth);
  }
  stats.submittedTriangles=stats.activeBatches=0;
  for(const r of records){
   const {source,proxy}=r;source.updateWorldMatrix(true,false);proxy.layers.mask=source.layers.mask;
   let parentVisible=true;
   for(let parent=source.parent;parent;parent=parent.parent)if(!parent.visible){parentVisible=false;break;}
   if(!r.world.equals(source.matrixWorld)){
    r.world.copy(source.matrixWorld);proxy.matrix.copy(source.matrix);proxy.matrixWorld.copy(source.matrixWorld);
    for(const cell of r.cells)cell.world.copy(cell.local).applyMatrix4(r.world);
   }
   let changed=false;
   for(let i=0;i<r.cells.length;i++){
    const box=r.cells[i].world;
    let keep=parentVisible&&source.layers.test(camera.layers)&&view.intersectsBox(box)&&(!fogLimited||box.intersectsPlane(fogPlane)||fogPlane.distanceToPoint(box.getCenter(point))>=0);
    // WebGLShadowMap selects caster layers using the main camera.
    if(!keep&&parentVisible&&source.castShadow&&source.layers.test(camera.layers))for(const entry of shadowViews)if(entry.frustum.intersectsBox(box)){keep=true;break;}
    const bit=Number(keep);if(r.mask[i]!==bit){r.mask[i]=bit;changed=true;}
   }
   if(changed){
    let count=0;
    if(r.instanced){
     for(let i=0;i<r.sourceCount;i++)if(r.mask[r.instanceCells[i]]){
      proxy.instanceMatrix.array.set(r.instanceMatrices[i],count*16);
      if(proxy.instanceColor)proxy.instanceColor.array.set(r.instanceColors[i],count*proxy.instanceColor.itemSize);
      count++;
     }
     proxy.count=count;
     for(const attribute of [proxy.instanceMatrix,proxy.instanceColor])if(attribute&&count){
      attribute.clearUpdateRanges();attribute.addUpdateRange(0,count*attribute.itemSize);attribute.needsUpdate=true;
     }
     r.submitted=count*r.triangles;
    }else{
     const attribute=proxy.geometry.index;
     for(const run of r.runs)if(r.mask[run.cell]){attribute.array.set(run.values,count);count+=run.values.length;}
     proxy.geometry.setDrawRange(0,count);
     if(count){attribute.clearUpdateRanges();attribute.addUpdateRange(0,count);attribute.needsUpdate=true;}
     r.submitted=count/3;
    }
    stats.uploads++;
   }
   stats.submittedTriangles+=r.submitted;if(r.submitted)stats.activeBatches++;
  }
 }
 return {stats,update,dispose(){
  if(disposed)return;disposed=true;
  for(const r of records){
   r.source.visible=r.visible;r.source.matrixAutoUpdate=r.auto;r.proxy.removeFromParent();
   if(r.instanced)r.proxy.dispose();else r.proxy.geometry.dispose();
  }
  records.length=0;stats.activeBatches=stats.submittedTriangles=0;
 }};
}
