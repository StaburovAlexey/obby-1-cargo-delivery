#!/usr/bin/env node

import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createVehicleRig} from '../dist/vehicle-rig.js';
let checks=0;
const check=(name,run)=>{run();checks++;console.log(`PASS ${name}`)};
const near=(a,b,tolerance=1e-12)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const nearArray=(a,b)=>{assert.equal(a.length,b.length);a.forEach((value,i)=>near(value,b[i]))};
const parent=new THREE.Group(),root=new THREE.Group();parent.add(root);
parent.position.set(20,4,-10);root.position.set(1.8,.3,9.8);root.rotation.set(.03,.6,-.02);root.updateMatrix();
const initialPosition=root.position.clone(),initialQuaternion=root.quaternion.clone(),initialMatrix=root.matrix.clone();
const rig=createVehicleRig(THREE,root);
check('empty root allocates no geometry and preserves calibrated contact metadata',()=>{
 assert.equal(rig.root,root);assert.equal(rig.group,root);assert.equal(root.parent,parent);assert.equal(root.children.length,0);
 nearArray(rig.initialPosition.toArray(),initialPosition.toArray());nearArray(rig.initialQuaternion.toArray(),initialQuaternion.toArray());
 assert.equal(rig.wheelRadius,.68);assert.equal(rig.wheelbase,3.36);assert.equal(rig.frontAxleZ,-1.63);assert.equal(rig.rearAxleZ,1.73);
 assert.equal(rig.wheels.length,4);assert.equal(new Set(rig.wheels.map(w=>w.name)).size,4);
 for(const wheel of rig.wheels){nearArray(wheel.localPosition.toArray(),[wheel.side==='left'?-1.32:1.32,.73,wheel.front?-1.63:1.73]);assert.equal(wheel.radius,.68);assert.equal(wheel.parts,undefined)}
 assert.throws(()=>createVehicleRig(THREE,root),/already has an active/);
});
check('absolute pose accepts arrays, typed arrays, vectors and normalized quaternions',()=>{
 const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(.17,.6,-.04));
 rig.update({position:[10,4,-32],quaternion:quaternion.toArray()});
 nearArray(root.matrix.elements,new THREE.Matrix4().compose(new THREE.Vector3(10,4,-32),quaternion,new THREE.Vector3(1,1,1)).elements);
 rig.update({position:new Float32Array([3,5,7])});nearArray(root.position.toArray(),[3,5,7]);nearArray(root.quaternion.toArray(),quaternion.toArray());
 rig.update({position:new THREE.Vector3(-4,2,-71),quaternion:[0,0,0,4]});nearArray(root.position.toArray(),[-4,2,-71]);nearArray(root.quaternion.toArray(),[0,0,0,1]);
 assert.equal(rig.update(),rig);
});
check('visual pose state retains omitted fields without changing root or adding meshes',()=>{
 const before=root.matrix.clone();
 rig.update({steerAngle:.42,wheelSpin:1.3,bodyPitch:.07,bodyRoll:-.05,bodyBob:.08});
 for(let i=0;i<30;i++){rig.update({bodyBob:-.03});rig.update({bodyBob:.08});}
 assert.deepEqual(rig.pose,{steerAngle:.42,wheelSpin:1.3,bodyPitch:.07,bodyRoll:-.05,bodyBob:.08});
 for(const wheel of rig.wheels){near(wheel.steerAngle,wheel.front?.42:0);near(wheel.wheelSpin,1.3)}
 nearArray(root.matrix.elements,before.elements);assert.equal(root.children.length,0);
 rig.update({wheelSpin:Math.PI*2*10000+.18});assert(Number.isFinite(rig.pose.wheelSpin));
});
check('invalid pose rejects atomically before transform or articulation changes',()=>{
 const before=root.matrix.clone(),beforePose={...rig.pose},beforeWheels=rig.wheels.map(w=>[w.steerAngle,w.wheelSpin]);
 for(const invalid of [{position:[0,NaN,0]},{position:[1,2]},{quaternion:[0,0,0,0]},{quaternion:[0,Infinity,0,1]},
  {position:[4,4,4],quaternion:[0,0,1]},{position:[4,4,4],steerAngle:NaN},{quaternion:[0,0,0,1],wheelSpin:Infinity},null,
  {position:[4,4,4],bodyPitch:NaN},{steerAngle:.4,wheelSpin:10,bodyRoll:Infinity},{bodyBob:-Infinity}]){
  assert.throws(()=>rig.update(invalid),TypeError);nearArray(root.matrix.elements,before.elements);assert.deepEqual(rig.pose,beforePose);assert.deepEqual(rig.wheels.map(w=>[w.steerAngle,w.wheelSpin]),beforeWheels);
 }
});
check('independent root, pose and reset preserve initial orientation',()=>{
 const other=new THREE.Group(),otherRig=createVehicleRig(THREE,other);
 rig.update({position:[8,9,10],steerAngle:.5,wheelSpin:4});assert.deepEqual(otherRig.pose,{steerAngle:0,wheelSpin:0,bodyPitch:0,bodyRoll:0,bodyBob:0});
 nearArray(other.position.toArray(),[0,0,0]);assert.notEqual(rig.pose,otherRig.pose);assert.notEqual(rig.wheels[0].localPosition,otherRig.wheels[0].localPosition);
 assert.equal(rig.reset(),rig);nearArray(root.matrix.elements,initialMatrix.elements);
 assert.deepEqual(rig.pose,{steerAngle:0,wheelSpin:0,bodyPitch:0,bodyRoll:0,bodyBob:0});
 otherRig.dispose();
});
check('dispose is idempotent and leaves adapter-owned resources untouched',()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());root.add(mesh);let disposals=0;
 mesh.geometry.addEventListener('dispose',()=>disposals++);mesh.material.addEventListener('dispose',()=>disposals++);
 rig.update({position:[7,8,9],wheelSpin:3});rig.dispose();rig.dispose();
 assert.equal(rig.disposed,true);nearArray(root.matrix.elements,initialMatrix.elements);assert.equal(disposals,0);assert.equal(mesh.parent,root);
 rig.update({position:[100,200,300]});rig.reset();nearArray(root.matrix.elements,initialMatrix.elements);
 const replacement=createVehicleRig(THREE,root);replacement.dispose();assert.equal(disposals,0);
 mesh.geometry.dispose();mesh.material.dispose();assert.equal(disposals,2);
});
check('manual-matrix roots restore their exact starting transform',()=>{
 const manual=new THREE.Group();manual.matrixAutoUpdate=false;manual.matrix.makeTranslation(4,5,6);
 const before=manual.matrix.clone(),controller=createVehicleRig(THREE,manual);assert.equal(manual.matrixAutoUpdate,true);
 controller.update({position:[7,8,9]});controller.dispose();assert.equal(manual.matrixAutoUpdate,false);assert.deepEqual(manual.matrix.elements,before.elements);
});
check('missing or malformed roots are rejected without creating resources',()=>{
 for(const invalid of [undefined,null,{},new THREE.Object3D()])assert.throws(()=>createVehicleRig(THREE,invalid),/root Group/);
});
console.log(`Vehicle rig: ${checks} checks passed. CPU-only; no procedural vehicle geometry.`);
