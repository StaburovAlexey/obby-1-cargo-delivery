#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { buildCity, routeHeight, routeCenter } from '../dist/scene.js';
import { branchCenter, routePointAtProgress } from '../dist/road-layout.js';
import { TOW_DRIVING, createDrivingModel, moveWithContacts, steeringTarget } from '../dist/driving-model.js';
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
function routePoint(y,offset=0){const p=routePointAtProgress(y);return {...p,x:p.x+offset*p.right.x,z:p.z+offset*p.right.z};}
function run(model,seconds,dt=1/60){for(let i=0;i<Math.round(seconds/dt);i++)model.step(dt);return model.state;}

check('Retained Tow UI/view configuration and city mesh adaptations are explicit',()=>{
 for(const [key,value]of Object.entries({maxSpeed:11,accelerationSeconds:1.3,inertiaSeconds:2.2,steeringStrength:1,maximumWheelAngle:.48,steeringDeadzone:.08,steeringResponseSeconds:.22,wheelbase:3.2,sourceWheelRadius:.48,wheelRadius:.68,maxDelta:.05,movingThreshold:.05,followSmoothing:7,cameraFov:70}))near(TOW_DRIVING[key],value,0,key);
 assert.ok(Object.isFrozen(TOW_DRIVING));return{sourceForward:'+Z',cityForward:'-Z',sourceRadius:.48,cityRadius:.68,physicsWheelbase:3.2,visualWheelbase:3.36};
});
check('Exact deadzone, nonlinear steering response, and exponential response',()=>{
 for(const input of[-1,-.55,-.0801,-.08,-.079,0,.079,.08,.0801,.55,1]){
  const magnitude=Math.max(0,(Math.abs(input)-.08)/.92),expected=-Math.sign(input)*magnitude*(.55+.45*magnitude)*.48;
  near(steeringTarget(input),expected,1e-14,`target ${input}`);
  const model=createDrivingModel();model.setInput({steering:input,active:false});model.step(.05);
  near(model.state.frontWheelAngle,expected*(1-Math.exp(-.05/.44)),1e-14,'filtered steering');
 }
 near(steeringTarget(100),-.48);near(steeringTarget(-100),.48);
 assert.ok(Math.abs(steeringTarget(.5))<.24,'near-center steering should be gentler than linear');
});
check('Collision solver uses source 0.15 m combined translation/rotation steps',()=>{
 const position={x:0,z:0},rotation={y:0},travel=4,yaw=.8,reach=3.3;let calls=0,px=0,pz=0,py=0,maxStep=0;
 assert.equal(moveWithContacts(position,rotation,travel,yaw,reach,()=>{calls++;const combined=Math.hypot(position.x-px,position.z-pz)+Math.abs(rotation.y-py)*reach;maxStep=Math.max(maxStep,combined);px=position.x;pz=position.z;py=rotation.y;return undefined;}),false);
 assert.equal(calls,Math.ceil((travel+yaw*reach)/.15));assert.ok(maxStep<=.15+1e-12);near(rotation.y,.8);
 return{steps:calls,maxCombinedStep:maxStep};
});
check('Thin obstacles block head-on travel without tunneling inside the road corridor',()=>{
 const wall={name:'test thin wall',minX:-60,maxX:60,minZ:-.01,maxZ:.01};
 for(const travel of[1,20,200]){const position={x:0,z:10},rotation={y:0};moveWithContacts(position,rotation,travel,0,3.3,()=>getTruckContact(position.x,position.z,rotation.y,[wall]));assert.ok(position.z>=2.92-1e-9);assert.equal(overlapsTruck(position.x,position.z,rotation.y,wall),false);}
});
check('Confined-corner corrections cannot teleport or preserve a blocked yaw',()=>{
 const position={x:2,z:3},rotation={y:.2};const collided=moveWithContacts(position,rotation,5,.8,3.3,()=>({normalX:1,normalZ:0,depth:1}));assert.equal(collided,true);near(position.x,2,0);near(position.z,3,0);near(rotation.y,.2,0);
});
check('Road projection follows the curved generated centerline at all elevations',()=>{
 let samples=0,maxError=0;
 for(let y=-16;y<=69;y+=.25)for(const offset of[-7.8,-5.1,-3,0,3,5.1,7.8]){const p=routePoint(y,offset),actual=projectRoad(p.x,p.z);near(actual.y,y,.0002,'projected distance');near(actual.offset,offset,.0002,'projected offset');maxError=Math.max(maxError,Math.abs(actual.y-y),Math.abs(actual.offset-offset));samples++;}
 return{samples,maxError};
});
check('Four-wheel fit stays finite and supported across route heights, curves, shoulders',()=>{
 let samples=0,minClearance=Infinity,maxRoadClearance=0;
 for(let y=-16;y<=81;y+=.5)for(const offset of[-6,-3,0,3,6])for(const delta of[0,Math.PI/2,Math.PI]){const p=routePoint(y,offset),fit=fitTruckToGround(THREE,p.x,p.z,p.heading+delta);finite([...fit.position,...fit.quaternion,...fit.normal,...fit.clearances]);near(fit.quaternion.length(),1,1e-12);near(fit.normal.length(),1,1e-12);assert.ok(fit.normal.y>.85);assert.ok(Math.min(...fit.clearances)>=-1e-10);near(Math.min(...fit.clearances),SUPPORT_CLEARANCE,1e-10);minClearance=Math.min(minClearance,...fit.clearances);if(offset===0)maxRoadClearance=Math.max(maxRoadClearance,...fit.clearances);samples++;}
 assert.ok(maxRoadClearance<.04+SUPPORT_CLEARANCE,`road fit floats ${maxRoadClearance} m`);return{poses:samples,minClearance,maxRoadClearance};
});
check('Uphill and cross-slope body orientation agrees with wheel contacts',()=>{
 const p=routePoint(285),uphill=fitTruckToGround(THREE,p.x,p.z,p.heading),reverse=fitTruckToGround(THREE,p.x,p.z,p.heading+Math.PI),sideways=fitTruckToGround(THREE,p.x,p.z,p.heading+Math.PI/2);


 const f=new THREE.Vector3(0,0,-1),r=new THREE.Vector3(1,0,0);assert.ok(f.clone().applyQuaternion(uphill.quaternion).y>.005);assert.ok(f.clone().applyQuaternion(reverse.quaternion).y<-.005);assert.ok(r.clone().applyQuaternion(sideways.quaternion).y>.005);near(uphill.normal.dot(new THREE.Vector3(0,1,0).applyQuaternion(uphill.quaternion)),1,1e-12);
});

