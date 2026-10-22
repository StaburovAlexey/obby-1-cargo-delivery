import {bridgeAtProgress} from '../dist/road-bridges.js';





import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { createAppDom } from './fixtures/app-dom.mjs';
import {createRapierDrivingModel} from '../dist/rapier-vehicle.js';
import {createPhysicsWorld,PHYSICS_FIXED_STEP} from '../dist/physics-world.js';
import {getRapier} from '../dist/rapier-runtime.js';
import { roadGroundGradient,roadGroundSurface } from '../dist/driving-ground.js';
import { fitTruckToGround, groundHeight } from '../dist/city-driving.js';
import { routePointAtDistance, truckInRoad } from '../dist/road-layout.js';
import { GAMEPLAY } from '../dist/gameplay.js';
import { vehicleConfig, VEHICLE_CONFIG, ECONOMY_CONFIG } from '../dist/economy-config.js';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';

const report = { generatedAt: new Date().toISOString(), rendererFree: true, checks: [], notes: [
  'Actual app frames, model, Three.js math, road contacts, fuel and camera are exercised.',
  'DOM, renderer and pointer events are simulated; no Android, GPU or physical multi-touch claim.',
] };
const finiteFields = ['x', 'y', 'z', 'heading', 'speed', 'linearSpeed', 'velocityX', 'velocityY', 'velocityZ',
  'angularVelocity', 'frontWheelAngle', 'wheelSpin', 'travel', 'pathDistance', 'bodyPitch', 'bodyRoll', 'bodyBob'];
const restFields = ['speed', 'linearSpeed', 'velocityX', 'velocityY', 'velocityZ', 'angularVelocity',
  'frontWheelAngle', 'travel', 'pathDistance', 'bodyPitch', 'bodyRoll', 'bodyBob'];
const near = (a, b, eps = 1e-8, label = 'value') => assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= eps,
  `${label}: ${a} != ${b} (tolerance ${eps})`);
const finiteState = s => { for (const key of finiteFields) assert.ok(Number.isFinite(s[key]), `${key} is not finite: ${s[key]}`);for(const value of [...Object.values(s.quaternion),...Object.values(s.angularVelocity3D)])assert.ok(Number.isFinite(value),'3D orientation and angular velocity must be finite'); };
const atRest = s => { for (const key of restFields) near(s[key], 0, 1e-12, key);for(const [axis,value] of Object.entries(s.angularVelocity3D))near(value,0,1e-12,`angularVelocity3D.${axis}`); assert.equal(s.active, false); assert.equal(s.moving, false); };
const snapshot = s => Object.fromEntries(finiteFields.map(key => [key, s[key]]));
const ownedCareer = { version: ECONOMY_CONFIG.saveVersion, money: 0,
  ownedVehicleIds: VEHICLE_CONFIG.map(v=>v.id), characterId: 'bacon', completedRuns: 0 };
let apps;
function make({ id = 'pickup', ...options } = {}) {
  const app = createAppDom({ startDriving: false, career: id==='bmwreward'?earnedRewardCareer({career:ownedCareer}):ownedCareer, ...options });
  apps.push(app); app.debug.gameplay.state.cooldown = 0;
  assert.equal(app.debug.enterVehicle(id), true);
  app.time = 1000; app.frame(app.time); return app;
}
function frame(app, seconds = 1/60) { app.time += seconds * 1000; app.frame(app.time); finiteState(app.debug.model.state); }
function advance(app, seconds, fps = 60) { for (let i=0; i<Math.round(seconds*fps); i++) frame(app, 1/fps); }
function check(name, run) {
  apps = [];
  try { const details = run(); report.checks.push({ name, passed: true, details }); console.log(`PASS ${name}`); }
  catch(error) { report.checks.push({ name, passed: false, error: error.stack }); console.error(`FAIL ${name}: ${error.stack}`); }
  finally { for(const app of apps) app.dispose(); }
}
function setVelocity(model, vx, vz, omega = 0) {
  model.body.setLinvel({x:vx,y:0,z:vz},true);model.body.setAngvel({x:0,y:omega,z:0},true);
  model.setPose({},{clearMotion:false});
}
function setupPose(app, pose, vx=0, vz=0, omega=0) {
  const d=app.debug; d.model.pause();
  const groundPose=fitTruckToGround(THREE,pose.x,pose.z,pose.heading);
  d.model.setPose({...pose,y:groundPose.position.y,quaternion:groundPose.quaternion});d.physics.resetTime();
  setVelocity(d.model,vx,vz,omega); d.applyTruckPose(); d.followTruck(0,true);
  finiteState(d.model.state);
}

