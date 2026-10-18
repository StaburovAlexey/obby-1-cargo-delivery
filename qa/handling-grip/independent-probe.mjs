import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=process.argv[2] || fileURLToPath(new URL('../../dist',import.meta.url));
const {VEHICLE_CONFIG,BIOME_SEQUENCE}=await import(pathToFileURL(root+'/economy-config.js'));
const {createDrivingModel}=await import(pathToFileURL(root+'/driving-model.js'));
const {surfaceForBiome}=await import(pathToFileURL(root+'/biome-surfaces.js'));
const dt=1/120;
const stats=s=>({slip:Math.abs(Math.atan2(Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ,Math.abs(-Math.sin(s.heading)*s.velocityX-Math.cos(s.heading)*s.velocityZ)))*180/Math.PI,speed:s.linearSpeed,heading:s.heading,wheel:s.frontWheelAngle,yaw:s.angularVelocity,x:s.x,z:s.z});
const create=(v,b,levels={})=>createDrivingModel({vehicleId:v.id,maxSpeed:v.maxSpeed,x:0,z:0,heading:0,getUpgrades:()=>levels,groundSurface:()=>surfaceForBiome(b,v.id)});
const run=(m,n,input)=>{m.setInput(input);for(let f=0;f<Math.round(n/dt);f++)m.step(dt);return stats(m.state);};
const rows=[];
for(const v of VEHICLE_CONFIG){
 for(const levels of [{},{handling:10},{grip:10},{speed:10,handling:10,grip:10}]){
 const b=v.specialty,m=create(v,b,levels),row={vehicle:v.id,biome:b,levels};
 row.rack=run(m,.1,{steering:1});
 m.reset();m.state.velocityZ=-3;row.lowTurn=run(m,.4,{steering:.65,speedDemand:3/v.maxSpeed});
 m.reset();m.state.velocityZ=-v.maxSpeed*.9;m.setInput({active:true,steering:1});let peak=0;for(let f=0;f<360;f++){m.step(dt);peak=Math.max(peak,stats(m.state).slip);}row.corner={...stats(m.state),peak};
 m.setInput({active:true});let recovered=null;for(let f=1;f<1200;f++){m.step(dt);if(recovered===null&&stats(m.state).slip<1&&Math.abs(m.state.angularVelocity)<.05)recovered=f*dt;}row.recovery={recovered,...stats(m.state)};
 m.reset();m.state.velocityZ=-Math.min(20,v.maxSpeed*.8);m.state.velocityX=3;m.setInput({});let rec=null;for(let f=1;f<1200;f++){m.step(dt);if(rec===null&&Math.abs(Math.cos(m.state.heading)*m.state.velocityX-Math.sin(m.state.heading)*m.state.velocityZ)<.1)rec=f*dt;}row.slipRecovery=rec;
 m.reset();m.state.velocityZ=-Math.min(20,v.maxSpeed*.8);m.setInput({brake:1});let travel=0,t=null;for(let f=1;f<2400;f++){m.step(dt);travel+=m.state.pathDistance;if(m.state.linearSpeed<.05){t=f*dt;break;}}row.braking={distance:travel,time:t};
 rows.push(row);
 }
}
const measurements=[];
for(let i=0;i<rows.length;i+=4){
 const [stock,handling,grip,allMax]=rows.slice(i,i+4);
 const brakingGain=1-grip.braking.distance/stock.braking.distance;
 const recoveryGain=1-grip.slipRecovery/stock.slipRecovery;
 assert.ok(brakingGain>.1,`${stock.vehicle}: maximum grip must improve braking`);
 assert.ok(recoveryGain>.1,`${stock.vehicle}: maximum grip must improve injected side-slip recovery`);
 measurements.push({vehicle:stock.vehicle,brakeStartSpeed:Math.min(20,VEHICLE_CONFIG[i/4].maxSpeed*.8),stockBraking:stock.braking,maximumGripBraking:grip.braking,brakingImprovementPercent:brakingGain*100,stockSideSlipRecoverySeconds:stock.slipRecovery,maximumGripSideSlipRecoverySeconds:grip.slipRecovery,sideSlipRecoveryImprovementPercent:recoveryGain*100,stockLowSpeedHeading:stock.lowTurn.heading,maximumHandlingLowSpeedHeading:handling.lowTurn.heading,stockCorner:stock.corner,maximumGripCorner:grip.corner,allMaximumCorner:allMax.corner});
}
const report={pass:true,scope:'CPU simulation only; no visual or browser playtesting',vehicleUpgradeCases:rows.length,measurements};
fs.writeFileSync(process.argv[3] || new URL('./independent-probe.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:true,vehicleUpgradeCases:rows.length,brakingImprovementPercent:measurements.map(r=>({vehicle:r.vehicle,value:r.brakingImprovementPercent})),sideSlipRecoveryImprovementPercent:measurements.map(r=>({vehicle:r.vehicle,value:r.sideSlipRecoveryImprovementPercent}))},null,2));
