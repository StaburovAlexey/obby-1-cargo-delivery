
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {loadCharacter,CHARACTER_CATALOG} from '../dist/character.js';
import {makeSeatPose} from '../dist/character-seat-pose.js';
import {CHARACTER_SEAT} from '../dist/character-seat-calibration.js';
import {makeSeatPose as oldPose} from './fixtures/seated-v18/character-seat-pose.js';
import {CHARACTER_SEAT as oldProfiles} from './fixtures/seated-v18/character-seat-calibration.js';
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1024,height:512,close(){}});
const reports=[];
for(const entry of CHARACTER_CATALOG){
 const bytes=fs.readFileSync(entry.url),a=await loadCharacter(T,{id:entry.id,data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 const model=a.group.children[0].children[0],bones=[];let skeleton;
 model.traverse(b=>{if(b.isBone)bones.push(b);if(b.skeleton)skeleton=b.skeleton;});
 const bone=suffix=>bones.find(b=>b.name.endsWith(suffix));
 const bq=b=>new T.Quaternion().setFromRotationMatrix(new T.Matrix4().extractRotation(skeleton.boneInverses[skeleton.bones.indexOf(b)].clone().invert()));
 const old=oldPose(T,model,oldProfiles[entry.id]),current=makeSeatPose(T,model,CHARACTER_SEAT[entry.id]);
 for(const [b,q] of current)if(!/Arm$|Hand$/.test(b.name))assert.ok(q.clone().normalize().angleTo(old.get(b).clone().normalize())<1e-6,`${entry.id} changed unrelated bone ${b.name}`);
 for(const key of ['thighSlope','seatSupport','seatAnchor'])assert.deepEqual(CHARACTER_SEAT[entry.id][key],oldProfiles[entry.id][key],`${entry.id}: lower-body placement changed`);
 a.setSeated(true);for(let i=0;i<180;i++)a.update(1/60);a.group.updateMatrixWorld(true);
 const world=b=>b.getWorldQuaternion(new T.Quaternion()),pos=b=>b.getWorldPosition(new T.Vector3());
 const wrists=[],sides=[];
 for(const side of ['Left','Right']){
  const arm=bone(side+'Arm'),fore=bone(side+'ForeArm'),hand=bone(side+'Hand');
  const neutral=bq(fore).invert().multiply(bq(hand)),actual=world(fore).invert().multiply(world(hand));
  const wristDegrees=T.MathUtils.radToDeg(actual.angleTo(neutral));wrists.push(wristDegrees);
  assert.ok(wristDegrees<45,`${entry.id} ${side}: bind-relative wrist bend ${wristDegrees}`);
  const upper=pos(fore).sub(pos(arm)),lower=pos(hand).sub(pos(fore));
  assert.ok(lower.z<-.15,`${entry.id}: forearm must point forward`);
  assert.ok(Math.abs(lower.x)<.15,`${entry.id}: excessive forearm lateral splay`);
  assert.ok(pos(fore).y<pos(arm).y+.06,`${entry.id}: elbow lifted above shoulder`);
  const elbowDegrees=T.MathUtils.radToDeg(upper.angleTo(lower));
  assert.ok(elbowDegrees>12&&elbowDegrees<140,`${entry.id}: elbow hinge angle ${elbowDegrees}`);
  for(const [b,child] of [[arm,fore],[fore,hand],[hand,null]]){
   const longitudinal=child?pos(child).sub(pos(b)).normalize():new T.Vector3(0,1,0).applyQuaternion(world(b));
   const skinSide=new T.Vector3(1,0,0).applyQuaternion(bq(b).invert()).applyQuaternion(world(b));
   skinSide.addScaledVector(longitudinal,-skinSide.dot(longitudinal)).normalize();
   const target=new T.Vector3(-1,0,0).addScaledVector(longitudinal,longitudinal.x).normalize();
   assert.ok(skinSide.dot(target)>.99999,`${entry.id}: twisted source-skin frame ${b.name}`);
  }
  sides.push(new T.Vector3(0,1,0).applyQuaternion(world(hand)));
 }
 assert.ok(sides[0].distanceTo(sides[1])<1e-6,`${entry.id}: wrists have different longitudinal directions`);
 const settled=bones.map(b=>b.quaternion.clone());for(let i=0;i<240;i++)a.update(1/60);
 for(let i=0;i<bones.length;i++)assert.ok(bones[i].quaternion.clone().normalize().angleTo(settled[i].clone().normalize())<1e-5,`${entry.id}: seated idle drift`);
 reports.push({id:entry.id,wristDegrees:wrists});console.log(`PASS ${entry.id}: source-bind wrist ${wrists.map(v=>v.toFixed(2)).join('/')} degrees, zero added axial roll, mirrored hand directions, unchanged legs, steady idle`);a.dispose();
}
fs.writeFileSync(new URL('./latest-seated-arm-report.json',import.meta.url),JSON.stringify({browser:false,realThreeSkeleton:true,characters:reports},null,2));
