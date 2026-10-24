import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {initializeRapier,getRapier} from '../dist/rapier-runtime.js';
import {createPhysicsWorld} from '../dist/physics-world.js';
await initializeRapier();
const R=getRapier();
function setup(){const garage={group:new THREE.Group()},pedestal=new THREE.Group(),root=new THREE.Group();garage.group.add(pedestal);pedestal.add(root);root.position.set(3,1,0);garage.vehicles=[{id:'parked',rig:{root},physicsBounds:{min:[-1,-1,-2],max:[1,1,2]}}];const entrance={group:new THREE.Group(),unlocked:false},arm=new THREE.Mesh(new THREE.BoxGeometry(20,.32,.35),new THREE.MeshBasicMaterial());arm.name='Closed red and white barrier arm';arm.position.set(0,1.65,0);entrance.group.add(arm);return {garage,pedestal,root,w:createPhysicsWorld({THREE,garage,canyon:{entrance}})};}
function spy(object,name){const original=object[name].bind(object),calls=[];object[name]=(...args)=>{calls.push(args);return original(...args);};return calls;}
const colliderFor=(w,name)=>{let found;w.world.colliders.forEach(c=>{if(c.userData.name===name)found=c;});return found;};

test('unchanged parked and gate state performs no repeated Rapier writes or world matrix refresh',()=>{
 const {w,root}=setup();try{
  w.syncParkedVehicles(null);const parked=colliderFor(w,'Parked parked'),gate=colliderFor(w,'Closed red and white barrier arm');
  const enabled=spy(parked,'setEnabled'),translation=spy(parked,'setTranslation'),rotation=spy(parked,'setRotation'),gateEnabled=spy(gate,'setEnabled'),matrices=spy(root,'updateWorldMatrix');
  for(let i=0;i<120;i++){w.syncParkedVehicles(null);w.updateGate(false);}
  assert.equal(enabled.length,0,'unchanged parking enable state must not cross into Rapier');assert.equal(gateEnabled.length,0,'unchanged gate state must not cross into Rapier');
  assert.equal(translation.length,0);assert.equal(rotation.length,0);assert.equal(matrices.length,0,'unchanged transform chain needs no world matrix refresh');
  w.syncParkedVehicles('parked');w.syncParkedVehicles('parked');assert.equal(enabled.length,1);assert.equal(parked.isEnabled(),false);
  w.syncParkedVehicles(null);assert.equal(enabled.length,2);assert.equal(parked.isEnabled(),true);
  w.updateGate(true);w.updateGate(true);assert.equal(gateEnabled.length,1);assert.equal(gate.isEnabled(),false);w.updateGate(false);assert.equal(gateEnabled.length,2);
 }finally{w.dispose();}
});

test('parked proxies follow local, rotating pedestal, manual ancestor matrices and selection changes independently of visibility',()=>{
 const {w,garage,pedestal,root}=setup();try{
  w.syncParkedVehicles(null);const parked=colliderFor(w,'Parked parked'),translation=spy(parked,'setTranslation'),rotation=spy(parked,'setRotation');
  const assertPose=()=>{root.updateWorldMatrix(true,false);const point=new THREE.Vector3(0,0,0).applyMatrix4(root.matrixWorld),q=new THREE.Quaternion();root.getWorldQuaternion(q);const actual=parked.translation(),orientation=parked.rotation();for(const k of ['x','y','z'])assert.ok(Math.abs(actual[k]-point[k])<1e-6,`${k} position`);for(const k of ['x','y','z','w'])assert.ok(Math.abs(orientation[k]-q[k])<1e-6,`${k} rotation`);};
  for(let i=1;i<=12;i++){pedestal.rotation.y=i*.1;w.syncParkedVehicles(null);assertPose();}assert.equal(translation.length,12);assert.equal(rotation.length,12);
  root.position.x+=2;w.syncParkedVehicles(null);assertPose();
  root.rotation.y=.4;w.syncParkedVehicles(null);assertPose();root.pivot=new THREE.Vector3(1,0,2);w.syncParkedVehicles(null);assertPose();root.pivot.x=3;w.syncParkedVehicles(null);assertPose();root.pivot=null;w.syncParkedVehicles(null);assertPose();
  pedestal.pivot=new THREE.Vector3(2,0,-1);w.syncParkedVehicles(null);assertPose();pedestal.pivot.z=2;w.syncParkedVehicles(null);assertPose();pedestal.pivot=null;w.syncParkedVehicles(null);assertPose();
  garage.group.position.z=8;garage.group.scale.setScalar(1.3);w.syncParkedVehicles(null);assertPose();
  pedestal.matrixAutoUpdate=false;pedestal.matrix.makeTranslation(7,0,5);pedestal.matrixWorldNeedsUpdate=true;w.syncParkedVehicles(null);assertPose();assert.ok(Math.abs(parked.translation().x-15.6)<1e-6,'manual parent translation reaches collider');
  root.visible=false;garage.group.visible=false;w.syncParkedVehicles(null);assert.equal(parked.isEnabled(),true,'render culling cannot disable collisions');
  w.syncParkedVehicles('parked');root.position.z+=4;pedestal.matrix.makeTranslation(-3,0,5);pedestal.matrixWorldNeedsUpdate=true;w.syncParkedVehicles('parked');w.syncParkedVehicles(null);assertPose();
  w.step(1/60);const p=parked.translation();assert.ok(w.world.castRay(new R.Ray({x:p.x-4,y:p.y,z:p.z},{x:1,y:0,z:0}),8,true),'hidden parked vehicle keeps its real collider');
 }finally{w.dispose();}
});
