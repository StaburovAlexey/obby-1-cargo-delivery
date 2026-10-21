import assert from 'node:assert/strict';
import fs from 'node:fs';
import {after, test} from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {COSMO_VEHICLES, loadCosmoVehicle, clearCosmoVehicleCache} from '../dist/cosmo-vehicles.js';
import {createDrivingModel, evaluateVehicleForces, roadWheelTarget, VEHICLE_DYNAMICS as P} from '../dist/driving-model.js';
import {rearTireSlip} from '../dist/vehicle-physics.js';
import {vehicleConfig} from '../dist/economy-config.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {getUpgradeModifiers, steeringResponseSeconds} from '../dist/vehicle-upgrades.js';

const original={fetch:globalThis.fetch,self:globalThis.self,createImageBitmap:globalThis.createImageBitmap};
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{
  const bytes=Buffer.from(await blob.arrayBuffer());
  return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),close(){}};
};
globalThis.fetch=async request=>{
  const url=typeof request==='string'?request:request.url;
  if(url.startsWith('blob:'))return original.fetch(request);
  assert.ok(url.startsWith('file:'),'only real local GLBs are loaded');
  return new Response(fs.readFileSync(new URL(url)));
};
const adapters=await Promise.all(COSMO_VEHICLES.map(v=>loadCosmoVehicle(THREE,v.id)));
const cars=adapters.map(adapter=>({spec:vehicleConfig(adapter.metadata.id),metadata:adapter.metadata}));
after(()=>{
  adapters.forEach(a=>a.dispose());clearCosmoVehicleCache();
  for(const [key,value] of Object.entries(original)){
    if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
});
const near=(a,b,message,tolerance=1e-10)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<tolerance,`${message}: ${a} != ${b}`);
const make=({spec,metadata},levels={},extra={})=>createDrivingModel({
  x:0,z:0,vehicleId:spec.id,maxSpeed:spec.maxSpeed,getVehicleMetadata:()=>metadata,
  getUpgrades:()=>levels,groundSurface:()=>surfaceForBiome(spec.specialty,spec.id),...extra,
});
const run=(model,seconds,input,sample=()=>{},fps=120)=>{
  model.setInput(input);
  for(let i=0;i<Math.round(seconds*fps);i++){
    model.step(1/fps);sample(model.state);
    for(const value of Object.values(model.state))if(typeof value==='number')assert.ok(Number.isFinite(value));
  }
};

test('extra speed uses each car terrain baseline, bounded rack compensation and a progressive response delay',async t=>{
  for(const car of cars)await t.test(car.spec.id,()=>{
    for(const factor of [1,.75,.15])for(const ratio of [.8,1,1.05,1.10,3])for(const longitudinalGripFactor of [1,1.5,3]){
      const surface={...surfaceForBiome(car.spec.specialty,car.spec.id),speedFactor:factor,longitudinalGripFactor};
      const speed=Math.max(6,car.spec.maxSpeed*factor)*ratio;
      const model=make(car,{}, {groundSurface:()=>surface});
      model.state.velocityZ=-speed;model.setInput({steering:1});
      const r=Math.max(1,Math.min(1.10,speed/Math.max(6,car.spec.maxSpeed*factor)));
      const u=(r-1)/.10,blend=u*u*(3-2*u);
      const steeringGrip=Math.sqrt(Math.min(1,surface.frictionFactor*surface.longitudinalGripFactor));
      const target=roadWheelTarget(1,speed/r/steeringGrip,9+7*Math.min(1,1/surface.longitudinalGripFactor));
      const supported=Math.max(0,Math.min(1,2/surface.longitudinalGripFactor-1));
      const response=steeringResponseSeconds(car.spec.handling,speed)/surface.handlingFactor*(1+.20*blend+u*supported);
      const expected=target*(1-Math.exp(-P.fixedStep/response));
      model.step(P.fixedStep);
      near(model.state.frontWheelAngle,expected,`${car.spec.id}/${factor}/${ratio}: rack follows actual speed`);
    }
  });
});

