#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
const root=path.resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const output=path.resolve(process.argv[3]||fileURLToPath(new URL('bridge-obstacle-report.json',import.meta.url)));
const at=name=>import(pathToFileURL(path.join(root,'dist',name+'.js')));
const {VEHICLE_CONFIG}=await at('economy-config');
const {createDrivingModel,roadWheelTarget}=await at('driving-model');
const {getUpgradeModifiers}=await at('vehicle-upgrades');
const {surfaceForBiome}=await at('biome-surfaces');
const N=await at('route-network');
const {roadGroundGradient,roadGroundSurface}=await at('driving-ground');
const {BRIDGES,bridgeSupport}=await at('road-bridges');
const {loadCosmoVehicle,clearCosmoVehicleCache}=await at('cosmo-vehicles');
const THREE=await at('vendor/three.module');
const vehicles=VEHICLE_CONFIG.filter(v=>!v.rewardOnly),failures=[];
const check=(condition,label,row)=>{if(!condition)failures.push({label,row});};
const hashFiles=['driving-model.js','route-network-config.js','route-network.js','road-bridges.js','cosmo-vehicles.js'];
const hashes=()=>Object.fromEntries(hashFiles.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist',f))).digest('hex')]));
const sourceHashes=hashes();
const slip=s=>Math.abs(Math.atan2(Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ,Math.max(.001,Math.abs(s.speed))))*180/Math.PI;
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
function pursuit(state,target,surface,levels,direction=1){
  const dx=target.x-state.x,dz=target.z-state.z,distance=Math.hypot(dx,dz);
  const desired=angle(Math.atan2(-direction*dx,-direction*dz)-state.heading);
  const wheel=Math.atan(direction*2*3.36*Math.sin(desired)/Math.max(1,distance));
  const grip=surface.frictionFactor*getUpgradeModifiers(levels).grip;
  const speedScale=Math.sqrt(Math.min(1,grip*surface.longitudinalGripFactor));
  const reverseScale=direction<0?Math.min(1,grip):1;
  let low=-1,high=1;
  for(let i=0;i<20;i++){
    const mid=(low+high)/2,current=roadWheelTarget(mid,state.linearSpeed/speedScale,9+7*Math.min(1,1/surface.longitudinalGripFactor))*reverseScale;
    if(current>wheel)low=mid;else high=mid;
  }
  return (low+high)/2;
}
const original={fetch:globalThis.fetch,self:globalThis.self,createImageBitmap:globalThis.createImageBitmap};
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const bytes=Buffer.from(await blob.arrayBuffer());return{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),close(){}};};
globalThis.fetch=async request=>{
 const url=typeof request==='string'?request:request.url;
 if(url.startsWith('blob:'))return original.fetch(request);
 if(!url.startsWith('file:'))throw Error('Only local asset reads are permitted in independent QA: '+url);
 return new Response(fs.readFileSync(new URL(url)),{status:200});
};
const bridgeRows=[],adapters=[];
try{
 for(const v of vehicles){
  const adapter=await loadCosmoVehicle(THREE,v.id);adapters.push(adapter);
  for(const level of [0,5,10])for(const fps of [15,30,60])for(const bridge of BRIDGES.filter(b=>b.biome===v.specialty)){
   const levels={handling:level,grip:level},start=N.routePointAtProgress(bridge.from-7);
   let context=start;
   const m=createDrivingModel({vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>levels,
    x:start.x+start.right.x*bridge.offset,z:start.z+start.right.z*bridge.offset,heading:start.heading,
    groundGradient:(x,z)=>roadGroundGradient(x,z,context),groundSurface:(x,z,id)=>roadGroundSurface(x,z,id,context)});
   let frames=0,maxOffset=0,peakSlip=0,fall=false,nonfinite=false;
   for(;frames<40*fps&&context.progress<bridge.to+7;frames++){
    const target=N.routePointAtProgress(context.progress+7),surface=roadGroundSurface(m.state.x,m.state.z,v.id,context);
    m.setInput({speedDemand:3/(v.maxSpeed*surface.speedFactor),steering:pursuit(m.state,{x:target.x+target.right.x*bridge.offset,z:target.z+target.right.z*bridge.offset},surface,levels)});
    m.step(1/fps);context=N.projectRoad(m.state.x,m.state.z,context);
    maxOffset=Math.max(maxOffset,Math.abs(context.offset-bridge.offset));peakSlip=Math.max(peakSlip,slip(m.state));
    fall ||=bridgeSupport(m.state,context,adapter.metadata).fall;
    nonfinite ||= ![m.state.x,m.state.z,m.state.heading,m.state.speed].every(Number.isFinite);
   }
   const row={vehicle:v.id,level,fps,bridge:bridge.id,seconds:frames/fps,finalProgress:context.progress,maxOffset,peakSlip,fall,nonfinite};
   bridgeRows.push(row);check(!fall&&!nonfinite&&context.progress>=bridge.to+7,'3m/s real bridge crossing with actual GLB wheel contacts',row);
  }
 }
}finally{adapters.forEach(a=>a.dispose());clearCosmoVehicleCache();Object.assign(globalThis,original);}

