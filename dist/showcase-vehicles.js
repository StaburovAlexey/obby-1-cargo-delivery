import {makeVehicleWindowsOpaque} from './vehicle-window-materials.js';
import {attachShowcaseBrakeLights} from './showcase-brake-lights.js';
import {updateVisualSuspension} from './wheel-contact-visuals.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {SHOWCASE_VEHICLES} from './showcase-vehicle-catalog.js';

const bytesByURL=new Map(),CLEARANCE=.05,SOURCE_WHEEL_RADIUS=.68;
const materialList=mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material];

// Imported OBJ packs merge wheels and trim by material. Weld coincident points
// for connectivity only, retaining every original UV, normal and vertex below.
function components(THREE,geometry){
 const position=geometry.attributes.position,index=geometry.index;
 const parent=Array.from({length:position.count},(_,i)=>i),keys=new Map();
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 const join=(a,b)=>{parent[root(a)]=root(b);};
 for(let i=0;i<position.count;i++){
  const key=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>v.toFixed(5)).join(',');
  if(keys.has(key))join(i,keys.get(key));else keys.set(key,i);
 }
 const count=index?.count??position.count,id=i=>index?index.getX(i):i;
 for(let i=0;i<count;i+=3){join(id(i),id(i+1));join(id(i+1),id(i+2));}
 const result=new Map(),point=new THREE.Vector3();
 for(let i=0;i<count;i+=3){
  const key=root(id(i));
  if(!result.has(key))result.set(key,{indices:[],box:new THREE.Box3(),materialIndex:geometry.groups.find(group=>i>=group.start&&i<group.start+group.count)?.materialIndex??0});
  const part=result.get(key);
  for(let j=0;j<3;j++){const vertex=id(i+j);part.indices.push(vertex);part.box.expandByPoint(point.fromBufferAttribute(position,vertex));}
 }
 return [...result.values()].map(part=>({...part,center:part.box.getCenter(new THREE.Vector3()),size:part.box.getSize(new THREE.Vector3())}));
}

function compactGeometry(THREE,source,indices){
 const geometry=new THREE.BufferGeometry(),mapping=new Map(),vertices=[],result=[];
 for(const index of indices){if(!mapping.has(index)){mapping.set(index,vertices.length);vertices.push(index);}result.push(mapping.get(index));}
 for(const [name,attribute]of Object.entries(source.attributes)){
  const values=new Float32Array(vertices.length*attribute.itemSize);
  for(let i=0;i<vertices.length;i++)for(let k=0;k<attribute.itemSize;k++)values[i*attribute.itemSize+k]=attribute.getComponent(vertices[i],k);
  geometry.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize));
 }
 geometry.setIndex(result);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

export async function loadShowcaseVehicle(THREE,id){
 const spec=SHOWCASE_VEHICLES.find(vehicle=>vehicle.id===id);
 if(!spec)throw new RangeError(`Unknown showcase vehicle: ${id}`);
 if(!bytesByURL.has(spec.url)){
  const pending=fetch(spec.url).then(response=>{if(!response.ok)throw new Error(`Vehicle download failed: ${id} (${response.status})`);return response.arrayBuffer();});
  bytesByURL.set(spec.url,pending);pending.catch(()=>{if(bytesByURL.get(spec.url)===pending)bytesByURL.delete(spec.url);});
 }
 const gltf=await new GLTFLoader().parseAsync(await bytesByURL.get(spec.url),new URL('.',spec.url).href);
 return createShowcaseVehicleAdapter(THREE,spec,gltf);
}

