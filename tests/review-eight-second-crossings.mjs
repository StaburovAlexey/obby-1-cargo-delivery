#!/usr/bin/env node



import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from '../dist/vendor/three.module.js';
import * as N from '../dist/route-network.js';
import * as C from '../dist/route-network-config.js';
import {BRIDGES,bridgeSupport} from '../dist/road-bridges.js';
import {buildRoadHazards,createRoadHazards,roadHazardContact,ROAD_HAZARD_RULES as R,ROAD_HAZARD_EXCLUSIONS} from '../dist/road-hazards.js';
import {createRoadHazardsScene,ROAD_HAZARD_VISUALS as V} from '../dist/road-hazards-scene.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {freshCareer} from '../dist/career-save.js';
import {createAppDom} from './fixtures/app-dom.mjs';

const out=new URL('../qa/turns-crossings/',import.meta.url),root=new URL('../',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const baseline=JSON.parse(fs.readFileSync(new URL('review-baseline.json',out),'utf8'));
const hash=f=>createHash('sha256').update(fs.readFileSync(new URL('dist/'+f,root))).digest('hex');
const hashes=()=>Object.fromEntries(fs.readdirSync(new URL('dist/',root)).filter(f=>f.endsWith('.js')).sort().map(f=>[f,hash(f)]));
const report={generatedAt:new Date().toISOString(),scope:'Independent offline Node review of production geometry, live collider poses, actual Three.js CPU instance transforms, and mocked-DOM app lifecycle. No browser, GPU, visual-occlusion, mobile-gesture, human-difficulty or full-journey claim.',runtimeHashes:hashes(),checks:[],failures:[]};
const near=(a,b,e=1e-7)=>assert(Math.abs(a-b)<=e,`${a} != ${b}; tolerance ${e}`);
const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const player={x:0,z:0,heading:0};
const groundHeight=(x,z)=>N.queryRoadSurface(x,z).height+N.ROAD_SURFACE_OFFSET;
function check(name,fn){try{const details=fn();report.checks.push({name,passed:true,...details});console.log('PASS '+name);}catch(e){report.failures.push({name,error:e.stack});console.error('FAIL '+name+': '+e.message);}}
const advance=(system,to,dt=.05)=>{while(system.elapsed<to-1e-10)system.update(Math.min(dt,to-system.elapsed),player,true);};

check('Route length, bridge identities and progression are preserved',()=>{
 near(N.ROUTE_LENGTH,baseline.routeLength,1e-8);assert.equal(BRIDGES.length,25);assert.deepEqual(BRIDGES,baseline.bridges);
 for(const [name,key] of [['biomes','BIOME_DEFINITIONS'],['forks','FORK_DEFINITIONS'],['checkpoints','CHECKPOINT_PROGRESS'],['previews','PREVIEW_PROGRESS'],['elevation','ELEVATION_PROFILE']])assert.deepEqual(C[key],baseline[name]);
 for(const [file,oldHash] of Object.entries(baseline.preservedHashes))assert.equal(hash(file),oldHash,file+' changed outside route/crossing scope');
 let samples=0,maxBridgeCurvature=0;
 for(const b of BRIDGES)for(let q=b.from-60;q<=b.to+60;q+=1){const p=N.routePointAtProgress(q);maxBridgeCurvature=Math.max(maxBridgeCurvature,Math.abs(p.curvature));assert(Math.abs(p.curvature)<=.0013+1e-9,b.id+' bridge curvature');assert(Math.hypot(p.gradient.x,p.gradient.z)<=.065+1e-9);samples++;if(q>=b.from&&q<=b.to)for(const yaw of [-5,0,5])for(const reverse of [0,Math.PI])assert(!bridgeSupport({x:p.x+p.right.x*b.offset,z:p.z+p.right.z*b.offset,heading:p.heading+reverse+yaw*Math.PI/180},p).fall);}
 return{routeLength:N.ROUTE_LENGTH,bridges:BRIDGES.length,preservedModules:Object.keys(baseline.preservedHashes),bridgeApproachSamples:samples,maxBridgeCurvature};
});



const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function pointSegment(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
function segmentDistance(a,b,c,d){if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));}
check('Alternating city turns have valid derivatives, offsets and no nonlocal road overlaps',()=>{
 assert(C.TURN_DEFINITIONS.length>baseline.turns.length);const cityTurns=C.TURN_DEFINITIONS.filter(t=>t[0]<3000);assert(cityTurns.length>=6);
 let priorEnd=-Infinity,priorHeading=0,maxCurvature=0,maxDerivativeError=0,maxBackboneCurvature=0,minShoulderJacobian=1,projectionSamples=0;
 for(const [from,to,a,b] of C.TURN_DEFINITIONS){assert(from>=priorEnd);assert(to>from);near(a,priorHeading);assert(a!==b);for(const fork of C.FORK_DEFINITIONS)assert(to<=fork.from||from>=fork.to,'Turn overlaps fork '+fork.id);priorEnd=to;priorHeading=b;}
 const changes=cityTurns.map(t=>Math.sign(t[3]-t[2]));assert(changes.slice(1).filter((s,i)=>s!==changes[i]).length>=4);
 for(const e of N.NETWORK_EDGES)for(let q=e.progressFrom+.1;q<e.progressTo-.1;q+=3){
  const p=N.pointOnEdge(e.id,N.routeDistanceAt(q)-e.distanceFrom),a=N.pointOnEdge(e.id,N.routeDistanceAt(q-.01)-e.distanceFrom),b=N.pointOnEdge(e.id,N.routeDistanceAt(q+.01)-e.distanceFrom);
  const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),error=Math.hypot(dx/l-p.tangent.x,dz/l-p.tangent.z);maxDerivativeError=Math.max(maxDerivativeError,error);assert(error<1e-6,e.id+' analytic tangent disagrees with centerline');
  maxCurvature=Math.max(maxCurvature,Math.abs(p.curvature));if(!e.forkId){maxBackboneCurvature=Math.max(maxBackboneCurvature,Math.abs(p.curvature));minShoulderJacobian=Math.min(minShoulderJacobian,1-110*Math.abs(p.curvature));assert(1-110*Math.abs(p.curvature)>.7,'Road shoulder offset cusp');}
  if(!e.forkId && q>N.ROUTE.start+1 && q<N.ROUTE.end-1)for(const offset of [-14.2,0,14.2]){const x=p.x+p.right.x*offset,z=p.z+p.right.z*offset,projection=N.projectRoad(x,z,p);near(projection.progress,q,1e-5);near(projection.offset,offset,1e-5);if(!BRIDGES.some(b=>q>=b.from-5&&q<=b.to+5))assert(N.pointInRoad(x,z,.2),e.id+' road containment at '+q);projectionSamples++;}
 }
 const segments=[];for(const e of N.NETWORK_EDGES)for(let q=e.progressFrom;q<e.progressTo;q+=6){const end=Math.min(e.progressTo,q+6);segments.push({a:N.pointOnEdge(e.id,N.routeDistanceAt(q)-e.distanceFrom),b:N.pointOnEdge(e.id,N.routeDistanceAt(end)-e.distanceFrom),q:(q+end)/2,edge:e.id});}
 const bins=new Map();let testedPairs=0,minNonlocalDistance=Infinity;const seen=new Set();
 for(let i=0;i<segments.length;i++){const s=segments[i];for(let x=Math.floor((Math.min(s.a.x,s.b.x)-31)/64);x<=Math.floor((Math.max(s.a.x,s.b.x)+31)/64);x++)for(let z=Math.floor((Math.min(s.a.z,s.b.z)-31)/64);z<=Math.floor((Math.max(s.a.z,s.b.z)+31)/64);z++){const key=x+','+z;for(const j of bins.get(key)||[]){const id=j+':'+i;if(seen.has(id))continue;seen.add(id);const t=segments[j];if(Math.abs(s.q-t.q)<150)continue;const distance=segmentDistance(s.a,s.b,t.a,t.b);testedPairs++;minNonlocalDistance=Math.min(minNonlocalDistance,distance);assert(distance>30.1,`${s.edge}/${t.edge}: nonlocal roads approach within ${distance} m`);}if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);}}
 for(const mesh of [N.ROAD_MESH,N.GROUND_MESH])for(let i=0;i<mesh.indices.length;i+=3){const indices=mesh.indices.slice(i,i+3),p=indices.map(j=>({x:mesh.positions[j*3],z:mesh.positions[j*3+2]}));assert(cross(...p)<-1e-9,'Mesh triangle winding or degeneracy');}
 return{turns:C.TURN_DEFINITIONS.length,cityTurns:cityTurns.length,cityDirectionChanges:changes.slice(1).filter((s,i)=>s!==changes[i]).length,maxCurvature,maxBackboneCurvature,maxDerivativeError,minShoulderJacobian,projectionSamples,nonlocalSegmentPairs:testedPairs,minNonlocalDistance:Number.isFinite(minNonlocalDistance)?minNonlocalDistance:null};
});

