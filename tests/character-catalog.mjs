#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as THREE from '../dist/vendor/three.module.js';
import { CHARACTER_CATALOG, loadCharacter, createCharacterDisplay, getCharacterCacheStats, clearCharacterCache } from '../dist/character.js';
import { CHARACTER_SUPPORT } from '../dist/character-support.js';
import { CLASSROOM_DESKS } from '../dist/garage-scene.js';
const require=createRequire(import.meta.url);let validator;try{validator=require('gltf-validator');}catch{validator=require('../../tools/node_modules/gltf-validator');}
globalThis.self=globalThis; globalThis.ProgressEvent=class{constructor(type,values){Object.assign(this,{type},values);}};
globalThis.createImageBitmap=async blob=>{const bytes=Buffer.from(await blob.arrayBuffer());return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),close(){}};};
const originalFetch=globalThis.fetch; let reads=0;
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url; if(url.startsWith('file:')){reads++;return new Response(fs.readFileSync(new URL(url)),{status:200});}return originalFetch(request);};
const vector=new THREE.Vector3(), box=new THREE.Box3(); const metrics=[];
assert.equal(CHARACTER_CATALOG.length,17);assert.equal(new Set(CHARACTER_CATALOG.map(c=>c.id)).size,17);
for(const entry of CHARACTER_CATALOG){
 const bytes=fs.readFileSync(entry.url); assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
 assert.equal(bytes.length,entry.bytes); const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:entry.source});
 assert.equal(validation.issues.numErrors,0,entry.id);assert.equal(validation.issues.numWarnings,0,entry.id);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert.deepEqual(json.animations.map(a=>a.name),['Jumping','Orc Idle','FlyingEdit','running']);
 assert.ok(json.skins.every(s=>s.joints.length===22)); assert.equal(CHARACTER_SUPPORT[entry.id].sha256,entry.sha256);
 const character=await loadCharacter(THREE,{id:entry.id,data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 const {group}=character;let meshes=0,skinVertices=0;group.traverse(o=>{if(o.isMesh){meshes++;assert.ok(o.isSkinnedMesh);skinVertices+=o.geometry.attributes.position.count;assert.ok(o.geometry.attributes.uv);assert.equal(o.skeleton.bones.length,22);if(entry.textured)assert.ok(o.material.map);}});assert.ok(meshes>0);
 const initial=box.setFromObject(group,true);assert.ok(Math.abs(initial.min.y)<1e-6,`${entry.id} initial foot ${initial.min.y}`);assert.ok(Math.abs(initial.max.y-3.5)<1e-6,entry.id);
 let minFoot=Infinity,maxFoot=-Infinity,maxSteadyPivotStep=0,maxStep=0,oldPivot=group.children[0].position.y;
 for(let i=0;i<480;i++){
  const speed=i<60?0:i<240?7:i<300?0:i<390?4.5:0;
  character.update(1/60,speed,0); if(i%3===0){const b=box.setFromObject(group,true);minFoot=Math.min(minFoot,b.min.y);maxFoot=Math.max(maxFoot,b.min.y);}
  const dy=Math.abs(group.children[0].position.y-oldPivot);maxStep=Math.max(maxStep,dy);if(i>180&&i<240)maxSteadyPivotStep=Math.max(maxSteadyPivotStep,dy);oldPivot=group.children[0].position.y;
 }
 assert.ok(minFoot>-.001,`${entry.id} foot penetration ${minFoot}`);assert.ok(maxFoot<.34,`${entry.id} floating ${maxFoot}`);assert.ok(maxSteadyPivotStep<1e-6,`${entry.id} run jitter ${maxSteadyPivotStep}`);
 character.resetMotion(); character.setSeated(true);const originals=[];group.traverse(o=>{if(o.isMesh){originals.push([o,o.getVertexPosition]);o.getVertexPosition=()=>{throw Error('Runtime skinned scan');};}});for(let i=0;i<180;i++)character.update(1/60,0,0);for(const [m,original] of originals)m.getVertexPosition=original;
 group.position.set(-character.seatAnchor.x*character.seatedWeight,(CLASSROOM_DESKS[0].seat.height-character.seatAnchor.y)*character.seatedWeight,-character.seatAnchor.z*character.seatedWeight);group.updateMatrixWorld(true);
 const seated=box.setFromObject(group,true);assert.ok(seated.min.y>=-.001,`${entry.id} seated feet below floor ${seated.min.y}`);assert.ok(character.seatedWeight>.99999);assert.ok(character.animations.every(c=>!/sit/i.test(c.name)));

 const hip=group.getObjectByName('mixamorigHips').getWorldPosition(new THREE.Vector3());assert.ok(hip.y>CLASSROOM_DESKS[0].seat.height&&hip.y<1.1,`${entry.id} seated pelvis height ${hip.y}`);
 for(const side of ['Left','Right']){
  const top=group.getObjectByName(`mixamorig${side}UpLeg`).getWorldPosition(new THREE.Vector3());
  const knee=group.getObjectByName(`mixamorig${side}Leg`).getWorldPosition(new THREE.Vector3());
  const foot=group.getObjectByName(`mixamorig${side}Foot`).getWorldPosition(new THREE.Vector3());
  assert.ok(knee.z<top.z-.3,`${entry.id} ${side} thigh not forward`);assert.ok(Math.abs(Math.atan2(knee.y-top.y,top.z-knee.z))<23*Math.PI/180,`${entry.id} thigh not seated`);assert.ok(foot.y<knee.y-.35,`${entry.id} lower leg not vertical`);
 }


 let lowerTableMax=-Infinity;
 group.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const pos=mesh.geometry.attributes.position,weights=mesh.geometry.attributes.skinWeight,indices=mesh.geometry.attributes.skinIndex;for(let i=0;i<pos.count;i++){let legWeight=0;for(let c=0;c<4;c++)if(/UpLeg|Leg|Foot|Toe/.test(mesh.skeleton.bones[indices.getComponent(i,c)].name))legWeight+=weights.getComponent(i,c);if(legWeight<.5)continue;mesh.getVertexPosition(i,vector).applyMatrix4(mesh.matrixWorld);if(vector.z<-.5&&vector.z>-2.5&&Math.abs(vector.x)<1.2)lowerTableMax=Math.max(lowerTableMax,vector.y);}});
 assert.ok(lowerTableMax<1.15,`${entry.id} thighs/table collision ${lowerTableMax}`);
 character.setSeated(false);for(let i=0;i<180;i++)character.update(1/60,0,0);assert.ok(character.seatedWeight<1e-10);
 character.dispose();
 metrics.push({id:entry.id,meshPrimitives:meshes,parsedVertices:skinVertices,validationErrors:validation.issues.numErrors,validationWarnings:validation.issues.numWarnings,minFoot,maxFoot,maxSteadyPivotStep,maxPivotStep:maxStep,seatedFeetY:seated.min.y,lowerTableMax:Number.isFinite(lowerTableMax)?lowerTableMax:null,seatAnchor:character.seatAnchor.toArray()});
 console.log(`PASS ${entry.id}: original GLB, 22-bone rig, native materials/UV, idle/run floor, stable support, seated knees + feet + desk`);
}


