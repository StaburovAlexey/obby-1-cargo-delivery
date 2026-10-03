#!/usr/bin/env node
// Independent audit. Real solver, uploaded Float32 geometry and actual app code;
// mocked DOM/renderer only. No browser, WebGL, GPU or Android verification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import * as N from '../dist/route-network.js';
import {createDrivingModel,VEHICLE_DYNAMICS as P,evaluateVehicleForces} from '../dist/driving-model.js';
import {createDrivingModel as createBaseline} from '../qa/turn-assist/baseline-v34/driving-model.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {buildCity,clipBridgeSurfaces} from '../dist/network-scene.js';
import {fitTruckToGround,groundHeight} from '../dist/city-driving.js';
import {roadGroundGradient} from '../dist/driving-ground.js';
import {buildRoadHazards} from '../dist/road-hazards.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';

const dir=new URL('../qa/hills-independent/',import.meta.url);fs.mkdirSync(dir,{recursive:true});
const files=['driving-model.js','route-network.js','route-network-config.js','network-scene.js','app.js','vehicle-input.js','follow-camera.js','driving-ground.js','city-driving.js','road-hazards.js','economy-config.js','vehicle-upgrades.js','biome-surfaces.js'];
const hash=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const hashes=()=>Object.fromEntries(files.map(f=>[f,hash(new URL('../dist/'+f,import.meta.url))]));
const report={generatedAt:new Date().toISOString(),scope:'Offline independent numerical audit of actual runtime. DOM and renderer are mocked; no browser/WebGL/GPU/Android verification.',runtimeHashesAtStart:hashes(),checks:[]};
const check=(name,fn)=>{if(process.env.AUDIT_FILTER&&!new RegExp(process.env.AUDIT_FILTER).test(name))return;const t=performance.now();try{const details=fn();report.checks.push({name,passed:true,milliseconds:Math.round(performance.now()-t),details});console.log('PASS',name,JSON.stringify(details));}catch(e){report.checks.push({name,passed:false,milliseconds:Math.round(performance.now()-t),error:e.stack});console.error('FAIL',name,e.stack);}};
const near=(a,b,e=1e-8,label='')=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=e,`${label}: ${a} != ${b} (+/-${e})`);
const round=n=>Math.round(n*1e8)/1e8;
const save=(name,rows)=>fs.writeFileSync(new URL(name,dir),JSON.stringify(rows,null,2)+'\n');
const full={speed:3,handling:3,grip:3,fuel:3},biomes=['city','forest','desert','snow','volcanic'];
const profiles=VEHICLE_CONFIG.flatMap(spec=>[false,true].flatMap(max=>biomes.map(biome=>({spec,max,biome,surface:surfaceForBiome(biome,spec.id),levels:max?full:undefined,top:spec.maxSpeed*(max?1.06:1)*surfaceForBiome(biome,spec.id).speedFactor}))));
const make=(profile,{baseline=false,speed=0,gear='D',heading=0,contact=()=>undefined}={})=>{
 const m=(baseline?createBaseline:createDrivingModel)({x:0,z:0,heading,vehicleId:profile.spec.id,maxSpeed:profile.spec.maxSpeed,getUpgrades:()=>profile.levels,groundSurface:()=>profile.surface,contact});
 const signed=speed*(gear==='R'?-1:1);m.setGear(gear);Object.assign(m.state,{velocityX:-Math.sin(heading)*signed,velocityZ:-Math.cos(heading)*signed,speed:signed,linearSpeed:speed});return m;
};
const bodyExtent=s=>Math.abs(s.x)+2.9*Math.abs(Math.cos(s.heading))+3.6*Math.abs(Math.sin(s.heading));
const finiteState=s=>{for(const[k,v]of Object.entries(s))if(typeof v==='number')assert.ok(Number.isFinite(v),`${k} is not finite`);};
const commonFields=['x','z','heading','velocityX','velocityZ','angularVelocity','speed','linearSpeed','frontWheelAngle','wheelSpin','gear','steering','active','moving','blocked','travel','pathDistance','movingSeconds','bodyPitch','bodyRoll','bodyBob'];
function turn(profile,fraction,gear,steering,{baseline=false,maxSeconds=45,dt=1/120,checkMotion=false}={}){
 const m=make(profile,{baseline,speed:profile.top*fraction,gear}),s=m.state,beforeInput={...s};m.setInput({active:true,steering});
 for(const k of ['x','z','heading','velocityX','velocityZ','angularVelocity'])assert.equal(s[k],beforeInput[k],'Input must not change pose or momentum');
 let extent=bodyExtent(s),time=0,maxAccel=0,maxYawAccel=0,maxSlip=0,brakeTime=null,at90=null,initialHeading=0;
 while(time<maxSeconds&&Math.abs(s.heading-initialHeading)<Math.PI){
  const old={...s};m.step(dt);time+=Math.min(dt,.1);finiteState(s);extent=Math.max(extent,bodyExtent(s));
  maxAccel=Math.max(maxAccel,Math.hypot(s.velocityX-old.velocityX,s.velocityZ-old.velocityZ)/Math.min(dt,.1));maxYawAccel=Math.max(maxYawAccel,Math.abs(s.angularVelocity-old.angularVelocity)/Math.min(dt,.1));
  if(checkMotion&&dt===P.fixedStep){near(s.x-old.x,s.velocityX*dt,1e-10,'Semi-implicit x');near(s.z-old.z,s.velocityZ*dt,1e-10,'Semi-implicit z');near(s.heading-old.heading,s.angularVelocity*dt,1e-10,'Integrated yaw');}
  if(brakeTime===null&&s.linearSpeed<=Math.min(profile.top,5.6))brakeTime=time;
  if(at90===null&&Math.abs(s.heading)>=Math.PI/2)at90={seconds:round(time),speed:round(s.linearSpeed),x:round(s.x),z:round(s.z)};
  if(s.linearSpeed>.3){const side=s.velocityX*Math.cos(s.heading)-s.velocityZ*Math.sin(s.heading);maxSlip=Math.max(maxSlip,Math.abs(Math.atan2(side,Math.abs(s.speed))));}
 }
 return{vehicle:profile.spec.id,upgrade:profile.max?'max':'stock',biome:profile.biome,gear,steering,startFraction:fraction,initialSpeed:round(profile.top*fraction),completed:Math.abs(s.heading)>=Math.PI,seconds:round(time),maxBodyLateralExtent:round(extent),brakeSeconds:brakeTime===null?null:round(brakeTime),at90,maxAcceleration:round(maxAccel),maxYawAcceleration:round(maxYawAccel),maxSlipDegrees:round(maxSlip*180/Math.PI),end:{x:round(s.x),z:round(s.z),heading:round(s.heading),speed:round(s.linearSpeed)}};
}

