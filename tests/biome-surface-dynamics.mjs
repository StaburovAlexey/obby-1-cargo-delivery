#!/usr/bin/env node
import {routePointAtProgress} from '../dist/road-layout.js';

import assert from 'node:assert/strict';
import { createDrivingModel, evaluateVehicleForces, VEHICLE_DYNAMICS as P } from '../dist/driving-model.js';
import { BIOMES } from '../dist/road-layout.js';
import { VEHICLE_CONFIG } from '../dist/economy-config.js';
import { roadGroundSurface } from '../dist/driving-ground.js';
import { BIOME_SURFACES, CITY_SURFACE, SURFACE_FACTOR_KEYS, SURFACE_BOUNDS,
  SURFACE_TRANSITION_METERS, VEHICLE_SURFACE_MODIFIERS, VEHICLE_SURFACE_PROFILES, surfaceForBiome, biomeSurfaceAt,
  biomeSurfaceBlend, normalizeSurfaceDynamics } from '../dist/biome-surfaces.js';
const near = (a,b,eps=1e-9) => assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=eps, `${a} != ${b} +/- ${eps}`);
const run = (m,seconds,fps=120) => { let path=0;for(let i=0;i<Math.round(seconds*fps);i++){m.step(1/fps);path+=m.state.pathDistance;}return path; };
const make = (v,id,extra={}) => createDrivingModel({x:0,z:0,maxSpeed:v.maxSpeed,vehicleId:v.id,
  groundSurface:()=>surfaceForBiome(id,v.id),...extra});
const energy = s => .5*P.mass*(s.velocityX**2+s.velocityZ**2)+.5*P.yawInertia*s.angularVelocity**2;
const slip = s => Math.abs(Math.atan2(Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ,Math.abs(s.speed)));
let checks=0;const matrix=[];
function check(name,fn){const details=fn();checks++;console.log(`PASS ${name}${details?`: ${JSON.stringify(details)}`:''}`);}