check('Actual app driving, reversing and fuel agree at 30, 60 and 120 Hz', () => {
  const outcomes=[];
  for(const fps of [30,60,120]) {
    const app=make(),d=app.debug,s=d.model.state; let distance=0,rolling=0,maxStep=0;
    for(const phase of [
      {seconds:2,active:true,steering:0,gear:'D'},
      {seconds:1,active:true,steering:.2,gear:'D'},
      {seconds:1,active:true,steering:-.2,gear:'D'},
      {seconds:1,active:false,steering:0,gear:'D'},
      {seconds:1.5,active:true,steering:0,gear:'R'},
      {seconds:1.5,active:true,steering:0,gear:'D'},
    ]) {
      d.model.setGear(phase.gear); d.model.setInput(phase);
      for(let i=0;i<phase.seconds*fps;i++) {
        const before={x:s.x,z:s.z}; frame(app,1/fps);
        distance+=s.pathDistance; rolling+=s.travel;
        maxStep=Math.max(maxStep,Math.hypot(s.x-before.x,s.z-before.z));
        assert.equal(s.blocked,false); assert.equal(d.gameplay.state.mode,'driving');
        assert.ok(truckInRoad(s.x,s.z,s.heading));
      }
    }
    near(d.gameplay.state.fuels.pickup,100-distance*vehicleConfig('pickup').consumption,1e-8,'Actual path fuel');
    near(d.cameraState.state.distanceSinceLook,distance,1e-8,'Camera substep path');
    const result={fps,...snapshot(s),distance,rolling,maxStep,fuel:d.gameplay.state.fuels.pickup}; outcomes.push(result);
    if(outcomes.length>1) for(const key of ['x','z','heading','speed','linearSpeed','velocityX','velocityZ','angularVelocity','frontWheelAngle','wheelSpin','bodyPitch','bodyRoll','bodyBob','distance','rolling','fuel'])
      near(result[key],outcomes[0][key],2e-7,`${fps} Hz ${key}`);
  }
  return outcomes;
});

check('A long render stall advances only the bounded physics budget and leaves no catch-up debt', () => {
  const outcomes=[];
  const budget=6*PHYSICS_FIXED_STEP;
  for(const stall of [budget,30]) {
    const app=make(),d=app.debug,s=d.model.state;
    d.model.setInput({active:true,steering:.15}); advance(app,1);
    frame(app,.004); const before={x:s.x,z:s.z},steps=d.physics.stats.steps; frame(app,stall);
    const leap=Math.hypot(s.x-before.x,s.z-before.z);
    assert.equal(d.physics.stats.steps-steps,6,'A stall consumes six shared 60 Hz physics ticks');
    assert.ok(leap <= vehicleConfig('pickup').maxSpeed*budget+.03,`Stall leap ${leap}`);
    for(let i=0;i<12;i++) frame(app,1/120);
    outcomes.push({...snapshot(s),fuel:d.gameplay.state.fuels.pickup,leap});
  }
  for(const key of [...finiteFields,'fuel','leap']) near(outcomes[0][key],outcomes[1][key],2e-8,`Stall ${key}`);
  return outcomes;
});

