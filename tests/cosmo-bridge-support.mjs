#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {COSMO_VEHICLES,loadCosmoVehicle,clearCosmoVehicleCache} from '../dist/cosmo-vehicles.js';
import {BRIDGES,bridgeAtProgress,bridgeSupport,createBridgeFall,bridgeFallPose,buildBridges} from '../dist/road-bridges.js';
import {routePointAtProgress,projectRoad} from '../dist/route-network.js';
import {fitTruckToGround} from '../dist/city-driving.js';

const original={fetch:globalThis.fetch,self:globalThis.self,createImageBitmap:globalThis.createImageBitmap};
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const png=Buffer.from(await blob.arrayBuffer());return {width:png.readUInt32BE(16),height:png.readUInt32BE(20),close(){}};};
globalThis.fetch=async request=>{
  const url=typeof request==='string'?request:request.url;
  if(url.startsWith('blob:'))return original.fetch(request);
  assert.ok(url.startsWith('file:'),`Unexpected nonlocal request: ${url}`);
  return new Response(fs.readFileSync(new URL(url)),{status:200});
};
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const poseAt=(b,q,offset=0,yaw=0,steer=0,spin=0)=>{
  const route=routePointAtProgress(q);
  return {route,pose:{x:route.x+route.right.x*(b.offset+offset),z:route.z+route.right.z*(b.offset+offset),heading:route.heading+yaw,frontWheelAngle:steer,wheelSpin:spin}};
};
const report={scope:'Actual ten GLBs, CPU production support and fall poses; no browser/GPU claim',vehicles:[],centered:0,edges:0,approaches:0,longitudinalThresholds:0,diagonals:0,falls:0,deckVertices:0,maxTipLift:0,maxStartLift:0,minimumClearance:Infinity};
const adapters=[];
try{
  assert.equal(BRIDGES.length,25);
  assert.deepEqual(BRIDGES,buildBridges(42));
  assert.equal(new Set(BRIDGES.map(b=>b.id)).size,25);
  for(const spec of COSMO_VEHICLES){
    const adapter=await loadCosmoVehicle(THREE,spec.id);adapters.push(adapter);
    const {metadata}=adapter;
    assert.equal(metadata.wheels.length,4);


    const dimensions=adapter.wheels.map(wheel=>{
      const box=new THREE.Box3().setFromObject(wheel.node,true);
      return {halfWidth:(box.max.x-box.min.x)/2,center:box.getCenter(new THREE.Vector3())};
    });
    const realContacts=(pose)=>{
      adapter.update({steerAngle:pose.frontWheelAngle,wheelSpin:pose.wheelSpin});
      const rotation=new THREE.Matrix4().makeRotationY(pose.heading);
      return adapter.wheels.flatMap((wheel,i)=>[-1,1].map(end=>{
        const contact=new THREE.Vector3(end*dimensions[i].halfWidth,-wheel.radius,0).applyMatrix4(wheel.pivot.matrixWorld);
        contact.y=0;contact.applyMatrix4(rotation);contact.x+=pose.x;contact.z+=pose.z;
        return contact;
      }));
    };
    const expectedFall=(pose,route)=>realContacts(pose).some(v=>{
      const p=projectRoad(v.x,v.z,route),b=bridgeAtProgress(p.progress);
      return !!b&&Math.abs(p.offset-b.offset)>b.halfWidth;
    });
    const extent=Math.max(...dimensions.map(w=>Math.abs(w.center.x)+w.halfWidth));
    report.vehicles.push({id:spec.id,outerHalfWidth:extent,centeredMargin:2.5-extent,wheelRadii:metadata.wheels.map(w=>w.radius)});
    for(let i=0;i<4;i++){
      const wheel=metadata.wheels[i];
      near(wheel.halfWidth,dimensions[i].halfWidth);
      wheel.center.forEach((value,j)=>near(value,dimensions[i].center.getComponent(j)));
    }
    for(const b of BRIDGES){


      for(const q of [b.from-3,b.from,b.from+3,(b.from+b.to)/2,b.to-3,b.to,b.to+3])for(const reverse of [0,Math.PI])for(const yaw of [-.08,0,.08]){
        const {pose,route}=poseAt(b,q,0,reverse+yaw,yaw*2,.7);
        assert.equal(bridgeSupport(pose,route,metadata).fall,false,`${spec.id}/${b.id} centered q=${q} yaw=${reverse+yaw}`);
        report.centered++;
      }


      for(const side of [-1,1])for(const reverse of [0,Math.PI])for(const delta of [-.04,.04]){
        const offset=side*(b.halfWidth-extent+delta),{pose,route}=poseAt(b,(b.from+b.to)/2,offset,reverse);
        const actual=bridgeSupport(pose,route,metadata),expected=expectedFall(pose,route);
        assert.equal(actual.fall,expected,`${spec.id}/${b.id} side=${side} reverse=${reverse} delta=${delta}`);
        assert.equal(actual.fall,delta>0,'measured straight-line side threshold');
        report.edges++;
      }
      for(const q of [b.from-5,b.to+5])for(const side of [-1,1]){
        const {pose,route}=poseAt(b,q,side*1.9);
        assert.equal(bridgeSupport(pose,route,metadata).fall,false,`${spec.id}/${b.id} wide approach`);report.approaches++;
      }
    }



    for(const yaw of [0,Math.PI])for(const steer of [-.3,.3])for(const side of [-1,1]){
      const b=BRIDGES[0],mid=(b.from+b.to)/2,offset=side*(b.halfWidth-extent+.4),reference=poseAt(b,mid,offset,yaw,steer);
      const overEdge=realContacts(reference.pose).map(v=>projectRoad(v.x,v.z,reference.route)).filter(p=>Math.abs(p.offset-b.offset)>b.halfWidth);
      assert.ok(overEdge.length>0);
      const entry=b.from-Math.max(...overEdge.map(p=>p.progress-mid)),exit=b.to-Math.min(...overEdge.map(p=>p.progress-mid));
      for(const [q,expected] of [[entry-.02,false],[entry+.02,true],[exit-.02,true],[exit+.02,false]]){
        const {pose,route}=poseAt(b,q,offset,yaw,steer);
        assert.equal(bridgeSupport(pose,route,metadata).fall,expected,`${spec.id} actual axle entry/exit q=${q} yaw=${yaw}`);report.longitudinalThresholds++;
      }
    }



    if(spec.id==='citycourier'){
      const legacyOuterHalfWidth=1.535;
      assert.ok(Math.abs(extent-legacyOuterHalfWidth)>.01);
      const comparisonOffset=BRIDGES[0].halfWidth-(extent+legacyOuterHalfWidth)/2;
      const {pose,route}=poseAt(BRIDGES[0],(BRIDGES[0].from+BRIDGES[0].to)/2,comparisonOffset);
      assert.equal(bridgeSupport(pose,route).fall,legacyOuterHalfWidth>extent);
      assert.equal(bridgeSupport(pose,route,metadata).fall,extent>legacyOuterHalfWidth);
    }
    for(const b of BRIDGES.filter((_,i)=>i%5===0))for(const q of [b.from-.5,b.from+.5,(b.from+b.to)/2,b.to-.5,b.to+.5])for(const yaw of [0,.42,Math.PI,Math.PI+.42,Math.PI/2,Math.PI*1.5])for(const side of [-1,1]){
      const {pose,route}=poseAt(b,q,side*1.4,yaw,side*.36,side*1.13);
      const actual=bridgeSupport(pose,route,metadata);
      assert.equal(actual.fall,expectedFall(pose,route),`${spec.id}/${b.id} front/rear/yaw support q=${q} yaw=${yaw}`);
      if(actual.fall){assert.ok(actual.pivot);near(Math.hypot(actual.outward.x,actual.outward.z),1);}
      report.diagonals++;
    }

    const b=BRIDGES[0];let diagonalHinges=0;
    for(const q of [b.from-.5,(b.from+b.to)/2,b.to+.5])for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const side of [-1,1]){
      const {pose,route}=poseAt(b,q,side*(b.halfWidth-extent+.3),yaw,side*.24,side*.83);
      const support=bridgeSupport(pose,route,metadata);if(!support.fall)continue;
      const ground=fitTruckToGround(THREE,pose.x,pose.z,pose.heading,route,metadata),fall=createBridgeFall();
      adapter.update({steerAngle:pose.frontWheelAngle,wheelSpin:pose.wheelSpin});
      const actualVertices=[];
      for(const wheel of adapter.wheels)wheel.node.traverse(mesh=>{
        const attribute=mesh.geometry?.attributes.position;if(!attribute)return;
        const unique=new Set();
        for(let i=0;i<attribute.count;i++){
          const v=new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld),key=v.toArray().map(x=>x.toFixed(7)).join(',');
          if(!unique.has(key)){unique.add(key);actualVertices.push(v);}
        }
      });
      assert.equal(fall.begin(pose,support,ground),true);
      assert.equal(fall.begin(pose,support,ground),false);
      assert.equal(fall.state.wheelContacts.length,4);
      assert.notEqual(fall.state.wheelContacts,metadata.wheels,'fall snapshots contacts');
      const start=bridgeFallPose(THREE,fall.state);report.maxStartLift=Math.max(report.maxStartLift,start.clearanceLift);
      assert.ok(start.position.distanceTo(ground.position)<1e-7,`${spec.id} no start snap`);
      assert.ok(start.quaternion.angleTo(ground.quaternion)<1e-7);
      const forward=new THREE.Vector3(-Math.sin(route.heading),0,-Math.cos(route.heading));
      if(q!==(b.from+b.to)/2&&Math.abs(new THREE.Vector3(support.outward.x,0,support.outward.z).dot(forward))>.02)diagonalHinges++;
      for(const time of [0,.001,.1,.2,.419999,.42,.420001,.65,.9,1.2,1.55]){
        while(fall.state.time<time-1e-10)fall.step(Math.min(.01,time-fall.state.time));
        const result=bridgeFallPose(THREE,fall.state);
        if(time<.42)report.maxTipLift=Math.max(report.maxTipLift,result.clearanceLift);
        if(time===.001)assert.ok(result.position.distanceTo(start.position)<.0001,'tip starts smoothly');
        if(time===.419999)fall.beforeRelease=result;
        if(time===.420001)assert.ok(result.position.distanceTo(fall.beforeRelease.position)<.0001,'release has no step');
        for(const local of actualVertices){
          const world=local.clone().applyQuaternion(result.quaternion).add(result.position),p=projectRoad(world.x,world.z,route);
          if(p.progress>=b.from&&p.progress<=b.to&&Math.abs(p.offset-b.offset)>b.halfWidth+1e-8)continue;
          const clearance=world.y-(p.height+.008);report.minimumClearance=Math.min(report.minimumClearance,clearance);report.deckVertices++;
          assert.ok(clearance>=.003-1e-6,`${spec.id} supported actual tire vertex penetrated at t=${time}: ${clearance}`);
        }
      }
      assert.equal(fall.step(.01),true);fall.reset();assert.equal(fall.active,false);assert.equal(fall.state,null);assert.equal(fall.step(.1),false);report.falls++;
    }
    assert.ok(diagonalHinges>0,`${spec.id} actual front/rear approach creates diagonal hinge`);
  }
  assert.equal(adapters.length,10);
  console.log(JSON.stringify({status:'PASS',...report},null,2));
}finally{
  adapters.forEach(adapter=>adapter.dispose());clearCosmoVehicleCache();Object.assign(globalThis,original);
}
