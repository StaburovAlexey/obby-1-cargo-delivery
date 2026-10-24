// Only display rendering is owned here. Source geometry, transforms, textures,
// gameplay bounds and the selected vehicle's appearance remain authoritative.
export function createDisplayQuality(THREE){
 const records=new Map(),cheapMaterials=new Map(),point=new THREE.Vector3(),cameraPoint=new THREE.Vector3(),inverse=new THREE.Matrix4(),transform=new THREE.Matrix4(),box=new THREE.Box3();
 const stats={vehicles:0,characters:0,meshes:0,simplifiedMeshes:0,cheapMaterials:0,disabledShadowCasters:0,sourceShadowBatches:0,proxies:0,proxyDraws:0,proxyTriangles:0};
 let disposed=false,proxyGeometry=null,proxyMaterial=null;
 const hysteresis=3;
 const threshold=value=>Number.isFinite(value)&&value>=0?value:Infinity;
 const farAt=(distance,limit,wasFar)=>wasFar?distance>=Math.max(0,limit-hysteresis):distance>limit+hysteresis;
 function safeMaterial(material){
  return !!material?.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial&&
   material.onBeforeCompile===THREE.Material.prototype.onBeforeCompile&&
   material.customProgramCacheKey===THREE.Material.prototype.customProgramCacheKey&&
   material.blending===THREE.NormalBlending&&!material.clippingPlanes?.length&&!material.stencilWrite&&!material.polygonOffset&&
   material.depthFunc===THREE.LessEqualDepth&&
   !Object.keys(material.userData||{}).some(key=>/livery|brake|locked|finish|paint/i.test(key));
 }
 function cheapFor(source){
  if(!safeMaterial(source))return source;
  let cached=cheapMaterials.get(source);
  if(!cached){const material=new THREE.MeshLambertMaterial();material.name=source.name+' (distant display)';material.visible=source.visible;cached={material,visible:source.visible};cheapMaterials.set(source,cached);}
  const material=cached.material;
  // Visibility may be changed through either the retained source or the active
  // shared variant. Preserve current-variant changes until its source changes.
  if(source.visible!==cached.visible){material.visible=source.visible;cached.visible=source.visible;}
  material.color.copy(source.color);material.emissive.copy(source.emissive);material.emissiveIntensity=source.emissiveIntensity;
  for(const key of ['map','alphaMap','emissiveMap','alphaTest','transparent','vertexColors','side','flatShading','alphaHash','alphaToCoverage']){
   if(material[key]!==source[key]){material[key]=source[key];material.needsUpdate=true;}
  }
  for(const key of ['opacity','depthTest','depthWrite','colorWrite','toneMapped','fog','premultipliedAlpha','shadowSide','wireframe','wireframeLinewidth','forceSinglePass','dithering'])material[key]=source[key];
  return material;
 }
 function syncOriginal(entry){
  if(entry.mesh.material!==entry.applied){entry.original=entry.mesh.material;entry.applied=entry.original;}
 }
 function restoreMesh(entry){
  syncOriginal(entry);
  if(entry.mesh.material!==entry.original)entry.mesh.material=entry.original;
  entry.applied=entry.original;entry.mesh.castShadow=entry.castShadow;
 }
 function applyMaterial(entry,far){
  syncOriginal(entry);
  const source=entry.original;
  if(!far){if(entry.mesh.material!==source)entry.mesh.material=source;entry.applied=source;return;}
  let desired;
  if(Array.isArray(source)){
   let changed=false;for(let i=0;i<source.length;i++)if(safeMaterial(source[i])){changed=true;break;}
   if(changed){
    desired=Array.isArray(entry.applied)&&entry.applied!==source&&entry.applied.length===source.length?entry.applied:source.slice();
    for(let i=0;i<source.length;i++)desired[i]=cheapFor(source[i]);
   }else desired=source;
  }else desired=cheapFor(source);
  if(entry.mesh.material!==desired)entry.mesh.material=desired;
  entry.applied=desired;
 }
 function sourceVisible(mesh,root){for(let node=mesh;node&&node!==root;node=node.parent)if(!node.visible)return false;return true;}
 function sceneVisible(root){for(let node=root;node;node=node.parent)if(!node.visible)return false;return true;}
 function removeRecord(record){
  for(const entry of record.meshes.values())restoreMesh(entry);
  for(const node of record.nodes){node.removeEventListener('childadded',record.changed);node.removeEventListener('childremoved',record.changed);}
  record.proxy?.removeFromParent();records.delete(record.root);
 }
 function scan(record){
  const nodes=new Set(),meshes=new Map();
  record.root.traverse(node=>{
   if(node.userData.displayQualityProxy)return;
   nodes.add(node);
   if(!record.nodes.has(node)){node.addEventListener('childadded',record.changed);node.addEventListener('childremoved',record.changed);}
   if(node.isMesh)meshes.set(node,record.meshes.get(node)||{mesh:node,original:node.material,applied:node.material,castShadow:node.castShadow});
  });
  for(const [mesh,entry]of record.meshes)if(!meshes.has(mesh))restoreMesh(entry);
  for(const node of record.nodes)if(!nodes.has(node)){node.removeEventListener('childadded',record.changed);node.removeEventListener('childremoved',record.changed);}
  record.nodes=nodes;record.meshes=meshes;record.dirty=false;record.boundsDirty=true;
 }
 function refreshShadowState(record){
  record.shadowBatches=0;record.shadowTriangles=0;record.proxySafe=true;
  for(const entry of record.meshes.values()){
   const mesh=entry.mesh,geometry=mesh.geometry,material=mesh.material;let batches=0;
   if(entry.castShadow&&sourceVisible(mesh,record.root)&&geometry?.attributes.position){
    if(Array.isArray(material)){for(const group of geometry.groups)if(material[group.materialIndex]?.visible!==false)batches++;}
    else if(material?.visible!==false)batches=1;
   }
   if(entry.shadowBatches!==batches||entry.geometry!==geometry)record.boundsDirty=true;
   entry.shadowBatches=batches;entry.geometry=geometry;
   if(!batches)continue;
   if(mesh.isSkinnedMesh||mesh.isInstancedMesh||mesh.morphTargetInfluences?.length||mesh.customDepthMaterial||mesh.customDistanceMaterial)record.proxySafe=false;
   record.shadowBatches+=batches;record.shadowTriangles+=(geometry.index?.count??geometry.attributes.position.count)/3;
  }
  if(!record.boundsDirty)return;
  record.root.updateWorldMatrix(true,true);inverse.copy(record.root.matrixWorld).invert();record.bounds.makeEmpty();
  for(const entry of record.meshes.values()){
   if(!entry.shadowBatches)continue;
   const geometry=entry.geometry;
   box.copy(geometry.boundingBox||new THREE.Box3().setFromBufferAttribute(geometry.attributes.position));
   transform.multiplyMatrices(inverse,entry.mesh.matrixWorld);record.bounds.union(box.applyMatrix4(transform));
  }
  record.boundsDirty=false;
  if(record.proxy&&!record.bounds.isEmpty())fitProxy(record);
 }

 function register(root,kind,owner){
  let record=records.get(root);
  if(!record){
   record={root,kind,owner,nodes:new Set(),meshes:new Map(),bounds:new THREE.Box3(),shadowFar:false,materialFar:false,dirty:true,proxy:null};
   record.changed=event=>{if(!event.child?.userData.displayQualityProxy)record.dirty=true;};
   records.set(root,record);
  }
  record.kind=kind;record.owner=owner;return record;
 }
 function prepareProxyResources(){
  if(proxyGeometry)return;
  const parts=[new THREE.BoxGeometry(.95,.43,1).translate(0,-.11,0),new THREE.BoxGeometry(.7,.4,.55).translate(0,.285,-.05)];
  for(const x of [-.44,.44])for(const z of [-.32,.32])parts.push(new THREE.CylinderGeometry(.16,.16,.12,6).rotateZ(Math.PI/2).translate(x,-.31,z));
  const positions=[];
  for(const geometry of parts){const p=geometry.attributes.position,index=geometry.index;for(let i=0;i<(index?.count??p.count);i++){point.fromBufferAttribute(p,index?index.getX(i):i);positions.push(point.x,point.y,point.z);}geometry.dispose();}
  proxyGeometry=new THREE.BufferGeometry();proxyGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));proxyGeometry.computeBoundingBox();proxyGeometry.computeBoundingSphere();
  // Three's shadow renderer filters against main-camera layers. Keeping this
  // material opaque but disabling both writes makes its main pass invisible;
  // the regular depth material still casts one cheap merged shadow.
  proxyMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,toneMapped:false});proxyMaterial.name='Invisible parked-display shadow proxy';
 }
 function fitProxy(record){
  record.bounds.getCenter(record.proxy.position);record.bounds.getSize(record.proxy.scale);record.proxy.updateMatrix();
 }
 function showProxy(record,visible,camera){
  if(visible){prepareProxyResources();if(record.shadowTriangles<=proxyGeometry.attributes.position.count/3)visible=false;}
  if(visible&&!record.proxy){
   const proxy=new THREE.Mesh(proxyGeometry,proxyMaterial);proxy.name='Parked display shadow proxy';proxy.userData.displayQualityProxy=true;proxy.castShadow=true;proxy.receiveShadow=false;proxy.matrixAutoUpdate=false;proxy.raycast=()=>{};
   record.proxy=proxy;fitProxy(record);record.root.add(proxy);
  }
  if(record.proxy){record.proxy.visible=visible;record.proxy.layers.mask=camera.layers.mask;}
 }
 function resetStats(){for(const key of Object.keys(stats))stats[key]=0;}
 function update({vehicles=[],characters=[],selectedId=null,camera,profile={}}={}){
  if(disposed||!camera)return stats;
  const active=new Set();
  for(const vehicle of vehicles){const root=vehicle.visual?.group;if(!root||vehicle.visual.disposed)continue;active.add(root);register(root,'vehicle',vehicle);}
  for(const character of characters){const root=character.group;if(!root||character.disposed)continue;active.add(root);register(root,'character',character);}
  for(const record of records.values())if(!active.has(record.root))removeRecord(record);
  camera.getWorldPosition(cameraPoint);resetStats();
  for(const record of records.values()){
   if(record.dirty)scan(record);
   record.root.getWorldPosition(point);const distance=point.distanceTo(cameraPoint),selected=record.kind==='vehicle'&&record.owner.id===selectedId;
   record.shadowFar=!selected&&farAt(distance,threshold(profile.displayShadowDistance),record.shadowFar);
   record.materialFar=!selected&&farAt(distance,threshold(profile.materialDistance),record.materialFar);
   const locked=!!record.owner.visual?.locked||record.root.userData.locked===true;
   for(const entry of record.meshes.values()){
    applyMaterial(entry,record.materialFar&&!locked);
    entry.mesh.castShadow=entry.castShadow&&!record.shadowFar;
    stats.meshes++;if(entry.mesh.material!==entry.original)stats.simplifiedMeshes++;
    if(entry.castShadow&&!entry.mesh.castShadow)stats.disabledShadowCasters++;
   }
   refreshShadowState(record);
   const proxy=record.kind==='vehicle'&&record.shadowFar&&record.proxySafe&&record.shadowBatches>2&&!record.bounds.isEmpty();
   showProxy(record,proxy,camera);
   stats[record.kind==='vehicle'?'vehicles':'characters']++;stats.sourceShadowBatches+=record.shadowBatches;
   if(record.proxy?.visible&&sceneVisible(record.root)){stats.proxies++;stats.proxyTriangles+=record.proxy.geometry.attributes.position.count/3;}
  }
  stats.cheapMaterials=cheapMaterials.size;stats.proxyDraws=stats.proxies*2;return stats;
 }
 function clear(){
  for(const record of records.values())removeRecord(record);
  for(const {material}of cheapMaterials.values())material.dispose();cheapMaterials.clear();
  proxyGeometry?.dispose();proxyMaterial?.dispose();proxyGeometry=proxyMaterial=null;resetStats();
 }
 function dispose(){if(disposed)return;clear();disposed=true;}
 return {update,clear,dispose,stats};
}
