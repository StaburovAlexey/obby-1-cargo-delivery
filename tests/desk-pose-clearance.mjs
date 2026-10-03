// The shipped Three loader, pose, skinning, and installed furniture. No browser.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import { loadCharacter, CHARACTER_CATALOG } from '../dist/character.js';
import { createGarageScene, CLASSROOM_DESKS } from '../dist/garage-scene.js';
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:1024,height:512,close(){}});
const garage=createGarageScene(T,{group:new T.Group()}),seat=CLASSROOM_DESKS[0].seat;
const boxes=[];garage.group.updateMatrixWorld(true);
garage.group.traverse(mesh=>{
 if(!mesh.isInstancedMesh)return;const names=mesh.userData.partNames??[];let active=false;
 for(let i=0;i<mesh.count;i++){
  if(names[i]==='Classroom desk-02 tabletop')break;
  if(names[i]==='Classroom desk-01 tabletop')active=true;if(!active)continue;
  const matrix=new T.Matrix4();mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);
  const box=new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(matrix);
  box.translate(new T.Vector3(-seat.x,0,-seat.z));boxes.push({name:names[i],box});
 }
});
assert.equal(boxes.length,17,'exact installed first desk/chair/brackets');
const tabletop=boxes.find(v=>/tabletop/.test(v.name)).box;
const seatParts=boxes.filter(v=>/chair seat|seat wing/.test(v.name));
const under=(p,b)=>p.x>=b.min.x&&p.x<=b.max.x&&p.z>=b.min.z&&p.z<=b.max.z;
const inside=(p,b,pad=.006)=>p.x>b.min.x+pad&&p.x<b.max.x-pad&&p.y>b.min.y+pad&&p.y<b.max.y-pad&&p.z>b.min.z+pad&&p.z<b.max.z-pad;
const vector=new T.Vector3(),report=[];
function updatePlacement(a){const w=a.seatedWeight;a.group.position.set(-a.seatAnchor.x*w,(seat.height-a.seatAnchor.y)*w,-a.seatAnchor.z*w);a.group.updateMatrixWorld(true);}
for(const entry of CHARACTER_CATALOG){
 const bytes=fs.readFileSync(entry.url),data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 const a=await loadCharacter(T,{id:entry.id,data}),reference=await loadCharacter(T,{id:entry.id,data});
 const vertices=[],bones=[],refBones=[];
 a.group.traverse(mesh=>{
  if(mesh.isBone)bones.push(mesh);if(!mesh.isSkinnedMesh)return;
  for(let i=0;i<mesh.geometry.attributes.position.count;i++){
   let weight=-1,index=0,legWeight=0;
   for(let j=0;j<4;j++){const w=mesh.geometry.attributes.skinWeight.getComponent(i,j),b=mesh.geometry.attributes.skinIndex.getComponent(i,j);if(w>weight){weight=w;index=b;}if(/Leg$|Foot$|ToeBase$/.test(mesh.skeleton.bones[b].name))legWeight+=w;}
   vertices.push({mesh,index:i,bone:mesh.skeleton.bones[index].name,leg:legWeight>.5});
  }
 });reference.group.traverse(b=>{if(b.isBone)refBones.push(b);});
 const sample=v=>v.mesh.getVertexPosition(v.index,vector).applyMatrix4(v.mesh.matrixWorld);
 const legs=vertices.filter(v=>v.leg);let blendMinimum=Infinity,largestHipStep=0,previousHip;
 function tick(speed=0){a.update(1/60,speed,0);reference.update(1/60,speed,0);updatePlacement(a);const y=bones[0].getWorldPosition(new T.Vector3()).y;if(previousHip!==undefined)largestHipStep=Math.max(largestHipStep,Math.abs(y-previousHip));previousHip=y;}
 function blendCheck(){for(const v of legs)blendMinimum=Math.min(blendMinimum,sample(v).y);}
 a.setSeated(true);
 for(let i=0;i<180;i++){tick();if(i%3===0)blendCheck();}
 const metrics={id:entry.id,handContactY:[],thighContactY:[],footMinimumY:[],deepFurnitureVertices:0,blendMinimumY:0};
 let wholeMin=Infinity;const penetrations=[];
 for(const v of vertices){const p=sample(v);wholeMin=Math.min(wholeMin,p.y);for(const shape of boxes)if(inside(p,shape.box))penetrations.push({bone:v.bone,shape:shape.name,position:p.toArray()});}
 assert.equal(penetrations.length,0,`${entry.id}: furniture penetration ${JSON.stringify(penetrations.slice(0,3))}`);
 assert.ok(wholeMin>=-.001,`${entry.id}: original mesh below floor`);
 for(const side of ['Left','Right']){
  let handMin=Infinity,thighMin=Infinity,footMin=Infinity,shinBack=-Infinity;
  for(const v of vertices){const p=sample(v);
   if(v.bone.endsWith(side+'Hand')&&under(p,tabletop))handMin=Math.min(handMin,p.y);
   if(v.bone.endsWith(side+'UpLeg')&&seatParts.some(s=>under(p,s.box)))thighMin=Math.min(thighMin,p.y);
   if(new RegExp(side+'(Leg|Foot|ToeBase)$').test(v.bone))footMin=Math.min(footMin,p.y);
   if(v.bone.endsWith(side+'Leg')&&p.y>.36&&p.y<.51)shinBack=Math.max(shinBack,p.z);
  }
  assert.ok(handMin>=tabletop.max.y-.002&&handMin<=tabletop.max.y+.012,`${entry.id} ${side}: hand must contact tabletop ${handMin}`);
  assert.ok(thighMin>=seat.height-.002&&thighMin<=seat.height+.05,`${entry.id} ${side}: thigh must be supported ${thighMin}`);
  assert.ok(footMin>=-.001&&footMin<.115,`${entry.id} ${side}: foot near floor ${footMin}`);
  assert.ok(shinBack<-.12,`${entry.id} ${side}: shin must be ahead of seat edge ${shinBack}`);
  const hip=a.group.getObjectByName('mixamorig'+side+'UpLeg').getWorldPosition(new T.Vector3());
  const knee=a.group.getObjectByName('mixamorig'+side+'Leg').getWorldPosition(new T.Vector3());
  const ankle=a.group.getObjectByName('mixamorig'+side+'Foot').getWorldPosition(new T.Vector3());
  const thigh=knee.clone().sub(hip),shin=ankle.clone().sub(knee);
  assert.ok(knee.z<-.25&&thigh.z<-.30,`${entry.id}: knees forward of chair`);
  assert.ok(Math.abs(Math.atan2(thigh.y,-thigh.z))<23*Math.PI/180,`${entry.id}: near-horizontal thigh axis`);
  assert.ok(shin.y<-.40&&Math.hypot(shin.x,shin.z)<.025,`${entry.id}: lower legs down`);
  metrics.handContactY.push(handMin);metrics.thighContactY.push(thighMin);metrics.footMinimumY.push(footMin);
 }
 assert.ok(Math.min(...metrics.thighContactY)<=seat.height+.015,`${entry.id}: actual load-bearing thigh contact`);
 a.setSeated(false);for(let i=0;i<180;i++){tick();if(i%3===0)blendCheck();}
 assert.ok(blendMinimum>=-.002,`${entry.id}: blend below floor ${blendMinimum}`);
 assert.ok(largestHipStep<.08,`${entry.id}: discontinuous seat blend ${largestHipStep}`);
 function samePose(label){for(let i=0;i<bones.length;i++){assert.ok(bones[i].quaternion.clone().normalize().angleTo(refBones[i].quaternion.clone().normalize())<.00001,`${entry.id} ${label}: leaked seated rotation ${bones[i].name}`);assert.ok(bones[i].position.distanceTo(refBones[i].position)<.000001,`${entry.id} ${label}: leaked translation`);}}
 samePose('smooth exit');for(let i=0;i<90;i++)tick(7);samePose('run after smooth exit');
 for(let i=0;i<80;i++){const state={airborne:i<45,elapsed:i/60,duration:.75};a.setAirborne(state);reference.setAirborne(state);tick();}samePose('jump after smooth exit');
 a.setSeated(true);for(let i=0;i<180;i++)a.update(1/60);a.resetMotion();reference.resetMotion();a.group.position.set(0,0,0);samePose('reset from chair');
 for(let i=0;i<90;i++)tick(7);samePose('run after reset');
 for(let i=0;i<80;i++){const state={airborne:i<45,elapsed:i/60,duration:.75};a.setAirborne(state);reference.setAirborne(state);tick();}samePose('jump after reset');
 metrics.blendMinimumY=blendMinimum;metrics.largestHipStep=largestHipStep;report.push(metrics);
 console.log(`PASS ${entry.id}: hands on desk, thighs supported, shins clear, feet near floor; all furniture/accessories clear; seat/stand/reset/run/jump`);
 a.dispose();reference.dispose();
}
fs.writeFileSync(new URL('./latest-seated-pose-report.json',import.meta.url),JSON.stringify({browser:false,realThreeSkinning:true,sourceAssetsUnchanged:true,furniture:boxes.map(s=>({name:s.name,min:s.box.min.toArray(),max:s.box.max.toArray()})),characters:report},null,2));
garage.dispose();
