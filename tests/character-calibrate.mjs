#!/usr/bin/env node

import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.js';
import { CHARACTER_CATALOG } from '../dist/character-catalog.js';
import { makeSeatPose } from '../dist/character-seat-pose.js';
import { CHARACTER_SEAT } from '../dist/character-seat-calibration.js';
globalThis.self=globalThis; globalThis.createImageBitmap=async()=>({width:1024,height:512,close(){}});
const results={};
const round=x=>+x.toFixed(8);
for(const item of CHARACTER_CATALOG){
 const bytes=fs.readFileSync(item.url); const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const model=gltf.scene;model.rotation.y=Math.PI;
 const pivot=new THREE.Group();pivot.add(model);
 const idleClip=gltf.animations.find(c=>/idle/i.test(c.name));const runClip=gltf.animations.find(c=>/run/i.test(c.name));
 const hipsTrack=idleClip.tracks.find(t=>/Hips\.position$/.test(t.name));
 const inPlace=source=>{const clip=source.clone();for(const track of clip.tracks)if(track.name===hipsTrack.name)for(let i=0;i<track.values.length;i+=3){track.values[i]=hipsTrack.values[0];track.values[i+2]=hipsTrack.values[2];}return clip;};
 const mixer=new THREE.AnimationMixer(model),idle=mixer.clipAction(inPlace(idleClip)).play(),run=mixer.clipAction(inPlace(runClip)).play();run.setEffectiveWeight(0);mixer.update(0);pivot.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(model,true), scale=3.5/(bounds.max.y-bounds.min.y);pivot.scale.setScalar(scale);pivot.position.set(-(bounds.min.x+bounds.max.x)*.5*scale,0,-(bounds.min.z+bounds.max.z)*.5*scale);pivot.updateMatrixWorld(true);
 const v=new THREE.Vector3(); const soles=[];let allVertices=0;
 model.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const weights=mesh.geometry.attributes.skinWeight,indices=mesh.geometry.attributes.skinIndex,positions=mesh.geometry.attributes.position;const footBones=new Set(mesh.skeleton.bones.map((b,i)=>/Foot|ToeBase/.test(b.name)?i:-1).filter(i=>i>=0));const vertices=[];for(let i=0;i<positions.count;i++){allVertices++;let weight=0;for(let c=0;c<4;c++)if(footBones.has(indices.getComponent(i,c)))weight+=weights.getComponent(i,c);if(weight>.08)vertices.push(i);}soles.push({mesh,vertices});});
 function support(){pivot.updateMatrixWorld(true);let min=Infinity;for(const {mesh,vertices} of soles)for(const i of vertices){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);min=Math.min(min,v.y);}return -min;}
 function pose(idleTime,runTime,w){idle.time=idleTime;run.time=runTime;idle.setEffectiveWeight(1-w);run.setEffectiveWeight(w);mixer.update(0);return support();}
 const idleCurve=Array.from({length:501},(_,i)=>pose(i*idleClip.duration/501,0,0));
 const runSupport=Math.max(...Array.from({length:Math.ceil(runClip.duration*240)+1},(_,i)=>pose(0,i*runClip.duration/Math.ceil(runClip.duration*240),1)))+.004;
 const transition=Array(33).fill(0);
 for(let a=0;a<8;a++)for(let b=0;b<48;b++)for(let wi=1;wi<32;wi++){
   const w=wi/32; const actual=pose(a*idleClip.duration/8,b*runClip.duration/48,w);
   const base=(1-w)*pose(a*idleClip.duration/8,0,0)+w*runSupport;
   transition[wi]=Math.max(transition[wi],actual-base+.004);
 }
 pose(0,0,0);const seatPose=makeSeatPose(THREE,model,CHARACTER_SEAT[item.id]);for(const [bone,q] of seatPose)bone.quaternion.copy(q);pivot.updateMatrixWorld(true);
 const seatedBox=new THREE.Box3().setFromObject(pivot,true),seatSupport=CHARACTER_SEAT[item.id].seatSupport;
 const hips=model.getObjectByName('mixamorigHips').getWorldPosition(new THREE.Vector3());
 const seatAnchor=CHARACTER_SEAT[item.id].seatAnchor;
 results[item.id]={sha256:item.sha256,scale:round(scale),originalHeight:round(3.5/scale),soleVertices:soles.reduce((n,s)=>n+s.vertices.length,0),allVertices,idle:idleCurve.map(round),run:round(runSupport),transition:transition.map(round),seatSupport:round(seatSupport),seatAnchor:seatAnchor.map(round),seatBounds:{min:seatedBox.min.toArray().map(round),max:seatedBox.max.toArray().map(round)}};
 console.log(item.id, 'vertices',allVertices,'soles',results[item.id].soleVertices,'run',runSupport,'seatAnchor',seatAnchor);
 fs.writeFileSync(new URL('../dist/character-support.js',import.meta.url),'// Generated offline from each original GLB. See tests/character-calibrate.mjs.\nexport const CHARACTER_SUPPORT = '+JSON.stringify(results)+';\n');
}