test('speed overload limits rear lateral capacity while keeping front tires, straight traction and bypasses intact',()=>{
  const car=cars.at(-1),geometry=make(car).physicsGeometry;
  const state={heading:0,velocityX:7,velocityZ:-30,angularVelocity:0,
    frontWheelAngle:0,gear:'D',active:false};
  const options={geometry,surface:surfaceForBiome(car.spec.specialty,car.spec.id)};
  const base=evaluateVehicleForces(state,options);
  const loaded=evaluateVehicleForces(state,{...options,rearGripDeficit:1});
  for(let i=0;i<loaded.tires.length;i++){
    const a=base.tires[i],b=loaded.tires[i];
    if(geometry.wheels[i].front)assert.deepEqual(b,a,'front contact unchanged');
    else assert.ok(Math.abs(b.lateralForce)<Math.abs(a.lateralForce)*.85,'rear breakaway is meaningfully stronger');
    assert.ok(b.lateralForce*b.lateralSpeed<=0,'contact dissipates lateral motion');
    assert.ok(Math.hypot(b.longitudinalForce,b.lateralForce)<=b.grip+1e-8,'combined friction budget');
  }
  for(const invalid of [NaN,Infinity,-1,0])assert.deepEqual(evaluateVehicleForces(state,{...options,rearGripDeficit:invalid}),base);
  assert.deepEqual(evaluateVehicleForces(state,{...options,rearGripDeficit:4}),loaded,'deficit capped');
  for(const extra of [{gear:'R'},{velocityX:0,active:true}]){
    const seed={...state,...extra};
    assert.deepEqual(evaluateVehicleForces(seed,{...options,rearGripDeficit:1}),evaluateVehicleForces(seed,options));
  }
  const reward={...options,rewardDrift:{rearLateralGrip:.7,rearLateralDamping:.7}};
  assert.deepEqual(evaluateVehicleForces(state,{...reward,rearGripDeficit:1}),evaluateVehicleForces(state,reward),'BMW bypass');
});

test('overload steering delay follows linear speed even after the body turns sideways',()=>{
  const car=cars.at(-1),model=make(car,{speed:10});
  Object.assign(model.state,{heading:Math.PI/2,velocityZ:-car.spec.maxSpeed*1.1,frontWheelAngle:.12});
  model.setInput({steering:0});model.step(P.fixedStep);
  const surface=surfaceForBiome(car.spec.specialty,car.spec.id);
  const response=steeringResponseSeconds(car.spec.handling,car.spec.maxSpeed*1.1)/surface.handlingFactor*2;
  near(model.state.frontWheelAngle,.12*Math.exp(-P.fixedStep/response),'sideways motion retains the overload delay');
});

test('an analog reverse request preserves the previous rack response on the transition tick',()=>{
  const model=make(cars.at(-1),{speed:10});
  Object.assign(model.state,{velocityZ:-38.94,frontWheelAngle:.1});
  model.setInput({speedDemand:-1,steering:-.6});model.step(P.fixedStep);
  assert.equal(model.state.gear,'R');
  near(model.state.frontWheelAngle,.09820314001212241,'reverse transition keeps its baseline response');
});

test('rear stabilization shares the bounded speed reference without changing tire geometry or friction budgets',()=>{
  const car=cars.at(-1),geometry=make(car).physicsGeometry;
  const state={heading:0,velocityX:.2,velocityZ:-car.spec.maxSpeed*1.1,angularVelocity:-.05,
    frontWheelAngle:-.08,gear:'D',active:false};
  const options={geometry,surface:surfaceForBiome(car.spec.specialty,car.spec.id)};
  const baseline=evaluateVehicleForces(state,options);
  assert.deepEqual(evaluateVehicleForces(state,{...options,speedAssistRatio:1}),baseline);
  const loaded=evaluateVehicleForces(state,{...options,speedAssistRatio:1.10});
  for(let i=0;i<loaded.tires.length;i++){
    const a=baseline.tires[i],b=loaded.tires[i];
    for(const key of ['rx','rz','pointVelocityX','pointVelocityZ','lateralSpeed','normalLoad','grip'])near(a[key],b[key],key);
    if(!geometry.wheels[i].front)assert.ok(Math.abs(b.lateralForce)<Math.abs(a.lateralForce)*.99,'extra speed receives no free rear-stiffness bonus');
    assert.ok(b.lateralForce*b.lateralSpeed<=0,'contact opposes slip');
    assert.ok(Math.hypot(b.longitudinalForce,b.lateralForce)<=b.grip+1e-8,'combined tire budget');
  }
  for(const invalid of [NaN,Infinity,-1,0])assert.deepEqual(evaluateVehicleForces(state,{...options,speedAssistRatio:invalid}),baseline);
  assert.deepEqual(evaluateVehicleForces(state,{...options,speedAssistRatio:7}),loaded,'extreme overspeed remains capped');
  state.gear='R';
  assert.deepEqual(evaluateVehicleForces(state,{...options,speedAssistRatio:1.1}),evaluateVehicleForces(state,options),'reverse bypass');
});

