#!/usr/bin/env node



import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDrivingModel, evaluateVehicleForces, roadWheelTarget, VEHICLE_DYNAMICS as P } from '../dist/driving-model.js';
import { VEHICLE_CONFIG, BIOME_SEQUENCE } from '../dist/economy-config.js';
import { ROUTE_STATIONS, routeGrade } from '../dist/road-layout.js';
import { surfaceForBiome, VEHICLE_SURFACE_PROFILES, CITY_SURFACE, SURFACE_BOUNDS, biomeSurfaceAt } from '../dist/biome-surfaces.js';

const near = (a, b, tolerance = 1e-9, label = '') => assert.ok(Number.isFinite(a) && Math.abs(a-b) <= tolerance, `${label}: ${a} != ${b} ± ${tolerance}`);
const COMMON_SPEED = 1.5;
const DT = P.fixedStep;
const make = (v, biome, extra = {}) => createDrivingModel({ x:0, z:0, vehicleId:v.id, maxSpeed:v.maxSpeed,
  groundSurface:()=>surfaceForBiome(biome, v.id), ...extra });
const run = (m, seconds, fps = 120) => {
  let distance=0, travel=0, movingSeconds=0;
  for(let i=0;i<Math.round(seconds*fps);i++) { m.step(1/fps); distance+=m.state.pathDistance; travel+=m.state.travel; movingSeconds+=m.state.movingSeconds; }
  return { distance, travel, movingSeconds };
};
const sideSpeed = s => Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ;
const slip = s => Math.abs(Math.atan2(sideSpeed(s),Math.abs(s.speed)));
const energy = s => .5*P.mass*(s.velocityX**2+s.velocityZ**2)+.5*P.yawInertia*s.angularVelocity**2;
const assertFinite = s => { for(const [key,value] of Object.entries(s)) if(typeof value==='number') assert.ok(Number.isFinite(value), key); };
const biomeIndex = id => BIOME_SEQUENCE.findIndex(b=>b.id===id);
let groups=0;
const check=(name,fn)=>{const result=fn();groups++;console.log(`PASS ${name}${result?`: ${JSON.stringify(result)}`:''}`);};
const matrix=[];
const report={ scope:'Renderer-free real fixed-step solver; no browser, GPU, touch, or subjective playtest claim.',
  method:{ commonSpeedMps:COMMON_SPEED, launch:'Speed after 1 s and 2 s from rest under held throttle.',
    terminal:'40 s on a constant flat surface; compare actual speed with immutable nominal speed × surface speed factor.',
    braking:'D/R interlock from a matched, previously verified attainable 1.5 m/s. Distance until velocity changes sign.',
    turn:'Actual tire-generated angular acceleration at 1.5 m/s, steering 0.8, production grip-aware D rack angle, coasting.',
    slide:'Released car enters at 1.5 m/s forward + 0.6 m/s sideways; measure lateral path until rest.',
    stability:'8 s held 0.8 steering in both gears, then 4 s straight recovery, then a brake-interlocked gear reversal.',
    grade:'All 50 profiles face the maximum actual route grade as a conservative constant uphill, in both D and R.',
    timing:'Identical input program at 30/60/120 Hz; 3 s stall compared against the existing 0.1 s / 12-substep budget.' }, matrix };

check('All 50 explicit profiles preserve ordered IDs, strict stock progression and halved pickup/city baseline',()=>{
  assert.deepEqual(VEHICLE_CONFIG.map(v=>v.id),['pickup','citycourier','rover','foresthauler','van','desertscout','snowgrip','snowrunner','lavacrawler','ashhauler']);
  for(let i=1;i<VEHICLE_CONFIG.length;i++)for(const key of ['price','maxSpeed','range','acceleration','handling','grip'])assert.ok(VEHICLE_CONFIG[i][key]>VEHICLE_CONFIG[i-1][key],`${key}: next bay improves`);
  assert.deepEqual(surfaceForBiome('city','pickup'),{...CITY_SURFACE,frictionFactor:.5,lateralDampingFactor:.5});
  for(const v of VEHICLE_CONFIG){
    assert.equal(v.consumption,v.capacity/v.range);
    assert.deepEqual(Object.keys(VEHICLE_SURFACE_PROFILES[v.id]),BIOME_SEQUENCE.map(b=>b.id));
    for(const b of BIOME_SEQUENCE)assert.equal(Object.hasOwn(VEHICLE_SURFACE_PROFILES[v.id][b.id],'fuelFactor'),false);
  }
  const original=createDrivingModel({x:0,z:0,groundSurface:()=>surfaceForBiome('city','pickup')}), current=make(VEHICLE_CONFIG[0],'city');
  for(const m of [original,current])m.setInput({active:true,steering:.45});
  for(let i=0;i<1200;i++){original.step(DT);current.step(DT);assert.deepEqual(current.state,original.state);}
});

