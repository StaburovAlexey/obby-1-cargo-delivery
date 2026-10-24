// Register only groups whose own visible field belongs to this controller.
// Existing owner toggles belong on record.enabled; ancestor visibility is left
// alone. box is a fixed conservative local-space bound (required for animated
// or asynchronously populated groups). margin expands its world bounds.
const EMPTY_CAMERAS=[];

export function createRenderZones(THREE,{entries=[]}={}){
 const records=[],lookup=new Map(),projection=new THREE.Matrix4(),inverse=new THREE.Matrix4();
 const view=new THREE.Frustum(),shadowViews=[];
 const stats={registered:0,visible:0,hidden:0};
 let disposed=false;

 function refreshStats(){
  stats.registered=records.length;stats.visible=0;
  for(let i=0;i<records.length;i++)if(isVisible(records[i].object))stats.visible++;
  stats.hidden=stats.registered-stats.visible;
 }
 function register(object,{box,margin=0}={}){
  if(disposed)throw new Error('Cannot register a disposed render-zone controller');
  if(!object?.isObject3D)throw new TypeError('A render zone requires a Three.js Object3D');
  if(lookup.has(object))return lookup.get(object);
  object.updateWorldMatrix(true,!box);
  const local=box?box.clone():new THREE.Box3().setFromObject(object).applyMatrix4(inverse.copy(object.matrixWorld).invert());
  let castShadow=false;
  object.traverse(child=>{if(child.castShadow)castShadow=true;});
  const record={object,box:local,margin:Number.isFinite(margin)?Math.max(0,margin):0,
   enabled:object.visible,castShadow,initialVisible:object.visible,world:new THREE.Box3(),
   get visible(){return isVisible(object);}};
  records.push(record);lookup.set(object,record);refreshStats();return record;
 }
 function unregister(object){
  const record=lookup.get(object);if(!record)return false;
  object.visible=record.initialVisible;lookup.delete(object);records.splice(records.indexOf(record),1);refreshStats();return true;
 }
 function finiteBox(box){
  return !box.isEmpty()&&Number.isFinite(box.min.x)&&Number.isFinite(box.min.y)&&Number.isFinite(box.min.z)&&
   Number.isFinite(box.max.x)&&Number.isFinite(box.max.y)&&Number.isFinite(box.max.z);
 }
 // Fog is based on -viewZ. Testing the nearest corner retains a box until it
 // lies entirely beyond full fog, including geometry near screen corners.
 function beforeFog(box,camera,maxDistance){
  const e=camera.matrixWorldInverse.elements;
  const maxViewZ=e[2]*(e[2]>=0?box.max.x:box.min.x)+e[6]*(e[6]>=0?box.max.y:box.min.y)+
   e[10]*(e[10]>=0?box.max.z:box.min.z)+e[14];
  return -maxViewZ<=maxDistance;
 }
 function update({camera,shadowCameras=EMPTY_CAMERAS,maxDistance=Infinity,enabled=true}={}){
  if(disposed)return stats;
  const active=enabled&&!!camera;
  if(active){
   camera.updateWorldMatrix(true,false);
   view.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);
   for(let i=0;i<shadowCameras.length;i++){
    const shadow=shadowCameras[i];if(!shadow)continue;
    shadow.updateWorldMatrix(true,false);
    const frustum=shadowViews[i]||(shadowViews[i]=new THREE.Frustum());
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(shadow.projectionMatrix,shadow.matrixWorldInverse),shadow.coordinateSystem,shadow.reversedDepth);
   }
  }
  const fogLimited=Number.isFinite(maxDistance)&&maxDistance>0;
  stats.visible=0;
  for(let i=0;i<records.length;i++){
   const record=records[i],object=record.object;
   let visible=!!record.enabled;
   if(visible&&active){
    object.updateWorldMatrix(true,false);
    const world=record.world.copy(record.box).applyMatrix4(object.matrixWorld);
    if(record.margin)world.expandByScalar(record.margin);
    // Missing/loading geometry and invalid bounds fail open.
    if(finiteBox(world)){
     visible=view.intersectsBox(world)&&(!fogLimited||beforeFog(world,camera,maxDistance));
     if(!visible&&record.castShadow)for(let j=0;j<shadowCameras.length;j++){
      if(shadowCameras[j]&&shadowViews[j].intersectsBox(world)){visible=true;break;}
     }
    }
   }
   object.visible=visible;if(isVisible(object))stats.visible++;
  }
  stats.hidden=stats.registered-stats.visible;return stats;
 }
 function isVisible(object){
  if(!object)return false;
  for(let node=object;node;node=node.parent)if(node.visible===false)return false;
  return true;
 }
 function dispose(){
  if(disposed)return;disposed=true;
  for(let i=0;i<records.length;i++)records[i].object.visible=records[i].initialVisible;
  records.length=0;lookup.clear();shadowViews.length=0;refreshStats();
 }
 for(let i=0;i<entries.length;i++)register(entries[i].object,entries[i]);
 return{register,unregister,update,isVisible,stats,dispose};
}
