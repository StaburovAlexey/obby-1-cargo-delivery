#!/usr/bin/env node
// Portable source-backed tests. Node only: no HTTP server, browser, or WebGL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { buildCity, routeHeight, routeCenter } from '../dist/scene.js';
import { branchCenter } from '../dist/road-layout.js';
import { TOW_DRIVING, createDrivingModel, moveWithContacts, steeringTarget } from './baseline/driving-model-v25.js';
import { projectRoad, groundHeight, fitTruckToGround, SUPPORT_CLEARANCE, collectObstacles, overlapsTruck, getTruckContact } from '../dist/city-driving.js';
import { createVehicleRig } from '../dist/vehicle-rig.js';
import { createSourceOracle } from './fixtures/tow-driving-reference.mjs';
import { createVehicleInput, STEERING_MAX_ANGLE, shortestAngleDegrees, fingerAngleAt } from '../dist/vehicle-input.js';
import { createInputDom } from './fixtures/vehicle-input-dom.mjs';
import { createAppDom } from './fixtures/app-dom.mjs';

const report={generatedAt:new Date().toISOString(),sourceCommit:'6c52e417cd499c7b9d9c6f450961c8ca0956063c',checks:[],notes:[]};
function check(name,fn){try{const details=fn();report.checks.push({name,status:'passed',...(details===undefined?{}:{details})});console.log(`PASS ${name}`);}catch(error){report.checks.push({name,status:'failed',error:error.message});console.error(`FAIL ${name}: ${error.message}`);}}
function near(actual,expected,tolerance=1e-10,label='value'){assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`${label}: expected ${expected}, got ${actual}`);}
function finite(values){for(const value of values)assert.ok(Number.isFinite(value));}
function routePoint(y,offset=0){const d=(routeCenter(y+.01)-routeCenter(y-.01))/.02,n=1/Math.hypot(1,d);return{x:routeCenter(y)+offset*n,z:-y+offset*d*n,heading:-Math.atan(d)};}
function run(model,seconds,dt=1/60){for(let i=0;i<Math.round(seconds/dt);i++)model.step(dt);return model.state;}