const [a,b,display1,display2]=await Promise.all([loadCharacter(THREE),loadCharacter(THREE),createCharacterDisplay(THREE),createCharacterDisplay(THREE)]);
assert.equal(reads,1);assert.equal(getCharacterCacheStats().parses,1);
assert.notEqual(a.group.getObjectByName('mixamorigHips'),b.group.getObjectByName('mixamorigHips'));
let amesh,bmesh;a.group.traverse(o=>{if(o.isMesh)amesh=o;});b.group.traverse(o=>{if(o.isMesh)bmesh=o;});
assert.equal(amesh.geometry,bmesh.geometry);assert.equal(amesh.material,bmesh.material);assert.equal(display1.group.children[0].geometry,display2.group.children[0].geometry);
assert.deepEqual(Array.from(display1.group.children[0].geometry.attributes.uv.array),Array.from(amesh.geometry.attributes.uv.array));
for(const display of [display1,display2])display.group.traverse(o=>{assert.ok(!o.isSkinnedMesh&&!o.isBone);if(o.isMesh){assert.equal(o.geometry.attributes.skinIndex,undefined);assert.equal(o.material,amesh.material);}});
let disposed=0;amesh.material.map.addEventListener('dispose',()=>disposed++);a.dispose();a.dispose();assert.equal(disposed,0);b.update(.016,7,0);assert.equal(clearCharacterCache(),0);
b.dispose();display1.dispose();display2.dispose();assert.equal(getCharacterCacheStats().references,0);assert.equal(clearCharacterCache(),1);assert.equal(disposed,1);
const urlOnly=await loadCharacter(THREE,{url:CHARACTER_CATALOG.find(c=>c.id==='pirate').url});
assert.equal(urlOnly.id,'pirate');urlOnly.dispose();clearCharacterCache();
await assert.rejects(loadCharacter(THREE,{id:'missing'}));
console.log('PASS cached parse, independent active rigs, frozen snapshots, shared resources and safe cache teardown');
fs.writeFileSync(new URL('./latest-character-catalog-report.json',import.meta.url),JSON.stringify({all17Validated:true,nativeUV:true,sourceUnmodified:true,browserRun:false,metrics,cacheChecks:true},null,2));
