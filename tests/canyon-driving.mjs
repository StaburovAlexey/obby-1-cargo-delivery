import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createDrivingModel} from '../dist/driving-model.js';
import {VEHICLE_CONFIG,vehicleConfig} from '../dist/economy-config.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {createVehicleInput} from '../dist/vehicle-input.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
import {createFollowCameraState} from '../dist/follow-camera.js';

const bmw=()=>createDrivingModel({vehicleId:'bmwreward',maxSpeed:vehicleConfig('bmwreward').maxSpeed,groundSurface:()=>surfaceForBiome('city','bmwreward')});
const run=(m,seconds,fps=120)=>{for(let i=0;i<Math.round(seconds*fps);i++)m.step(1/fps);};
const beta=s=>Math.atan2(Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ,-Math.sin(s.heading)*s.velocityX-Math.cos(s.heading)*s.velocityZ);

test('BMW tire-generated slide can be countersteered and released in both directions',()=>{
 for(const sign of [-1,1]){
  const m=bmw();m.state.velocityZ=-22;m.setInput({active:true,steering:sign*.75});let drifting=0,maxAngle=0;
  for(let i=0;i<3*120;i++){m.step(1/120);const angle=Math.abs(beta(m.state))*180/Math.PI;maxAngle=Math.max(maxAngle,angle);if(angle>=12&&angle<=50&&m.state.linearSpeed>10)drifting++;assert.ok(angle<50,`uncontrolled angle ${angle}`);}
  assert.ok(drifting>120,'at least one second of genuine tire slip without an angle servo');
  const oldYaw=m.state.angularVelocity;
  m.setInput({active:false,steering:-sign*.75});run(m,.6);
  assert.ok(Math.abs(m.state.angularVelocity)<Math.abs(oldYaw),'countersteer reduces the existing yaw');
  m.setInput({active:false,steering:0});run(m,2);
  assert.ok(Math.abs(beta(m.state))<5*Math.PI/180,'lifting and centering recovers the slide');
 }
});

test('BMW links opposite turns through actual steering and tire forces',()=>{
 const m=bmw();m.state.velocityZ=-22;m.setInput({active:true,steering:.6});run(m,.75);
 assert.ok(m.state.angularVelocity<-.2);
 m.setInput({active:true,steering:-.6});run(m,.75);
 assert.ok(m.state.angularVelocity>.2);assert.ok(m.state.linearSpeed>10);assert.ok(Number.isFinite(m.state.driftIntensity));
});

test('BMW brakes independently of throttle and releases every control on pause',()=>{
 const m=bmw();m.state.velocityZ=-25;m.setInput({active:true,brake:1,handbrake:.5});run(m,1);
 assert.ok(m.state.linearSpeed<18,'brake wins over the throttle');assert.equal(m.state.brake,1);assert.equal(m.state.handbrake,.5);
 m.pause();assert.equal(m.state.brake,0);assert.equal(m.state.handbrake,0);assert.equal(m.state.driftIntensity,0);
});

test('BMW trajectories agree at 30, 60 and 120 frames per second',()=>{
 const samples=[30,60,120].map(fps=>{const m=bmw();m.state.velocityZ=-22;m.setInput({active:true,steering:.7});run(m,4,fps);return m.state;});
 for(const s of samples)for(const key of ['x','z','heading','velocityX','velocityZ'])assert.ok(Math.abs(s[key]-samples[0][key])<1e-7,key);
});

test('a drift camera keeps the direction of travel in view',()=>{
 const c=createFollowCameraState({mode:'driving',heading:0});
 for(let i=0;i<60;i++)c.update({dt:1/60,heading:Math.PI/4,distance:.4,drifting:true,velocityX:0,velocityZ:-20});
 assert.ok(c.state.yaw<Math.PI/8,'camera favors the road direction during a slide');
});