const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10-15*t+6*t*t);};
const pathOffset=q=>7*smooth((q-8)/37)*(1-smooth((q-82)/38));
const obstacleRows=[];
for(const v of vehicles)for(const level of [0,5,10])for(const fps of [15,30,60])for(const style of ['cautious','fast']){
 const levels={handling:level,grip:level},surface=surfaceForBiome(v.specialty,v.id);
 const speed=style==='cautious'?Math.max(4,Math.min(8,v.maxSpeed*.35)):Math.min(20,v.maxSpeed*.9);
 const m=createDrivingModel({vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>levels,groundSurface:()=>surface});
 let frames=0,peakSlip=0,maximumRoadOffset=0,hit=false,minObstacleClearance=Infinity;
 for(;frames<60*fps&&-m.state.z<132;frames++){
  const q=-m.state.z,lookAhead=7+Math.abs(m.state.speed)*.65,targetProgress=q+lookAhead;
  m.setInput({speedDemand:speed/(v.maxSpeed*surface.speedFactor),steering:pursuit(m.state,{x:pathOffset(targetProgress),z:-targetProgress},surface,levels)});
  m.step(1/fps);peakSlip=Math.max(peakSlip,slip(m.state));maximumRoadOffset=Math.max(maximumRoadOffset,Math.abs(m.state.x));
  const halfX=2.9*Math.abs(Math.cos(m.state.heading))+3.6*Math.abs(Math.sin(m.state.heading));
  const halfZ=3.6*Math.abs(Math.cos(m.state.heading))+2.9*Math.abs(Math.sin(m.state.heading));
  if(Math.abs(m.state.z+60)<4+halfZ){const clearance=Math.abs(m.state.x)-halfX-1.75;minObstacleClearance=Math.min(minObstacleClearance,clearance);hit ||=clearance<=0;}
 }
 const row={vehicle:v.id,level,fps,style,targetSpeed:speed,seconds:frames/fps,completed:-m.state.z>=132,peakSlip,maximumRoadOffset,hit,minObstacleClearance};obstacleRows.push(row);
 if(style==='cautious')check(row.completed&&!hit&&maximumRoadOffset<11,'cautious 7m lane-change clears 3.5m obstacle inside 30m road',row);
}
const finalHashes=hashes();check(JSON.stringify(sourceHashes)===JSON.stringify(finalHashes),'sources stable during bridge/evasion run',{sourceHashes,finalHashes});
const report={passed:failures.length===0,scope:'Input-only CPU trajectories from isolated segment spawn. Real road geometry and actual GLB tire contact metadata for bridges; conservative bounding-box obstacle on a synthetic 30m road for evasion. Fast evasion is measured, not assumed passable. No browser/mobile playtest claim.',generatedAt:new Date().toISOString(),sourceHashes,finalHashes,counts:{bridges:bridgeRows.length,obstacles:obstacleRows.length},bridgeRows,obstacleRows,failures};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,counts:report.counts,maximumBridgeOffset:Math.max(...bridgeRows.map(r=>r.maxOffset)),maximumBridgeSlip:Math.max(...bridgeRows.map(r=>r.peakSlip)),cautiousObstacleHits:obstacleRows.filter(r=>r.style==='cautious'&&r.hit).length,fastObstacleHits:obstacleRows.filter(r=>r.style==='fast'&&r.hit).length,failures},null,2));
process.exitCode=report.passed?0:1;
