#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {SHADOW_LAYOUT,followShadowLight} from '../dist/scene-lighting.js';
import {routePointAtProgress,ROUTE,NETWORK_EDGES} from '../dist/route-network.js';
import {loadCharacter,CHARACTER_CATALOG} from '../dist/character.js';
function lightAt(target,position){const l=new T.DirectionalLight();l.position.set(...position);l.target.position.set(...target);Object.assign(l.shadow.camera,{left:-68,right:68,top:78,bottom:-65,near:.5,far:190});l.shadow.camera.updateProjectionMatrix();l.updateMatrixWorld();l.target.updateMatrixWorld();l.shadow.updateMatrices(l);return l;}
const old=lightAt([0,0,-28],[-35,60,30]);
const garage=lightAt([-13,0,58],[-48,60,116]);
const uv=(l,p)=>new T.Vector3(...p).applyMatrix4(l.shadow.matrix).toArray();
const inside=p=>p.every(x=>x>=0&&x<=1);
const points=[[0,0,60],[-41,0,85],[15,0,85],[0,0,-200]];
const report={method:'CPU matrices and original GLB deformed vertices; no GPU or screenshot verification',baseline:points.map(p=>({point:p,shadow:uv(old,p),inside:inside(uv(old,p))})),garageCorners:[],characters:[]};
for(const x of [-58,32])for(const y of [0,20.6])for(const z of [25,91]){const p=[x,y,z];const s=uv(garage,p);assert(inside(s),'Recentered garage contains all shell corners');report.garageCorners.push({point:p,shadow:s});}
assert(!inside(uv(old,[-41,0,85])));assert(!inside(uv(old,[15,0,85])));

for(const p of [[0,0,60],[0,0,85],[-41,0,85]]) {const roof=[p[0]-35/3,20,p[2]+58/3]; report.baseline.push({receiver:p,roofRayIntersection:roof,shadow:uv(old,roof),inside:inside(uv(old,roof))});}

for(const p of [[0,0,-200],[12000,80,-28000],[-10000,30,-16000]]){const l=lightAt(p,[p[0]-35,p[1]+60,p[2]+58]);for(const dx of [-15,15])for(const dz of [-25,25])assert(inside(uv(l,[p[0]+dx,p[1],p[2]+dz])));}

const proposed=new T.DirectionalLight();proposed.position.set(-36,80,30);
Object.assign(proposed.shadow.camera,{left:-75,right:75,bottom:-75,top:75,near:.5,far:220});
proposed.shadow.camera.updateProjectionMatrix();proposed.updateMatrixWorld();proposed.target.updateMatrixWorld();proposed.shadow.updateMatrices(proposed);
report.proposedLocalVolume=[];
for(const x of [-35,35])for(const y of [0,20.6])for(const z of [-35,35]){const point=[x,y,z],shadow=uv(proposed,point);assert(inside(shadow));report.proposedLocalVolume.push({point,shadow});}
report.proposedBias={normalFloorShift:.015*Math.hypot(36,30)/80,depthWorld:.00006*219.5,texelWidth:150/2048};

const tracking=new T.DirectionalLight();Object.assign(tracking.shadow.camera,{left:-SHADOW_LAYOUT.halfExtent,right:SHADOW_LAYOUT.halfExtent,bottom:-SHADOW_LAYOUT.halfExtent,top:SHADOW_LAYOUT.halfExtent,near:SHADOW_LAYOUT.near,far:SHADOW_LAYOUT.far});tracking.shadow.camera.updateProjectionMatrix();
const anchors=[{x:0,y:0,z:60},{x:-56,y:0,z:89},{x:30,y:0,z:27}];
for(const e of NETWORK_EDGES)for(let q=e.progressFrom;q<=e.progressTo;q+=50){const r=routePointAtProgress(q,{branch:e.branch});anchors.push({x:r.x,y:r.height,z:r.z});}
let maxTargetError=0,minimumRoofDepth=Infinity;
for(const anchor of anchors){followShadowLight(tracking,anchor);tracking.shadow.updateMatrices(tracking);maxTargetError=Math.max(maxTargetError,tracking.target.position.distanceTo(new T.Vector3(anchor.x,anchor.y,anchor.z)));for(const dx of [-35,35])for(const dz of [-35,35])for(const dy of [0,20.6]){const point=[anchor.x+dx,anchor.y+dy,anchor.z+dz],s=uv(tracking,point);assert(inside(s),'Production local floor/roof corner within shadow map');if(dy)minimumRoofDepth=Math.min(minimumRoofDepth,s[2]);}}
assert(maxTargetError<=Math.SQRT2*(150/2048)/2+1e-8);
report.productionTracking={anchors:anchors.length,maxTargetError,minimumRoofDepth,minAnchorHeight:Math.min(...anchors.map(p=>p.y)),maxAnchorHeight:Math.max(...anchors.map(p=>p.y))};
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1024,height:512,close(){}});
for(const entry of CHARACTER_CATALOG){const b=fs.readFileSync(entry.url);const c=await loadCharacter(T,{id:entry.id,data:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});let min=Infinity,max=-Infinity;const v=new T.Vector3();for(let frame=0;frame<60;frame++){c.update(.15,0,0);let bottom=Infinity;c.group.traverse(o=>{if(!o.isMesh)return;assert(o.castShadow);assert.equal(o.frustumCulled,false);for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);bottom=Math.min(bottom,v.y);}});min=Math.min(min,bottom);max=Math.max(max,bottom);}report.characters.push({id:entry.id,idleSoleMinimum:min,idleSoleMaximum:max});assert(Math.abs(min)<.01&&Math.abs(max)<.01,`${entry.id}: idle sole clearance is within 1 cm`);c.dispose();}
const vendor=fs.readFileSync(new URL('../dist/vendor/three.module.js',import.meta.url),'utf8');assert(vendor.includes('skinning: object.isSkinnedMesh === true'));assert(vendor.includes('skeleton.update();'));
report.bias={normalBias:.04,depthBias:-.00012,depthRange:189.5,depthBiasWorldMagnitude:.00012*189.5,texelWidth:136/2048,texelHeight:143/2048};
fs.mkdirSync(new URL('../qa/lighting-audit/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/lighting-audit/report.json',import.meta.url),JSON.stringify(report,null,2));console.log(`PASS: fixed-shadow clipping reproduced; recentered garage and distant moving targets covered; ${report.characters.length} original characters grounded within 1 cm.`);