check('Pinned source configuration and city mesh adaptations are explicit',()=>{
 for(const [key,value]of Object.entries({maxSpeed:11,accelerationSeconds:1.3,inertiaSeconds:2.2,steeringStrength:1,maximumWheelAngle:.48,steeringDeadzone:.08,steeringResponseSeconds:.22,wheelbase:3.2,sourceWheelRadius:.48,wheelRadius:.68,maxDelta:.05,movingThreshold:.05,followSmoothing:7,cameraFov:70}))near(TOW_DRIVING[key],value,0,key);
 assert.ok(Object.isFrozen(TOW_DRIVING));return{sourceForward:'+Z',cityForward:'-Z',sourceRadius:.48,cityRadius:.68,physicsWheelbase:3.2,visualWheelbase:3.36};
});
check('Exact deadzone, nonlinear steering response, and exponential response',()=>{
 for(const input of[-1,-.55,-.0801,-.08,-.079,0,.079,.08,.0801,.55,1]){
  const magnitude=Math.max(0,(Math.abs(input)-.08)/.92),expected=-Math.sign(input)*magnitude*(.55+.45*magnitude)*.48;
  near(steeringTarget(input),expected,1e-14,`target ${input}`);
  const model=createDrivingModel();model.setInput({steering:input,active:false});model.step(.05);
  near(model.state.frontWheelAngle,expected*(1-Math.exp(-.05/.22)),1e-14,'filtered steering');
 }
 near(steeringTarget(100),-.48);near(steeringTarget(-100),.48);
 assert.ok(Math.abs(steeringTarget(.5))<.24,'near-center steering should be gentler than linear');
});
check('Stationary start, held-wheel acceleration, release coast, and full stop',()=>{
 const model=createDrivingModel({x:0,z:0});run(model,1);near(model.state.speed,0);near(model.state.x,0);near(model.state.z,0);
 model.setInput({active:true});run(model,1.3);near(model.state.speed,11,1e-10);assert.ok(model.state.z<0);near(model.state.x,0);
 model.setInput({active:false});model.step(.05);near(model.state.speed,10.75);run(model,2.15);near(model.state.speed,0);assert.equal(model.state.moving,false);
 const settled={...model.state};run(model,1);near(model.state.x,settled.x);near(model.state.z,settled.z);near(model.state.wheelSpin,settled.wheelSpin);
});
check('Forward/reverse changes slew through zero and preserve held steering',()=>{
 const model=createDrivingModel();model.setInput({active:true,steering:.4});run(model,2);const before=model.state.speed;
 model.setGear('R');near(model.state.speed,before,0);assert.equal(model.state.active,true);near(model.state.steering,.4,0);
 let previous=before,positive=false,negative=false;
 for(let i=0;i<180;i++){model.step(1/60);assert.ok(Math.abs(model.state.speed-previous)<=11/1.3/60+1e-12);positive ||= model.state.speed>0;negative ||= model.state.speed<0;previous=model.state.speed;}
 assert.ok(positive&&negative);near(model.state.speed,-11,1e-10);model.setGear('D');model.step(.05);assert.ok(model.state.speed<0);assert.throws(()=>model.setGear('N'));
});
check('Maximum-turn speed limit is symmetric at 82 percent',()=>{
 for(const gear of['D','R'])for(const steering of[-1,1]){const model=createDrivingModel();model.setGear(gear);model.setInput({active:true,steering});run(model,10);near(model.state.speed,(gear==='D'?1:-1)*9.02,1e-10);near(model.state.frontWheelAngle,-steering*.48,1e-12);}
});
check('Frame delta cap and nonpositive frame safeguards',()=>{
 const a=createDrivingModel(),b=createDrivingModel();for(const m of[a,b])m.setInput({active:true,steering:.8});a.step(5);b.step(.05);assert.deepEqual(a.state,b.state);
 for(const dt of[0,-1,NaN]){const before={...a.state};a.step(dt);assert.deepEqual(a.state,before);}
});
check('Thousands of no-contact frames match the actual source updateVehicle',()=>{
 const model=createDrivingModel({x:0,z:0,heading:.37}),oracle=createSourceOracle({heading:.37});let random=3481;
 const rand=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
 const inputs=[{steering:0,active:false},{steering:0,active:true},{steering:.075,active:true},{steering:.55,active:true},{steering:1,active:true},{steering:-1,active:true},{steering:0,active:false}];
 let frames=0,maxError=0;
 for(let phase=0;phase<42;phase++){
  const input=inputs[phase%inputs.length],gear=phase%5<3?'D':'R';model.setInput(input);oracle.setInput(input);model.setGear(gear);oracle.setGear(gear);
  for(let i=0;i<83;i++){
   const dt=i%29===0?.2:i%31===0?.001:1/(25+Math.floor(rand()*90));model.step(dt);oracle.step(dt);frames++;
   const actual=model.state,source=oracle.state,expected={x:-source.x,z:-source.z,heading:source.heading,speed:source.speed,frontWheelAngle:source.frontWheelAngle,wheelSpin:-source.sourceWheelRotation*.48/.68,bodyPitch:source.bodyPitch,bodyRoll:source.bodyRoll,bodyBob:source.bodyBob};
   for(const[key,value]of Object.entries(expected)){near(actual[key],value,2e-10,`frame ${frames} ${key}`);maxError=Math.max(maxError,Math.abs(actual[key]-value));}
   assert.equal(actual.moving,source.moving);
  }
 }
 return{frames,maxAbsoluteError:maxError,comparison:'Source +Z positions rotate 180 degrees; wheel distance adapts 0.48 m source radius to 0.68 m city mesh radius'};
});
check('Tiny subthreshold source travel is retained for wheel animation',()=>{
 const model=createDrivingModel({x:0,z:0}),oracle=createSourceOracle();for(const m of[model,oracle]){m.setInput({active:true,steering:0});m.step(.001);}
 near(model.state.x,0);near(model.state.z,0);assert.equal(model.state.moving,false);near(model.state.wheelSpin,-oracle.state.sourceWheelRotation*.48/.68,1e-15);
});
check('Bicycle turning circles and reverse yaw have the source signs',()=>{
 for(const gear of['D','R']){
  const model=createDrivingModel({x:0,z:0});model.setGear(gear);model.setInput({active:true,steering:1});model.state.speed=gear==='D'?9.02:-9.02;model.state.frontWheelAngle=-.48;
  const radius=3.2/Math.tan(.48),direction=gear==='D'?-1:1,frames=Math.round(2*Math.PI*radius/9.02*120);let maxRadialError=0;
  for(let i=0;i<frames;i++){model.step(1/120);maxRadialError=Math.max(maxRadialError,Math.abs(Math.hypot(model.state.x-radius,model.state.z)-radius));}
  assert.ok(maxRadialError<.04,`circle radius error ${maxRadialError}`);near(model.state.heading,direction*9.02*Math.tan(.48)/3.2*frames/120,1e-10);assert.ok(Math.hypot(model.state.x,model.state.z)<.07);assert.equal(Math.sign(model.state.wheelSpin),gear==='D'?1:-1);
 }
});

report.failedChecks=report.checks.filter(c=>c.status==='failed').length;console.log(`Historical v25 Tow baseline: ${report.checks.length-report.failedChecks}/${report.checks.length}`);process.exitCode=report.failedChecks?1:0;