export function createShowcaseVehicleAdapter(THREE,spec,gltf){
 const scene=gltf.scene,group=new THREE.Group(),body=new THREE.Group(),normalized=new THREE.Group();
 group.name=`Showcase vehicle ${spec.id}`;body.name='Showcase suspended body';group.add(body);
 normalized.rotation.y=spec.rotation;normalized.add(scene);normalized.updateWorldMatrix(true,true);
 const geometries=new Set(),materials=new Set(),textures=new Set(),originalMaterials=new Map();
 scene.traverse(mesh=>{
  if(mesh.geometry)geometries.add(mesh.geometry);
  for(const material of materialList(mesh).filter(Boolean)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}
 });
 const disposeResources=()=>{
  geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());
  new Set([...textures].map(texture=>texture.source?.data)).forEach(value=>value?.close?.());
 };
 try{
  const sourceBox=new THREE.Box3().setFromObject(normalized,true),sourceSize=sourceBox.getSize(new THREE.Vector3()),center=sourceBox.getCenter(new THREE.Vector3());
  if(!sourceSize.toArray().every(v=>Number.isFinite(v)&&v>0))throw new Error(`Invalid model bounds: ${spec.id}`);
  const scale=Math.min(4.65/sourceSize.x,8/sourceSize.z);
  normalized.scale.setScalar(scale);normalized.position.set(-center.x*scale,CLEARANCE-sourceBox.min.y*scale,-center.z*scale);normalized.updateWorldMatrix(true,true);
  const bounds=new THREE.Box3().setFromObject(normalized,true),dimensions=bounds.getSize(new THREE.Vector3()),parts=[];
  scene.traverse(mesh=>{
   if(!mesh.isMesh)return;
   const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);geometries.add(geometry);
   parts.push({mesh,geometry,components:components(THREE,geometry)});
  });
  const seeds=new Map(),quadrant=point=>`${point.z<0?'front':'rear'}-${point.x<0?'left':'right'}`;
  for(const {mesh,components:chunks}of parts)for(const part of chunks){
   if(spec.id==='phoenixinterceptor'&&!mesh.name.includes('WheelStock_'))continue;
   const {size,center}=part,ratio=size.y/size.z;
   if(Math.abs(center.x)<dimensions.x*.25||Math.abs(center.z)<dimensions.z*.12||center.y>bounds.min.y+dimensions.y*.65||
      size.y<dimensions.z*.08||size.y>dimensions.z*.22||ratio<.75||ratio>1.3||size.x>size.y*.75)continue;
   const key=quadrant(center),score=size.y*size.z;
   if(!seeds.has(key)||score>seeds.get(key).score)seeds.set(key,{...part,score,material:materialList(mesh)[part.materialIndex]});
  }
  if(seeds.size!==4)throw new Error(`Expected four measured wheel groups: ${spec.id}, found ${seeds.size}`);
  const wheelGroups=new Map([...seeds].map(([key])=>[key,new THREE.Group()]));
  for(const {mesh,geometry,components:chunks}of parts){
   const buckets=new Map();
   for(const part of chunks){
    const key=quadrant(part.center),seed=seeds.get(key),radius=Math.max(seed.size.y,seed.size.z)/2;
    const wheel=materialList(mesh)[part.materialIndex]===seed.material&&
      (spec.id!=='phoenixinterceptor'||mesh.name.includes('WheelStock_'))&&part.size.x<radius*1.15&&
      Math.abs(part.center.x-seed.center.x)+part.size.x/2<radius*1.15&&
      Math.hypot(part.center.y-seed.center.y,part.center.z-seed.center.z)+Math.max(part.size.y,part.size.z)/2<radius*1.12;
    const bucketKey=`${wheel?key:'body'}:${part.materialIndex}`;
    if(!buckets.has(bucketKey))buckets.set(bucketKey,{wheel:wheel?key:null,materialIndex:part.materialIndex,indices:[]});
    buckets.get(bucketKey).indices.push(...part.indices);
   }
   for(const bucket of buckets.values()){
    const g=compactGeometry(THREE,geometry,bucket.indices);geometries.add(g);
    const material=materialList(mesh)[bucket.materialIndex],part=new THREE.Mesh(g,material);part.name=mesh.name;part.castShadow=part.receiveShadow=true;
    originalMaterials.set(part,material);(bucket.wheel?wheelGroups.get(bucket.wheel):body).add(part);
   }
  }
  const wheels=[];
  for(const [name,wheelGroup]of wheelGroups){
   const wheelBox=new THREE.Box3().setFromObject(wheelGroup,true),position=seeds.get(name).center.clone(),extent=seeds.get(name).size;
   const pivot=new THREE.Group(),spin=new THREE.Group();pivot.position.copy(position);group.add(pivot);pivot.add(spin);spin.add(wheelGroup);wheelGroup.position.copy(position).negate();
   const radius=Math.max(extent.y,extent.z)/2,halfWidth=Math.max(Math.abs(wheelBox.min.x-position.x),Math.abs(wheelBox.max.x-position.x)),front=name.startsWith('front'),side=name.endsWith('left')?'left':'right';
   wheels.push({name,front,side,pivot,spin,localPosition:position,radius,halfWidth});
  }
  wheels.sort((a,b)=>a.name.localeCompare(b.name));
  makeVehicleWindowsOpaque(materials,{extraNames:spec.id==='koenigseggone1'?['lambert13SG','lambert16SG']:[]});
  for(const material of materials){
   // Source GLBs export closed body panels as DoubleSide. Match the existing
   // BMW/passenger shadow pass so front and back depth faces do not self-stripe.
   if(material.side===THREE.DoubleSide&&!material.transparent&&material.opacity===1&&material.alphaTest===0)material.shadowSide=THREE.BackSide;
   if(Number.isFinite(material.metalness))material.metalness=Math.min(material.metalness,.45);
   if(Number.isFinite(material.roughness))material.roughness=Math.max(material.roughness,.25);
  }
  const brakeLights=attachShowcaseBrakeLights(THREE,{id:spec.id,body,bounds,wheels,originalMaterials,materials});
  const wheelContacts=Object.freeze(wheels.map(wheel=>Object.freeze({name:wheel.name,front:wheel.front,side:wheel.side,
   center:Object.freeze(wheel.localPosition.toArray()),radius:wheel.radius,halfWidth:wheel.halfWidth})));
  const metadata=Object.freeze({id:spec.id,model:spec.model,url:spec.url,biome:'reward',forward:'-Z',up:'+Y',uniformScale:scale,
   dimensions:Object.freeze(dimensions.toArray()),bounds:Object.freeze({min:Object.freeze(bounds.min.toArray()),max:Object.freeze(bounds.max.toArray())}),
   groundClearance:CLEARANCE,sourceWheelRadius:SOURCE_WHEEL_RADIUS,wheels:wheelContacts,wheelContacts,brakeLights:brakeLights.metadata,
   footprint:Object.freeze({width:dimensions.x,length:dimensions.z}),bodyHalfWidth:dimensions.x/2});
  const black=new THREE.MeshBasicMaterial({color:0x000000,side:THREE.DoubleSide,toneMapped:false});materials.add(black);
  let locked=null,disposed=false;
  const cargoPosition=new THREE.Vector3(0,bounds.max.y+.575,0);
  const adapter={group,body,wheels,cargoPosition,metadata,get disposed(){return disposed;},get locked(){return locked;},
   setLocked(value){
    if(disposed||locked===!!value)return adapter;locked=!!value;
    if(locked)brakeLights.set(false);
    for(const [mesh,material]of originalMaterials)mesh.material=locked?black:material;
    group.userData.locked=locked;return adapter;
   },
   update(pose={}){
    if(disposed)return adapter;
    updateVisualSuspension(wheels,pose);
    body.position.y=pose.bodyBob??0;body.rotation.set(pose.bodyPitch??0,0,pose.bodyRoll??0);
    for(const wheel of wheels){wheel.pivot.rotation.y=wheel.front?(pose.steerAngle??0):0;wheel.spin.rotation.x=-(pose.wheelSpin??0)*SOURCE_WHEEL_RADIUS/wheel.radius;}
    return adapter;
   },
   setBrakeLights(value){brakeLights.set(locked?false:value);return adapter;},reset(){brakeLights.set(false);return adapter.update({});},
   dispose(){if(disposed)return;disposed=true;brakeLights.dispose();group.removeFromParent();disposeResources();},
  };
  return adapter.setLocked(true);
 }catch(error){disposeResources();throw error;}
}