check('All ten vehicles have bounded explicit tire packages for the actual five sequential biomes',()=>{
  assert.equal(VEHICLE_CONFIG.length,10);assert.equal(Object.keys(VEHICLE_SURFACE_MODIFIERS).length,10);
  assert.deepEqual(Object.keys(BIOME_SURFACES),BIOMES.map(b=>b.id));
  for(const v of VEHICLE_CONFIG){assert.ok(Object.hasOwn(VEHICLE_SURFACE_MODIFIERS,v.id));for(const b of BIOMES){
    const p=surfaceForBiome(b.id,v.id),mid=(b.from+b.to)/2;
    assert.equal(p.id,b.id);assert.deepEqual(biomeSurfaceAt(mid,v.id),p);
    const point=routePointAtProgress(mid);assert.deepEqual(roadGroundSurface(point.x-14.9*point.right.x,point.z-14.9*point.right.z,v.id,point),roadGroundSurface(point.x+14.9*point.right.x,point.z+14.9*point.right.z,v.id,point));
    for(const key of SURFACE_FACTOR_KEYS)assert.ok(Number.isFinite(p[key])&&p[key]>=0);
    assert.ok(p.frictionFactor>=.07&&p.frictionFactor<=1.05);assert.ok(p.speedFactor<=1&&p.speedFactor>=.17);
    assert.deepEqual(Object.keys(VEHICLE_SURFACE_PROFILES[v.id]),BIOMES.map(b=>b.id));
    assert.deepEqual(normalizeSurfaceDynamics(p),VEHICLE_SURFACE_PROFILES[v.id][b.id]);
    assert.equal(Object.hasOwn(p,'fuelFactor'),false);
  }}
  assert.deepEqual(surfaceForBiome('unknown','unknown'),CITY_SURFACE);
  assert.deepEqual(roadGroundSurface(NaN,0),surfaceForBiome('city'));
});
check('Ordered specialist pairs improve together and retain usable earlier terrain',()=>{
  const f=(id,b)=>surfaceForBiome(b,id);
  for(const biome of BIOMES){const [first,next]=VEHICLE_CONFIG.filter(v=>v.specialty===biome.id);
    assert.ok(f(next.id,biome.id).frictionFactor>f(first.id,biome.id).frictionFactor);
    assert.ok(f(next.id,biome.id).lateralDampingFactor>f(first.id,biome.id).lateralDampingFactor);
    assert.ok(next.range>first.range&&next.maxSpeed>first.maxSpeed);
  }
  for(const v of VEHICLE_CONFIG){const tier=BIOMES.findIndex(b=>b.id===v.specialty);for(const [index,b]of BIOMES.entries()){
    const p=f(v.id,b.id);if(index<=tier){assert.ok(p.speedFactor>=.98);assert.ok(p.engineFactor>=.98);assert.ok(p.frictionFactor>=.45);}
    else {assert.ok(p.speedFactor<=.42);assert.ok(p.engineFactor<=.38);assert.ok(p.frictionFactor<=.1515);}
  }}
  assert.ok(f('rover','forest').rollingFactor<f('pickup','forest').rollingFactor);
});
check('Every transition is continuous, monotone, lane-independent, and shares the exact 48m blend',()=>{
  assert.equal(SURFACE_TRANSITION_METERS,48);
  for(const boundary of SURFACE_BOUNDS){
    near(biomeSurfaceBlend(boundary).blend,.5);
    for(const v of VEHICLE_CONFIG)for(const key of SURFACE_FACTOR_KEYS){
      const a=biomeSurfaceAt(boundary-24,v.id)[key],b=biomeSurfaceAt(boundary+24,v.id)[key];
      near(biomeSurfaceAt(boundary,v.id)[key],(a+b)/2);
      let previous=a;
      for(let i=0;i<=96;i++){
        const y=boundary-24+i*.5,current=biomeSurfaceAt(y,v.id)[key];
        assert.ok(current>=Math.min(a,b)-1e-10&&current<=Math.max(a,b)+1e-10);
        assert.ok((current-previous)*Math.sign(b-a)>=-1e-10);previous=current;
      }
      for(const y of [boundary-24,boundary,boundary+24])near(biomeSurfaceAt(y-1e-6,v.id)[key],biomeSurfaceAt(y+1e-6,v.id)[key],1e-6);
    }
  }
});
check('Fifty car/surface combinations accelerate, reach bounded speed and keep each tire inside its friction circle',()=>{
  for(const v of VEHICLE_CONFIG)for(const b of BIOMES){
    const s=surfaceForBiome(b.id,v.id),m=make(v,b.id);m.setInput({active:true});run(m,1);const speed1=m.state.speed;run(m,39);
    near(m.state.speed,v.maxSpeed*s.speedFactor,2e-5);assert.ok(speed1>.7&&speed1<22);near(m.state.x,0);near(m.state.angularVelocity,0);
    for(const heading of [0,.47,-1.2])for(const gear of ['D','R'])for(const active of [false,true]){
      const state={...m.state,heading,gear,active,velocityX:3.4,velocityZ:-13,angularVelocity:.7,frontWheelAngle:.2};
      const forces=evaluateVehicleForces(state,{maxSpeed:v.maxSpeed,surface:s});
      assert.ok([forces.forceX,forces.forceZ,forces.torque].every(Number.isFinite));assert.equal(forces.tires.length,4);
      for(const t of forces.tires){assert.ok(Math.hypot(t.forceX,t.forceZ)<=t.grip+1e-8);assert.ok(t.lateralForce*t.lateralSpeed<=1e-8);
        if(!active)assert.ok(t.forceX*t.pointVelocityX+t.forceZ*t.pointVelocityZ<=1e-8);}
    }
    matrix.push({car:v.id,biome:b.id,speed1:+speed1.toFixed(3),topSpeed:+m.state.speed.toFixed(3)});
  }
  return {combinations:matrix.length};
});
check('Unsupported tiers brake poorly; snow retains longer coasting for every tier',()=>{
  const rows=[];
  for(const v of VEHICLE_CONFIG){
    const tier=BIOMES.findIndex(b=>b.id===v.specialty),result={car:v.id},brakes={};

    for(const b of BIOMES){
      const m=make(v,b.id);m.setInput({active:true});
      while(m.state.speed<1.5)m.step(P.fixedStep);
      m.state.velocityZ=-1.5;m.setGear('R');let distance=0,time=0;
      while(m.state.velocityZ<0&&time<20){m.step(P.fixedStep);time+=P.fixedStep;distance+=m.state.pathDistance;}
      assert.ok(time<2);brakes[b.id]=distance;
    }
    for(const [index,b]of BIOMES.entries())if(index>tier)assert.ok(brakes[b.id]>brakes[v.specialty]*2);
    for(const id of ['city','snow']){
      const n=make(v,id);n.state.velocityZ=-1.5;result[`${id}Coast`]=run(n,30);assert.equal(n.state.moving,false);
    }
    assert.ok(result.snowCoast>result.cityCoast*1.35);
    rows.push(Object.fromEntries(Object.entries(result).map(([k,x])=>[k,typeof x==='number'?+x.toFixed(2):x])));
  }
  return rows;
});
check('All fifty combinations retain D/R brake interlocks, stable held turns and controllable slide recovery',()=>{
  let maxSlip=0,maxYaw=0;
  for(const v of VEHICLE_CONFIG)for(const b of BIOMES)for(const gear of ['D','R']){
    const m=make(v,b.id);m.setGear(gear);m.setInput({active:true,steering:.8});
    for(let i=0;i<960;i++){m.step(P.fixedStep);maxSlip=Math.max(maxSlip,slip(m.state));maxYaw=Math.max(maxYaw,Math.abs(m.state.angularVelocity));
      assert.ok(slip(m.state)<.27,`${v.id}/${b.id}/${gear}: uncontrolled slip ${slip(m.state)}`);assert.ok(Math.abs(m.state.angularVelocity)<.95);}
    assert.equal(Math.sign(m.state.speed),gear==='D'?1:-1);assert.equal(Math.sign(m.state.angularVelocity),gear==='D'?-1:1);
    m.setInput({active:true,steering:0});run(m,8);assert.ok(Math.abs(m.state.angularVelocity)<.004);assert.ok(slip(m.state)<.003);
    const initial=m.state.speed,sign=Math.sign(initial);m.setGear(gear==='D'?'R':'D');near(m.state.speed,initial,0);let old=initial,min=Math.abs(initial),crossed=false;
    for(let i=0;i<1200;i++){m.step(P.fixedStep);const speed=m.state.speed;min=Math.min(min,Math.abs(speed));assert.ok(Math.abs(speed-old)<.27);
      if(!crossed&&speed*sign>=0)assert.ok(Math.abs(speed)<=Math.abs(old)+1e-6);if(speed*sign<0)crossed=true;old=speed;}
    assert.ok(crossed);assert.ok(min<.08);assert.equal(Math.sign(m.state.speed),-sign);
  }
  return {maxSlipDegrees:+(maxSlip*180/Math.PI).toFixed(2),maxYaw:+maxYaw.toFixed(3)};
});
check('Snow gives a longer lateral slide that settles without artificial energy gain',()=>{
  for(const v of VEHICLE_CONFIG){const travel={};for(const id of ['city','snow']){
    const m=make(v,id);Object.assign(m.state,{velocityX:.6,velocityZ:-1.5,angularVelocity:0});let previous=energy(m.state),side=0;
    for(let i=0;i<3600;i++){const x=m.state.x;m.step(P.fixedStep);side+=Math.abs(m.state.x-x);const e=energy(m.state);assert.ok(e<=previous+1e-7);previous=e;}
    assert.equal(m.state.moving,false);travel[id]=side;
  }assert.ok(travel.snow>travel.city*1.2,`${v.id}: snow slide must remain perceptible`);}
});
check('Volcano vibration is mild, solely cosmetic, distance driven and fully cleared by pause/reset',()=>{
  for(const v of VEHICLE_CONFIG){
    const a=make(v,'volcanic'),b=make(v,'volcanic',{groundSurface:()=>({...surfaceForBiome('volcanic',v.id),vibration:0})});
    a.setInput({active:true,steering:.3});b.setInput({active:true,steering:.3});let maxBob=0;
    for(let i=0;i<720;i++){a.step(P.fixedStep);b.step(P.fixedStep);for(const key of ['x','z','heading','velocityX','velocityZ','angularVelocity','travel','pathDistance','wheelSpin'])near(a.state[key],b.state[key],0);
      maxBob=Math.max(maxBob,Math.abs(a.state.bodyBob-b.state.bodyBob));assert.ok(Math.abs(a.state.bodyBob-b.state.bodyBob)<=.015);assert.ok(Math.abs(a.state.bodyRoll-b.state.bodyRoll)<=.003);}
    assert.ok(maxBob>.003);a.pause();run(a,2);assert.equal(a.state.bodyBob,0);assert.equal(a.state.pathDistance,0);
    a.reset();assert.equal(a.state.x,0);assert.equal(a.state.z,0);assert.equal(a.state.bodyRoll,0);assert.equal(a.state.bodyPitch,0);
  }
});
check('Pause/reset and finite surface sanitization cannot replay distance, retain drift or destabilize forces',()=>{
  for(const v of VEHICLE_CONFIG)for(const b of BIOMES){const m=make(v,b.id);m.setInput({active:true,steering:.8});run(m,1);m.step(P.fixedStep/2);m.pause();
    for(const key of ['speed','linearSpeed','velocityX','velocityZ','angularVelocity','travel','pathDistance','bodyPitch','bodyRoll','bodyBob','frontWheelAngle'])near(m.state[key],0,0);
    m.setInput({active:true});m.step(P.fixedStep/2);near(m.state.speed,0,0);m.step(P.fixedStep/2);assert.ok(m.state.speed>0);
    m.reset();assert.equal(m.state.gear,'D');assert.equal(m.state.wheelSpin,0);assert.equal(m.state.x,0);assert.equal(m.state.z,0);
  }
  for(const value of [undefined,null,{},Object.fromEntries(SURFACE_FACTOR_KEYS.map(k=>[k,NaN])),{frictionFactor:-1,rollingFactor:1e100,engineFactor:Infinity}]){
    const normalized=normalizeSurfaceDynamics(value);assert.ok(Object.values(normalized).every(Number.isFinite));
    const m=createDrivingModel({groundSurface:()=>value});m.setInput({active:true,steering:.5});run(m,5);
    assert.ok(Object.values(m.state).filter(x=>typeof x==='number').every(Number.isFinite));
  }
});
check('Canonical surface boundary crossings are fixed-step deterministic at 30/60/120Hz without impulses',()=>{
  for(const boundary of SURFACE_BOUNDS){const results=[];for(const fps of [30,60,120]){
    const m=createDrivingModel({x:0,z:-(boundary-38),maxSpeed:17,vehicleId:'rover',groundSurface:(x,z,id)=>biomeSurfaceAt(-z,id)});m.setInput({active:true});const distance=run(m,30,fps);
    assert.ok(-m.state.z>boundary+24);results.push({...m.state,pathDistance:distance});
  }for(const state of results.slice(1))for(const[key,value]of Object.entries(state)){
    if(key==='travel'||key==='movingSeconds')continue;
    if(typeof value==='number')near(value,results[0][key],1e-9);else assert.equal(value,results[0][key]);}}
});
console.log(`\n${checks} biome dynamics groups passed: ${matrix.length} car/surface combinations. No browser/GPU claim.`);
