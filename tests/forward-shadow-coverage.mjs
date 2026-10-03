#!/usr/bin/env node
// Real Three shadow matrices + application loop with a mocked renderer.
// This verifies geometric coverage, not GPU appearance, FPS or perceived popping.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {SHADOW_LAYOUT as P,followShadowLight} from '../dist/scene-lighting.js';
import {routePointAtProgress,NETWORK_EDGES} from '../dist/route-network.js';
import {groundHeight} from '../dist/city-driving.js';
import {createAppDom} from './fixtures/app-dom.mjs';
const light=(half=P.halfExtent,far=P.far)=>{const l=new T.DirectionalLight();Object.assign(l.shadow.camera,{left:-half,right:half,top:half,bottom:-half,near:.5,far});l.shadow.camera.updateProjectionMatrix();return l;};
const project=(l,p)=>new T.Vector3(p.x,p.y,p.z).applyMatrix4(l.shadow.matrix);
const inside=(v)=>['x','y','z'].every(k=>v[k]>=-1e-9&&v[k]<=1+1e-9);
const update=(l,a,d)=>{followShadowLight(l,a,d);l.shadow.updateMatrices(l);};
const covered=(l,p,label)=>assert(inside(project(l,p)),`${label}: ${JSON.stringify(p)} -> ${project(l,p).toArray()}`);
const rayDistance=(l,a,d)=>{const v=project(l,a),w=project(l,{x:a.x+d.x,y:a.y,z:a.z+d.z}).sub(v);assert(inside(v));let end=Infinity;for(const k of ['x','y','z'])if(Math.abs(w[k])>1e-12)end=Math.min(end,w[k]>0?(1-v[k])/w[k]:-v[k]/w[k]);return end;};
const report={method:'CPU: real Three matrices, generated route terrain, mocked renderer; no browser/GPU verification',mapCount:1,mapSize:P.mapSize,localTexel:2*P.localHalfExtent/P.mapSize,drivingTexel:2*P.halfExtent/P.mapSize,lookAhead:P.lookAhead,forward:[],terrainAnchors:0,receiverAndCasterChecks:0};
assert.equal(P.mapSize,2048);assert(report.drivingTexel<=.15);assert.equal(P.localHalfExtent,75);
const tracking=light(),old=light(75,220),origin={x:0,y:0,z:0};
old.position.set(-36,80,30);old.target.position.set(0,0,0);old.updateMatrixWorld();old.target.updateMatrixWorld();old.shadow.updateMatrices(old);
let snapError=0,minDepth=1,maxDepth=0;
for(let i=0;i<72;i++){
 const angle=i*Math.PI/36,d={x:Math.sin(angle),y:-.5,z:Math.cos(angle)};
 update(tracking,origin,d);
 const a=rayDistance(old,origin,d),b=rayDistance(tracking,origin,d);
 assert(b>=229.8&&b>a*2.5,'Wider camera-facing forward ground range');
 report.forward.push({degrees:i*5,old:a,new:b});
 const target=new T.Vector3(P.lookAhead*d.x,0,P.lookAhead*d.z);
 snapError=Math.max(snapError,target.distanceTo(tracking.target.position));
 // 200 m of ground and a 40 m caster envelope with the maximum route grade,
 // in either uphill/downhill direction and every horizontal camera direction.
 for(const grade of [-.075,0,.075])for(const distance of [-30,0,50,100,150,200])for(const side of [-20,0,20])for(const height of [0,40]){
  const point={x:d.x*distance+d.z*side,y:grade*distance+height,z:d.z*distance-d.x*side};
  covered(tracking,point,'graded receiver/caster');const z=project(tracking,point).z;minDepth=Math.min(minDepth,z);maxDepth=Math.max(maxDepth,z);report.receiverAndCasterChecks++;
 }
 // Nearby roof/vehicle/road remain inside while bias rotates around the player.
 for(const x of [-35,35])for(const z of [-35,35])for(const y of [0,20.6])covered(tracking,{x,y,z},'nearby roof/ground');
}
assert(snapError<=Math.SQRT2*report.drivingTexel/2+1e-9);
// Sample every route branch at 100 m intervals, both travel directions, including
// large world coordinates and actual sloped road edges at 200 m look-ahead.
for(const edge of NETWORK_EDGES)for(let q=edge.progressFrom;q<=edge.progressTo;q+=100){
 const r=routePointAtProgress(q,{branch:edge.branch}),anchor={x:r.x,y:groundHeight(r.x,r.z,r),z:r.z};report.terrainAnchors++;
 for(const sign of [-1,1]){
  const d={x:r.tangent.x*sign,z:r.tangent.z*sign};update(tracking,anchor,d);
  for(const distance of [0,50,100,150,200])for(const side of [-15,15])for(const height of [0,40]){
   const x=r.x+d.x*distance+d.z*side,z=r.z+d.z*distance-d.x*side;
   covered(tracking,{x,y:groundHeight(x,z)+height,z},'actual terrain and elevated caster');report.receiverAndCasterChecks++;
  }
 }
}
// The hangar returns to its exact original transverse resolution and covers
// all shell corners from its spawn, plus the former local envelope at edges.
const spawn={x:0,y:0,z:60};update(tracking,spawn);
assert.equal(tracking.shadow.camera.right,75);
for(const x of [-58,32])for(const y of [0,20.6])for(const z of [25,91])covered(tracking,{x,y,z},'hangar shell from spawn');
for(const a of [{x:-56,y:0,z:89},{x:30,y:0,z:27}]){update(tracking,a);for(const x of [-35,35])for(const y of [0,20.6])for(const z of [-35,35])covered(tracking,{x:a.x+x,y,z:a.z+z},'hangar local envelope');}
for(const d of [{x:0,y:-1,z:0},{x:NaN,y:Infinity,z:NaN}]){update(tracking,origin,d);assert.equal(tracking.shadow.camera.right,P.halfExtent);assert(tracking.target.position.toArray().every(Number.isFinite));covered(tracking,origin,'degenerate view fallback');}
// Real app camera quaternion is sampled after follow-camera/orbit updates.
const app=createAppDom();try{
 const debug=app.debug,sun=debug.scene.children.find(o=>o.isDirectionalLight&&o.castShadow);
 assert(sun);assert.equal(debug.scene.children.filter(o=>o.isLight&&o.castShadow).length,1);
 for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
  debug.model.pause();debug.cameraState.lookBegin();debug.cameraState.lookDelta(yaw-debug.cameraState.state.yaw,0);app.frame();
  const direction=debug.camera.getWorldDirection(new T.Vector3()),length=Math.hypot(direction.x,direction.z),a=debug.model.state;
  const expected=new T.Vector3(a.x+P.lookAhead*direction.x/length,groundHeight(a.x,a.z),a.z+P.lookAhead*direction.z/length);
  assert(sun.target.position.distanceTo(expected)<=Math.SQRT2*report.drivingTexel/2+1e-8,'Production anchor uses actual viewed direction');
  // Negative speed must not flip the shadow bias away from the viewed direction.
  Object.assign(a,{velocityX:2*Math.sin(a.heading),velocityZ:2*Math.cos(a.heading),speed:-2,linearSpeed:2,gear:'R'});app.frame();
  assert(a.speed<0,'Exercise actual reverse motion');
  debug.camera.getWorldDirection(direction);const reverseLength=Math.hypot(direction.x,direction.z);
  expected.set(a.x+P.lookAhead*direction.x/reverseLength,groundHeight(a.x,a.z),a.z+P.lookAhead*direction.z/reverseLength);
  assert(sun.target.position.distanceTo(expected)<=Math.SQRT2*report.drivingTexel/2+1e-8,'Reverse bias follows viewed direction');debug.model.pause();
 }
 debug.returnToGarage();app.frame();assert.equal(sun.shadow.camera.right,P.localHalfExtent);
}finally{app.dispose();}
report.forwardSummary={oldMinimum:Math.min(...report.forward.map(x=>x.old)),oldMaximum:Math.max(...report.forward.map(x=>x.old)),newMinimum:Math.min(...report.forward.map(x=>x.new)),newMaximum:Math.max(...report.forward.map(x=>x.new)),maxTargetSnapError:snapError,gradedDepthMinimum:minDepth,gradedDepthMaximum:maxDepth};
fs.mkdirSync(new URL('../qa/forward-shadow-coverage/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/forward-shadow-coverage/report.json',import.meta.url),JSON.stringify(report,null,2));
console.log(`PASS forward shadows: ${report.forwardSummary.oldMinimum.toFixed(1)}–${report.forwardSummary.oldMaximum.toFixed(1)} m -> ${report.forwardSummary.newMinimum.toFixed(1)}–${report.forwardSummary.newMaximum.toFixed(1)} m, ${report.receiverAndCasterChecks} receiver/caster checks, ${report.terrainAnchors} terrain anchors; 1 × 2048² map, ${report.drivingTexel.toFixed(3)} m driving texels, original hangar detail. CPU/mock only.`);
