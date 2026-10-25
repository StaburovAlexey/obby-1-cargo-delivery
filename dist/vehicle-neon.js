import {getVehicleNeon} from './vehicle-neon-catalog.js';
import {createVehicleNeonGlowResources, vehicleNeonFootprint, VEHICLE_NEON_GROUND_LIFT} from './vehicle-neon-glow.js';

/** Shared unlit ground halos: no extra dynamic lights or postprocessing. */
export function createFleetNeon(THREE){
 const entries=new Map(),resources=createVehicleNeonGlowResources(THREE),material=resources.createMaterial();
 const inverse=new THREE.Matrix4(),world=new THREE.Matrix4(),basis=new THREE.Matrix4(),offset=new THREE.Matrix4();
 const position=new THREE.Vector3(),scale=new THREE.Vector3(),normal=new THREE.Vector3(),point=new THREE.Vector3();
 const forward=new THREE.Vector3(),right=new THREE.Vector3(),back=new THREE.Vector3(),quaternion=new THREE.Quaternion();
 let selected=null,disposed=false;
 const visibility=(adapter,entry)=>{entry.root.visible=!!selected&&!adapter.locked&&entry.supported;};
 function align(adapter,entry,support){
  const group=adapter.group||adapter.body;
  entry.supported=support?.airborne!==true;
  visibility(adapter,entry);
  if(!entry.root.visible)return;
  adapter.body.updateWorldMatrix(true,false);
  normal.set(0,0,0);point.set(0,0,0);let contacts=0;
  for(const contact of support?.wheelContacts||[]){
   const p=contact.point,n=contact.normal;
   if(!contact.grounded||!p||!n||![p.x,p.y,p.z,n.x,n.y,n.z].every(Number.isFinite)||n.y<=0)continue;
   point.add(p);normal.add(n);contacts++;
  }
  const plane=support?.groundPlane,p=plane?.point,n=plane?.normal;
  if(p&&n&&[p.x,p.y,p.z,n.x,n.y,n.z].every(Number.isFinite)&&n.y>0){
   point.copy(p);normal.copy(n);contacts=1;
  }
  if(contacts&&normal.lengthSq()>0){
   point.multiplyScalar(1/contacts);normal.normalize();
   group.matrixWorld.decompose(position,quaternion,scale);
   position.set(entry.footprint.x,0,entry.footprint.z).applyMatrix4(group.matrixWorld);
   // Project the rendered X/Z onto real support (ramps, bridges and pits).
   position.y=point.y-(normal.x*(position.x-point.x)+normal.z*(position.z-point.z))/normal.y;
   position.addScaledVector(normal,VEHICLE_NEON_GROUND_LIFT*scale.y);
   forward.set(0,0,-1).applyQuaternion(quaternion).projectOnPlane(normal);
   if(forward.lengthSq()<1e-8)forward.set(0,0,-1).projectOnPlane(normal);
   forward.normalize();right.crossVectors(forward,normal).normalize();back.copy(forward).negate();
   basis.makeBasis(right,normal,back);quaternion.setFromRotationMatrix(basis);
   world.compose(position,quaternion,scale);
   offset.makeTranslation(-entry.footprint.x,-entry.footprint.y,-entry.footprint.z);world.multiply(offset);
  }else world.copy(group.matrixWorld);
  // Keep the public body child while cancelling cosmetic body bob/pitch/roll.
  entry.root.matrix.multiplyMatrices(inverse.copy(adapter.body.matrixWorld).invert(),world);
  entry.root.matrixWorldNeedsUpdate=true;
 }
 return {
  get size(){return entries.size;},
  setColor(id){
   if(disposed||id===selected)return;const color=getVehicleNeon(id);selected=color?.id||null;
   if(color)material.color.setHex(color.color);
   for(const [adapter,entry]of entries)visibility(adapter,entry);
  },
  attach(adapter,support){
   if(disposed||!adapter?.body)return;
   if(adapter.disposed){entries.get(adapter)?.root.removeFromParent();entries.delete(adapter);return;}
   let entry=entries.get(adapter);
   if(!entry){
    if(adapter.locked)return;
    const footprint=vehicleNeonFootprint(THREE,adapter);if(!footprint)return;
    const root=resources.createGlow(footprint,material);root.matrixAutoUpdate=false;
    entry={root,footprint,supported:true};adapter.body.add(root);entries.set(adapter,entry);
   }
   align(adapter,entry,support);
  },
  clear(){for(const {root}of entries.values())root.removeFromParent();entries.clear();},
  dispose(){if(disposed)return;disposed=true;this.clear();resources.dispose();},
 };
}
