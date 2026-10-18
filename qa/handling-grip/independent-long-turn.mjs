import fs from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=process.argv[2] || fileURLToPath(new URL('../../dist',import.meta.url));
const {VEHICLE_CONFIG}=await import(pathToFileURL(root+'/economy-config.js'));
const {createDrivingModel}=await import(pathToFileURL(root+'/driving-model.js'));
const {surfaceForBiome}=await import(pathToFileURL(root+'/biome-surfaces.js'));
const slip=s=>Math.atan2(Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ,Math.max(.001,Math.abs(s.speed)))*180/Math.PI;
const rows=[];
for(const id of ['snowrunner','bmwreward'])for(const levels of [{},{grip:10},{speed:10,handling:10,grip:10}])for(const steer of [.5,.8,1]){
const v=VEHICLE_CONFIG.find(v=>v.id===id),m=createDrivingModel({vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>levels,groundSurface:()=>surfaceForBiome(v.specialty,v.id)});m.state.velocityZ=-v.maxSpeed*.9;m.setInput({active:true,steering:steer});let out={id,levels,steer};for(let i=1;i<=120*30;i++){m.step(1/120);if(i%600===0)out[i/120]={speed:m.state.linearSpeed,slip:slip(m.state),yaw:m.state.angularVelocity,radius:m.state.linearSpeed/Math.abs(m.state.angularVelocity)};}rows.push(out);}
const report={scope:'CPU simulation only; no visual or browser playtesting',rows};
fs.writeFileSync(process.argv[3] || new URL('./independent-long-turn.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:rows.length,settled:rows.map(r=>({vehicle:r.id,levels:r.levels,steering:r.steer,...r[30]}))},null,2));
