#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {VEHICLE_CONFIG,BIOME_SEQUENCE,ECONOMY_CONFIG,DELIVERY_CHECKPOINTS} from '../dist/economy-config.js';
import {UPGRADE_STATS,UPGRADE_MAX_LEVEL,sanitizeVehicleUpgrades,sanitizeUpgradeLevels,getUpgradeModifiers,getVehiclePerformance,getUpgradeOffer} from '../dist/vehicle-upgrades.js';
import {createDrivingModel,roadWheelTarget,VEHICLE_DYNAMICS as P} from '../dist/driving-model.js';
import {surfaceForBiome,biomeSurfaceAt,SURFACE_BOUNDS} from '../dist/biome-surfaces.js';
import {ROUTE_STATIONS,routeGrade,routePointAtDistance,projectRoad,truckInRoad,corridorContact} from '../dist/road-layout.js';
import {roadGroundSurface,roadGroundGradient} from '../dist/driving-ground.js';
const DT=P.fixedStep, FULL=Object.freeze({speed:3,handling:3,grip:3,fuel:3}),ZERO=Object.freeze({speed:0,handling:0,grip:0,fuel:0});
const near=(a,b,eps=1e-9,label='')=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=eps,`${label}: ${a} != ${b}`);
const run=(m,t,fps=120,onFrame=()=>{})=>{let distance=0;for(let i=0;i<Math.round(t*fps);i++){m.step(1/fps);distance+=m.state.pathDistance;onFrame(m.state);}return distance;};
const make=(v,b,levels=ZERO,extra={})=>createDrivingModel({x:0,z:0,vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>levels,groundSurface:()=>surfaceForBiome(b,v.id),...extra});
const finite=s=>{for(const [key,v]of Object.entries(s))if(typeof v==='number')assert.ok(Number.isFinite(v),key);};
const side=s=>Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ;
const slip=s=>Math.abs(Math.atan2(side(s),Math.abs(s.speed)));
const energy=s=>.5*P.mass*(s.velocityX**2+s.velocityZ**2)+.5*P.yawInertia*s.angularVelocity**2;
const tier=id=>BIOME_SEQUENCE.findIndex(b=>b.id===id);
const matrix=[];let checks=0;
const check=(label,fn)=>{const result=fn();checks++;console.log(`PASS ${label}${result?`: ${JSON.stringify(result)}`:''}`);};
const report={scope:'Actual fixed-step four-tire model; renderer-free, no browser/GPU/human playtest claim.',matrix};

check('All offers are explicit, bounded, affordable-scale and descriptor-safe',()=>{
  assert.equal(ECONOMY_CONFIG.saveVersion,2);assert.equal(ECONOMY_CONFIG.saveKey,'urban-route-career-v1');
  assert.deepEqual(UPGRADE_STATS.map(s=>s.id),['speed','handling','grip','fuel']);assert.equal(UPGRADE_MAX_LEVEL,3);
  let invoked=0;const hostile=Object.create({pickup:FULL});Object.defineProperty(hostile,'pickup',{get(){invoked++;return FULL;}});
  const hostileLevels=Object.create(FULL);Object.defineProperty(hostileLevels,'speed',{get(){invoked++;return 3;}});
  assert.deepEqual(sanitizeUpgradeLevels(hostileLevels),ZERO);assert.deepEqual(sanitizeVehicleUpgrades(hostile).pickup,ZERO);assert.equal(invoked,0);
  for(const input of [null,undefined,[],NaN,'3',{unknown:FULL},hostile]){
    const clean=sanitizeVehicleUpgrades(input);assert.deepEqual(Object.keys(clean),VEHICLE_CONFIG.map(v=>v.id));assert.deepEqual(sanitizeVehicleUpgrades(clean),clean);
  }
  assert.deepEqual(sanitizeUpgradeLevels({speed:99,handling:-8,grip:2.9}),{speed:3,handling:0,grip:2,fuel:0});
  for(const input of [{speed:NaN,handling:Infinity,grip:'3'},{speed:{valueOf(){throw Error('must not coerce');}}}])assert.deepEqual(sanitizeUpgradeLevels(input),ZERO);
  assert.deepEqual(getUpgradeModifiers(FULL),{speed:1.06,engine:1.06,handling:1.06,grip:1.06,fuel:1.06});
  for(const v of VEHICLE_CONFIG)for(const stat of UPGRADE_STATS){let last=0;for(let level=0;level<=3;level++){
    const offer=getUpgradeOffer(v.id,stat.id,{[stat.id]:level});assert.equal(offer.level,level);assert.equal(offer.maxed,level===3);assert.equal(offer.nextLevel,Math.min(3,level+1));
    if(level<3){assert.ok(offer.price>last&&offer.price<=185);assert.ok(offer.next>offer.current);last=offer.price;}
    else{assert.equal(offer.price,null);assert.equal(offer.next,offer.current);}
  }}
  assert.equal(getUpgradeOffer('unknown','speed',{}),null);assert.equal(getUpgradeOffer('pickup','unknown',{}),null);
  for(let i=1;i<VEHICLE_CONFIG.length;i++){
    const old=getVehiclePerformance(VEHICLE_CONFIG[i-1].id,FULL),next=getVehiclePerformance(VEHICLE_CONFIG[i].id,ZERO);
    for(const key of ['maxSpeed','acceleration','handling','grip','range'])assert.ok(next[key]>old[key],`${key}: next stock beats previous maximum`);
    assert.ok(next.steeringResponseSeconds<old.steeringResponseSeconds);
  }
});

