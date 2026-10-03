#!/usr/bin/env node
/** CPU-only bridge support + actual ten-rig footprint contract. Static pose
 * probes are geometry tests, not driving proofs. Full input-only journeys live
 * in expanded-bridge-journeys.mjs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {createGarageScene} from '../dist/garage-scene.js';
import {BRIDGES,bridgeAtProgress,bridgeSupport} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/route-network.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
const hash=()=>createHash('sha256').update(fs.readFileSync(new URL('../dist/road-bridges.js',import.meta.url))).digest('hex');
const runtimeFiles=['road-bridges.js','route-network.js','route-network-config.js','vehicle-rig.js','garage-scene.js'];
const runtimeHashes=()=>Object.fromEntries(runtimeFiles.map(name=>[name,createHash('sha256').update(fs.readFileSync(new URL('../dist/'+name,import.meta.url))).digest('hex')]));
const report={runtimeHashes:runtimeHashes(),generatedAt:new Date().toISOString(),scope:'CPU production support geometry and actual ten rendered rigs; static poses, no browser/GPU/human claim.',bridgeHash:hash(),bridges:BRIDGES.length,vehicleFootprints:[],centeredSamples:0,offEdgeSamples:0,insideToleranceSamples:0,yawSamples:0,approachSamples:0,passed:false};
assert.equal(BRIDGES.length,25);
assert.deepEqual(Object.fromEntries(['city','forest','desert','snow','volcanic'].map(id=>[id,BRIDGES.filter(b=>b.biome===id).length])),{city:5,forest:5,desert:5,snow:5,volcanic:5});
const g=createGarageScene(THREE,{group:new THREE.Group()});
try{
 for(const spec of VEHICLE_CONFIG){
  const vehicle=g.vehicles.find(v=>v.id===spec.id);assert.ok(vehicle?.rig?.wheels?.length===4);
  let maxOuter=0;
  for(const wheel of vehicle.rig.wheels){
   const {x,z}=wheel.localPosition;
   assert.ok(Math.abs(Math.abs(x)-1.32)<1e-5,`${spec.id} wheel track`);
   assert.ok(Math.abs(z+1.63)<1e-5||Math.abs(z-1.73)<1e-5,`${spec.id} wheelbase`);
   maxOuter=Math.max(maxOuter,Math.abs(x)+.43/2);
  }
  report.vehicleFootprints.push({id:spec.id,wheelTrack:2.64,tireWidth:.43,outerTireHalfWidth:maxOuter,straightDeckLateralMargin:2.5-maxOuter});
  for(const b of BRIDGES){
   assert.equal(b.halfWidth,2.5);
   const pose=(q,lateral=0,reverse=false,yaw=0)=>{const p=routePointAtProgress(q);return {p,state:{x:p.x+p.right.x*(b.offset+lateral),z:p.z+p.right.z*(b.offset+lateral),heading:p.heading+(reverse?Math.PI:0)+yaw}};};
   for(const q of [b.from-2,b.from,b.from+2,(b.from+b.to)/2,b.to-2,b.to,b.to+2])for(const reverse of [false,true]){
    const {p,state}=pose(q,0,reverse);assert.equal(bridgeSupport(state,p).fall,false,`${spec.id} ${b.id} centered ${q}`);report.centeredSamples++;
   }
   for(const q of [b.from+2,(b.from+b.to)/2,b.to-2])for(const side of [-1,1])for(const reverse of [false,true]){
    const {p,state}=pose(q,side*1.3,reverse);assert.equal(bridgeSupport(state,p).fall,true,`${spec.id} ${b.id} off edge ${side} ${q}`);report.offEdgeSamples++;
   }
   for(const side of [-1,1])for(const reverse of [false,true]){
    const {p,state}=pose((b.from+b.to)/2,side*.7,reverse);assert.equal(bridgeSupport(state,p).fall,false,`${spec.id} ${b.id} safe offset ${side}`);report.insideToleranceSamples++;
   }
   for(const q of [b.from-4,b.to+4])for(const side of [-1,1]){
    const {p,state}=pose(q,side*1.3);assert.equal(bridgeAtProgress(q),undefined);assert.equal(bridgeSupport(state,p).fall,false,`${spec.id} ${b.id} wide approach`);report.approachSamples++;
   }
  }
 }
 // Shared wheel envelopes validated above; dense longitudinal/yaw probes need
 // only one pass per bridge rather than repeating identical rig footprints.
 for(const b of BRIDGES)for(let i=0;i<60;i++)for(const reverse of [0,Math.PI])for(const yaw of [-5,0,5]){
  const q=b.from-2+(b.to-b.from+4)*i/59,p=routePointAtProgress(q),state={x:p.x+p.right.x*b.offset,z:p.z+p.right.z*b.offset,heading:p.heading+reverse+yaw*Math.PI/180};
  assert.equal(bridgeSupport(state,p).fall,false,`${b.id} yaw ${yaw} reverse ${!!reverse} at ${q}`);report.yawSamples++;
 }
 report.bridgeHashAtEnd=hash();assert.equal(report.bridgeHashAtEnd,report.bridgeHash);report.runtimeHashesAtEnd=runtimeHashes();assert.deepEqual(report.runtimeHashesAtEnd,report.runtimeHashes);report.passed=true;
 const dir=new URL('../qa/current-route-calibration/',import.meta.url);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(new URL('support.json',dir),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{g.dispose();}
