import test from 'node:test';
import assert from 'node:assert/strict';
import {createFollowCameraState,drivingCameraScale} from '../dist/follow-camera.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {nitroCareer} from './fixtures/nitro-career.mjs';
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<t,`${a} ~= ${b}`);

test('nitro camera grows throughout the two-second charge to 15 percent at every frame rate',()=>{
 const at=[];
 for(const fps of [30,60,120]){
  const c=createFollowCameraState({mode:'driving'}),base={...c.state};
  c.update({dt:0,nitroActive:true,nitroRemaining:2});near(c.state.nitroScale,1);
  for(let frame=1;frame<2*fps;frame++){
   const before=c.state.nitroScale;
   c.update({dt:1/fps,nitroActive:true,nitroRemaining:2-frame/fps});
   near(c.state.nitroScale,1+.15*frame/(2*fps));assert.ok(c.state.nitroScale>before);
   if(frame===fps){at.push(c.state.nitroScale);near(c.state.nitroScale,1.075);}
  }
  near(c.state.nitroScale,1.15-.075/fps);
  near(c.state.radius,base.radius);near(c.state.yaw,base.yaw);near(c.state.pitch,base.pitch);
  const boosted=c.state.nitroScale;c.update({dt:1/fps,nitroActive:false,nitroRemaining:0});assert.ok(c.state.nitroScale<boosted&&c.state.nitroScale>1);
  for(let i=0;i<fps*2;i++)c.update({dt:1/fps,nitroActive:false});near(c.state.nitroScale,1,1e-6);
 }
 near(at[0],at[1]);near(at[1],at[2]);
});

test('walking, reset, teleport and mode changes clear transient zoom; invalid remaining time cannot increase it',()=>{
 const c=createFollowCameraState();c.update({dt:1,nitroActive:true,nitroRemaining:1});near(c.state.nitroScale,1);
 c.setMode('driving');c.update({dt:1,nitroActive:true,nitroRemaining:NaN});near(c.state.nitroScale,1);
 c.update({dt:1,nitroActive:true,nitroRemaining:1});assert.ok(c.state.nitroScale>1);
 c.update({dt:0,nitroActive:true,teleported:true});near(c.state.nitroScale,1);
 c.update({dt:1,nitroActive:true,nitroRemaining:1});c.setMode('walking');near(c.state.nitroScale,1);
 c.setMode('driving');c.update({dt:1,nitroActive:true,nitroRemaining:1});c.reset();near(c.state.nitroScale,1);
});

test('a second charge continues from the current distance without jumps or accumulated zoom',()=>{
 const c=createFollowCameraState({mode:'driving'});
 c.update({dt:1,nitroActive:true,nitroRemaining:1});near(c.state.nitroScale,1.075);
 c.update({dt:.1,nitroActive:false,nitroRemaining:0});
 const start=c.state.nitroScale;
 c.update({dt:0,nitroActive:true,nitroRemaining:2});near(c.state.nitroScale,start);
 c.update({dt:1,nitroActive:true,nitroRemaining:1});near(c.state.nitroScale,(start+1.15)/2);
 const before=c.state.nitroScale;c.update({dt:1/60,nitroActive:true,nitroRemaining:1});near(c.state.nitroScale,before);
 c.update({dt:1,nitroActive:true,nitroRemaining:0});near(c.state.nitroScale,1.15);
 c.update({dt:0,nitroActive:true,nitroRemaining:2});near(c.state.nitroScale,1.15);
});

test('real follow camera uses actual nitro and does not bake its distance into manual orbit',()=>{
 const f=createAppDom({startDriving:false,career:{...nitroCareer(),nitroLevel:2}});
 try{
  const d=f.debug,g=d.gameplay;g.state.cooldown=0;assert.equal(d.enterVehicle('bmwreward'),true);
  d.model.body.setLinvel({x:0,y:0,z:-20},true);for(let i=0;i<20;i++)f.frame();
  const baseRadius=d.cameraState.state.radius,viewport=drivingCameraScale(d.camera.aspect);
  near(d.camera.position.distanceTo(d.controls.target)/baseRadius,viewport);
  assert.equal(g.activateNitro(d.model.state),true);for(let i=0;i<30;i++)f.frame();
  assert.equal(d.model.state.nitroThrust,true);
  near(d.cameraState.state.nitroScale,1+.15*(2-g.nitro.state.remaining)/2);
  assert.ok(d.cameraState.state.nitroScale>1.03&&d.cameraState.state.nitroScale<1.05);
  near(d.camera.position.distanceTo(d.controls.target)/baseRadius,viewport*d.cameraState.state.nitroScale);
  const canvas=d.renderer.domElement;
  canvas.dispatch('pointerdown',{pointerId:7,button:0,clientX:100,clientY:100,pointerType:'touch'});
  near(d.cameraState.state.radius,baseRadius);
  canvas.dispatch('pointermove',{pointerId:7,button:0,clientX:110,clientY:100,pointerType:'touch'});
  d.followTruck(1/60);near(d.cameraState.state.radius,baseRadius);
  canvas.dispatch('pointerup',{pointerId:7,button:0,clientX:110,clientY:100,pointerType:'touch'});
  const boost=d.cameraState.state.nitroScale;g.nitro.cancel();f.frame();
  assert.ok(d.cameraState.state.nitroScale<boost);assert.ok(d.cameraState.state.nitroScale>1);
  for(let i=0;i<120;i++)d.followTruck(1/60);near(d.cameraState.state.nitroScale,1,1e-6);near(d.cameraState.state.radius,baseRadius);
  g.nitro.start(2);d.model.body.setLinvel({x:0,y:0,z:-20},true);for(let i=0;i<20;i++)f.frame();
  assert.equal(g.activateNitro(d.model.state),true);f.frame();assert.ok(d.cameraState.state.nitroScale>1);
  d.pauseState.set('nitro-camera-test',true);near(d.cameraState.state.nitroScale,1);
  d.pauseState.set('nitro-camera-test',false);d.returnToGarage();near(d.cameraState.state.nitroScale,1);
  g.state.cooldown=0;assert.equal(d.enterVehicle('pickup'),true);d.model.state.nitroThrust=true;
  for(let i=0;i<10;i++)d.followTruck(1/60);near(d.cameraState.state.nitroScale,1);
 }finally{f.dispose();}
});