check('50-combination launch, terminal, common-speed braking, turn response and slip measurements',()=>{
  for(const v of VEHICLE_CONFIG)for(const b of BIOME_SEQUENCE){
    const label=`${v.id}/${b.id}`,surface=surfaceForBiome(b.id,v.id),m=make(v,b.id);
    m.setInput({active:true});run(m,1);const speed1=m.state.speed;run(m,1);const speed2=m.state.speed;
    run(m,38);const top=m.state.speed;
    near(top,v.maxSpeed*surface.speedFactor,1e-8,label);
    assert.ok(top>COMMON_SPEED,`${label}: common measurement speed must be attainable`);
    assert.ok(speed1>.7&&speed1<22);assertFinite(m.state);
    const brakes=[];
    for(const gear of ['D','R']){
      const direction=gear==='D'?1:-1,n=make(v,b.id);
      n.setGear(gear);n.setInput({active:true});
      let elapsed=0;
      while(n.state.speed*direction<COMMON_SPEED&&elapsed<10){n.step(DT);elapsed+=DT;}
      assert.ok(elapsed<10,`${label}: attain reference speed`);


      n.state.velocityZ=-COMMON_SPEED*direction;n.state.velocityX=0;
      n.setGear(gear==='D'?'R':'D');
      let seconds=0,distance=0;
      while(n.state.velocityZ*direction<0&&seconds<5){n.step(DT);seconds+=DT;distance+=n.state.pathDistance;assertFinite(n.state);}
      assert.ok(seconds<2,`${label}: brake safely`);brakes.push({gear,distance,seconds});
    }
    near(brakes[0].distance,brakes[1].distance);near(brakes[0].seconds,brakes[1].seconds);
    const rack=roadWheelTarget(.8,COMMON_SPEED/Math.sqrt(Math.min(1,surface.frictionFactor)));
    const forces=evaluateVehicleForces({heading:0,velocityX:0,velocityZ:-COMMON_SPEED,angularVelocity:0,
      frontWheelAngle:rack,gear:'D',active:false},{surface,maxSpeed:v.maxSpeed});
    for(const tire of forces.tires)assert.ok(Math.hypot(tire.forceX,tire.forceZ)<=tire.grip+1e-8);
    assert.ok(forces.torque<0,`${label}: expected steering direction`);
    const n=make(v,b.id);Object.assign(n.state,{velocityX:.6,velocityZ:-COMMON_SPEED});
    let lateralDistance=0,lateralRecoverySeconds=null,previousEnergy=energy(n.state);
    for(let i=0;i<3600;i++){
      const x=n.state.x;n.step(DT);lateralDistance+=Math.abs(n.state.x-x);
      if(lateralRecoverySeconds===null&&Math.abs(sideSpeed(n.state))<.05)lateralRecoverySeconds=(i+1)*DT;
      const current=energy(n.state);assert.ok(current<=previousEnergy+1e-7,`${label}: no passive energy gain`);previousEnergy=current;
    }
    assert.equal(n.state.moving,false,`${label}: passive motion settles`);
    assert.ok(lateralRecoverySeconds!==null);
    matrix.push({car:v.id,biome:b.id,tier:v.specialty,relativeTier:biomeIndex(b.id)-biomeIndex(v.specialty),
      nominalSpeedMps:v.maxSpeed,profile:surface,launchSpeed1sMps:speed1,launchSpeed2sMps:speed2,
      terminalSpeedMps:top,nominalSpeedRatio:top/v.maxSpeed,
      brakeDistanceM:brakes[0].distance,brakeTimeS:brakes[0].seconds,
      commonSpeedTurnAccelerationRadS2:Math.abs(forces.torque)/P.yawInertia,
      lateralSlideM:lateralDistance,lateralRecoveryS:lateralRecoverySeconds});
  }
  return {combinations:matrix.length,minimumTerminalMps:Math.min(...matrix.map(r=>r.terminalSpeedMps))};
});