const city=buildCity(THREE,{seed:42});
try{
 check('City obstacle collection excludes the moving truck and visual-only details',()=>{
  const obstacles=collectObstacles(THREE,city);assert.ok(obstacles.every(o=>/^Residence /.test(o.name)));assert.ok(!obstacles.some(o=>/Tree|Lamp|Pump|Portal/.test(o.name)));assert.ok(!obstacles.some(o=>/truck|stud|window|roof/i.test(o.name)));for(const o of obstacles){finite([o.minX,o.maxX,o.minZ,o.maxZ]);assert.ok(o.minX<o.maxX&&o.minZ<o.maxZ);}assert.equal(getTruckContact(1.8,9.8,0,obstacles),undefined);return{obstacles:obstacles.length};
 });
 check('Rendered wide road and edge markings are physically flush with the sampler',()=>{
  assert.equal(city.group.getObjectByName('Flush road markings'),undefined);assert.ok(city.group.getObjectByName('Continuous 30m-wide road').material.userData.embeddedRoadMarkings);
  const names=['Continuous 30m-wide road'];let witnesses=0,maxDifference=0;
  for(const name of names){const mesh=city.group.getObjectByName(name);assert.ok(mesh,`Missing ${name}`);const p=mesh.geometry.attributes.position;
   for(let i=0;i<p.count;i++){const difference=Math.abs(p.getY(i)-groundHeight(p.getX(i),p.getZ(i)));maxDifference=Math.max(maxDifference,difference);assert.ok(difference<.00005,`${name} vertex rises ${difference} above/below sampler`);witnesses++;}
  }
  assert.ok(witnesses>2000);return{witnesses,maxDifference,flushMeshes:names};
 });
 check('Mesh-free wheel contacts stay supported by actual road triangles',()=>{
  const root=new THREE.Group(),rig=createVehicleRig(THREE,root),road=city.group.getObjectByName('Continuous 30m-wide road'),ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);let minClearance=Infinity,contacts=0,worst;
  try{for(const [branch,y] of[...[25,35,43,43.7,55,65].map(y=>['main',y]),...[96,103,110,118,125,170,205,240,265,285,330,350,390,410,435,460,480,510,535,562,590,610].flatMap(y=>[['left',y],['right',y]])])for(const heading of[0,Math.PI/4,Math.PI/2,Math.PI])for(const spin of[0,.2]){
   const point=routePointAtProgress(y,{branch:branch==='left'?'alternate':'main'}),pose=fitTruckToGround(THREE,point.x,point.z,heading,point);rig.update({position:pose.position,quaternion:pose.quaternion,steerAngle:-.48,wheelSpin:spin});
   root.updateMatrixWorld(true);
   for(const wheel of rig.wheels){
    assert.equal(wheel.parts,undefined);assert.equal(wheel.mesh,undefined);
    const center=wheel.localPosition.clone().applyMatrix4(root.matrixWorld);
    ray.set(new THREE.Vector3(center.x,center.y+20,center.z),down);const hit=ray.intersectObject(road,false)[0];if(!hit)continue;
    const clearance=center.y-wheel.radius/pose.normal.y-hit.point.y;if(clearance<minClearance){minClearance=clearance;worst={branch,y,heading,spin,wheel:wheel.name,clearance};}contacts++;
   }
  }}finally{rig.dispose();}
  assert.ok(contacts>1000,'Road triangle checks must exercise all four contact points');assert.equal(root.children.length,0);
  assert.ok(minClearance>=-.0001,`Contact penetration against actual mesh: ${JSON.stringify(worst)}`);return{contacts,minClearance};
 });
 check('Ground pose and mesh-free contact rig remain coherent without scene-resource growth',()=>{
  const before={...city.stats},root=new THREE.Group(),rig=createVehicleRig(THREE,root);try{
   for(const [y,heading,spin,steer]of[[0,0,0,0],[30,-.2,3,-.48],[45,Math.PI/2,-4,.4],[74,Math.PI,7,0]]){
    const p=routePoint(y),pose=fitTruckToGround(THREE,p.x,p.z,heading);rig.update({position:pose.position,quaternion:pose.quaternion,steerAngle:steer,wheelSpin:spin});root.updateMatrixWorld(true);
    near(root.position.distanceTo(pose.position),0,1e-12);assert.ok(root.quaternion.angleTo(pose.quaternion)<1e-7);
    for(const wheel of rig.wheels){const actual=wheel.localPosition.clone().applyMatrix4(root.matrixWorld),expected=wheel.localPosition.clone().applyQuaternion(pose.quaternion).add(pose.position);near(actual.distanceTo(expected),0,3e-6,`${wheel.name} grounded center`);near(wheel.wheelSpin,spin,0);near(wheel.steerAngle,wheel.front?steer:0,0);}
    near(rig.pose.steerAngle,steer,0);near(rig.pose.wheelSpin,spin,0);assert.equal(root.children.length,0);
   }
   assert.deepEqual(city.stats,before);
  }finally{rig.dispose();}
 });
}finally{city.dispose();}