test('buying speed does not change passive motion at the same actual speed, including above the base cap',async t=>{
  for(const car of cars)await t.test(car.spec.id,()=>{
    for(const speed of [3,car.spec.maxSpeed*1.08]){
      const models=[0,5,10].map(level=>make(car,{speed:level}));
      for(const model of models){
        Object.assign(model.state,{velocityX:.2,velocityZ:-speed,angularVelocity:.03,frontWheelAngle:.06});
        run(model,.5,{active:false,steering:-.4});
      }
      assert.deepEqual(models[1].state,models[0].state);assert.deepEqual(models[2].state,models[0].state);
    }
  });
});

const rackTime=(car,levels)=>{
  const model=make(car,levels),modifiers=getUpgradeModifiers(levels);
  Object.assign(model.state,{velocityZ:-car.spec.maxSpeed*modifiers.speed,frontWheelAngle:-.12});
  model.setInput({active:true,steering:-1});
  let elapsed=0;
  while(model.state.frontWheelAngle<0&&elapsed<2){model.step(P.fixedStep);elapsed+=P.fixedStep;}
  assert.ok(elapsed<2,'rack reverses');return elapsed;
};
const corner=(car,levels,comfortable=false)=>{
  const model=make(car,levels),geometry=model.physicsGeometry;
  run(model,15,{active:true});
  let peak=0,bodyPeak=0,minForward=Infinity;
  run(model,6,{active:true,steering:1},state=>{
    peak=Math.max(peak,Math.abs(rearTireSlip(state,geometry.rearZ))*180/Math.PI);
    bodyPeak=Math.max(bodyPeak,Math.abs(Math.atan2(Math.cos(state.heading)*state.velocityX-Math.sin(state.heading)*state.velocityZ,state.speed))*180/Math.PI);
    minForward=Math.min(minForward,state.speed);
  });
  if(comfortable)assert.ok(peak<22&&minForward>car.spec.maxSpeed*getUpgradeModifiers(levels).speed*.7,
    `${car.spec.id}/${JSON.stringify(levels)}: bounded forward skid ${peak.toFixed(2)}deg, ${minForward.toFixed(2)}m/s`);
  const seed={...model.state};
  const catchTime=active=>{
    Object.assign(model.state,seed);model.setInput({active,steering:0});let elapsed=0;
    while(elapsed<5){
      model.step(P.fixedStep);elapsed+=P.fixedStep;
      if(Math.abs(rearTireSlip(model.state,geometry.rearZ))<Math.PI/180&&Math.abs(model.state.angularVelocity)<.03)break;
    }
    return elapsed;
  };
  const center=catchTime(true),lift=catchTime(false);
  if(comfortable)assert.ok(center<3&&lift<2,`${car.spec.id}: center ${center.toFixed(3)}s / lift ${lift.toFixed(3)}s`);
  return {peak,bodyPeak,minForward,center,lift,rack:rackTime(car,levels)};
};
test('real cars need grip and handling as speed grows, and each upgrade has a distinct benefit',async t=>{
  const report=[];
  for(const car of cars)await t.test(car.spec.id,()=>{
    const stock=corner(car,{},true),half=corner(car,{speed:5}),speed=corner(car,{speed:10});
    const handling=corner(car,{speed:10,handling:10}),grip=corner(car,{speed:10,grip:10});
    const max=corner(car,{speed:10,handling:10,grip:10},true);
    const middle=corner(car,{speed:5,handling:5,grip:5},true);
    assert.ok(half.bodyPeak>stock.bodyPeak*1.3&&half.minForward<car.spec.maxSpeed*.95,
      `S5 already costs trajectory and speed: ${JSON.stringify({stock,half,base:car.spec.maxSpeed})}`);
    assert.ok(stock.rack<half.rack&&half.rack<speed.rack,'speed 0/5/10 progressively slows correction');
    assert.ok(speed.peak>stock.peak*1.3&&speed.rack>stock.rack*1.6,'S10 strongly increases breakaway and correction time');
    assert.ok(handling.rack<speed.rack*.8,'handling alone improves rack reversal');
    assert.ok(grip.peak<speed.peak*.85,'grip alone improves tire slip');
    assert.ok(max.peak<=stock.peak*1.05&&max.rack<=stock.rack*1.05,'balanced upgrades restore stock control');
    report.push({id:car.spec.id,stock,half,speed,handling,grip,max,middle});
  });
  if(process.env.SPEED_BALANCE_REPORT)fs.writeFileSync(process.env.SPEED_BALANCE_REPORT,JSON.stringify(report,null,2)+'\n');
});

