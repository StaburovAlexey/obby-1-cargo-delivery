

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {createBiomeWeather} from '../dist/biome-weather.js';
import {createBiomeWeather as createBefore} from './fixtures/weather-before-frustum/biome-weather.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {FOLLOW_CAMERA,computeFollowOffset} from '../dist/follow-camera.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/route-network.js';
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const round=value=>Math.round(value*1000)/1000;
const unitArea=(kind,haze,before)=>{
 let sum=0;const resolution=80;
 for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
  const px=(x+.5)/resolution-.5,py=(y+.5)/resolution-.5;
  if(haze)sum+=(1-smooth(0,.5,Math.hypot(px,py)))**2;
  else if(kind===0)sum+=(1-smooth(.035,before?.10:.085,Math.abs(px+py*(before?.12:.22))))*(1-smooth(before?.25:.30,.5,Math.abs(py)));
  else if(!before&&kind===1)sum+=1-smooth(.06,.5,Math.hypot(px*.85,py*1.8));
  else sum+=1-smooth(before?(kind===1?.05:.22):(kind===2?.24:.14),.5,Math.hypot(px,py));
 }
 return sum/resolution**2;
};
const areaCache=Array.from({length:2},(_,old)=>Array.from({length:4},(_,kind)=>[unitArea(kind,false,!!old),unitArea(kind,true,!!old)]));
function measure(weather,camera,plane,{width,height,dpr},before){
 const points=weather.group.children[0],positions=points.geometry.getAttribute('position'),haze=points.geometry.getAttribute('haze'),life=points.geometry.getAttribute('life'),u=points.material.uniforms;
 weather.group.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 let onScreen=0,visible=0,visibleHaze=0,belowGround=0,alphaArea=0;const sizes=[],alphas=[];
 for(let i=0;i<points.geometry.drawRange.count;i++){
  const local=new THREE.Vector3().fromBufferAttribute(positions,i),world=local.clone().applyMatrix4(points.matrixWorld),view=world.clone().applyMatrix4(camera.matrixWorldInverse),ndc=world.clone().project(camera),depth=-view.z;
  if(ndc.z<-1||ndc.z>1||Math.abs(ndc.x)>1||Math.abs(ndc.y)>1)continue;
  const visibility=before?smooth(3,7,depth)*(1-smooth(18,22,Math.hypot(local.x,local.z))):smooth(0,.3,life.getX(i))*smooth(3,6,depth)*(1-smooth(30,40,depth))*(1-smooth(1.25,1.8,Math.abs(ndc.x)))*(1-smooth(1.25,1.8,Math.abs(ndc.y)));
  const isHaze=!!haze.getX(i),peak=visibility*(isHaze?u.hazeOpacity.value:u.opacity.value);
  if(peak<(isHaze?.02:.08))continue;
  if(!isHaze)onScreen++;


  if(plane.distanceToPoint(world)<=0){if(!isHaze)belowGround++;continue;}
  const max=before?(isHaze?112:20):(isHaze?180:52),size=Math.max(before?1:2,Math.min(max,(isHaze?u.hazeSize.value:u.particleSize.value)*(before?14:22)/Math.max(5,depth)));
  alphaArea+=size*size*peak*areaCache[before?1:0][u.kind.value][isHaze?1:0];
  if(isHaze)visibleHaze++;else{visible++;sizes.push(size/dpr);alphas.push(peak);}
 }
 return{visible,visibleHaze,onScreen,belowGround,meanCssSize:sizes.length?mean(sizes):0,meanPeakAlpha:alphas.length?mean(alphas):0,alphaFootprintUpperBoundPct:100*alphaArea/(width*height*dpr*dpr)};
}
function run(factory,biome,camera,plane,viewport,before,seconds=20){
 const weather=factory(THREE),samples=[];
 const initialPose=[...camera.position.toArray(),...camera.quaternion.toArray()];
 for(let frame=0;frame<seconds*60;frame++){
  weather.update(1/60,{biome,camera,x:camera.position.x,y:camera.position.y,z:camera.position.z});
  if(frame%60===0)samples.push(measure(weather,camera,plane,viewport,before));
 }
 assert.deepEqual([...camera.position.toArray(),...camera.quaternion.toArray()],initialPose);
 const summary={visibleMin:Math.min(...samples.map(s=>s.visible)),visibleMean:round(mean(samples.map(s=>s.visible))),visibleMax:Math.max(...samples.map(s=>s.visible)),onScreenMean:round(mean(samples.map(s=>s.onScreen))),groundOccludedMean:round(mean(samples.map(s=>s.belowGround))),hazeMean:round(mean(samples.map(s=>s.visibleHaze))),meanCssSize:round(mean(samples.map(s=>s.meanCssSize))),meanPeakAlpha:round(mean(samples.map(s=>s.meanPeakAlpha))),alphaFootprintUpperBoundPct:round(mean(samples.map(s=>s.alphaFootprintUpperBoundPct)))};
 weather.dispose();return summary;
}
const report={scope:'Offline CPU: production Three.js, actual app camera and local road/deck tangent-plane occlusion; no browser/GPU/Android rendering or performance claim.',sampling:'Static views: 20 seconds at 60 Hz, sampled once per second. Continuous orbit: 10 seconds at 60 Hz, measured every frame with per-particle continuity assertions. Counts require point center within clip volume and peak alpha >= 0.08 after the production shader fade math. Alpha footprint is an upper bound on mean screen alpha, ignores overlap/discard, uses 80x80 fragment-shape quadrature and production DPR.',defaultViews:[],orbitViews:[],movingOrbitViews:[],fog:[]};
for(const viewport of [{width:390,height:844,dpr:1.6},{width:1440,height:900,dpr:2}]){
 const app=createAppDom(viewport),d=app.debug;
 try{
  for(const biome of ['forest','desert','snow','volcanic']){
   const bridge=BRIDGES.find(b=>b.biome===biome),p=routePointAtProgress(bridge.from-45);
   d.model.pause();Object.assign(d.model.state,{x:p.x+p.right.x*bridge.offset,z:p.z+p.right.z*bridge.offset,heading:p.heading});
   d.applyTruckPose();d.followTruck(1,true);d.camera.updateMatrixWorld();
   const point=new THREE.Vector3(p.x,p.height+.008,p.z),normal=new THREE.Vector3(p.normal.x,p.normal.y,p.normal.z),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,point);
   const before=run(createBefore,biome,d.camera,plane,viewport,true),after=run(createBiomeWeather,biome,d.camera,plane,viewport,false);
   assert.ok(after.visibleMin>=45,`${biome}/${viewport.width}: sustained storm must stay visible after ground occlusion`);
   assert.ok(after.visibleMean>before.visibleMean*10,`${biome}: actual projected density must exceed 10x baseline`);
   if(biome==='forest')assert.ok(after.visibleMean>=130,'widening must retain the dense rainfall in the driving view');
   if(biome==='snow')assert.ok(after.visibleMean>=110,'widening must retain the dense snowfall in the driving view');
   assert.ok(after.alphaFootprintUpperBoundPct<8,'particles and veils keep near-view contrast readable');
   report.defaultViews.push({biome,viewport:`${viewport.width}x${viewport.height}`,cameraHeightAbovePlane:round(plane.distanceToPoint(d.camera.position)),before,after});
   const target=d.controls.target.clone(),radius=FOLLOW_CAMERA.driving.radius*(viewport.width/viewport.height<.8?1.2:1);


   for(const pitch of [FOLLOW_CAMERA.minPitch,FOLLOW_CAMERA.maxPitch])for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const offset=computeFollowOffset({radius,pitch,yaw});d.camera.position.copy(target).add(new THREE.Vector3(offset.x,offset.y,offset.z));d.camera.lookAt(target);d.camera.updateMatrixWorld();
    const result=run(createBiomeWeather,biome,d.camera,plane,viewport,false);
    assert.ok(result.visibleMin>=35,`${biome}/${viewport.width}/pitch${pitch}/yaw${yaw}: view must not empty (${result.visibleMin})`);
    report.orbitViews.push({biome,viewport:`${viewport.width}x${viewport.height}`,pitchDegrees:round(pitch*180/Math.PI),yawDegrees:round(yaw*180/Math.PI),...result});
   }
   const movingWeather=createBiomeWeather(THREE),movingCounts=[];
   const movingGeometry=movingWeather.group.children[0].geometry;
   const movingPositions=movingGeometry.getAttribute('position').array;
   const movingLife=movingGeometry.getAttribute('life').array;
   const previousPositions=movingPositions.slice(),previousLife=movingLife.slice();
   let softRecycles=0,maxSurvivorStep=0,maxBirthFadeStep=0;
   for(let frame=0;frame<600;frame++){
    const offset=computeFollowOffset({radius,pitch:FOLLOW_CAMERA.driving.pitch,yaw:frame*.04});
    d.camera.position.copy(target).add(new THREE.Vector3(offset.x,offset.y,offset.z));d.camera.lookAt(target);d.camera.updateMatrixWorld();
    movingWeather.update(1/60,{biome,camera:d.camera});
    if(frame>0)for(let i=0;i<movingGeometry.drawRange.count;i++){
     const offset=i*3,age=movingLife[i];
     if(age===0){softRecycles++;continue;}
     const delta=Math.hypot(movingPositions[offset]-previousPositions[offset],movingPositions[offset+1]-previousPositions[offset+1],movingPositions[offset+2]-previousPositions[offset+2]);
     maxSurvivorStep=Math.max(maxSurvivorStep,delta);
     assert.ok(delta<.55,`${biome}: orbit must preserve world-space trajectories rather than rotate/reseed visible particles (${delta})`);
     const fadeDelta=smooth(0,.3,age)-smooth(0,.3,previousLife[i]);
     maxBirthFadeStep=Math.max(maxBirthFadeStep,fadeDelta);
     assert.ok(fadeDelta<=.084,`${biome}: a recycled particle must not pop to full opacity (${fadeDelta})`);
    }
    previousPositions.set(movingPositions);previousLife.set(movingLife);
    movingCounts.push(measure(movingWeather,d.camera,plane,viewport,false).visible);
   }
   const movingMin=Math.min(...movingCounts);assert.ok(movingMin>=45,`${biome}: dragging camera must not drain weather (${movingMin})`);
   assert.ok(softRecycles>100,'continuous orbit exercises many soft recycling events');
   assert.equal(movingGeometry.getAttribute('position').array,movingPositions);
   assert.equal(movingGeometry.getAttribute('life').array,movingLife);
   assert.equal(movingWeather.group.children.length,1,'padded weather stays in one draw call');
   assert.ok(movingGeometry.drawRange.count<=768,'the wider reservoir has a fixed performance cap');
   report.movingOrbitViews.push({biome,viewport:`${viewport.width}x${viewport.height}`,seconds:10,yawRadiansPerSecond:2.4,samples:movingCounts.length,visibleMin:movingMin,visibleMean:round(mean(movingCounts)),softRecycles,maxSurvivorStep:round(maxSurvivorStep),maxBirthFadeStep:round(maxBirthFadeStep)});
   movingWeather.dispose();
  }
 }finally{app.dispose();}
}
for(const biome of ['forest','desert','snow','volcanic']){
 const weather=createBiomeWeather(THREE);weather.update(0,{biome});const fog=weather.fog,transmission={};
 for(const depth of [20,50,90,100,200])transmission[`${depth}m`]=round(1-smooth(fog.near,fog.far,depth));
 assert.equal(transmission['20m'],1);assert.ok(transmission['50m']>=.95);assert.ok(transmission['90m']>=.5,'bridge warning retains at least half of scene contrast');assert.ok(transmission['100m']<=.8,'distance fog is perceptible before the old 500m start');
 report.fog.push({biome,...fog,contrastTransmission:transmission});weather.dispose();
}
if(process.argv.includes('--write-report')){fs.mkdirSync(new URL('../qa/weather-visible/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/weather-visible/projection-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:'PASS',scope:report.scope,defaultViews:report.defaultViews,orbitCases:report.orbitViews.length,worstOrbitVisibleCount:Math.min(...report.orbitViews.map(v=>v.visibleMin)),movingOrbitViews:report.movingOrbitViews,fog:report.fog},null,2));