check('Road gradient matches the rendered height convention and influences actual driving', () => {
  const gradients=[];
  for(const distance of [25,43,450,900,1400,1900,2450,3000,3550,4100,4700,5350]) {
    const p=routePointAtDistance(distance),g=roadGroundGradient(p.x,p.z),h=.001;
    near(g.x,(groundHeight(p.x+h,p.z)-groundHeight(p.x-h,p.z))/(2*h),1e-7,'Gradient x');
    near(g.z,(groundHeight(p.x,p.z+h)-groundHeight(p.x,p.z-h))/(2*h),1e-7,'Gradient z');
    gradients.push({distance,...p,gradient:g});
  }
  const p=gradients.filter(p=>!bridgeAtProgress(p.progress)).reduce((a,b)=>Math.abs(a.gradient.z)>Math.abs(b.gradient.z)?a:b);
  assert.ok(Math.abs(p.gradient.z)>.005,'Test requires a real nonzero route grade');
  const app=make(),d=app.debug,s=d.model.state;

  setupPose(app,{x:p.x,z:p.z,heading:0},0,-4);
  const flatPhysics=createPhysicsWorld({THREE,physicsTestTrack:{colliders:[{type:'box',halfExtents:[100,.5,100],position:[0,-.5,0]}]}});
  const flat=createRapierDrivingModel({world:flatPhysics.world,x:0,z:0,vehicleId:'pickup',maxSpeed:vehicleConfig('pickup').maxSpeed,groundSurface:()=>roadGroundSurface(p.x,p.z,'pickup')});
  try{
    // Let each real suspension establish its support before comparing coasting.
    for(let i=0;i<60;i++){frame(app);flatPhysics.step(PHYSICS_FIXED_STEP,flat);}
    setVelocity(d.model,0,-4);setVelocity(flat,0,-4);
    for(let i=0;i<30;i++){frame(app);flatPhysics.step(PHYSICS_FIXED_STEP,flat);}
    const gravitySign=Math.sign(p.gradient.z);
    assert.ok((s.speed-flat.state.speed)*gravitySign>1e-5,'Road gradient must change longitudinal acceleration with the correct sign');
    assert.ok(s.grounded,'The road comparison requires actual tire support');
    const rendered=d.model.getRenderState(d.physics.alpha);
    const expectedPosition=new THREE.Vector3(rendered.x,rendered.y,rendered.z);
    const expectedQuaternion=new THREE.Quaternion(rendered.quaternion.x,rendered.quaternion.y,rendered.quaternion.z,rendered.quaternion.w);
    near(d.rig.root.position.distanceTo(expectedPosition),0,1e-10,'Interpolated physical position');
    near(Math.abs(d.rig.root.quaternion.dot(expectedQuaternion)),1,1e-7,'Interpolated physical rotation');
    return {sampleCount:gradients.length,atDistance:p.distance,gradient:p.gradient,roadSpeed:s.speed,flatSpeed:flat.state.speed};
  }finally{flat.dispose();flatPhysics.dispose();}
});

check('Lateral sliding consumes true path fuel and camera distance without inventing wheel travel', () => {
  const app=make(),d=app.debug,s=d.model.state;
  setupPose(app,{x:0,z:6,heading:0},4,0);
  d.cameraState.lookBegin();d.cameraState.lookDelta(.7,.05);d.cameraState.lookEnd();
  const fuel=d.gameplay.state.fuels.pickup,before={x:s.x,z:s.z}; frame(app,.05);
  const displacement=Math.hypot(s.x-before.x,s.z-before.z);
  assert.ok(s.pathDistance>.05,'Lateral velocity must produce actual movement');
  assert.ok(s.pathDistance>Math.abs(s.travel)+.03,'Rolling travel must not substitute for sideways path');
  assert.ok(s.pathDistance>=displacement-1e-9,'Substep path cannot be shorter than endpoint displacement');
  near(fuel-d.gameplay.state.fuels.pickup,s.pathDistance*vehicleConfig('pickup').consumption,1e-10,'Lateral fuel');
  near(d.cameraState.state.distanceSinceLook,s.pathDistance,1e-10,'Lateral camera');
  assert.equal(app.ids.get('speed-value').textContent,String(Math.round(s.linearSpeed*3.6)),'HUD uses speed magnitude during a skid');
  return {pathDistance:s.pathDistance,rolling:s.travel,displacement,fuelUsed:fuel-d.gameplay.state.fuels.pickup,speed:s.speed,linearSpeed:s.linearSpeed};
});

