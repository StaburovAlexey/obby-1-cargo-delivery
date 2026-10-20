import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {vehicleConfig} from '../dist/economy-config.js';
import {fitTruckToGround} from '../dist/city-driving.js';
import {FOLLOW_CAMERA} from '../dist/follow-camera.js';

test('real application frames keep a steadily driven car stable relative to its follow camera',()=>{
  for(const cadence of [
    {name:'60',dt:()=>1/60},{name:'90',dt:()=>1/90},
    {name:'120',dt:()=>1/120},{name:'144',dt:()=>1/144},
    {name:'variable-60',dt:i=>1/60+(i%2?.004:-.004)},
  ]){
    const app=createAppDom({width:1280,height:720}),d=app.debug,s=d.model.state;
    try{
      d.model.pause();Object.assign(s,{x:0,z:6,heading:0,velocityX:0,velocityZ:-11,speed:11,linearSpeed:11});
      d.model.setInput({active:true,steering:0});d.applyTruckPose();d.followTruck(0,true);
      let now=1000,time=0,index=0,previousY=null,previousZ=null,maxJump=0,path=0;
      const initialFuel=d.gameplay.state.fuels.pickup;app.frame(now);
      while(time<3.5){
        const dt=cadence.dt(index++);time+=dt;now+=dt*1000;app.frame(now);path+=s.pathDistance;
        if(time<2)continue;
        d.camera.updateMatrixWorld(true);
        const p=d.rig.root.position.clone().add(new THREE.Vector3(0,1.7,0)).project(d.camera),y=(-p.y*.5+.5)*720;
        if(previousY!==null)maxJump=Math.max(maxJump,Math.abs(y-previousY));
        if(previousZ!==null)assert.ok(previousZ>d.rig.root.position.z,`${cadence.name}: rendered car stalled between physics ticks`);
        previousY=y;previousZ=d.rig.root.position.z;
        assert.equal(s.linearSpeed,11);assert.equal(s.heading,0);assert.equal(s.blocked,false);
      }
      assert.ok(maxJump<.05,`${cadence.name}: car/camera micro-jump ${maxJump.toFixed(4)} px`);
      assert.ok(Math.abs(initialFuel-d.gameplay.state.fuels.pickup-path*vehicleConfig('pickup').consumption)<1e-8);
      console.log(`${cadence.name} FPS: maximum car/camera jump ${maxJump.toFixed(5)} px`);
    }finally{app.dispose();}
  }
});

test('the rendered car and follow camera share the interpolated turn rather than the latest physics heading',()=>{
  const app=createAppDom({width:1280,height:720}),d=app.debug,s=d.model.state;
  try{
    d.model.pause();Object.assign(s,{x:0,z:6,heading:0,velocityX:0,velocityZ:-11,speed:11,linearSpeed:11,angularVelocity:.5});
    d.model.setInput({active:true,steering:.2});d.applyTruckPose();d.followTruck(0,true);
    app.frame(1000);const dt=1/80;app.frame(1000+dt*1000);
    const rendered=d.model.getRenderState(),pose=fitTruckToGround(THREE,rendered.x,rendered.z,rendered.heading,s.routeContext);
    assert.ok(Math.abs(s.heading-rendered.heading)>1e-5,'the fixture must exercise a partially rendered turn');
    assert.ok(d.rig.root.position.distanceTo(pose.position)<1e-9);
    assert.ok(d.rig.root.quaternion.angleTo(pose.quaternion)<1e-7);
    assert.ok(Math.abs(d.cameraState.state.yaw-rendered.heading*(1-Math.exp(-FOLLOW_CAMERA.returnRate*dt)))<1e-10);
  }finally{app.dispose();}
});

test('camera rotation continues through zero-tick render frames without adding fictitious return distance',()=>{
  const app=createAppDom({width:1280,height:720}),d=app.debug,s=d.model.state;
  try{
    d.model.pause();Object.assign(s,{x:0,z:6,heading:0,velocityX:0,velocityZ:-11,speed:11,linearSpeed:11,angularVelocity:.5});
    d.model.setInput({active:true,steering:.2});d.applyTruckPose();d.followTruck(0,true);app.frame(1000);
    let distance=0,zeroTicks=0;
    for(let frame=1;frame<=20;frame++){
      const previousYaw=d.cameraState.state.yaw,previousHeading=d.model.getRenderState().heading;
      app.frame(1000+frame*1000/144);distance+=s.pathDistance;
      if(!s.pathDistance&&Math.abs(d.model.getRenderState().heading-previousHeading)>1e-6){
        zeroTicks++;
        assert.ok(Math.abs(d.cameraState.state.yaw-previousYaw)>1e-9,'camera rotation stopped while the displayed car kept turning');
      }
    }
    assert.ok(zeroTicks>=2);
    assert.ok(Math.abs(d.cameraState.state.distanceSinceLook-distance)<1e-9);
  }finally{app.dispose();}
});

test('camera follows an angular-only displayed spin between physics ticks',()=>{
  const app=createAppDom({width:1280,height:720}),d=app.debug,s=d.model.state;
  try{
    d.model.pause();Object.assign(s,{x:0,z:6,heading:0,angularVelocity:1});
    d.applyTruckPose();d.followTruck(0,true);app.frame(1000);
    let zeroTicks=0,distance=0;
    for(let frame=1;frame<=20;frame++){
      const beforeYaw=d.cameraState.state.yaw,beforeHeading=d.model.getRenderState().heading;
      app.frame(1000+frame*1000/144);distance+=s.pathDistance;
      if(!s.pathDistance&&Math.abs(d.model.getRenderState().heading-beforeHeading)>1e-6){
        zeroTicks++;
        assert.ok(Math.abs(d.cameraState.state.yaw-beforeYaw)>1e-9,'camera froze during a displayed spin with no translation');
      }
    }
    assert.ok(zeroTicks>=2);
    assert.ok(Math.abs(d.cameraState.state.distanceSinceLook-distance)<1e-9);
  }finally{app.dispose();}
});