check('More movers preserve clear intervals, exclusions and bidirectional terrain sightlines',()=>{
 let minimumSeparation=Infinity,minimumExclusionMargin=Infinity,minimumRoadMargin=Infinity,maxCurve=0,maxGrade=0,maxHeading=0,sightSamples=0,perimeterSamples=0;
 const seeds=[0,1,2,3,17,42,12345,4294967295,'repeat'];
 for(const seed of seeds){const hazards=buildRoadHazards(seed);assert.equal(hazards.length,30);assert.equal(hazards.filter(h=>h.motion).length,20);assert.deepEqual(hazards,buildRoadHazards(seed));
  for(const biome of C.BIOME_DEFINITIONS){const local=hazards.filter(h=>h.biome===biome.id),movers=local.filter(h=>h.motion);assert.equal(movers.length,4);assert(movers.every(h=>h.motion.crossesCenter));assert(Math.max(...local.map(h=>h.progress))-Math.min(...local.map(h=>h.progress))>(biome.to-biome.from)*.4,biome.id+' insufficient distribution');}
  for(let i=0;i<hazards.length;i++){
   const h=hazards[i],p=N.pointOnEdge(h.edgeId,h.edgeDistance);assert(Object.isFrozen(h));near(h.x,p.x+p.right.x*h.offset);near(h.z,p.z+p.right.z*h.offset);
   const extent=Math.hypot(h.width,h.length)/2+1;for(const x of ROAD_HAZARD_EXCLUSIONS){const margin=Math.abs(h.distance-x.distance)-extent-x.radius;minimumExclusionMargin=Math.min(minimumExclusionMargin,margin);assert(margin>=-1e-7,`${h.id} encroaches ${x.id}`);}
   for(const other of hazards.slice(i+1)){if(other.edgeId!==h.edgeId)continue;const required=h.motion||other.motion?180:150,distance=Math.abs(h.edgeDistance-other.edgeDistance);minimumSeparation=Math.min(minimumSeparation,distance);assert(distance>=required-1e-7);}
   if(!h.motion)continue;
   assert(h.progress>C.CHECKPOINT_PROGRESS[2]+160);assert.equal(h.motion.travelSeconds,8);near(h.motion.period,2*(8+h.motion.pauseSeconds));assert.equal(h.motion.pauseSeconds,1.4);assert.equal(h.motion.minOffset,-10.6);assert.equal(h.motion.maxOffset,10.6);
   const edge=N.getEdge(h.edgeId);assert(h.edgeDistance>100&&edge.length-h.edgeDistance>100);
   for(let d=-100;d<=100;d+=2){const q=N.pointOnEdge(h.edgeId,h.edgeDistance+d),curve=Math.abs(q.curvature),grade=Math.hypot(q.gradient.x,q.gradient.z),heading=Math.abs(angle(q.heading,p.heading));maxCurve=Math.max(maxCurve,curve);maxGrade=Math.max(maxGrade,grade);maxHeading=Math.max(maxHeading,heading);assert(curve<=R.maximumApproachCurvature);assert(grade<=R.maximumApproachGrade);assert(heading<=R.maximumApproachHeadingChange);sightSamples++;}

   for(let offset=-10.6;offset<=10.6001;offset+=1.06)for(const lx of [-h.width/2,h.width/2])for(const lz of [-h.length/2,h.length/2]){
    const x=p.x+p.right.x*offset+Math.cos(h.heading)*lx+Math.sin(h.heading)*lz,z=p.z+p.right.z*offset-Math.sin(h.heading)*lx+Math.cos(h.heading)*lz,q=N.projectRoad(x,z,h),margin=15-Math.abs(q.offset);minimumRoadMargin=Math.min(minimumRoadMargin,margin);assert(margin>2.4);assert(N.pointInRoad(x,z,.4));perimeterSamples++;
   }
  }
 }
 return{seeds:seeds.length,total:30,moving:20,perBiome:4,minimumSeparation,minimumExclusionMargin,minimumRoadMargin,sightSamples,perimeterSamples,maxCurve,maxGrade,maxHeading,sightlineLimitation:'100 m geometric curvature/grade/heading checks; no camera occlusion measurement'};
});