check('Zero-duration app frames never repeat previous path, fuel use or camera distance', () => {
  const app=make(),d=app.debug,s=d.model.state;
  d.model.setInput({active:true});advance(app,.5);
  const before={...snapshot(s),fuel:d.gameplay.state.fuels.pickup,cameraDistance:d.cameraState.state.distanceSinceLook};
  frame(app,0);frame(app,0);
  for(const key of ['x','z','heading','velocityX','velocityZ','angularVelocity','wheelSpin']) near(s[key],before[key],0,`Zero frame ${key}`);
  near(d.gameplay.state.fuels.pickup,before.fuel,0);near(d.cameraState.state.distanceSinceLook,before.cameraDistance,0);
  near(s.pathDistance,0,0);near(s.travel,0,0);
});

check('Held wheel plus a second-pointer reverse pedal brakes before rolling in reverse', () => {
  const app=make(),d=app.debug,s=d.model.state;
  app.pointer(app.wheel,'pointerdown',0,1);app.pointer(app.pedal,'pointerdown',0,2);advance(app,1.5);
  const startingSpeed=s.speed,startingSpin=s.wheelSpin; assert.ok(startingSpeed>1);
  app.pointer(app.pedal,'pointerup',0,2);const reverse=app.ids.get('reverse-pedal');app.pointer(reverse,'pointerdown',0,2);
  assert.equal(s.gear,'R');assert.equal(d.input.state.reversePointerId,2);assert.equal(d.input.state.pointerId,1);assert.equal(s.active,true);
  frame(app,PHYSICS_FIXED_STEP);assert.ok(s.speed>0&&s.speed<startingSpeed,'Opposite gear must first brake forward momentum');
  let nearStop=false,firstReverse,brakingFrames=0,previous=s.speed;
  for(let i=0;i<600;i++) {
    frame(app,1/120);brakingFrames++;
    if(Math.abs(s.speed)<.25)nearStop=true;
    if(s.speed<-.05){firstReverse={speed:s.speed,previous};break;}
    assert.ok(s.speed<=previous+1e-6,'Forward motion should decelerate while R remains held'); previous=s.speed;
  }
  assert.ok(firstReverse&&nearStop,'Reverse must begin only after a near-zero transition');
  const spinAtReverse=s.wheelSpin; advance(app,1);
  assert.ok(s.speed<0);assert.ok(s.travel<0);assert.ok(s.wheelSpin<spinAtReverse);assert.ok(s.pathDistance>0);
  app.pointer(reverse,'pointerup',0,2);assert.equal(s.active,false);assert.ok(s.linearSpeed>0,'Normal pedal release must coast');
  assert.equal(d.input.state.pointerId,1,'Throttle release retains the independent steering pointer');app.pointer(app.wheel,'pointerup',0,1);
  return {startingSpeed,startingSpin,firstReverse,brakingFrames,reverseSpeed:s.speed};
});

