import fs from 'node:fs';
import {createDrivingModel} from './baseline-v34/driving-model.js';
import {VEHICLE_CONFIG} from './baseline-v34/economy-config.js';
import {surfaceForBiome} from './baseline-v34/biome-surfaces.js';
const upgrades={speed:3,handling:3,grip:3,fuel:3},rows=[];
for(const level of ['stock','max'])for(const biome of ['city','forest','desert','snow','volcanic'])for(const fraction of [0,.25,.5,1]){
 const spec=VEHICLE_CONFIG.at(-1),surf=surfaceForBiome(biome,spec.id),levels=level==='max'?upgrades:undefined;
 const top=spec.maxSpeed*(level==='max'?1.06:1)*surf.speedFactor;
 const m=createDrivingModel({x:0,z:0,heading:0,vehicleId:spec.id,maxSpeed:spec.maxSpeed,getUpgrades:()=>levels,groundSurface:()=>surf});
 m.state.velocityZ=-top*fraction;m.setInput({steering:1,active:true});
 let extent=2.9,time=0,turnTime=null,turnExtent=null,at90=null;let radius=0,n=0;
 for(let i=0;i<120*120;i++){m.step(1/120);time+=1/120;const s=m.state;
  extent=Math.max(extent,Math.abs(s.x)+2.9*Math.abs(Math.cos(s.heading))+3.6*Math.abs(Math.sin(s.heading)));
  if(at90===null&&Math.abs(s.heading)>=Math.PI/2)at90={time,x:s.x,z:s.z,speed:s.linearSpeed,radius:s.linearSpeed/Math.abs(s.angularVelocity)};
  if(turnTime===null&&Math.abs(s.heading)>=Math.PI){turnTime=time;turnExtent=extent;}
  if(i>=120*100){radius+=s.linearSpeed/Math.max(1e-12,Math.abs(s.angularVelocity));n++;}
 }
 rows.push({vehicle:spec.id,level,biome,startFraction:fraction,initialSpeed:top*fraction,turn180Seconds:turnTime,turn180BodyLateralExtent:turnExtent,steadyFullWheelRadius:radius/n,at90});
}
fs.writeFileSync('qa/turn-assist/baseline-ashhauler.json',JSON.stringify({units:{speed:'m/s',radius:'m',lateralExtent:'m from corridor center incl conservative body',time:'s'},bodyHalfWidth:2.9,bodyHalfLength:3.6,rows},null,2));
console.table(rows.filter(r=>r.startFraction===1).map(r=>({level:r.level,biome:r.biome,initialSpeed:r.initialSpeed.toFixed(2),radius:r.steadyFullWheelRadius.toFixed(2),extent:r.turn180BodyLateralExtent?.toFixed(2),turn:r.turn180Seconds?.toFixed(2)})));