check('Terrain cannot hide the top of a mover from either 100 metre approach',()=>{
 let minimumTerrainRayClearance=Infinity,worst=null,samples=0;
 for(const h of buildRoadHazards(42).filter(h=>h.motion))for(const offset of [-10.6,0,10.6])for(const direction of [-1,1]){
  const p=N.pointOnEdge(h.edgeId,h.edgeDistance),eye=N.pointOnEdge(h.edgeId,h.edgeDistance+direction*100),tx=p.x+p.right.x*offset,tz=p.z+p.right.z*offset,ty=N.queryRoadSurface(tx,tz,p).height+h.height;
  for(let i=1;i<100;i++){const t=i/100,x=eye.x+(tx-eye.x)*t,z=eye.z+(tz-eye.z)*t,line=eye.height+2+(ty-eye.height-2)*t,ground=N.queryRoadSurface(x,z,p).height,clearance=line-ground;samples++;if(clearance<minimumTerrainRayClearance){minimumTerrainRayClearance=clearance;worst={hazard:h.id,offset,direction,fraction:t};}assert(clearance>.1,h.id+' hidden behind terrain');}
 }
 return{approaches:120,terrainRaySamples:samples,driverEyeHeight:2,minimumTerrainRayClearance,worst,limitation:'Production terrain ray only; scenery/camera occlusion is not measured.'};
});