check('A real off-centre facade contact changes planar momentum without a teleport', () => {
  const app=make(),d=app.debug,s=d.model.state,p=routePointAtDistance(25);
  frame(app); // Build Rapier's broad phase before seeding a moving contact.
  // Use the rendered west facade; the route's conservative driving envelope
  // is no longer an invisible collision wall under Rapier.
  const ray=new (getRapier().Ray)({x:p.x,y:groundHeight(p.x,p.z)+1.2,z:p.z},{x:-1,y:0,z:0});let wall;
  d.physics.world.colliders.forEach(collider=>{
    if(collider.userData?.tag!=='wall')return;
    const hit=collider.castRayAndGetNormal(ray,40,true);
    if(hit&&(!wall||hit.timeOfImpact<wall.timeOfImpact))wall=hit;
  });
  assert.ok(wall,'The scenario requires an actual west facade collider');
  assert.ok(wall.normal.x>.99,'The selected facade must face the road');
  const wallX=p.x-wall.timeOfImpact,heading=p.heading-.12,geometry=d.model.physicsGeometry;
  const corners=[];
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])corners.push(new THREE.Vector3(
    geometry.colliderCenter.x+x*geometry.colliderHalf.x,geometry.colliderCenter.y+y*geometry.colliderHalf.y,geometry.colliderCenter.z+z*geometry.colliderHalf.z));
  const clearance=state=>Math.min(...corners.map(corner=>corner.clone().applyQuaternion(state.quaternion).x+state.x-wallX));
  const radius=-clearance({x:wallX,quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading)});
  setupPose(app,{x:wallX+radius+.1,z:p.z,heading},-9,-4);
  assert.ok(clearance(s)>.09,'Edge-case setup begins clear of the physical facade');
  let contacts=0,maxStep=0,maxAngular=0,minClearance=clearance(s),firstContact;
  for(let i=0;i<100;i++) {
    const before={x:s.x,z:s.z,velocityX:s.velocityX,velocityZ:s.velocityZ,angularVelocity:s.angularVelocity};frame(app,1/120);
    const step=Math.hypot(s.x-before.x,s.z-before.z);maxStep=Math.max(maxStep,step);maxAngular=Math.max(maxAngular,Math.abs(s.angularVelocity));
    const physicsTravel=Math.hypot(before.velocityX,before.velocityZ)*d.physics.frameSeconds;
    assert.ok(step<=physicsTravel+.03,`Contact displaced the car by ${step} m beyond its ${d.physics.frameSeconds}s physics budget (${physicsTravel} m)`);
    minClearance=Math.min(minClearance,clearance(s));
    // The discrete solver can overlap during one approach tick, then separates
    // the chassis through contact impulses over subsequent ticks.
    assert.ok(clearance(s)>-9*PHYSICS_FIXED_STEP,`Contact overlap exceeds one physics tick of approach travel (${clearance(s)} m)`);
    if(s.blocked){contacts++;firstContact??={before,after:snapshot(s)};}
  }
  assert.ok(contacts>0,'Scenario must reach the actual facade');
  assert.ok(maxAngular>.001,'Off-centre impulse must change yaw momentum');
  assert.ok(Math.abs(s.velocityX)<1,'Wall-normal momentum must be removed without a bounce');
  assert.ok(clearance(s)>-.005,'The settled chassis must separate from the facade');
  return {contacts,maxStep,maxAngular,minClearance,firstContact,final:snapshot(s)};
});

check('Blur, resize and hidden-tab safety resets clear every planar momentum channel', () => {
  const app=make(),d=app.debug,s=d.model.state;
  for(const reason of ['blur','resize','hidden']) {
    app.pointer(app.wheel,'pointerdown',0,1);app.pointer(app.wheel,'pointermove',40,1);app.pointer(app.pedal,'pointerdown',0,2);advance(app,.4);
    assert.ok(s.linearSpeed>0);setVelocity(d.model,s.velocityX+1,s.velocityZ,.7);frame(app,.004);
    if(reason==='hidden'){app.doc.hidden=true;app.doc.dispatch('visibilitychange');}else app.win.dispatch(reason);
    atRest(s);assert.equal(d.input.state.active,false);assert.equal(app.wheel.hasPointerCapture(1),false);assert.equal(app.pedal.hasPointerCapture(2),false);
    const pos={x:s.x,z:s.z,heading:s.heading},steps=d.physics.stats.steps; app.time+=30000;app.frame(app.time);
    assert.equal(d.physics.stats.steps,steps,`${reason} discards elapsed time while interrupted`);
    for(const key of ['x','z','heading'])near(s[key],pos[key],0,`${reason} no catch-up`);
    if(reason==='hidden'){app.doc.hidden=false;app.doc.dispatch('visibilitychange');}
    if(reason==='blur')app.win.dispatch('focus');
    frame(app,.05);assert.ok(d.physics.stats.steps-steps<=3,`${reason} resumes only the current frame's physics budget`);
  }
});

