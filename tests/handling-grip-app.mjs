// CPU production app-frame bridge smoke. DOM/renderer mocked; no browser or human playtest.
import fs from 'node:fs';
const root=process.env.AUDIT_ROOT||new URL('../',import.meta.url).pathname;
const {createAppDom}=await import(root+'/tests/fixtures/app-dom.mjs');
const {VEHICLE_CONFIG}=await import(root+'/dist/economy-config.js');
const {BRIDGES}=await import(root+'/dist/road-bridges.js');
const {routePointAtProgress,projectRoad}=await import(root+'/dist/road-layout.js');
const {roadWheelTarget}=await import(root+'/dist/driving-model.js');
const {surfaceForBiome}=await import(root+'/dist/biome-surfaces.js');
const {getUpgradeModifiers}=await import(root+'/dist/vehicle-upgrades.js');
const app=createAppDom({startDriving:false,career:{version:2,money:0,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),characterId:'bacon',completedRuns:0}}),d=app.debug;let time=1000;app.frame(time);
const results=[];
try{for(const v of VEHICLE_CONFIG.filter(v=>!v.rewardOnly&&(!process.env.AUDIT_ID||v.id===process.env.AUDIT_ID)))for(const level of [0,10]){
 d.returnToGarage();d.gameplay.state.cooldown=0;d.gameplay.state.upgrades[v.id]={speed:level,handling:level,grip:level,fuel:level};d.enterVehicle(v.id);app.frame(time+=50);
 const b=BRIDGES.find(b=>b.biome===(process.env.AUDIT_BIOME||v.specialty)),p=routePointAtProgress(b.from-60),s=d.model.state;
 d.model.pause();Object.assign(s,{x:p.x,z:p.z,heading:p.heading});d.applyTruckPose();d.followTruck(0,true);
 let route=projectRoad(s.x,s.z),maxOffset=0,blocked=false,frames=0,peakSlip=0;
 for(;frames<1600&&d.driving;frames++){
  route=projectRoad(s.x,s.z,route);if(route.progress>b.to+10)break;
  const ahead=10+Math.abs(s.speed)*.7,q=routePointAtProgress(route.progress+ahead),blend=Math.max(0,Math.min(1,(q.progress-(b.from-60))/40)),offset=b.offset*blend;
  const dx=q.x+q.right.x*offset-s.x,dz=q.z+q.right.z*offset-s.z,error=Math.atan2(Math.sin(Math.atan2(-dx,-dz)-s.heading),Math.cos(Math.atan2(-dx,-dz)-s.heading));
  const wheel=Math.atan(2*3.2*Math.sin(error)/Math.max(1,Math.hypot(dx,dz))),surface=surfaceForBiome(process.env.AUDIT_BIOME||v.specialty,v.id),grip=Math.sqrt(Math.min(1,surface.frictionFactor*getUpgradeModifiers({grip:level}).grip));
  let lo=0,hi=1;for(let i=0;i<20;i++){const mid=(lo+hi)/2;if(Math.abs(roadWheelTarget(mid,s.linearSpeed/grip))<Math.abs(wheel))lo=mid;else hi=mid;}
  d.model.setInput({active:s.speed<6,steering:-Math.sign(wheel)*(lo+hi)/2});app.frame(time+=50);blocked ||= s.blocked;
  if(route.progress>=b.from&&route.progress<=b.to)maxOffset=Math.max(maxOffset,Math.abs(route.offset-b.offset));
  peakSlip=Math.max(peakSlip,Math.abs(Math.atan2(Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ,Math.max(.1,Math.abs(s.speed))))*180/Math.PI);
 }
 const row={id:v.id,level,bridge:b.id,passed:d.driving&&route.progress>b.to+10,progress:route.progress,seconds:frames*.05,maxDeckOffset:maxOffset,peakSlip,blocked};results.push(row);console.log(JSON.stringify(row));
}}finally{app.dispose();}
if(process.env.AUDIT_OUTPUT)fs.writeFileSync(process.env.AUDIT_OUTPUT,JSON.stringify({root,scope:'CPU app frames with mock DOM and WebGL renderer; one spawned approach per ordinary vehicle at 6m/s stock/max, actual bridge fall/fuel/contact logic; no full journey or imported visual-wheel metadata',results},null,2));
process.exitCode=results.some(r=>!r.passed)?1:0;