check('Own biome is fastest; all earlier terrain is good; every later tier is objectively poor',()=>{
  let maximumNextLaunchRatio=0,maximumNextSpeedRatio=0,minimumNextBrakeRatio=Infinity,minimumNextSlideRatio=Infinity;
  for(const v of VEHICLE_CONFIG){
    const rows=matrix.filter(r=>r.car===v.id),own=rows.find(r=>r.biome===v.specialty);
    for(const r of rows){
      if(r.relativeTier===0){near(r.nominalSpeedRatio,1,1e-9);continue;}
      const launchRatio=r.launchSpeed1sMps/own.launchSpeed1sMps;
      if(r.relativeTier<0){
        assert.ok(r.nominalSpeedRatio>=.9-1e-9,`${r.car}/${r.biome}: useful earlier top speed`);
        assert.ok(launchRatio>=.82&&launchRatio<1.03,`${r.car}/${r.biome}: strong earlier acceleration, own tier best`);
        assert.ok(r.profile.frictionFactor>=.41);
        assert.ok(r.brakeDistanceM<=own.brakeDistanceM*1.1);
        assert.ok(r.lateralSlideM<.05,`${r.car}/${r.biome}: earlier surface stays planted`);
      }else{
        assert.ok(r.nominalSpeedRatio<=.42+1e-9);
        assert.ok(launchRatio<.42,`${r.car}/${r.biome}: substantial acceleration penalty`);
        assert.ok(r.brakeDistanceM>own.brakeDistanceM*2.25,`${r.car}/${r.biome}: real braking penalty`);
        assert.ok(r.lateralSlideM>own.lateralSlideM*4,`${r.car}/${r.biome}: reduced lateral control`);
        assert.ok(r.commonSpeedTurnAccelerationRadS2<own.commonSpeedTurnAccelerationRadS2*.25,`${r.car}/${r.biome}: reduced matched-speed steering response`);
        if(r.relativeTier===1){
          maximumNextLaunchRatio=Math.max(maximumNextLaunchRatio,launchRatio);
          maximumNextSpeedRatio=Math.max(maximumNextSpeedRatio,r.nominalSpeedRatio);
          minimumNextBrakeRatio=Math.min(minimumNextBrakeRatio,r.brakeDistanceM/own.brakeDistanceM);
          minimumNextSlideRatio=Math.min(minimumNextSlideRatio,r.lateralSlideM/own.lateralSlideM);
        }
      }
    }
  }


  for(const b of BIOME_SEQUENCE){const [first,next]=VEHICLE_CONFIG.filter(v=>v.specialty===b.id);
    assert.ok(next.range>first.range);assert.ok(surfaceForBiome(b.id,next.id).frictionFactor>surfaceForBiome(b.id,first.id).frictionFactor);
    assert.ok(surfaceForBiome(b.id,next.id).lateralDampingFactor>surfaceForBiome(b.id,first.id).lateralDampingFactor);
  }
  report.progression={maximumNextLaunchRatio,maximumNextSpeedRatio,minimumNextBrakeRatio,minimumNextSlideRatio};
  return report.progression;
});