function measure(v,b,levels){
  const m=make(v,b,levels);m.setInput({active:true});run(m,1);const launch=m.state.speed;run(m,39);const top=m.state.speed;
  near(top,v.maxSpeed*getUpgradeModifiers(levels).speed*surfaceForBiome(b,v.id).speedFactor,2e-8,`${v.id}/${b} governed speed`);
  const n=make(v,b,levels);n.state.velocityZ=-1.5;n.setInput({active:true});n.setGear('R');let braking=0,brakeTime=0;
  while(n.state.velocityZ<0&&brakeTime<2){n.step(DT);braking+=n.state.pathDistance;brakeTime+=DT;finite(n.state);}assert.ok(brakeTime<1);
  const s=make(v,b,levels);Object.assign(s.state,{velocityX:.6,velocityZ:-1.5});let slide=0,last=energy(s.state),recovery=null;
  for(let i=0;i<3600;i++){const x=s.state.x;s.step(DT);slide+=Math.abs(s.state.x-x);const e=energy(s.state);assert.ok(e<=last+1e-7,`${v.id}/${b}: no passive energy creation`);last=e;if(recovery===null&&Math.abs(side(s.state))<.05)recovery=(i+1)*DT;}
  assert.equal(s.state.moving,false);assert.ok(recovery!==null);
  const h=make(v,b,levels);h.setInput({active:false,steering:.8});h.step(DT);
  const response=Math.abs(h.state.frontWheelAngle/roadWheelTarget(.8,0));
  return {car:v.id,biome:b,upgraded:levels===FULL,launchSpeed1sMps:launch,terminalSpeedMps:top,brakeDistanceM:braking,brakeTimeS:brakeTime,lateralSlideM:slide,lateralRecoveryS:recovery,rackResponseFractionOneStep:response};
}
check('100 base/max car-biome combinations improve real launch, speed, rack response, braking and lateral recovery',()=>{
  for(const v of VEHICLE_CONFIG)for(const b of BIOME_SEQUENCE){const stock=measure(v,b.id,ZERO),max=measure(v,b.id,FULL);matrix.push(stock,max);
    for(const key of ['launchSpeed1sMps','terminalSpeedMps','rackResponseFractionOneStep'])assert.ok(max[key]>stock[key],`${v.id}/${b.id}/${key}`);
    for(const key of ['brakeDistanceM','lateralSlideM'])assert.ok(max[key]<stock[key],`${v.id}/${b.id}/${key}`);
    assert.ok(max.lateralRecoveryS<=stock.lateralRecoveryS);
  }
  return {combinations:matrix.length,maxSpeedMps:Math.max(...matrix.map(r=>r.terminalSpeedMps))};
});
check('Every stock next car beats the previous fully upgraded car in its target and every earlier biome',()=>{
  let minimumSpeedAdvantage=Infinity,minimumLaunchAdvantage=Infinity,minimumBrakeImprovement=Infinity,minimumSlideImprovement=Infinity,comparisons=0;
  for(let i=1;i<VEHICLE_CONFIG.length;i++){const next=VEHICLE_CONFIG[i],previous=VEHICLE_CONFIG[i-1];for(const b of BIOME_SEQUENCE.filter(b=>tier(b.id)<=tier(next.specialty))){
    const a=matrix.find(r=>r.car===previous.id&&r.biome===b.id&&r.upgraded),n=matrix.find(r=>r.car===next.id&&r.biome===b.id&&!r.upgraded);comparisons++;
    for(const key of ['launchSpeed1sMps','terminalSpeedMps','rackResponseFractionOneStep'])assert.ok(n[key]>a[key],`${previous.id} max vs ${next.id} stock/${b.id}/${key}`);
    for(const key of ['brakeDistanceM','lateralSlideM'])assert.ok(n[key]<a[key],`${previous.id} max vs ${next.id} stock/${b.id}/${key}`);
    assert.ok(n.lateralRecoveryS<=a.lateralRecoveryS);
    minimumSpeedAdvantage=Math.min(minimumSpeedAdvantage,n.terminalSpeedMps/a.terminalSpeedMps-1);minimumLaunchAdvantage=Math.min(minimumLaunchAdvantage,n.launchSpeed1sMps/a.launchSpeed1sMps-1);
    minimumBrakeImprovement=Math.min(minimumBrakeImprovement,1-n.brakeDistanceM/a.brakeDistanceM);minimumSlideImprovement=Math.min(minimumSlideImprovement,1-n.lateralSlideM/a.lateralSlideM);
  }}
  return report.dominance={comparisons,minimumSpeedAdvantage,minimumLaunchAdvantage,minimumBrakeImprovement,minimumSlideImprovement};
});
check('Driving upgrades act through physical forces; tank upgrades extend range without changing consumption',()=>{
  for(const v of VEHICLE_CONFIG){const base=measure(v,v.specialty,ZERO),speed=measure(v,v.specialty,{speed:3}),handling=measure(v,v.specialty,{handling:3}),grip=measure(v,v.specialty,{grip:3});
    assert.ok(speed.terminalSpeedMps>base.terminalSpeedMps&&speed.launchSpeed1sMps>base.launchSpeed1sMps);
    assert.ok(handling.rackResponseFractionOneStep>base.rackResponseFractionOneStep);near(handling.terminalSpeedMps,base.terminalSpeedMps);
    assert.ok(grip.brakeDistanceM<base.brakeDistanceM&&grip.lateralSlideM<base.lateralSlideM);near(grip.terminalSpeedMps,base.terminalSpeedMps);
    const before=getVehiclePerformance(v.id,ZERO),after=getVehiclePerformance(v.id,FULL);for(const key of ['range','capacity'])near(after[key],before[key]*1.06);assert.equal(before.consumption,after.consumption);
    for(const levels of [{speed:3},{handling:3},{grip:3}])for(const key of ['range','capacity','consumption'])assert.equal(getVehiclePerformance(v.id,levels)[key],before[key]);
    let levels=ZERO;const m=make(v,v.specialty,ZERO,{getUpgrades:()=>levels});m.setInput({active:true});run(m,4);const state={...m.state};levels=FULL;assert.deepEqual(m.state,state);m.step(0);for(const key of ['x','z','heading','velocityX','velocityZ','wheelSpin'])assert.equal(m.state[key],state[key]);
    m.step(DT);assert.ok(m.state.speed>state.speed);assert.ok(m.state.pathDistance<40*DT);assert.ok(Math.abs(m.state.speed-state.speed)<.2);
  }
});