check('Every actual cycle travels for eight seconds each way with dwell counted separately',()=>{
 const system=createRoadHazards(42),movers=system.movers,records=new Map(movers.map(h=>[h.id,[]]));let maximumStep=0;
 const dt=.01,previous=new Map(movers.map(h=>[h.id,h.offset]));
 for(let frame=0;frame<Math.ceil(60/dt);frame++){system.update(dt,player,true);for(const h of movers){const delta=h.offset-previous.get(h.id);maximumStep=Math.max(maximumStep,Math.abs(delta));assert(Math.abs(delta)<=4*dt+1e-8);previous.set(h.id,h.offset);if(system.elapsed<=2)continue;const status=Math.abs(h.offset-h.motion.minOffset)<1e-10?'left':Math.abs(h.offset-h.motion.maxOffset)<1e-10?'right':delta>0?'rightward':'leftward';const runs=records.get(h.id),last=runs.at(-1);if(last?.status===status){last.end=system.elapsed;last.frames++;}else runs.push({status,start:system.elapsed,end:system.elapsed,frames:1});}}
 let travelRuns=0,dwellRuns=0,minTravel=Infinity,maxTravel=0,minDwell=Infinity,maxDwell=0;
 for(const [id,runs] of records){for(const run of runs.slice(1,-1)){const seconds=run.frames*dt;if(['left','right'].includes(run.status)){near(seconds,1.4,.011);minDwell=Math.min(minDwell,seconds);maxDwell=Math.max(maxDwell,seconds);dwellRuns++;}else{near(seconds,8,.011);minTravel=Math.min(minTravel,seconds);maxTravel=Math.max(maxTravel,seconds);travelRuns++;}}assert(runs.some(r=>r.status==='left')&&runs.some(r=>r.status==='right'),id+' did not reach both road sides');}
 assert(travelRuns>=80);assert(dwellRuns>=80);
 const snapshot=JSON.stringify(system.poses),elapsed=system.elapsed;for(const dt of [0,-1,NaN,Infinity])system.update(dt,player,true);system.update(3600,player,false);system.update(.1,{...player,x:NaN},true);assert.equal(JSON.stringify(system.poses),snapshot);near(system.elapsed,elapsed);
 const twin=createRoadHazards(42);advance(twin,elapsed);system.update(3600,player,true);twin.update(.1,player,true);near(system.elapsed,elapsed+.1);for(const h of system.movers)near(h.offset,twin.poseFor(h.id).offset,1e-7);
 const ids=[...system.poses];system.reset();const fresh=createRoadHazards(42);assert.deepEqual(system.poses,fresh.poses);system.poses.forEach((p,i)=>assert.equal(p,ids[i]));
 return{sampleStep:dt,seconds:60,moverFrames:6000*movers.length,travelRuns,dwellRuns,minTravel,maxTravel,minDwell,maxDwell,maximumStep,maxVisibleDelta:R.maxDelta};
});