check('Overview pause, garage return and re-entry clear stale forces, spin and teleport distance', () => {
  const app=make({devServer:true}),d=app.debug;
  app.pointer(app.wheel,'pointerdown',0,1);app.pointer(app.wheel,'pointermove',45,1);app.pointer(app.pedal,'pointerdown',0,2);advance(app,.75);
  app.ids.get('mode-toggle').dispatch('click');assert.equal(d.driving,false);atRest(d.model.state);
  app.ids.get('mode-toggle').dispatch('click');assert.equal(d.driving,true);atRest(d.model.state);
  app.pointer(app.pedal,'pointerdown',0,2);advance(app,.2);
  app.ids.get('garage-button').dispatch('click');assert.equal(d.gameplay.state.mode,'walking');
  for(const v of d.garage.vehicles){atRest(v.model.state);near(v.model.state.wheelSpin,0,0);near(v.model.state.x,Math.fround(v.park.x),0);near(v.model.state.z,Math.fround(v.park.z),0);}
  assert.equal(d.gameplay.state.run,null);
  for(const id of ['van','rover','pickup']) {
    d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle(id),true);
    const s=d.model.state;atRest(s);near(s.x,Math.fround(GAMEPLAY.roadSpawn.x),0);near(s.z,Math.fround(GAMEPLAY.roadSpawn.z),0);near(s.wheelSpin,0,0);
    near(d.cameraState.state.distanceSinceLook,0,0);near(d.gameplay.state.fuels[id],vehicleConfig(id).capacity,0);
    frame(app,5);atRest(s);near(s.pathDistance,0,0);near(d.cameraState.state.distanceSinceLook,0,0);
    app.ids.get('garage-button').dispatch('click');
  }
});

check('Empty fuel with sideways/angular momentum returns safely and cannot pay a coincident delivery', () => {
  const app=make(),d=app.debug,p=d.garage.deliveries[0];
  setupPose(app,{x:p.x,z:p.z,heading:0},2,-3,.5);
  let garageReason;const returnToGarage=d.gameplay.returnToGarage;d.gameplay.returnToGarage=reason=>{garageReason=reason;return returnToGarage(reason);};
  app.pointer(app.pedal,'pointerdown',0,1);
  d.renderer.domElement.dispatch('pointerdown',{pointerId:9,button:0,clientX:100,clientY:100});
  d.gameplay.state.fuels.pickup=0;frame(app,1/60);
  assert.equal(d.gameplay.state.mode,'walking');assert.equal(d.gameplay.state.money,0);assert.equal(d.gameplay.state.completedRuns,0);assert.equal(d.gameplay.state.run,null);
  assert.equal(d.input.state.active,false);assert.equal(d.lookInput.active,false);assert.equal(d.renderer.domElement.hasPointerCapture(9),false);
  for(const v of d.garage.vehicles){atRest(v.model.state);near(v.model.state.wheelSpin,0,0);assert.equal(v.cargo.visible,false);}
  assert.equal(garageReason,'empty','Fuel exhaustion is the reason for the safe return');
});

check('All eleven vehicle configurations retain finite dynamics and their own fuel accounting', () => {
  const outcomes=[];
  for(const spec of VEHICLE_CONFIG) {
    const app=make({id:spec.id}),d=app.debug,s=d.model.state;let distance=0;
    d.model.setInput({active:true,steering:.12});
    for(let i=0;i<240;i++){frame(app,1/120);distance+=s.pathDistance;assert.equal(s.blocked,false);assert.ok(s.linearSpeed<=spec.maxSpeed+.2);}
    const minimumSpeed=Math.min(spec.maxSpeed*.4,spec.acceleration*2*.65);
    assert.ok(s.linearSpeed>minimumSpeed,`${spec.id} must accelerate according to its catalog engine (${s.linearSpeed} <= ${minimumSpeed})`);
    near(d.gameplay.state.fuels[spec.id],spec.capacity-distance*spec.consumption,1e-8);
    outcomes.push({id:spec.id,maxSpeed:spec.maxSpeed,...snapshot(s),distance,fuel:d.gameplay.state.fuels[spec.id]});
  }
  return outcomes;
});

report.passed=report.checks.every(c=>c.passed);report.passedChecks=report.checks.filter(c=>c.passed).length;
fs.mkdirSync(new URL('../../physics-review/independent/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../../physics-review/independent/latest-integration.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`Rapier app integration: ${report.passedChecks}/${report.checks.length} checks passed.`);
process.exitCode=report.passed?0:1;
