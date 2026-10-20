import {getVehicleNeon} from './vehicle-neon-catalog.js';

/** Shared unlit geometry/material: no extra dynamic lights or postprocessing. */
export function createFleetNeon(THREE){
 const entries=new Map(),geometry=new THREE.BoxGeometry(1,1,1),plane=new THREE.PlaneGeometry(1,1);
 const size=32,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,r=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1);
  data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*Math.pow(Math.max(0,1-r),1.6));
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.needsUpdate=true;
 const material=new THREE.MeshBasicMaterial({toneMapped:false});
 const haloMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
 let selected=null;
 return {
  get size(){return entries.size;},
  setColor(id){if(id===selected)return;const color=getVehicleNeon(id);selected=color?.id||null;if(color){material.color.setHex(color.color);haloMaterial.color.setHex(color.color);}for(const entry of entries.values())entry.visible=!!selected;},
  attach(adapter){
   if(!adapter?.body||entries.has(adapter))return;
   // Bounds in the body's local frame, independent of the parked/driving pose.
   adapter.body.updateWorldMatrix(true,true);
   const inverse=adapter.body.matrixWorld.clone().invert(),box=new THREE.Box3().makeEmpty();
   adapter.body.traverse(node=>{if(!node.isMesh||!node.geometry)return;node.geometry.computeBoundingBox();box.union(node.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld)));});
   if(box.isEmpty())return;
   const extent=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
   const root=new THREE.Group();root.name='vehicle-underglow';root.visible=!!selected;
   const x=extent.x*.39,z=extent.z*.36,y=box.min.y+Math.min(.16,extent.y*.15);
   for(const [px,pz,sx,sz]of [[-x,0,.035,extent.z*.72],[x,0,.035,extent.z*.72],[0,-z,extent.x*.78,.035],[0,z,extent.x*.78,.035]]){
    const strip=new THREE.Mesh(geometry,material);strip.position.set(center.x+px,y,center.z+pz);strip.scale.set(sx,.035,sz);root.add(strip);
   }
   const halo=new THREE.Mesh(plane,haloMaterial);halo.rotation.x=-Math.PI/2;halo.position.set(center.x,box.min.y+.025,center.z);halo.scale.set(extent.x*1.5,extent.z*1.2,1);root.add(halo);
   adapter.body.add(root);entries.set(adapter,root);
  },
  clear(){for(const root of entries.values())root.removeFromParent();entries.clear();},
  dispose(){this.clear();geometry.dispose();plane.dispose();material.dispose();haloMaterial.dispose();texture.dispose();},
 };
}
