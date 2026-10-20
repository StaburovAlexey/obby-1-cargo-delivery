#!/usr/bin/env node
// Actual production app frame loop, with renderer/DOM mocked by the repository fixture.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const output=path.resolve(process.argv[3]||fileURLToPath(new URL('app-frame-report.json',import.meta.url)));
const at=name=>import(pathToFileURL(path.join(root,'dist',name+'.js')));
const {createAppDom}=await import(pathToFileURL(path.join(root,'tests/fixtures/app-dom.mjs')));
const {VEHICLE_CONFIG}=await at('economy-config'),{roadWheelTarget}=await at('driving-model');
const {getUpgradeModifiers}=await at('vehicle-upgrades'),{roadGroundSurface}=await at('driving-ground');
const {BRIDGES}=await at('road-bridges'),N=await at('route-network');
const {createRoadHazards}=await at('road-hazards'),{loadCosmoVehicle,clearCosmoVehicleCache}=await at('cosmo-vehicles');
const THREE=await at('vendor/three.module');
const vehicles=VEHICLE_CONFIG.filter(v=>!v.rewardOnly),adapters=new Map(),rows=[],failures=[];
const files=['app.js','driving-model.js','route-network-config.js','route-network.js','road-hazards.js','network-scene.js','canyon-rocks.js'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist',f))).digest('hex')]));
const selectedCases=new Set((process.env.APP_CASES||'bridge,technical,obstacle').split(','));
const sourceHashes=hashes(),original={fetch:globalThis.fetch,self:globalThis.self,createImageBitmap:globalThis.createImageBitmap};
globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}};};
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;if(url.startsWith('blob:'))return original.fetch(request);if(!url.startsWith('file:'))throw Error('Unexpected asset URL');return new Response(fs.readFileSync(new URL(url)),{status:200});};
for(const v of vehicles)adapters.set(v.id,await loadCosmoVehicle(THREE,v.id));
Object.assign(globalThis,original);
const app=createAppDom({startDriving:false,career:{version:2,money:0,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),characterId:'bacon',completedRuns:0},attachVehicleVisuals:(_THREE,garage)=>{for(const v of garage.vehicles)if(adapters.has(v.id))v.visual=adapters.get(v.id);return{ready:Promise.resolve()};}});
const d=app.debug;let now=1000;app.frame(now);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
function steering(state,target,surface,levels){
 const dx=target.x-state.x,dz=target.z-state.z,error=angle(Math.atan2(-dx,-dz)-state.heading);
 const wheel=Math.atan(2*3.36*Math.sin(error)/Math.max(1,Math.hypot(dx,dz)));
 const grip=Math.sqrt(Math.min(1,surface.frictionFactor*getUpgradeModifiers(levels).grip*surface.longitudinalGripFactor));
 let lo=-1,hi=1;for(let i=0;i<20;i++){let mid=(lo+hi)/2;const actual=roadWheelTarget(mid,state.linearSpeed/grip,9+7*Math.min(1,1/surface.longitudinalGripFactor));if(actual>wheel)lo=mid;else hi=mid;}return(lo+hi)/2;
}
function run(v,level,fps,scenario){
 const levels={speed:0,handling:level,grip:level,fuel:level};
 d.gameplay.state.upgrades[v.id]=levels;d.returnToGarage();d.gameplay.state.cooldown=0;d.enterVehicle(v.id);app.frame(now+=50);
 d.roadHazards.reset();
 const start=N.routePointAtProgress(scenario.from),s=d.model.state,offset=scenario.offset||0;
 d.model.pause();Object.assign(s,{x:start.x+start.right.x*offset,z:start.z+start.right.z*offset,heading:start.heading});d.applyTruckPose();d.followTruck(0,true);
 let context=N.projectRoad(s.x,s.z),frames=0,distance=0,maxOffset=0,peakSlip=0,blocked=false,minFuel=Infinity,maxRack=0;
 for(;frames<150*fps&&d.driving&&context.progress<scenario.to;frames++){
  const lookAhead=scenario.kind==='technical'?6+Math.abs(s.speed)*.45:7+Math.abs(s.speed)*.4;
  const target=N.routePointAtProgress(context.progress+lookAhead),targetOffset=scenario.targetOffset?.(target.progress)??offset;
  const surface=roadGroundSurface(s.x,s.z,v.id,context);
  d.model.setInput({speedDemand:scenario.speed/(v.maxSpeed*surface.speedFactor),steering:steering(s,{x:target.x+target.right.x*targetOffset,z:target.z+target.right.z*targetOffset},surface,levels)});
  app.frame(now+=1000/fps);context=N.projectRoad(s.x,s.z,context);
  distance+=s.pathDistance;blocked ||=s.blocked;maxOffset=Math.max(maxOffset,Math.abs(context.offset-(scenario.kind==='bridge'?offset:0)));maxRack=Math.max(maxRack,Math.abs(s.frontWheelAngle));
  peakSlip=Math.max(peakSlip,Math.abs(Math.atan2(Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ,Math.max(.001,Math.abs(s.speed))))*180/Math.PI);minFuel=Math.min(minFuel,d.gameplay.state.fuels[v.id]);
 }
 const row={vehicle:v.id,level,fps,kind:scenario.kind,style:scenario.style||'careful',targetSpeed:scenario.speed,from:scenario.from,to:scenario.to,completed:d.driving&&context.progress>=scenario.to,progress:context.progress,wallSeconds:frames/fps,simulatedBudgetSeconds:frames*Math.min(.05,1/fps),actualTravel:distance,maxOffset,peakSlip,blocked,minFuel,maxRack};
 rows.push(row);
 if(scenario.required!==false&&(!row.completed||blocked||!Number.isFinite(peakSlip)))failures.push(row);
 console.log(JSON.stringify(row));
}
try{
 if(selectedCases.has('bridge'))for(const v of vehicles)for(const level of [0,5,10])for(const fps of [15,30,60]){
  const bridge=BRIDGES.find(b=>b.biome===v.specialty);
  run(v,level,fps,{kind:'bridge',from:bridge.from-7,to:bridge.to+7,offset:bridge.offset,speed:3});
 }
 if(selectedCases.has('technical'))for(const v of vehicles.filter(v=>['pickup','citycourier','rover','ashhauler'].includes(v.id)))for(const level of [0,5,10])for(const fps of [15,30,60])for(const style of ['careful','brisk']){
  run(v,level,fps,{kind:'technical',style,from:1005,to:1275,speed:style==='careful'?6:Math.min(22,v.maxSpeed*.95),required:style==='careful'});
 }
 const hazard=d.roadHazards.hazards.find(h=>h.biome==='city'&&h.type==='barrier');
 if(selectedCases.has('obstacle'))for(const v of vehicles.filter(v=>['pickup','rover','ashhauler'].includes(v.id)))for(const level of [0,5,10])for(const fps of [15,30,60]){
  const predictor=createRoadHazards(42);for(let i=0;i<Math.ceil(13.5/.05);i++)predictor.update(.05,{x:0,z:0,heading:0},true);
  const side=-Math.sign(predictor.poseFor(hazard.id).offset)||1;
  // Pick the wider side before entry using the moving obstacle's predicted pose.
  // All movement thereafter remains ordinary steering/throttle through app.frame.
  const smooth=t=>{t=clamp(t,0,1);return t*t*t*(10-15*t+6*t*t);};
  run(v,level,fps,{kind:'obstacle',from:hazard.progress-65,to:hazard.progress+50,speed:5,offset:0,targetOffset:q=>side*9.5*smooth((q-(hazard.progress-60))/40)*(1-smooth((q-(hazard.progress+15))/30))});
 }
}finally{app.dispose();adapters.forEach(a=>a.dispose());clearCosmoVehicleCache();}
const finalHashes=hashes();if(JSON.stringify(sourceHashes)!==JSON.stringify(finalHashes))failures.push({kind:'source-mutation',sourceHashes,finalHashes});
const report={passed:failures.length===0,scope:'Actual app.frame with production fuel, ground, scenery/road/moving-hazard contacts and fall logic; mocked DOM/WebGL. Ten real GLB tire/body metadata profiles attached. No browser/device/GPU performance claim. No post-spawn pose/speed/fuel injection. At 15fps the unchanged app cap integrates only50ms per66.7ms frame, explicitly measured as75% simulation budget.',generatedAt:new Date().toISOString(),sourceHashes,finalHashes,counts:{bridges:rows.filter(r=>r.kind==='bridge').length,technical:rows.filter(r=>r.kind==='technical').length,obstacles:rows.filter(r=>r.kind==='obstacle').length},rows,failures};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,counts:report.counts,failures},null,2));process.exitCode=report.passed?0:1;
