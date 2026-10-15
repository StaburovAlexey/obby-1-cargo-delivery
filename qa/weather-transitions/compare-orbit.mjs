

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../dist/vendor/three.module.js';
import {createBiomeWeather} from '../../dist/biome-weather.js';
import {createAppDom} from '../../tests/fixtures/app-dom.mjs';
import {FOLLOW_CAMERA,computeFollowOffset} from '../../dist/follow-camera.js';
import {BRIDGES} from '../../dist/road-bridges.js';
import {routePointAtProgress} from '../../dist/route-network.js';
const source=fs.readFileSync(new URL('./site52-weather.js',import.meta.url),'utf8');
const {createBiomeWeather:createPrevious}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function visible(weather,camera,plane){
 const p=weather.group.children[0],position=p.geometry.getAttribute('position'),life=p.geometry.getAttribute('life'),haze=p.geometry.getAttribute('haze'),u=p.material.uniforms;let count=0;
 weather.group.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 for(let i=0;i<p.geometry.drawRange.count;i++){
  if(haze.getX(i))continue;
  const world=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(p.matrixWorld),ndc=world.clone().project(camera),depth=-world.clone().applyMatrix4(camera.matrixWorldInverse).z;
  if(Math.abs(ndc.x)>1||Math.abs(ndc.y)>1||ndc.z<-1||ndc.z>1||plane.distanceToPoint(world)<=0)continue;
  const alpha=smooth(0,.3,life.getX(i))*smooth(3,6,depth)*(1-smooth(30,40,depth))*(1-smooth(1.25,1.8,Math.abs(ndc.x)))*(1-smooth(1.25,1.8,Math.abs(ndc.y)))*u.opacity.value*(u.blendWeight?.value??1);
  if(alpha>=.08)count++;
 }
 return count;
}
const report={scope:'CPU projection, identical one-second warmup and ten-second continuous orbit; visible count requires peak alpha >= .08, clip visibility and above the tangent ground/deck plane. Checked-in Site52 vs transition weather.',baseCommit:'cf549c45c06dcda554e6fcd90056a69798629d06',cases:[]};
for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
 const app=createAppDom(viewport),d=app.debug;
 try{for(const biome of ['forest','desert','snow','volcanic']){
  const bridge=BRIDGES.find(b=>b.biome===biome),p=routePointAtProgress(bridge.from-45);
  d.model.pause();Object.assign(d.model.state,{x:p.x+p.right.x*bridge.offset,z:p.z+p.right.z*bridge.offset,heading:p.heading});d.applyTruckPose();d.followTruck(1,true);d.camera.updateMatrixWorld();
  const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(p.normal.x,p.normal.y,p.normal.z),new THREE.Vector3(p.x,p.height+.008,p.z));
  const target=d.controls.target.clone(),radius=FOLLOW_CAMERA.driving.radius*(viewport.width/viewport.height<.8?1.2:1);
  function pose(yaw){const offset=computeFollowOffset({radius,pitch:FOLLOW_CAMERA.driving.pitch,yaw});d.camera.position.copy(target).add(new THREE.Vector3(offset.x,offset.y,offset.z));d.camera.lookAt(target);d.camera.updateMatrixWorld();}
  pose(0);const old=createPrevious(THREE),next=createBiomeWeather(THREE),oldCounts=[],newCounts=[];
  for(let n=0;n<60;n++){old.update(1/60,{biome,camera:d.camera});next.update(1/60,{biome,camera:d.camera});}
  for(let frame=0;frame<600;frame++){
   pose(frame*.04);old.update(1/60,{biome,camera:d.camera});next.update(1/60,{biome,camera:d.camera});
   for(const key of ['position','life','haze'])assert.deepEqual(next.group.children[0].geometry.getAttribute(key).array,old.group.children[0].geometry.getAttribute(key).array,`${biome}: unchanged ${key} at frame ${frame}`);
   oldCounts.push(visible(old,d.camera,plane));newCounts.push(visible(next,d.camera,plane));
  }
  assert.deepEqual(newCounts,oldCounts,'settled actual shader/projection density is unchanged');
  report.cases.push({biome,viewport,frames:600,buffersIdentical:true,oldMin:Math.min(...oldCounts),newMin:Math.min(...newCounts),mean:oldCounts.reduce((a,b)=>a+b,0)/oldCounts.length});old.dispose();next.dispose();
 }}finally{app.dispose();}
}
fs.writeFileSync(new URL('./orbit-baseline-comparison.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