check('Both gears retain controlled held turns, recovery and gradual brake-before-reverse across all 50 profiles',()=>{
  for(const row of matrix){const v=VEHICLE_CONFIG.find(v=>v.id===row.car);let maxSlip=0,maxYaw=0,maxStep=0,maxReverseTime=0;
    for(const gear of ['D','R']){
      const m=make(v,row.biome),direction=gear==='D'?1:-1;m.setGear(gear);m.setInput({active:true,steering:.8});
      for(let i=0;i<960;i++){m.step(DT);assertFinite(m.state);maxSlip=Math.max(maxSlip,slip(m.state));maxYaw=Math.max(maxYaw,Math.abs(m.state.angularVelocity));}
      assert.ok(maxSlip<.27);assert.ok(maxYaw<.95);assert.equal(Math.sign(m.state.speed),direction);assert.equal(Math.sign(m.state.angularVelocity),-direction);
      m.setInput({active:true,steering:0});run(m,8);assert.ok(slip(m.state)<.003);assert.ok(Math.abs(m.state.angularVelocity)<.004);
      const before={...m.state};m.setGear(gear==='D'?'R':'D');near(m.state.speed,before.speed,0);
      let crossed=false,crossTime=0,minSpeed=Math.abs(m.state.speed);
      for(let i=0;i<1200;i++){
        const previous={...m.state};m.step(DT);assertFinite(m.state);minSpeed=Math.min(minSpeed,Math.abs(m.state.speed));
        const change=Math.hypot(m.state.velocityX-previous.velocityX,m.state.velocityZ-previous.velocityZ);maxStep=Math.max(maxStep,change);assert.ok(change<.27);
        if(!crossed&&m.state.speed*direction>=0)assert.ok(Math.abs(m.state.speed)<=Math.abs(previous.speed)+1e-6);
        if(!crossed&&m.state.speed*direction<0){crossed=true;crossTime=(i+1)*DT;}
      }
      assert.ok(crossed);assert.ok(minSpeed<.08);assert.equal(Math.sign(m.state.speed),-direction);maxReverseTime=Math.max(maxReverseTime,crossTime);
    }
    Object.assign(row,{heldTurnMaxSlipDeg:maxSlip*180/Math.PI,heldTurnMaxYawRadS:maxYaw,
      maxVelocityChangePerStepMps:maxStep,gearReverseCrossTimeS:maxReverseTime});
  }
  return {maxSlipDegrees:Math.max(...matrix.map(r=>r.heldTurnMaxSlipDeg)),maxVelocityStep:Math.max(...matrix.map(r=>r.maxVelocityChangePerStepMps))};
});

check('Every profile can recover uphill and reverse at the actual route maximum grade',()=>{

  const candidates=ROUTE_STATIONS.flatMap((y,i)=>i?[y,(ROUTE_STATIONS[i-1]+y)/2]:[y]);
  const maximum=candidates.map(y=>({y,grade:Math.abs(routeGrade(y))})).reduce((a,b)=>a.grade>b.grade?a:b);
  near(maximum.grade,.075,1e-12);
  report.maximumRouteGrade=maximum;
  for(const row of matrix){const v=VEHICLE_CONFIG.find(v=>v.id===row.car);let minSpeed=Infinity,maxRecovery=0;
    for(const gear of ['D','R']){
      const direction=gear==='D'?1:-1,extra={groundGradient:()=>({x:0,z:-maximum.grade*direction})};
      const m=make(v,row.biome,extra);m.setGear(gear);m.setInput({active:true});run(m,20);assertFinite(m.state);
      assert.ok(m.state.speed*direction>1,`${row.car}/${row.biome}/${gear}: continuous uphill progress`);minSpeed=Math.min(minSpeed,m.state.speed*direction);


      const n=make(v,row.biome,extra);n.state.velocityZ=COMMON_SPEED*direction;n.setGear(gear);n.setInput({active:true});
      let recovered=null;
      for(let i=0;i<2400;i++){const previous={...n.state};n.step(DT);assertFinite(n.state);
        assert.ok(Math.hypot(n.state.velocityX-previous.velocityX,n.state.velocityZ-previous.velocityZ)<.27);
        if(recovered===null&&n.state.speed*direction>.05)recovered=(i+1)*DT;
      }
      assert.ok(recovered!==null&&recovered<3,`${row.car}/${row.biome}/${gear}: recover from rollback`);
      assert.ok(n.state.speed*direction>1);maxRecovery=Math.max(maxRecovery,recovered);
    }
    Object.assign(row,{worstGradeSpeed20sMps:minSpeed,worstGradeRollbackRecoveryS:maxRecovery});
  }
  return {gradePercent:maximum.grade*100,minimumSpeed20sMps:Math.min(...matrix.map(r=>r.worstGradeSpeed20sMps)),maxRollbackRecoveryS:Math.max(...matrix.map(r=>r.worstGradeRollbackRecoveryS))};
});