check('Four contact patches remain individually bounded and sum to total forces',()=>{
 let cases=0;for(const p of profiles){const m=make(p,{speed:p.top*.7,heading:.6});m.setInput({active:true,steering:1});for(let i=0;i<240;i++){m.step(P.fixedStep);const f=evaluateVehicleForces(m.state,{maxSpeed:p.spec.maxSpeed, surface:p.surface});assert.equal(f.tires.length,4);for(const tire of f.tires){assert.ok(Math.hypot(tire.forceX,tire.forceZ)<=tire.grip+1e-7);assert.ok(tire.lateralForce*tire.lateralSpeed<=1e-9);}near(f.forceX,f.tires.reduce((a,t)=>a+t.forceX,0),1e-7);near(f.forceZ,f.tires.reduce((a,t)=>a+t.forceZ,0),1e-7);near(f.torque,f.tires.reduce((a,t)=>a+t.torque,0),1e-7);}cases++;}return{cases,forceEvaluations:cases*240};
});

let city;
const triangleAt=(positions,ids)=>ids.map(j=>({x:positions[j*3],y:positions[j*3+1],z:positions[j*3+2]}));
const triInfo=v=>{const[a,b,c]=v,u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},w={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z},n={x:u.y*w.z-u.z*w.y,y:u.z*w.x-u.x*w.z,z:u.x*w.y-u.y*w.x},length=Math.hypot(n.x,n.y,n.z);return{area:Math.abs(n.y)/2,gradient:{x:-n.x/n.y,z:-n.z/n.y},normal:{x:n.x/length,y:n.y/length,z:n.z/length},grade:Math.hypot(n.x,n.z)/Math.abs(n.y)};};
check('Higher profile increases amplitude while keeping all platforms level and every analytic join C1',()=>{
 const old=JSON.parse(fs.readFileSync(new URL('../qa/route-hills/baseline.json',import.meta.url),'utf8')),oldMax=Math.max(...old.profile.map(v=>v[1])),newMax=Math.max(...N.ELEVATION_PROFILE.map(v=>v[1]));assert.ok(newMax>oldMax*1.5);let maxGrade=0,maxJoinDelta=0,platformSamples=0;
 for(let q=N.ROUTE.start;q<=N.ROUTE.end;q+=.25){maxGrade=Math.max(maxGrade,Math.abs(N.routeGrade(q)));assert.ok(Math.abs(N.routeGrade(q))<=.07500001);}
 for(const[q]of N.ELEVATION_PROFILE){const e=.0001;maxJoinDelta=Math.max(maxJoinDelta,Math.abs(N.routeGrade(q-e)-N.routeGrade(q+e)));near(N.routeGrade(q-e),N.routeGrade(q+e),1e-8,'Profile C1');}
 for(const q of [...N.CHECKPOINT_PROGRESS,...N.PREVIEW_PROGRESS.map(p=>p.progress)])for(const dq of [-19,-10,0,10,19])for(const lateral of [-14,0,14]){const p=N.routePointAtProgress(q+dq),s=N.getSurface(p.x+p.right.x*lateral,p.z+p.right.z*lateral);near(s.height,N.routeHeight(q),5e-6,`Platform ${q}/${dq}/${lateral}`);near(Math.hypot(s.gradient.x,s.gradient.z),0,1e-9);platformSamples++;}
 for(const fork of N.FORKS)for(const q of [fork.from,fork.to]){const a=N.routePointAtProgress(q-.0001),b=N.routePointAtProgress(q+.0001,{branch:'alternate'});near(a.heading,b.heading,1e-8,'Fork C1 heading');near(a.gradient.x,b.gradient.x,1e-8);near(a.gradient.z,b.gradient.z,1e-8);}
 return{previousMaximum:oldMax,maximum:newMax,maxAnalyticGrade:maxGrade,maxJoinDerivativeDifference:maxJoinDelta,platformSamples};
});
check('Every actual uploaded road triangle respects the 7.5% full-width cap and ground normals match it',()=>{
 city=buildCity(THREE,{seed:42});city.group.updateMatrixWorld(true);let count=0,maxRoadGrade=0,maxGroundGrade=0,maxHeightError=0,maxNormalError=0,skinny=0;const problems=[];
 for(const[kind,name,data]of [['road','Continuous 30m-wide road',clipBridgeSurfaces(N.ROAD_MESH)],['ground','Closed continuous terrain foundation',clipBridgeSurfaces(N.GROUND_MESH,{terrain:true})]]){const mesh=city.group.getObjectByName(name),positions=mesh.geometry.attributes.position.array,ix=mesh.geometry.index.array;assert.equal(positions.length,data.positions.length);for(let k=0;k<positions.length;k++)assert.equal(positions[k],Math.fround(data.positions[k]+(k%3===1?N.ROAD_SURFACE_OFFSET:0)),`Uploaded position ${kind}/${k}`);
  for(let i=0;i<ix.length;i+=3){const ids=[ix[i],ix[i+1],ix[i+2]],v=triangleAt(positions,ids),f=triInfo(v),p=v.reduce((a,b)=>({x:a.x+b.x/3,y:a.y+b.y/3,z:a.z+b.z/3}),{x:0,y:0,z:0});assert.ok(f.area>0&&f.normal.y>0);if(f.area<.001)skinny++;if(kind==='road'){maxRoadGrade=Math.max(maxRoadGrade,f.grade);if(f.grade>.07505)problems.push({kind,triangle:i/3,grade:f.grade,progress:ids.map(j=>data.progress[j])});}else maxGroundGrade=Math.max(maxGroundGrade,f.grade);
   const surface=N.getSurface(p.x,p.z),gradient=roadGroundGradient(p.x,p.z),heightError=Math.abs(groundHeight(p.x,p.z)-p.y),normalError=Math.hypot(surface.normal.x-f.normal.x,surface.normal.y-f.normal.y,surface.normal.z-f.normal.z);maxHeightError=Math.max(maxHeightError,heightError);maxNormalError=Math.max(maxNormalError,normalError);assert.ok(heightError<.0001,`Triangle height mismatch ${kind}/${i/3} ${heightError}`);assert.ok(normalError<.002,`Triangle normal mismatch ${kind}/${i/3} ${normalError}`);near(gradient.x,f.gradient.x,.002);near(gradient.z,f.gradient.z,.002);count++;
  }
 }
 save('road-grade-problems.json',problems);assert.equal(problems.length,0,JSON.stringify(problems.slice(0,5)));return{triangles:count,maxRoadGrade,maxGroundGrade,maxHeightError,maxNormalError,skinnyTriangles:skinny,float32GradeTolerance:.00005};
});
check('Fork quantization stays bounded and does not create vehicle-support steps',()=>{
 let maxGradientError=0,maxHeightError=0,triangles=0,maxSupportResidual=0,supportChecks=0;const rows=[],thinProgress=new Map();
 for(const[kind,data]of [['road',N.ROAD_MESH],['ground',N.GROUND_MESH]])for(let i=0;i<data.indices.length;i+=3){const ids=data.indices.slice(i,i+3),qs=ids.map(j=>data.progress[j]),fork=N.FORKS.find(f=>qs.every(q=>q>=f.from&&q<=f.to));if(!fork)continue;const v=triangleAt(data.positions,ids),f=triInfo(v),p=v.reduce((a,b)=>({x:a.x+b.x/3,y:a.y+b.y/3,z:a.z+b.z/3}),{x:0,y:0,z:0}),origin=N.routePointAtProgress(fork.from),q=fork.from+(p.x-origin.x)*origin.tangent.x+(p.z-origin.z)*origin.tangent.z,grade=N.routeGrade(q),gradientError=Math.hypot(f.gradient.x-grade*origin.tangent.x,f.gradient.z-grade*origin.tangent.z),heightError=Math.abs(p.y-N.routeHeight(q));maxGradientError=Math.max(maxGradientError,gradientError);maxHeightError=Math.max(maxHeightError,heightError);triangles++;if(gradientError>.001)rows.push({kind,triangle:i/3,fork:fork.id,q,gradientError,heightError,area:f.area});if(kind==='road'&&Math.max(...qs)-Math.min(...qs)<.02)thinProgress.set(`${fork.id}:${q.toFixed(3)}`,{fork,q});}
 // A sub-mm Float32 facet can have ~0.22 degree normal error. The authoritative
 // query matches the rendered triangle; verify bounded support, not fake C1
 // flat-face normals. The analytic route itself is separately checked C1.
 assert.ok(maxGradientError<.004);assert.ok(maxHeightError<.0005);
 for(const{fork,q}of thinProgress.values())for(const branch of ['main','alternate'])for(const side of [-10,0,10]){
  const fits=[-.02,0,.02].map(dq=>{const p=N.routePointAtProgress(q+dq,{branch}),x=p.x+p.right.x*side,z=p.z+p.right.z*side;return fitTruckToGround(THREE,x,z,p.heading,p).position.y;});const residual=Math.abs(fits[0]-2*fits[1]+fits[2]);maxSupportResidual=Math.max(maxSupportResidual,residual);assert.ok(residual<.0006,`Fork support jerk ${fork.id}/${q}/${side}: ${residual}`);supportChecks++;
 }
 save('fork-quantization.json',{maxGradientError,maxHeightError,maxSupportResidual,supportChecks,worstBands:rows.sort((a,b)=>b.gradientError-a.gradientError).slice(0,30)});return{triangles,maxGradientError,maxHeightError,maxSupportResidual,supportChecks,notes:'Bounded Float32 facet normal quantization is approximately 0.22 degrees on a sub-mm band; rendered and collision normals agree.'};
});
check('Hills retain supported tires, coherent road edges and terrain-embedded houses/barriers',()=>{
 assert.ok(city);let fits=0,minClearance=Infinity,maxClearance=0,maxSeamStep=0,features=0;
 for(const edge of N.NETWORK_EDGES)for(let q=edge.progressFrom+5;q<edge.progressTo-5;q+=41.7)for(const side of [-10,0,10])for(const reverse of [0,Math.PI]){const p=N.routePointAtProgress(q,{branch:edge.branch}),x=p.x+p.right.x*side,z=p.z+p.right.z*side,fit=fitTruckToGround(THREE,x,z,p.heading+reverse,p);assert.ok(fit.position.toArray().every(Number.isFinite));near(fit.quaternion.length(),1,1e-10);for(const c of fit.clearances){minClearance=Math.min(minClearance,c);maxClearance=Math.max(maxClearance,c);assert.ok(c>=.011999&&c<.06,`Tire clearance ${c}`);}fits++;}
 for(const edge of N.ROAD_BOUNDARY_SEGMENTS){const x=(edge.a.x+edge.b.x)/2,z=(edge.a.z+edge.b.z)/2,q=N.projectRoad(x,z);if(q.progress<N.ROUTE.start+.1||q.progress>N.ROUTE.end-.1)continue;const e=.0001,a=N.getSurface(x+edge.normalX*e,z+edge.normalZ*e),b=N.getSurface(x-edge.normalX*e,z-edge.normalZ*e);assert.ok(a.onRoad);assert.ok(!b.onRoad);maxSeamStep=Math.max(maxSeamStep,Math.abs(a.height-b.height));assert.ok(Math.abs(a.height-b.height)<.0001);}
 for(const f of city.features.filter(v=>v.type==='building'||v.type==='barrier')){if(f.side===0)continue;const bottom=f.bottom??f.position[2];for(let i=0;i<f.footprint.length;i++){const a=f.footprint[i],b=f.footprint[(i+1)%f.footprint.length];for(const t of [0,.25,.5,.75,1]){const x=a.x+(b.x-a.x)*t,z=-(a.y+(b.y-a.y)*t),h=groundHeight(x,z);assert.ok(bottom<=h+.02,`Floating ${f.type} ${f.index}, bottom ${bottom}, terrain ${h}`);assert.ok(f.top>h+1,`Buried ${f.type} ${f.index}`);assert.ok(!N.pointInRoad(x,z));}}features++;}
 return{fits,minClearance,maxClearance,maxSeamStep,scenicFeatures:features};
});
check('Falling-rock warnings retain actual terrain sightlines in both directions after the height change',()=>{
 let rays=0,minClearance=Infinity,rocks=0;for(const seed of [1,42,2026])for(const h of buildRoadHazards(seed).filter(h=>h.type==='rock')){rocks++;for(const sign of [-1,1])for(const range of [160,180]){const eye=N.pointOnEdge(h.edgeId,h.edgeDistance+sign*range),target={x:h.x,z:h.z,y:groundHeight(h.x,h.z)+.08};for(let i=1;i<180;i++){const t=i/180,x=eye.x+(target.x-eye.x)*t,z=eye.z+(target.z-eye.z)*t,y=eye.height+2+(target.y-eye.height-2)*t,clearance=y-groundHeight(x,z);minClearance=Math.min(minClearance,clearance);assert.ok(clearance>0,`${h.id} hidden at ${range}m/${sign}`);}rays++;}}
 return{seedCount:3,rocks,twoWayTerrainRays:rays,minimumTerrainClearance:minClearance,limitations:'Terrain line of sight only; browser visual readability unverified'};
});

city?.dispose();report.selectedGroups=process.env.AUDIT_FILTER||'all';report.runtimeHashesAtEnd=hashes();report.runtimeFilesChangedDuringRun=files.filter(f=>report.runtimeHashesAtStart[f]!==report.runtimeHashesAtEnd[f]);report.passed=report.checks.every(c=>c.passed)&&report.runtimeFilesChangedDuringRun.length===0;save('report.json',report);console.log(`${report.checks.filter(c=>c.passed).length}/${report.checks.length} groups passed; runtime changed: ${report.runtimeFilesChangedDuringRun.join(',')||'none'}`);process.exitCode=report.passed?0:1;
