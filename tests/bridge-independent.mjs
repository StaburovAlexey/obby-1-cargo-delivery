import assert from 'node:assert/strict';
import {BRIDGES,bridgeAtProgress,bridgeSupport,createBridgeFall} from '../dist/road-bridges.js';
import {projectRoad,routePointAtProgress} from '../dist/route-network.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
const advance=(a,n)=>{for(let i=0;i<n;i++)a.frame();};
const place=(d,q,offset=0,angle=0)=>{const p=routePointAtProgress(q);offset+=(bridgeAtProgress(q)?.offset||0);d.model.pause();Object.assign(d.model.state,{x:p.x+p.right.x*offset,z:p.z+p.right.z*offset,heading:p.heading+angle});d.applyTruckPose();return p;};
assert.equal(BRIDGES.length,25);
for(const b of BRIDGES)assert.equal(b.halfWidth,2.5);
let supported=0;
for(const b of BRIDGES)for(const q of [b.from-2,b.from,b.from+2,(b.from+b.to)/2,b.to-2,b.to,b.to+2]){
 const p=routePointAtProgress(q),s={x:p.x+p.right.x*b.offset,z:p.z+p.right.z*b.offset,heading:p.heading};assert.equal(bridgeSupport(s,p).fall,false,`${b.id} centered ${q}`);supported++;
 if(q>=b.from+2&&q<=b.to-2)for(const side of [-1,1])assert.equal(bridgeSupport({...s,x:s.x+p.right.x*1.3*side,z:s.z+p.right.z*1.3*side},p).fall,true,`${b.id} side ${side}`);
}
let offCenterCases=0;
for(const b of BRIDGES)for(const offset of [-.7,.7])for(const reverse of [0,Math.PI]){
 const p=routePointAtProgress((b.from+b.to)/2),s={x:p.x+p.right.x*(offset+b.offset),z:p.z+p.right.z*(offset+b.offset),heading:p.heading+reverse};
 assert.equal(bridgeSupport(s,p).fall,false,'Wider deck must allow 0.7m offset');offCenterCases++;
}
let yawSamples=0;
for(const b of BRIDGES)for(let i=0;i<60;i++)for(const reverse of [0,Math.PI])for(const yaw of [-5,0,5]){
 const q=b.from-2+(b.to-b.from+4)*i/59,p=routePointAtProgress(q);
 assert.equal(bridgeSupport({x:p.x+p.right.x*b.offset,z:p.z+p.right.z*b.offset,heading:p.heading+reverse+yaw*Math.PI/180},p).fall,false,`${b.id} yaw ${yaw} reverse ${!!reverse} at ${q}`);yawSamples++;
}
const app=createAppDom({career:{...freshCareer(),money:1234,brains:87.25,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)}});
let cases=0;
try{
 const d=app.debug,g=d.gameplay;let returns=0;const original=g.returnToGarage;g.returnToGarage=(...args)=>{returns++;return original(...args);};
 const crossings=[];
 for(const vehicle of VEHICLE_CONFIG)for(const gear of ['D','R']){
  if(g.state.mode!=='walking')d.returnToGarage();g.state.cooldown=0;assert.equal(d.enterVehicle(vehicle.id),true);
  for(const w of d.rig.wheels){assert.ok(Math.abs(Math.abs(w.localPosition.x)-1.32)<1e-5);assert.ok(Math.abs(w.localPosition.z+1.63)<1e-5||Math.abs(w.localPosition.z-1.73)<1e-5);assert.ok(Math.abs(w.localPosition.x)+.43/2<BRIDGES[0].halfWidth);}
  const b=BRIDGES[0],sign=gear==='D'?1:-1,start=gear==='D'?b.from-5:b.to+5,target=gear==='D'?b.to+5:b.from-5;
  place(d,start,b.offset);d.model.setGear(gear);let q=start,n=0,maxSpeed=0,offset=0;
  while(sign*(target-q)>0&&n++<2400){d.model.setInput({active:d.model.state.linearSpeed<4,steering:0});app.frame();assert.equal(g.state.mode,'driving',`${vehicle.id}/${gear} returned before crossing`);const p=projectRoad(d.model.state.x,d.model.state.z);q=p.progress;maxSpeed=Math.max(maxSpeed,d.model.state.linearSpeed);offset=Math.max(offset,Math.abs(p.offset-b.offset));}
  assert.ok(sign*(q-target)>=0,`${vehicle.id}/${gear} failed crossing after ${n} frames at ${q}`);assert.ok(maxSpeed<4.5);assert.ok(offset<.1);crossings.push({vehicle:vehicle.id,gear,frames:n,maxSpeed,maxOffset:offset});
 }
 d.returnToGarage();
 for(const vehicle of VEHICLE_CONFIG){
  if(g.state.mode!=='walking')d.returnToGarage();g.state.cooldown=0;assert.equal(d.enterVehicle(vehicle.id),true);
  place(d,(BRIDGES[0].from+BRIDGES[0].to)/2);advance(app,3);assert.equal(g.state.mode,'driving');
  const money=g.state.money,brains=g.state.brains,run=g.state.run;place(d,(BRIDGES[0].from+BRIDGES[0].to)/2,1.3);advance(app,2);
  assert.equal(g.state.mode,'driving');assert.equal(d.setBiomeMenu(true),false);assert.equal(d.travelToBiome('forest'),false);assert.equal(d.setUpgradeMenu(true),false);
  const x=d.model.state.x,z=d.model.state.z;d.model.setInput({active:true,steering:1});advance(app,20);
  assert.equal(d.model.state.x,x);assert.equal(d.model.state.z,z);assert.equal(g.state.money,money);assert.equal(g.state.brains,brains);
  const before=returns;advance(app,100);assert.equal(g.state.mode,'walking');assert.equal(g.state.run,null);assert.equal(returns,before+1);assert.equal(g.state.money,money);assert.equal(g.state.brains,brains);advance(app,90);assert.equal(returns,before+1);cases++;
 }

 let saves=0;const originalSave=app.storage.setItem;app.storage.setItem=(...args)=>{saves++;return originalSave(...args);};
 g.state.cooldown=0;d.enterVehicle('pickup');g.tickProgress(.05,{distance:.2,active:true});const savedBrains=g.state.brains;
 place(d,(BRIDGES[0].from+BRIDGES[0].to)/2,1.3);advance(app,100);assert.equal(saves,1);advance(app,100);assert.equal(saves,1);
 const reload=createAppDom({startDriving:false,storage:app.storage});try{assert.ok(Math.abs(reload.debug.gameplay.state.brains-savedBrains)<1e-5);assert.equal(reload.debug.gameplay.state.money,g.state.money);}finally{reload.dispose();}

 for(const pause of ['overview','hidden','blur']){
  g.state.cooldown=0;d.enterVehicle('pickup');place(d,(BRIDGES[0].from+BRIDGES[0].to)/2,1.3);advance(app,3);const before=returns;
  if(pause==='overview')d.setDriving(false);if(pause==='hidden'){app.doc.hidden=true;app.doc.dispatch('visibilitychange');}if(pause==='blur')app.win.dispatch('blur');
  advance(app,100);assert.equal(returns,before);assert.equal(g.state.mode,'driving');
  if(pause==='overview')d.setDriving(true);if(pause==='hidden'){app.doc.hidden=false;app.doc.dispatch('visibilitychange');}if(pause==='blur')app.win.dispatch('focus');
  advance(app,100);assert.equal(returns,before+1);assert.equal(g.state.mode,'walking');
 }
 console.log(JSON.stringify({status:'PASS',centeredSupportCases:supported,yawSupportSamples:yawSamples,offCenterCases,drivingCrossings:crossings,allVehicleFalls:cases,pauseResumeCases:3,scope:'Node real app and geometry; DOM/renderer mocked, no browser/GPU/Android claim'}));
}finally{app.dispose();}