let app;
try{
 app=createAppDom({startDriving:false,career:{...freshCareer(),money:7654,brains:321,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)}});
 check('All ten actual rendered vehicle widths have an immediate clear escape corridor',()=>{
  const sizes=[];const m=new T.Matrix4(),v=new T.Vector3();
  for(const car of app.debug.garage.vehicles){car.rig.reset();car.root.updateMatrixWorld(true);const inverse=car.root.matrixWorld.clone().invert(),box=new T.Box3();car.root.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;if(mesh.isInstancedMesh){for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);m.premultiply(mesh.matrixWorld).premultiply(inverse);for(let j=0;j<p.count;j++)box.expandByPoint(v.fromBufferAttribute(p,j).applyMatrix4(m));}}else{m.copy(mesh.matrixWorld).premultiply(inverse);for(let j=0;j<p.count;j++)box.expandByPoint(v.fromBufferAttribute(p,j).applyMatrix4(m));}});sizes.push({id:car.id,width:box.max.x-box.min.x,length:box.max.z-box.min.z,halfWidth:Math.max(Math.abs(box.min.x),Math.abs(box.max.x)),halfLength:Math.max(Math.abs(box.min.z),Math.abs(box.max.z))});}
  assert.equal(sizes.length,10);let minimumOpening=Infinity,minimumRenderedMargin=Infinity,checks=0;const system=createRoadHazards(42);
  for(let frame=0;frame<=376;frame++){if(frame)system.update(.05,player,true);for(const h of system.movers){const p=N.pointOnEdge(h.edgeId,h.edgeDistance),side=h.offset<=0?1:-1,nearEdge=h.offset+side*h.width/2,offset=(nearEdge+15*side)/2,opening=15-h.width/2+Math.abs(h.offset);minimumOpening=Math.min(minimumOpening,opening);assert(opening>=13.1-1e-7);assert(!roadHazardContact(h,p.x+p.right.x*offset,p.z+p.right.z*offset,p.heading));
   for(const car of sizes)for(const yaw of [-15,0,15]){const theta=yaw*Math.PI/180,extent=Math.abs(Math.cos(theta))*car.halfWidth+Math.abs(Math.sin(theta))*car.halfLength,margin=opening/2-extent;minimumRenderedMargin=Math.min(minimumRenderedMargin,margin);assert(margin>2,car.id+' lacks immediate escape margin');
    if(frame%47===0)for(const lx of [-car.halfWidth,car.halfWidth])for(const lz of [-car.halfLength,car.halfLength]){const heading=p.heading+theta,x=p.x+p.right.x*offset+Math.cos(heading)*lx+Math.sin(heading)*lz,z=p.z+p.right.z*offset-Math.sin(heading)*lx+Math.cos(heading)*lz;assert(N.pointInRoad(x,z,.4));}checks++;
   }
  }}
  return{vehicles:sizes,sampledVehicleYawPoses:checks,minimumOpening,minimumRenderedMargin,limitation:'Instantaneous opposite-side escape only. No single lane is collision-free for the whole sweep; full journeys must react or wait.'};
 });
 check('Real Three.js instance transforms match live colliders without pool growth',()=>{
  const system=createRoadHazards(42),scene=createRoadHazardsScene(T,{system,groundHeight}),resources=scene.group.children.map(m=>[m,m.geometry,m.material,m.instanceMatrix?.array]),matrix=new T.Matrix4(),v=new T.Vector3();let transforms=0,vertices=0,maxPositionError=0,maxFootprintOvershoot=0,maxBaseDaylight=-Infinity,maxBaseBurial=0;
  try{for(let frame=0;frame<=376;frame++){if(frame)system.update(.05,player,true);scene.update(.05);for(const mesh of scene.group.children.filter(m=>m.isInstancedMesh)){assert(mesh.count<=mesh.userData.capacity);assert.equal(mesh.instanceMatrix.array.length,Math.max(1,mesh.userData.capacity)*16);for(let i=0;i<mesh.count;i++){const h=system.poseFor(mesh.userData.hazardIds[i]);if(!h.motion)continue;mesh.getMatrixAt(i,matrix);const error=Math.max(Math.abs(matrix.elements[12]-h.x),Math.abs(matrix.elements[14]-h.z));maxPositionError=Math.max(maxPositionError,error);assert(error<.002);assert(system.contact(h.x,h.z,h.heading));transforms++;if(frame%47)continue;const pos=mesh.geometry.attributes.position;for(let j=0;j<pos.count;j++){v.fromBufferAttribute(pos,j).applyMatrix4(matrix);const dx=v.x-h.x,dz=v.z-h.z,lx=Math.cos(h.heading)*dx-Math.sin(h.heading)*dz,lz=Math.sin(h.heading)*dx+Math.cos(h.heading)*dz,over=Math.max(Math.abs(lx)-h.width/2,Math.abs(lz)-h.length/2);maxFootprintOvershoot=Math.max(maxFootprintOvershoot,over);assert(over<.003);if(pos.getY(j)===0){const gap=v.y-groundHeight(v.x,v.z);maxBaseDaylight=Math.max(maxBaseDaylight,gap);maxBaseBurial=Math.max(maxBaseBurial,-gap);assert(gap<.001);assert(gap>-.06);}vertices++;}}}
   resources.forEach(([m,g,mat,buffer],i)=>{assert.equal(scene.group.children[i],m);assert.equal(m.geometry,g);assert.equal(m.material,mat);assert.equal(m.instanceMatrix?.array,buffer);});}
   assert.equal(scene.stats.hazards,30);assert.equal(scene.stats.movers,20);assert(scene.stats.drawCalls<=8);assert(scene.stats.triangles<10000);assert(30<=V.maximumHazards);return{frames:377,transforms,vertices,maxPositionError,maxFootprintOvershoot,maxBaseDaylight,maxBaseBurial,stats:{...scene.stats},maximumHazards:V.maximumHazards};
  }finally{scene.dispose();scene.dispose();assert.equal(scene.group.children.length,0);}
 });
 check('App menus, tab visibility, blur and overview freeze movers and bound resume time',()=>{
  const d=app.debug;let time=1000;const tick=(seconds=.05)=>{time+=seconds*1000;app.frame(time);};app.frame(time);d.gameplay.state.cooldown=0;assert(d.enterVehicle('ashhauler'));tick();tick();const system=d.roadHazards;assert(system.elapsed>0);
  let cases=0;const pause=(start,end)=>{const before=JSON.stringify(system.poses),elapsed=system.elapsed;start();for(let i=0;i<5;i++)tick(60);assert.equal(system.elapsed,elapsed);assert.equal(JSON.stringify(system.poses),before);end();tick();assert(system.elapsed<=elapsed+.05+1e-8);tick();assert(system.elapsed>elapsed);cases++;};
  pause(()=>d.setUpgradeMenu(true),()=>d.setUpgradeMenu(false));pause(()=>d.setBiomeMenu(true),()=>d.setBiomeMenu(false));pause(()=>d.setDriving(false,false),()=>d.setDriving(true,false));pause(()=>app.win.dispatch('blur'),()=>app.win.dispatch('focus'));pause(()=>{app.doc.hidden=true;app.doc.dispatch('visibilitychange')},()=>{app.doc.hidden=false;app.doc.dispatch('visibilitychange')});
  const elapsed=system.elapsed;tick(3600);near(system.elapsed,elapsed+.05);const money=d.gameplay.state.money,brains=d.gameplay.state.brains;d.returnToGarage();near(system.elapsed,0);assert.equal(d.gameplay.state.money,money);assert.equal(d.gameplay.state.brains,brains);return{pauseModes:cases,appDeltaCap:.05,resetOnGarage:true};
 });
}finally{app?.dispose();}
report.runtimeHashesAtEnd=hashes();report.changedDuringRun=Object.keys(report.runtimeHashes).filter(f=>report.runtimeHashes[f]!==report.runtimeHashesAtEnd[f]);report.passed=report.failures.length===0&&report.changedDuringRun.length===0;report.complete=true;
fs.writeFileSync(new URL('review-eight-second-crossings.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failures:report.failures,changedDuringRun:report.changedDuringRun},null,2));process.exitCode=report.passed?0:1;
