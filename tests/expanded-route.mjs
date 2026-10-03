import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as N from '../dist/route-network.js';
import { createDrivingModel } from '../dist/driving-model.js';
import { roadGroundGradient, roadGroundSurface } from '../dist/driving-ground.js';
import { VEHICLE_CONFIG } from '../dist/economy-config.js';
import { createNetworkRouteController } from './fixtures/network-route-controller.mjs';
const report={scope:'CPU geometry and input-only production tire solver. No browser/GPU/mobile claim. Segment drivability excludes fuel budgets and obstacles, which have separate integration audits.',baseline:{length:10830.787649846368,roadTriangles:16510,groundTriangles:30398},stats:N.NETWORK_STATS,checks:[],drives:[]};
assert.equal(N.ROUTE.end,32400);assert.equal(N.ROUTE.cityEnd,6000);assert.deepEqual(N.CHECKPOINT_PROGRESS.slice(0,3),[180,440,780]);assert.ok(Math.abs(N.ROUTE_LENGTH/report.baseline.length-3)<.02);
assert.equal(N.NETWORK_CONFIG.halfWidth,15);assert.equal(N.TRUCK_HALF_WIDTH,2.9);assert.equal(N.TRUCK_HALF_LENGTH,3.6);
assert.ok(N.NETWORK_STATS.roadTriangles<report.baseline.roadTriangles*1.1);assert.ok(N.NETWORK_STATS.groundTriangles<report.baseline.groundTriangles*1.1);
let maxGrade=0,minHeight=Infinity,maxHeight=-Infinity,maxCenterError=0,probes=0;
const m=N.ROAD_MESH;
for(let i=0;i<m.indices.length;i+=3){const [a,b,c]=m.indices.slice(i,i+3).map(j=>({x:m.positions[j*3],y:m.positions[j*3+1],z:m.positions[j*3+2]}));const area=(b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z);assert.ok(Math.abs(area)>1e-9);const gx=((b.y-a.y)*(c.z-a.z)-(c.y-a.y)*(b.z-a.z))/area,gz=((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/area;maxGrade=Math.max(maxGrade,Math.hypot(gx,gz));}
assert.ok(maxGrade<=.105,`Grade ${maxGrade}`);
for(const e of N.NETWORK_EDGES)for(let q=e.progressFrom+5;q<e.progressTo-5;q+=7.7){const p=N.routePointAtProgress(q,{branch:e.branch});minHeight=Math.min(minHeight,p.height);maxHeight=Math.max(maxHeight,p.height);for(const lateral of [-10,0,10]){const x=p.x+lateral*p.right.x,z=p.z+lateral*p.right.z,s=N.getSurface(x,z,p);assert.ok(s.onRoad,`${e.id} ${q}`);assert.ok(N.truckInRoad(x,z,p.heading,p));assert.ok(Number.isFinite(s.height));if(!lateral)maxCenterError=Math.max(maxCenterError,Math.abs(s.height-p.height));probes++;}}
assert.ok(maxCenterError<.012);assert.ok(maxHeight-minHeight>200);
for(const q of N.CHECKPOINT_PROGRESS){assert.ok(!N.FORKS.some(f=>q>=f.from&&q<=f.to));for(let d=-20;d<=20;d+=2)assert.ok(Math.abs(N.routeGrade(Math.min(N.ROUTE.end,q+d)))<1e-9);}
for(const f of N.FORKS){const mid=(f.from+f.to)/2,a=N.routePointAtProgress(mid),b=N.routePointAtProgress(mid,{branch:'alternate'});assert.ok(a.height-b.height>=26);for(const q of [f.from,f.to]){const a=N.routePointAtProgress(q),b=N.routePointAtProgress(q,{branch:'alternate'});assert.ok(Math.hypot(a.x-b.x,a.z-b.z,a.height-b.height)<1e-8);}}
report.checks.push({probes,maxGrade,minHeight,maxHeight,maxCenterError,flatGates:N.CHECKPOINT_PROGRESS.length});
const hazards={surfaceAt:(x,z,s)=>s};
for(const upgraded of [false,true])for(const branch of ['main','alternate'])for(const f of [{id:'city-hills',biome:'city',from:2800,to:5100},...N.FORKS]){if(f.biome==='city'&&branch==='alternate')continue;const id={city:'pickup',forest:'foresthauler',desert:'desertscout',snow:'snowrunner',volcanic:'ashhauler'}[f.biome],spec=VEHICLE_CONFIG.find(v=>v.id===id),levels=upgraded?{speed:10,handling:10,grip:10,fuel:10}:{};let context=N.routePointAtProgress(f.from-30,{branch});const model=createDrivingModel({x:context.x,z:context.z,heading:context.heading,vehicleId:id,maxSpeed:spec.maxSpeed,getUpgrades:()=>levels,contact:(x,z,h)=>N.corridorContact(x,z,h,context),groundGradient:(x,z)=>{context=N.projectRoad(x,z,context);return roadGroundGradient(x,z,context);},groundSurface:(x,z,v)=>roadGroundSurface(x,z,v,context)});model.setGear('D');const control=createNetworkRouteController({branch,vehicleId:id,levels,hazards});let frames=0,maxOffset=0,stalled=0,maxStalled=0;
 for(;frames<20000&&context.progress<f.to+30;frames++){const before=context.progress;model.setInput(control.sample(model.state));model.step(.1);context=N.projectRoad(model.state.x,model.state.z,context);assert.ok(!model.state.blocked,`Blocked ${id} ${branch} ${f.id} ${context.progress}`);assert.ok(N.truckInRoad(model.state.x,model.state.z,model.state.heading,context));stalled=frames>40&&context.progress-before<.01?stalled+.1:0;maxStalled=Math.max(maxStalled,stalled);assert.ok(stalled<4);maxOffset=Math.max(maxOffset,Math.abs(context.offset));}
 assert.ok(context.progress>=f.to+30,`Timed out ${id} ${f.id}`);report.drives.push({vehicle:id,upgraded,branch,fork:f.id,seconds:frames*.1,maxOffset,maxStalled,postSpawnPoseMutations:0,fuelInjected:0});
}
report.sourceHashes=Object.fromEntries(['route-network.js','route-network-config.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(new URL('../dist/'+f,import.meta.url))).digest('hex')]));report.passed=true;fs.mkdirSync(new URL('../qa/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/expanded-route.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