function setupInput(){const dom=createInputDom(),inputs=[],gears=[];let starts=0,safety=0;const api=createVehicleInput({root:dom.root,onInput:value=>inputs.push(value),onGear:value=>gears.push(value),onStart:()=>starts++,onSafetyReset:()=>safety++});return{...dom,api,inputs,gears,get starts(){return starts;},get safety(){return safety;}};}
check('Input starts in D with zero throttle and no invented keyboard driving',()=>{
 const h=setupInput();try{assert.equal(STEERING_MAX_ANGLE,135);assert.equal(h.api.state.gear,'D');assert.equal(h.api.state.active,false);assert.equal(h.root.dataset.throttle,'false');assert.equal(h.handle.style.getPropertyValue('--gear-progress'),'-1');assert.ok(h.d.classList.contains('is-active'));assert.equal(h.selector.getAttribute('role'),'button');assert.equal(h.selector.tabIndex,0);for(const key of['w','a','s','d','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'])h.win.dispatch('keydown',{key});assert.equal(h.api.state.active,false);near(h.api.state.steering,0);}finally{h.api.destroy();}
});
check('135-degree wheel gesture starts throttle and release clears/coasts input',()=>{
 const h=setupInput();try{h.pointer(h.wheel,'pointerdown',0);assert.equal(h.api.state.active,true);assert.equal(h.starts,1);assert.ok(h.wheel.hasPointerCapture(1));h.pointer(h.wheel,'pointermove',90);near(h.api.state.steering,2/3);h.pointer(h.wheel,'pointermove',135);near(h.api.state.steering,1);assert.equal(h.wheel.style.getPropertyValue('--steering-angle'),'135deg');h.pointer(h.wheel,'pointermove',175);near(h.api.state.steering,1);h.pointer(h.wheel,'pointerup',175);assert.equal(h.api.state.active,false);near(h.api.state.steering,0);assert.ok(h.wheel.classList.contains('is-returning'));assert.ok(!h.wheel.hasPointerCapture(1));assert.deepEqual(h.inputs.at(-1),{steering:0,active:false,started:false});}finally{h.api.destroy();}
});
check('Angular wrap and center-disc crossing cannot cause steering jumps',()=>{
 near(shortestAngleDegrees(-358*Math.PI/180),2,1e-10);const bounds={left:0,top:0,width:100,height:100};assert.equal(fingerAngleAt({clientX:65,clientY:50},bounds,100),undefined);near(fingerAngleAt({clientX:66,clientY:50},bounds,100),0);
 const h=setupInput();try{h.pointer(h.wheel,'pointerdown',179);h.pointer(h.wheel,'pointermove',-179);near(h.api.state.steering,2/135);h.pointer(h.wheel,'pointermove',0,1,{clientX:60,clientY:70});const before=h.api.state.steering;h.pointer(h.wheel,'pointermove',45);near(h.api.state.steering,before);h.pointer(h.wheel,'pointermove',90);near(h.api.state.steering,before+45/135);h.pointer(h.wheel,'pointerup',90);h.pointer(h.wheel,'pointerdown',0,1,{clientX:60,clientY:70});h.pointer(h.wheel,'pointermove',90);near(h.api.state.steering,0);h.pointer(h.wheel,'pointermove',45);near(h.api.state.steering,-1/3);}finally{h.api.destroy();}
});
check('Regrab continues from both rendered wheel and image rotations',()=>{
 const h=setupInput();try{h.wheel.computedTransform='rotate(27deg)';h.image.computedTransform='rotate(13.5deg)';h.pointer(h.wheel,'pointerdown',0);near(h.api.state.steering,.3);h.pointer(h.wheel,'pointermove',27);near(h.api.state.steering,.5);h.pointer(h.wheel,'pointerup',27);h.win.DOMMatrixReadOnly=undefined;h.wheel.computedTransform='matrix(0.7071067811865476,0.7071067811865475,-0.7071067811865475,0.7071067811865476,0,0)';h.image.computedTransform='rotate(-18deg)';h.pointer(h.wheel,'pointerdown',0);near(h.api.state.steering,.2);}finally{h.api.destroy();}
});
check('Only the captured pointer moves/releases; cancel and capture-loss reset',()=>{
 const h=setupInput();try{h.pointer(h.wheel,'pointerdown',0,1,{button:2});assert.equal(h.api.state.active,false);h.pointer(h.wheel,'pointerdown',0);h.pointer(h.wheel,'pointerdown',60,2);assert.equal(h.api.state.pointerId,1);h.pointer(h.wheel,'pointermove',90,2);near(h.api.state.steering,0);h.pointer(h.wheel,'pointerup',90,2);assert.equal(h.api.state.active,true);h.pointer(h.wheel,'pointermove',45);h.pointer(h.wheel,'pointercancel',45);assert.equal(h.api.state.active,false);near(h.api.state.steering,0);h.pointer(h.wheel,'pointerdown',0);h.pointer(h.wheel,'lostpointercapture',0);assert.equal(h.api.state.active,false);near(h.api.state.steering,0);}finally{h.api.destroy();}
});
check('D/R panel, labels, handle, and second pointer each toggle exactly once',()=>{
 const h=setupInput();try{h.pointer(h.wheel,'pointerdown',0);h.pointer(h.wheel,'pointermove',45);const steering=h.api.state.steering;for(const target of[h.selector,h.d,h.r,h.handle]){const before=h.gears.length,old=h.api.state.gear;h.pointer(target,'pointerdown',0,2);h.pointer(target,'pointerup',0,2);target.dispatch('click',{pointerId:2,isPrimary:false});assert.equal(h.gears.length,before+1);assert.notEqual(h.api.state.gear,old);assert.equal(h.api.state.active,true);near(h.api.state.steering,steering);assert.equal(h.api.state.pointerId,1);assert.equal(h.handle.style.getPropertyValue('--gear-progress'),h.api.state.gear==='D'?'-1':'1');}for(const key of['Enter',' ']){const before=h.gears.length,e=h.selector.dispatch('keydown',{key});assert.ok(e.defaultPrevented);assert.equal(h.gears.length,before+1);}const before=h.gears.length;h.d.dispatch('keydown',{key:'Enter'});assert.equal(h.gears.length,before);}finally{h.api.destroy();}
 return 'Simulated pointer/click sequence only; physical mobile event delivery not verified';
});
check('Documented non-primary first-grab safety adaptation works',()=>{
 const h=setupInput();try{h.pointer(h.wheel,'pointerdown',0,2,{isPrimary:false});assert.equal(h.api.state.active,true);assert.equal(h.api.state.pointerId,2);h.pointer(h.wheel,'pointermove',-90,2);near(h.api.state.steering,-2/3);}finally{h.api.destroy();}
 return 'Intentional standalone adaptation: source shell accepts primary wheel pointers only';
});
check('Resize, blur, hidden tab, disable, repeated reset, and destroy release input',()=>{
 const h=setupInput();try{for(const event of['resize','blur','pagehide']){h.pointer(h.wheel,'pointerdown',0);const previous=h.safety;h.win.dispatch(event);assert.equal(h.api.state.active,false);assert.equal(h.safety,previous+1);}h.pointer(h.wheel,'pointerdown',0);h.doc.hidden=false;h.doc.dispatch('visibilitychange');assert.equal(h.api.state.active,true);h.doc.hidden=true;h.doc.dispatch('visibilitychange');assert.equal(h.api.state.active,false);h.pointer(h.wheel,'pointerdown',0);h.api.setEnabled(false);assert.equal(h.root.hidden,true);assert.equal(h.api.state.active,false);h.pointer(h.wheel,'pointerdown',0);const before=h.api.state.gear;h.selector.dispatch('click');assert.equal(h.api.state.gear,before);assert.equal(h.api.state.active,false);h.api.setEnabled(true);assert.equal(h.root.hidden,false);h.api.reset();h.api.reset();h.pointer(h.wheel,'pointerdown',0);h.api.destroy();const n=h.inputs.length,g=h.gears.length;h.api.destroy();h.pointer(h.wheel,'pointerdown',0);h.selector.dispatch('click');h.win.dispatch('blur');assert.equal(h.inputs.length,n);assert.equal(h.gears.length,g);assert.equal(h.api.state.active,false);}finally{h.api.destroy();}
});
check('Touch guard suppresses browser gestures without cancelling control clicks',()=>{
 const h=setupInput();try{for(const type of['dblclick','contextmenu','selectstart','dragstart','gesturestart','gesturechange','gestureend'])assert.equal(h.root.dispatch(type).defaultPrevented,true);assert.equal(h.root.dispatch('click').defaultPrevented,false);}finally{h.api.destroy();}
});
check('Integrated input release coasts; safety reset clears rigid-body velocities and visual springs',()=>{
 const dom=createInputDom(),model=createDrivingModel();const input=createVehicleInput({root:dom.root,onInput:value=>model.setInput(value),onGear:value=>model.setGear(value),onSafetyReset:()=>model.pause()});try{dom.pointer(dom.wheel,'pointerdown',0);run(model,5);assert.ok(model.state.speed>10.8&&model.state.speed<=11.01);const held=model.state.speed;dom.pointer(dom.wheel,'pointerup',0);near(model.state.speed,held);model.step(.05);assert.ok(model.state.speed>0&&model.state.speed<held);dom.pointer(dom.wheel,'pointerdown',0);dom.pointer(dom.wheel,'pointermove',45);run(model,.5);dom.win.dispatch('blur');assert.equal(model.state.active,false);for(const field of['speed','linearSpeed','velocityX','velocityZ','angularVelocity','frontWheelAngle','travel','pathDistance','bodyPitch','bodyRoll','bodyBob'])near(model.state[field],0,0,field);model.reset();near(model.state.wheelSpin,0);assert.equal(model.state.gear,'D');near(model.state.x,1.8);near(model.state.z,9.8);}finally{input.destroy();}
});


