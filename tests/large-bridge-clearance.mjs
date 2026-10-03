#!/usr/bin/env node
/** Independent measurements of the enlarged real GLBs on the unchanged 5m
 * bridges. CPU-only geometry and production support; no browser/GPU claim. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {COSMO_VEHICLES,loadCosmoVehicle,clearCosmoVehicleCache} from '../dist/cosmo-vehicles.js';
import {BRIDGES,bridgeAtProgress,bridgeSupport} from '../dist/road-bridges.js';
import {routePointAtProgress,projectRoad} from '../dist/route-network.js';
import {FOLLOW_CAMERA,createFollowCameraState,computeFollowOffset,drivingCameraScale} from '../dist/follow-camera.js';
import {TOW_DRIVING} from '../dist/driving-model.js';

const original={fetch:globalThis.fetch,self:globalThis.self,createImageBitmap:globalThis.createImageBitmap};
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const p=Buffer.from(await blob.arrayBuffer());return {width:p.readUInt32BE(16),height:p.readUInt32BE(20),close(){}};};
globalThis.fetch=async request=>{
  const url=typeof request==='string'?request:request.url;
  if(url.startsWith('blob:'))return original.fetch(request);
  assert.ok(url.startsWith('file:'),`Unexpected nonlocal request: ${url}`);
  return new Response(fs.readFileSync(new URL(url)),{status:200});
};
const near=(a,b,message,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const localVertices=root=>{
  const points=[];root.traverse(mesh=>{
    const p=mesh.geometry?.attributes.position;if(!p)return;
    for(let i=0;i<p.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld));
  });return points;
};
const lateralExtent=(points,yaw)=>{
  const c=Math.cos(yaw),s=Math.sin(yaw);let maximum=0;
  for(const p of points)maximum=Math.max(maximum,Math.abs(p.x*c+p.z*s));
  return maximum;
};
const report={scope:'Actual ten local GLBs; renderer-free Three geometry and production support. No browser, GPU or touchscreen validation.',
  bridges:BRIDGES.length,width:5,crossings:0,crossingSamples:0,modestCorrections:0,curvedSilhouetteChecks:0,vehicles:[],
  approach:{maximumOffset:.02,maximumYawRadians:.04,maximumSteerRadians:.08},
  sourceSha256:Object.fromEntries(['cosmo-vehicles','road-bridges','follow-camera'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(new URL(`../dist/${name}.js`,import.meta.url))).digest('hex')]))};
const adapters=[];
try{
  assert.equal(BRIDGES.length,25);assert.ok(BRIDGES.every(b=>b.halfWidth===2.5));
  for(const spec of COSMO_VEHICLES){
    const adapter=await loadCosmoVehicle(THREE,spec.id);adapters.push(adapter);
    const {metadata}=adapter;
    assert.equal(metadata.sizeMultiplier,1.5);assert.deepEqual(adapter.group.scale.toArray(),[1,1,1]);
    const dimensions=adapter.wheels.map(w=>new THREE.Box3().setFromObject(w.node,true));
    const tireVertices=adapter.wheels.map(w=>localVertices(w.node).map(v=>v.sub(w.localPosition)));
    const actualRadii=tireVertices.map(points=>Math.max(...points.map(v=>Math.hypot(v.y,v.z))));
    const halfWidths=dimensions.map(b=>(b.max.x-b.min.x)/2);
    const centeredOuterHalfWidth=Math.max(...dimensions.map(b=>Math.max(Math.abs(b.min.x),Math.abs(b.max.x))));
    const centeredMargin=2.5-centeredOuterHalfWidth;
    assert.ok(centeredMargin>0,`${spec.id} cannot physically fit the 5m bridge`);
    adapter.wheels.forEach((wheel,i)=>{
      near(halfWidths[i],metadata.wheels[i].halfWidth,`${spec.id} wheel width`);
      dimensions[i].getCenter(new THREE.Vector3()).toArray().forEach((n,j)=>near(n,metadata.wheels[i].center[j],`${spec.id} wheel center ${j}`));
    });
    // Independent bottom contact lines use actual Object3D steering pivots.
    const contacts=(heading,steer)=>{
      adapter.update({steerAngle:steer,wheelSpin:.7});
      const rotation=new THREE.Matrix4().makeRotationY(heading);
      return adapter.wheels.flatMap((wheel,i)=>[-1,1].map(side=>{
        const v=new THREE.Vector3(side*halfWidths[i],-wheel.radius,0).applyMatrix4(wheel.pivot.matrixWorld);
        v.y=0;return v.applyMatrix4(rotation);
      }));
    };
    let minimumCurvedSilhouetteMargin=Infinity;
    for(const bridge of BRIDGES)for(const reverse of [0,Math.PI]){
      const midpoint=routePointAtProgress((bridge.from+bridge.to)/2);
      const offsets=contacts(reverse,0);
      for(let q=bridge.from-6;q<=bridge.to+6;q+=1){
        const route=routePointAtProgress(q),pose={x:route.x+route.right.x*bridge.offset,z:route.z+route.right.z*bridge.offset,heading:route.heading+reverse,frontWheelAngle:0};
        const c=Math.cos(route.heading),s=Math.sin(route.heading);
        const projected=offsets.map(v=>projectRoad(pose.x+v.x*c+v.z*s,pose.z-v.x*s+v.z*c,route));
        assert.ok(projected.every(p=>{const b=bridgeAtProgress(p.progress);return !b||Math.abs(p.offset-b.offset)<b.halfWidth;}),`${spec.id}/${bridge.id}: actual centered contacts`);
        assert.equal(bridgeSupport(pose,route,metadata).fall,false,`${spec.id}/${bridge.id}: centered ${reverse?'reverse':'forward'} crossing at ${q}`);
        report.crossingSamples++;
      }
      report.crossings++;
      for(const yaw of [-.04,0,.04])for(const steer of [-.08,0,.08])for(const offset of [-.02,.02]){
        const pose={x:midpoint.x+midpoint.right.x*(bridge.offset+offset),z:midpoint.z+midpoint.right.z*(bridge.offset+offset),heading:midpoint.heading+reverse+yaw,frontWheelAngle:steer};
        assert.equal(bridgeSupport(pose,midpoint,metadata).fall,false,`${spec.id}/${bridge.id}: modest correction yaw=${yaw} steer=${steer} offset=${offset}`);
        report.modestCorrections++;
      }
      // Conservative tire rectangles include every real vertex through every
      // spin phase. Project their corners against each actual curved slot,
      // including the first and last axles entering/leaving its wide approaches.
      for(const q of [bridge.from-3,bridge.from,bridge.from+3,(bridge.from+bridge.to)/2,bridge.to-3,bridge.to,bridge.to+3])for(const yaw of [-.04,.04])for(const steer of [-.08,.08]){
        const route=routePointAtProgress(q),heading=route.heading+reverse+yaw,c=Math.cos(heading),s=Math.sin(heading);
        for(const offset of [-.02,.02])for(let i=0;i<4;i++)for(const side of [-1,1])for(const end of [-1,1]){
          const wheel=adapter.wheels[i],angle=wheel.front?steer:0,cw=Math.cos(angle),sw=Math.sin(angle);
          const x=wheel.localPosition.x+side*halfWidths[i]*cw+end*actualRadii[i]*sw,z=wheel.localPosition.z-side*halfWidths[i]*sw+end*actualRadii[i]*cw;
          const p=projectRoad(route.x+route.right.x*(bridge.offset+offset)+x*c+z*s,route.z+route.right.z*(bridge.offset+offset)-x*s+z*c,route),b=bridgeAtProgress(p.progress);
          if(!b)continue;
          const margin=b.halfWidth-Math.abs(p.offset-b.offset);minimumCurvedSilhouetteMargin=Math.min(minimumCurvedSilhouetteMargin,margin);
          assert.ok(margin>0,`${spec.id}/${bridge.id} conservative whole-tire envelope at q=${q}: ${margin}`);report.curvedSilhouetteChecks++;
        }
      }
    }
    // Measure the complete tire silhouette, not only its bottom contact line.
    // Steering and spin can extend the upper tire outside the contact patch.
    let modestOuterHalfWidth=0,maxSteerOuterHalfWidth=0;
    for(const steer of [-.08,0,.08,-TOW_DRIVING.maximumWheelAngle,TOW_DRIVING.maximumWheelAngle])for(let spin=0;spin<12;spin++){
      adapter.update({steerAngle:steer,wheelSpin:spin/12*Math.PI*2*adapter.wheels[0].radius/.68});
      const points=adapter.wheels.flatMap(w=>localVertices(w.node));
      if(Math.abs(steer)<=.08)for(const yaw of [-.04,0,.04])modestOuterHalfWidth=Math.max(modestOuterHalfWidth,lateralExtent(points,yaw));
      else maxSteerOuterHalfWidth=Math.max(maxSteerOuterHalfWidth,lateralExtent(points,0));
    }
    const modestPhysicalMargin=2.5-modestOuterHalfWidth-report.approach.maximumOffset;
    assert.ok(modestPhysicalMargin>0,`${spec.id} modest steering/yaw silhouette exceeds bridge: ${modestPhysicalMargin}`);
    adapter.reset();
    // Read-only projection audit of every actual vertex at the normal follow
    // angle. This checks framing, without changing camera behavior or UI.
    const vertices=localVertices(adapter.group),projection=[];
    for(const [width,height] of [[1920,1080],[390,844],[320,568],[320,844]]){
      const camera=new THREE.PerspectiveCamera(TOW_DRIVING.cameraFov,width/height,.5,1800);
      const state=createFollowCameraState({mode:'driving'}).state,target=new THREE.Vector3(0,1.7,0),offset=computeFollowOffset(state,new THREE.Vector3());
      camera.position.copy(offset).multiplyScalar(drivingCameraScale(width/height)).add(target);camera.lookAt(target);camera.updateMatrixWorld();
      let maxX=0,maxY=0,minY=Infinity,largestY=-Infinity;
      for(const point of vertices){const p=point.clone().project(camera);maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));minY=Math.min(minY,p.y);largestY=Math.max(largestY,p.y);}
      assert.ok(maxX<1&&maxY<1,`${spec.id} cropped at default camera ${width}x${height}`);
      projection.push({viewport:[width,height],maxAbsNdcX:maxX,maxAbsNdcY:maxY,screenHeightFraction:(largestY-minY)/2});
    }
    report.vehicles.push({id:spec.id,model:spec.model,dimensions:metadata.dimensions,centeredOuterHalfWidth,centeredMargin,
      modestOuterHalfWidth,modestPhysicalMargin,minimumCurvedSilhouetteMargin,maxSteerOuterHalfWidth,maxSteerPhysicalMargin:2.5-maxSteerOuterHalfWidth,projection});
  }
  report.tightestCentered=report.vehicles.reduce((a,b)=>a.centeredMargin<b.centeredMargin?a:b).id;
  report.minimumCenteredMargin=Math.min(...report.vehicles.map(v=>v.centeredMargin));
  report.minimumModestPhysicalMargin=Math.min(...report.vehicles.map(v=>v.modestPhysicalMargin));
  report.minimumCurvedSilhouetteMargin=Math.min(...report.vehicles.map(v=>v.minimumCurvedSilhouetteMargin));
  report.fullSteeringOverhang=report.vehicles.filter(v=>v.maxSteerPhysicalMargin<0).map(v=>({id:v.id,perSideOverhang:-v.maxSteerPhysicalMargin}));
  report.camera={radius:FOLLOW_CAMERA.driving.radius,pitch:FOLLOW_CAMERA.driving.pitch,fov:TOW_DRIVING.cameraFov};
  report.recommendation='Keep the 5m crossings. Align before entry, stay centered, use small corrections, and avoid full-lock steering on the deck.';
  console.log(JSON.stringify({status:'PASS',...report},null,2));
}finally{
  adapters.forEach(a=>a.dispose());clearCosmoVehicleCache();Object.assign(globalThis,original);
}