test('timely lift and countersteer recover each real car within four seconds while still moving',async t=>{
  const levels=[{},{speed:5},{speed:10},{speed:10,handling:10},{speed:10,grip:10},
    {speed:5,handling:5,grip:5},{speed:10,handling:10,grip:10}];
  const bodySlip=state=>Math.atan2(Math.cos(state.heading)*state.velocityX-Math.sin(state.heading)*state.velocityZ,state.speed);
  for(const car of cars)await t.test(car.spec.id,()=>{
    for(const upgrades of levels)for(const steering of [.4,.6,1]){
      const model=make(car,upgrades);
      run(model,15,{active:true});model.setInput({active:true,steering});
      for(let i=0;i<720;i++){
        model.step(P.fixedStep);
        if(Math.abs(bodySlip(model.state))>=Math.PI/10)break;
      }
      let elapsed=0;
      while(elapsed<4){
        const slip=bodySlip(model.state);
        if(Math.abs(slip)<2*Math.PI/180&&Math.abs(model.state.angularVelocity)<.03)break;
        model.setInput({active:false,steering:Math.max(-.8,Math.min(.8,slip*2.5+model.state.angularVelocity*.8))});
        model.step(P.fixedStep);elapsed+=P.fixedStep;
      }
      assert.ok(elapsed<4,`${JSON.stringify(upgrades)}/${steering}: catch ${elapsed.toFixed(3)}s`);
      assert.ok(model.state.linearSpeed>1,'recovery is not a full stop');
    }
  });
});

test('upgraded motion stays frame-rate independent through terrain caps, downhill overspeed and reversals',async t=>{
  for(const car of cars)await t.test(car.spec.id,()=>{
    const snapshots=[30,60,120].map(fps=>{
      const surface=surfaceForBiome(car.spec.specialty,car.spec.id),seen=new Set();
      const model=make(car,{speed:10,handling:5,grip:5},{
        groundGradient:()=>({x:0,z:.03}),
        groundSurface:(x,z)=>{
          const progress=-z/car.spec.maxSpeed;
          const speedFactor=progress<1?1:progress<1.8?.75:progress<2.1?.15:1;
          seen.add(speedFactor);return {...surface,speedFactor};
        },
      });
      model.state.velocityZ=-car.spec.maxSpeed*1.25;
      const totals={travel:0,pathDistance:0,movingSeconds:0};
      for(const [seconds,input] of [
        [4,{active:true}], [1,{active:true,steering:.6}],
        [1.5,{active:false,steering:-.4}], [2,{active:true,steering:-.3}],
        [2,{speedDemand:-.5,steering:.3}], [2,{speedDemand:.8,steering:-.2}],
      ])run(model,seconds,input,state=>{
        for(const key of Object.keys(totals))totals[key]+=state[key];
      },fps);
      assert.ok(seen.size>=2,'a surface cap changes while the car is moving');
      return {...model.state,...totals};
    });
    for(const actual of snapshots.slice(1))for(const [key,value] of Object.entries(snapshots[0])){
      if(typeof value==='number')near(actual[key],value,`${car.spec.id}/${key}: fixed-step equivalence`,1e-8);
      else assert.equal(actual[key],value,key);
    }
  });
});