check('Maximum upgrades retain finite stable D/R turns, recovery, gradual gear interlocks and maximum-grade progress',()=>{
  const maxGrade=Math.max(...ROUTE_STATIONS.flatMap((y,i)=>i?[y,(ROUTE_STATIONS[i-1]+y)/2]:[y]).map(y=>Math.abs(routeGrade(y))));
  let maxSlip=0,maxYaw=0,maxVelocityStep=0,minGradeSpeed=Infinity;
  for(const v of VEHICLE_CONFIG)for(const b of BIOME_SEQUENCE)for(const gear of ['D','R']){
    const direction=gear==='D'?1:-1,m=make(v,b.id,FULL);m.setGear(gear);m.setInput({active:true,steering:.8});
    for(let i=0;i<960;i++){m.step(DT);finite(m.state);maxSlip=Math.max(maxSlip,slip(m.state));maxYaw=Math.max(maxYaw,Math.abs(m.state.angularVelocity));assert.ok(slip(m.state)<.27);assert.ok(Math.abs(m.state.angularVelocity)<.95);}
    m.setInput({active:true});run(m,4);assert.ok(slip(m.state)<.003);assert.ok(Math.abs(m.state.angularVelocity)<.004);
    const oldSpeed=m.state.speed;m.setGear(gear==='D'?'R':'D');assert.equal(m.state.speed,oldSpeed);let crossed=false,min=Math.abs(oldSpeed);
    for(let i=0;i<1200;i++){const old={...m.state};m.step(DT);finite(m.state);const dv=Math.hypot(m.state.velocityX-old.velocityX,m.state.velocityZ-old.velocityZ);maxVelocityStep=Math.max(maxVelocityStep,dv);assert.ok(dv<.27);min=Math.min(min,Math.abs(m.state.speed));if(m.state.speed*direction<0)crossed=true;}
    assert.ok(crossed&&min<.08);
    const slope=make(v,b.id,FULL,{groundGradient:()=>({x:0,z:-maxGrade*direction})});slope.setGear(gear);slope.setInput({active:true});run(slope,20);assert.ok(slope.state.speed*direction>1);minGradeSpeed=Math.min(minGradeSpeed,slope.state.speed*direction);
  }
  return report.safety={maxSlipDegrees:maxSlip*180/Math.PI,maxYawRadS:maxYaw,maxVelocityStepMps:maxVelocityStep,maximumGradePercent:maxGrade*100,minGradeSpeedMps:minGradeSpeed};
});
check('Max-upgrade 30/60/120Hz timing, stalls, malformed upgrade callbacks and high-speed wall sweeps are safe',()=>{
  for(const v of VEHICLE_CONFIG)for(const b of BIOME_SEQUENCE){const results=[];for(const fps of [30,60,120]){
    const m=make(v,b.id,FULL);let distance=0,movingSeconds=0;for(const [seconds,gear,steering,active]of [[2,'D',.8,true],[3,'R',0,true],[2,'D',-.5,true],[2,'D',0,false]]){m.setGear(gear);m.setInput({active,steering});distance+=run(m,seconds,fps,s=>movingSeconds+=s.movingSeconds);}results.push({...m.state,pathDistance:distance,travel:0,movingSeconds});
  }for(const r of results.slice(1))for(const [key,value]of Object.entries(r))if(typeof value==='number')near(value,results[0][key],1e-9,`${v.id}/${b.id}/${key}`);
    const a=make(v,b.id,FULL),c=make(v,b.id,FULL);for(const m of [a,c])m.setInput({active:true,steering:.4});a.step(9);c.step(.1);assert.deepEqual(a.state,c.state);
  }
  for(const bad of [()=>({speed:NaN,handling:Infinity,grip:-10}),()=>{throw Error('bad callback');},null]){const m=createDrivingModel({getUpgrades:bad});m.setInput({active:true,steering:.5});run(m,5);finite(m.state);}
  const v=VEHICLE_CONFIG.at(-1);let calls=0;const wall=make(v,'city',FULL,{z:25,contact:(x,z)=>{calls++;return z<P.halfLength?{depth:P.halfLength-z,normalX:0,normalZ:1}:undefined;}});wall.state.velocityZ=-getVehiclePerformance(v.id,FULL).maxSpeed;wall.setInput({active:true});run(wall,2,30);assert.ok(wall.state.z>=P.halfLength);assert.ok(calls>240);assert.ok(Math.abs(wall.state.speed)<1e-8);
});
check('Actual movement time is refresh-independent and cannot replay idle or wall-contact earnings',()=>{
  const times=[];
  for(const fps of [30,60,120,144,240]){const m=make(VEHICLE_CONFIG[0],'city',FULL);let movingSeconds=0,distance=0,emptyFrames=0;
    for(const [seconds,active]of [[2,true],[2,false],[2,true]]){m.setInput({active});distance+=run(m,seconds,fps,s=>{movingSeconds+=s.movingSeconds;if(!s.pathDistance){emptyFrames++;assert.equal(s.movingSeconds,0);}});}
    times.push({fps,movingSeconds,distance,emptyFrames});
    for(const dt of [0,NaN,Infinity,-1]){m.step(dt);assert.equal(m.state.movingSeconds,0);}
    m.pause();assert.equal(m.state.movingSeconds,0);m.reset();assert.equal(m.state.movingSeconds,0);
  }
  for(const r of times){near(r.movingSeconds,times[0].movingSeconds,1e-9);near(r.distance,times[0].distance,1e-9);}
  assert.ok(times.at(-1).emptyFrames>100);
  const m=make(VEHICLE_CONFIG.at(-1),'city',FULL,{z:P.halfLength,contact:(x,z)=>z<P.halfLength?{depth:P.halfLength-z,normalX:0,normalZ:1}:undefined});m.setInput({active:true});let moving=0;run(m,10,240,s=>moving+=s.movingSeconds);assert.equal(moving,0);
  return report.movementTiming=times;
});
check('Maximum upgrades cross all biome boundaries without discontinuities, including reverse',()=>{
  for(const v of VEHICLE_CONFIG)for(const boundary of SURFACE_BOUNDS)for(const gear of ['D','R']){
    const direction=gear==='D'?1:-1,m=make(v,'city',FULL,{z:-(boundary-30*direction),groundSurface:(x,z)=>biomeSurfaceAt(-z,v.id)});m.setGear(gear);m.setInput({active:true});for(let i=0;i<4800;i++){const speed=m.state.velocityZ;m.step(DT);finite(m.state);assert.ok(Math.abs(m.state.velocityZ-speed)<.2);assert.ok(m.state.speed*direction>0);}assert.ok((-m.state.z-boundary)*direction>24);
  }
});