const timingProgram=(v,b,fps)=>{
  const m=make(v,b);let distance=0,travel=0,movingSeconds=0;
  for(const [seconds,gear,steering,active] of [[2,'D',0,true],[2,'D',.7,true],[3,'R',0,true],[3,'D',-.5,true],[2,'D',0,false]]){
    m.setGear(gear);m.setInput({active,steering});const r=run(m,seconds,fps);distance+=r.distance;travel+=r.travel;movingSeconds+=r.movingSeconds;
  }
  return {...m.state,pathDistance:distance,travel,movingSeconds};
};
check('30/60/120 Hz, long stalls and invalid frame durations agree for all 50 profiles',()=>{
  for(const row of matrix){const v=VEHICLE_CONFIG.find(v=>v.id===row.car),reference=timingProgram(v,row.biome,120);let maximumError=0;
    for(const fps of [30,60])for(const [key,value] of Object.entries(timingProgram(v,row.biome,fps))){
      if(typeof value==='number'){maximumError=Math.max(maximumError,Math.abs(value-reference[key]));near(value,reference[key],1e-9,`${row.car}/${row.biome}/${fps}/${key}`);}
      else assert.equal(value,reference[key]);
    }
    const a=make(v,row.biome),b=make(v,row.biome);for(const m of [a,b]){m.setInput({active:true,steering:.5});run(m,2);}
    a.step(3);b.step(.1);assert.deepEqual(a.state,b.state);
    const pose={x:a.state.x,z:a.state.z,heading:a.state.heading};
    for(const dt of [0,-1,NaN,Infinity]){a.step(dt);assert.equal(a.state.pathDistance,0);assert.equal(a.state.travel,0);for(const key of Object.keys(pose))near(a.state[key],pose[key],0);}
    a.step(DT);b.step(DT);assert.deepEqual(a.state,b.state);
    row.maxFrameRateStateDifference=maximumError;row.stallBudgetVerified=true;
  }
  return {maximumStateDifference:Math.max(...matrix.map(r=>r.maxFrameRateStateDifference)),combinations:matrix.length};
});

check('All cars cross every 48 m transition in D and R without freezing or velocity impulses',()=>{
  let maximumVelocityStep=0;
  for(const v of VEHICLE_CONFIG)for(const boundary of SURFACE_BOUNDS)for(const gear of ['D','R']){
    const direction=gear==='D'?1:-1,start=boundary-30*direction;
    const m=make(v,'city',{z:-start,groundSurface:(x,z)=>biomeSurfaceAt(-z,v.id)});m.setGear(gear);m.setInput({active:true});
    for(let i=0;i<4800;i++){
      const previous=m.state.velocityZ;m.step(DT);assertFinite(m.state);
      maximumVelocityStep=Math.max(maximumVelocityStep,Math.abs(m.state.velocityZ-previous));
      assert.ok(Math.abs(m.state.velocityZ-previous)<.18,`${v.id}/${boundary}/${gear}: no boundary impulse`);
      assert.ok(m.state.speed*direction>0,`${v.id}/${boundary}/${gear}: no freeze or wrong-way motion`);
    }
    assert.ok((-m.state.z-boundary)*direction>24,`${v.id}/${boundary}/${gear}: complete transition`);
  }
  report.transitions={count:VEHICLE_CONFIG.length*SURFACE_BOUNDS.length*2,maximumVelocityStepMps:maximumVelocityStep};
  return report.transitions;
});

report.passed=true;report.groups=groups;report.combinations=matrix.length;
const reportIndex=process.argv.indexOf('--report-dir');
if(reportIndex!==-1){
  assert.ok(process.argv[reportIndex+1],'--report-dir requires a directory');
  const directory=path.resolve(process.argv[reportIndex+1]);fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'ordered-biome-measurements.json'),JSON.stringify(report,null,2)+'\n');
  const fields=['car','biome','tier','relativeTier','launchSpeed1sMps','launchSpeed2sMps','terminalSpeedMps','nominalSpeedRatio',
    'brakeDistanceM','brakeTimeS','commonSpeedTurnAccelerationRadS2','lateralSlideM','lateralRecoveryS',
    'heldTurnMaxSlipDeg','heldTurnMaxYawRadS','gearReverseCrossTimeS','worstGradeSpeed20sMps','worstGradeRollbackRecoveryS','maxFrameRateStateDifference'];
  fs.writeFileSync(path.join(directory,'ordered-biome-measurements.csv'),[fields.join(','),...matrix.map(r=>fields.map(k=>r[k]).join(','))].join('\n')+'\n');
}
console.log(`\n${groups} ordered biome groups passed; all ${matrix.length} combinations measured. No browser/GPU claim.`);