test('a held BMW brake stops forward motion without rolling backwards',()=>{
 const m=bmw();m.state.velocityZ=-8;m.setInput({brake:1});run(m,4);
 assert.ok(m.state.linearSpeed<.05);assert.ok(m.state.speed>=-.001);
});

test('released BMW settles completely instead of creeping indefinitely',()=>{
 const m=bmw();m.state.velocityZ=-20;m.setInput({active:false});run(m,30);
 assert.ok(m.state.linearSpeed<.001);
});

test('ordinary vehicles retain the approved handling/grip trajectories',()=>{
 const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/handling-grip-vehicles.json',import.meta.url)));
 for(const v of VEHICLE_CONFIG.filter(v=>!v.rewardOnly)){
  const m=createDrivingModel({vehicleId:v.id,maxSpeed:v.maxSpeed,groundSurface:()=>surfaceForBiome('city',v.id)});
  for(let i=0;i<900;i++){m.setInput({active:i<700,steering:Math.sin(i*.01)*.6});m.step(1/60);}
  for(const [key,expected]of Object.entries(baseline[v.id]))assert.ok(Math.abs(m.state[key]-expected)<1e-9,`${v.id}/${key}`);
 }
});

test('moving BMW combined reverse and Shift handbrake work independently from gas',()=>{
 const f=createInputDom(),events=[],c=createVehicleInput({root:f.root,getTelemetry:()=>({linearSpeed:10}),onInput:value=>events.push(value)});
 try{
  c.setDriftEnabled?.(true);f.win.dispatch('keydown',{code:'KeyW'});f.win.dispatch('keydown',{code:'KeyS'});f.win.dispatch('keydown',{code:'ShiftLeft'});
  assert.deepEqual({active:events.at(-1).active,brake:events.at(-1).brake,handbrake:events.at(-1).handbrake},{active:true,brake:0,handbrake:1});
  f.win.dispatch('keyup',{code:'KeyS'});assert.equal(events.at(-1).brake,0);assert.equal(events.at(-1).handbrake,1);
  f.win.dispatch('blur');assert.equal(events.at(-1).active,false);assert.equal(events.at(-1).handbrake,0);
 }finally{c.destroy();}
});

test('BMW tire forces dissipate unpowered contact motion and never invent yaw at rest',async()=>{
 const {evaluateDriftDynamics}=await import('../dist/drift-dynamics.js');
 const surface=surfaceForBiome('city','bmwreward');
 for(const heading of [0,.8,-2])for(const velocity of [[0,0],[3,-20],[-7,12]])for(const yaw of [-1,0,1])for(const handbrake of [0,1]){
  const s={heading,velocityX:velocity[0],velocityZ:velocity[1],angularVelocity:yaw,frontWheelAngle:.4,active:false,handbrake,steering:.8};
  const f=evaluateDriftDynamics(s,{maxSpeed:42,engineAcceleration:22,surface,gradient:{x:0,z:0},dt:1/120});
  const power=f.forceX*s.velocityX+f.forceZ*s.velocityZ+f.torque*yaw;
  assert.ok(power<=1e-8,`unpowered tire power ${power}`);
  assert.ok(Math.abs(f.forceX-f.tires.reduce((sum,t)=>sum+t.forceX,0))<1e-8);
  assert.ok(Math.abs(f.torque-f.tires.reduce((sum,t)=>sum+t.torque,0))<1e-8);
  for(const t of f.tires)assert.ok(t.lateralForce*t.lateralSpeed<=1e-8,'lateral tire resistance opposes slip');
  if(!yaw&&!velocity.some(Boolean)){assert.ok(f.forceX===0);assert.ok(f.forceZ===0);assert.ok(f.torque===0);}
 }
});

test('BMW handbrake also slows an already reversing car without shifting forward',()=>{
 const m=bmw();m.setGear('R');m.state.velocityZ=6;
 m.setInput({active:false,handbrake:1});run(m,2);
 assert.equal(m.state.gear,'R');assert.ok(m.state.linearSpeed<.08);
});