if(process.argv.includes('--route-check'))check('All ten maximum-upgrade vehicles follow the real route and fuel checkpoint spacing',()=>{
  const rows=[];
  for(const v of VEHICLE_CONFIG){
    const performance=getVehiclePerformance(v.id,FULL);let previous=0,targetIndex=-1;for(let i=0;i<DELIVERY_CHECKPOINTS.length;i++){if(DELIVERY_CHECKPOINTS[i].distance-previous>performance.range)break;targetIndex=i;previous=DELIVERY_CHECKPOINTS[i].distance;}
    const target=DELIVERY_CHECKPOINTS[targetIndex];assert.ok(target);
    const m=make(v,'city',FULL,{x:0,z:6,groundSurface:roadGroundSurface,groundGradient:roadGroundGradient,contact:corridorContact});
    const stations=DELIVERY_CHECKPOINTS.map(p=>{const q=routePointAtDistance(p.distance);return {...p,x:q.x+8*q.right.x,z:q.z+8*q.right.z};});
    let fuel=performance.capacity,distance=0,frames=0,refills=new Set(),maximumStep=0;
    while(projectRoad(m.state.x,m.state.z).distance<target.distance-4.4&&frames<30000){
      const state=m.state,projection=projectRoad(state.x,state.z),lookAhead=12+Math.abs(state.speed)*.65,next=routePointAtDistance(projection.distance+lookAhead);
      const dx=next.x+8*next.right.x-state.x,dz=next.z+8*next.right.z-state.z,desired=Math.atan2(-dx,-dz);
      const error=Math.atan2(Math.sin(desired-state.heading),Math.cos(desired-state.heading));
      const desiredWheel=Math.atan(2*3.2*Math.sin(error)/Math.hypot(dx,dz));
      const ground=roadGroundSurface(state.x,state.z,v.id),gripScale=Math.sqrt(Math.min(1,ground.frictionFactor*1.06));
      const response=Math.min(1,Math.abs(desiredWheel)*(1+(state.linearSpeed/(gripScale*P.steeringSpeedScale))**2)/.48);
      const magnitude=(-.55+Math.sqrt(.55*.55+1.8*response))/.9;
      m.setInput({active:true,steering:-Math.sign(desiredWheel)*(.08+.92*magnitude)});m.step(.05);frames++;
      finite(state);assert.ok(truckInRoad(state.x,state.z,state.heading),`${v.id}: complete footprint stays on route`);assert.equal(state.blocked,false,`${v.id}: no barrier assistance`);
      distance+=state.pathDistance;maximumStep=Math.max(maximumStep,state.pathDistance);assert.ok(state.pathDistance<(getVehiclePerformance(v.id,FULL).maxSpeed+.5)*.05);
      fuel-=state.pathDistance*v.consumption;
      for(const station of stations)if(Math.hypot(state.x-station.x,state.z-station.z)<4.4){fuel=performance.capacity;refills.add(station.id);}
      assert.ok(fuel>0,`${v.id}: actual travel must fit upgraded tank ranges`);
    }
    assert.ok(frames<30000,`${v.id}: reaches target`);assert.ok(refills.size>=targetIndex,`${v.id}: visits intervening fuel stations`);
    rows.push({car:v.id,target:target.distance,frames,seconds:frames*.05,distance,refills:refills.size,maximumStep});
  }
  report.routes=rows;return rows;
});
report.passed=true;report.groups=checks;const at=process.argv.indexOf('--report-dir');if(at>=0){const dir=path.resolve(process.argv[at+1]);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'vehicle-upgrades-measurements.json'),JSON.stringify(report,null,2)+'\n');}
console.log(`\n${checks} upgrade groups passed; ${matrix.length} measured combinations. No browser/GPU claim.`);