check('Selected vehicle follows with the requested unrestricted fixed-radius camera',()=>{
 const app=createAppDom();try{const {model,camera,controls,rig,renderer}=app.debug;assert.equal(app.debug.driving,true);assert.equal(app.root.hidden,false);assert.equal(controls.enabled,false);near(camera.fov,70);near(model.state.speed,0);const expected=new THREE.Vector3(...[0,1.7+8.3*1.2,13*1.2]).add(rig.root.position);near(camera.position.distanceTo(expected),0,1e-10);app.frame(1000);assert.equal(app.ids.get('loading').hidden,true);const before=camera.position.clone(),beforeUpdates=controls.updates;app.pointer(app.wheel,'pointerdown',0);app.frame(1050);assert.ok(model.state.speed>0);const next=new THREE.Vector3(...[0,1.7+8.3*1.2,13*1.2]).applyAxisAngle(new THREE.Vector3(0,1,0),model.state.heading).add(rig.root.position);near(camera.position.distanceTo(before.lerp(next,1-Math.exp(-.05*7))),0,1e-10);assert.equal(controls.updates,beforeUpdates);assert.equal(renderer.renderCount,2);assert.equal(app.doc.body.dataset.vehicleThrottle,'true');}finally{app.dispose();}
});
check('Application mode switches keep regeneration locked in a car; top Garage clears held throttle',()=>{
 const app=createAppDom();try{
  const originalCity=app.debug.city,originalRig=app.debug.rig,originalSeed=app.debug.city.stats.seed;
  const assertRegenerationLocked=()=>{
   assert.equal(app.ids.get('regenerate').disabled,true);assert.equal(app.ids.get('seed').disabled,true);
   app.ids.get('regenerate').dispatch('click');
   app.ids.get('seed').value=originalSeed+7;app.ids.get('seed').dispatch('change');
   assert.equal(app.debug.city,originalCity);assert.equal(app.debug.rig,originalRig);assert.equal(app.debug.city.stats.seed,originalSeed);
   assert.equal(app.debug.gameplay.state.mode,'driving');assert.equal(app.debug.gameplay.state.selectedId,'pickup');assert.equal(app.debug.character.group.visible,false);
  };
  app.pointer(app.wheel,'pointerdown',0);app.frame(1000);app.frame(1050);
  assertRegenerationLocked();
  app.ids.get('mode-toggle').dispatch('click');
  assert.equal(app.debug.driving,false);assert.equal(app.debug.controls.enabled,true);assert.equal(app.root.hidden,true);near(app.debug.model.state.speed,0);
  assertRegenerationLocked();
  app.ids.get('mode-toggle').dispatch('click');
  assert.equal(app.debug.driving,true);assert.equal(app.debug.controls.enabled,false);assert.equal(app.root.hidden,false);assert.equal(app.debug.model.state.active,false);
  app.pointer(app.wheel,'pointerdown',0);app.selector.dispatch('click');app.frame(1100);app.frame(1150);
  assertRegenerationLocked();
  app.ids.get('garage-button').dispatch('click');
  near(app.debug.model.state.x,app.debug.garage.vehicles[0].park.x);near(app.debug.model.state.z,app.debug.garage.vehicles[0].park.z);
  assert.equal(app.debug.gameplay.state.mode,'walking');near(app.debug.model.state.speed,0);near(app.debug.model.state.wheelSpin,0);assert.equal(app.debug.model.state.active,false);
  assert.equal(app.ids.get('regenerate').disabled,false);assert.equal(app.ids.get('seed').disabled,false);
  app.ids.get('seed').value=originalSeed;app.ids.get('regenerate').dispatch('click');
  assert.notEqual(app.debug.city,originalCity);assert.notEqual(app.debug.rig,originalRig);assert.equal(app.debug.city.stats.seed,originalSeed+1);
  assert.equal(app.debug.gameplay.state.mode,'walking');assert.equal(app.debug.model.state.gear,'D');assert.equal(app.debug.model.state.active,false);
  assert.equal(app.selector.dataset.gear,'D');near(app.debug.model.state.speed,0);
  app.views[2].dispatch('click');assert.equal(app.debug.driving,false);assert.equal(app.ids.get('view-name').textContent,'ЛЕС / ПУСТЫНЯ');
 }finally{app.dispose();}
});
check('Hidden-tab timing reset prevents a catch-up leap on resume',()=>{
 const app=createAppDom();try{app.frame(1000);app.pointer(app.wheel,'pointerdown',0);app.frame(1050);app.doc.hidden=true;app.doc.dispatch('visibilitychange');near(app.debug.model.state.speed,0);const position=[app.debug.model.state.x,app.debug.model.state.z];app.frame(9000);app.doc.hidden=false;app.doc.dispatch('visibilitychange');app.frame(10000);assert.deepEqual([app.debug.model.state.x,app.debug.model.state.z],position);assert.equal(app.debug.model.state.active,false);}finally{app.dispose();}
});

report.notes.push('Tow input and legacy contact utility retain provenance; current force dynamics is tested separately. Exact old kinematics is isolated in tow-baseline.mjs.');
report.notes.push('Renderer-free tests validate JavaScript, generated geometry, and simulated DOM events only. Real browser rendering, visual quality, and physical multi-touch delivery remain unverified.');
report.failedChecks=report.checks.filter(c=>c.status==='failed').length;report.passed=report.failedChecks===0;
fs.writeFileSync(new URL('./latest-driving-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`Driving: ${report.checks.length-report.failedChecks}/${report.checks.length} checks passed.`);process.exitCode=report.failedChecks?1:0;
