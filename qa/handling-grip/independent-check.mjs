import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=process.argv[2] || fileURLToPath(new URL('../../dist',import.meta.url));
const {VEHICLE_CONFIG,BIOME_SEQUENCE}=await import(pathToFileURL(root+'/economy-config.js'));
const {createDrivingModel,evaluateVehicleForces}=await import(pathToFileURL(root+'/driving-model.js'));
const {evaluateDriftDynamics}=await import(pathToFileURL(root+'/drift-dynamics.js'));
const {surfaceForBiome}=await import(pathToFileURL(root+'/biome-surfaces.js'));
const dt=1/120;
const telemetry=s=>({slip:Math.atan2(Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ,Math.max(.001,Math.abs(-Math.sin(s.heading)*s.velocityX-Math.cos(s.heading)*s.velocityZ)))*180/Math.PI,lat:Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ,speed:Math.hypot(s.velocityX,s.velocityZ)});
const create=(v,b,levels={})=>createDrivingModel({vehicleId:v.id,maxSpeed:v.maxSpeed,x:0,z:0,heading:0,getUpgrades:()=>levels,groundSurface:()=>surfaceForBiome(b,v.id)});
const run=(m,n,input)=>{m.setInput(input);let peakSlip=0,peakYaw=0,minForward=Infinity;for(let f=0;f<Math.round(n/dt);f++){m.step(dt);const s=m.state;for(const k of ['x','z','heading','velocityX','velocityZ','angularVelocity','frontWheelAngle'])if(!Number.isFinite(s[k]))throw Error('nonfinite '+k);peakSlip=Math.max(peakSlip,Math.abs(telemetry(s).slip));peakYaw=Math.max(peakYaw,Math.abs(s.angularVelocity));minForward=Math.min(minForward,s.speed);}return {peakSlip,peakYaw,minForward,...telemetry(m.state)};};
const correction=[],sweep=[],energy=[],frame=[];
for(const v of VEHICLE_CONFIG){
 const stock=create(v,v.specialty);stock.state.velocityZ=-v.maxSpeed*.9;run(stock,3,{active:true,steering:1});const start=structuredClone(stock.state),row={vehicle:v.id,initialSlip:telemetry(start).slip};
 for(const [key,levels]of Object.entries({stock:{},handling:{handling:10},grip:{grip:10}})){
 const m=create(v,v.specialty,levels);Object.assign(m.state,start);m.setInput({active:true});let recovered=null;for(let f=1;f<1200;f++){m.step(dt);if(recovered===null&&Math.abs(telemetry(m.state).slip)<1&&Math.abs(m.state.angularVelocity)<.05)recovered=f*dt;}
 const n=create(v,v.specialty,levels);Object.assign(n.state,start);n.setInput({active:true,steering:-1});let cross=null;for(let f=1;f<120;f++){n.step(dt);if(cross===null&&n.state.frontWheelAngle>=0)cross=f*dt;}
 row[key]={recover:recovered,wheelCross:cross};
 }correction.push(row);
 for(const b of BIOME_SEQUENCE){for(const levels of [{},{handling:10},{grip:10},{handling:10,grip:10,speed:10}])for(const steer of [.35,.7,1]){
 const m=create(v,b.id,levels);m.state.velocityZ=-v.maxSpeed*surfaceForBiome(b.id,v.id).speedFactor*.9;const turn=run(m,3,{active:true,steering:steer});let max=turn.peakSlip;for(let i=0;i<6;i++)max=Math.max(max,run(m,.5,{active:true,steering:i%2?steer:-steer}).peakSlip);const end=run(m,6,{active:true});sweep.push({vehicle:v.id,biome:b.id,levels,steer,turn,slalomPeak:max,end});
 }}
 for(const b of BIOME_SEQUENCE){for(let i=0;i<40;i++){
 const s={heading:(i*.73)%6.28,velocityX:Math.sin(i*.3)*45,velocityZ:Math.cos(i*.4)*45,angularVelocity:Math.sin(i)*2,frontWheelAngle:Math.sin(i*.6)*.6,gear:'D',active:false,handbrake:i%3/2},surface=surfaceForBiome(b.id,v.id);
 const f=v.rewardDrift?evaluateDriftDynamics(s,{maxSpeed:v.maxSpeed,engineAcceleration:v.acceleration,surface,gradient:{x:0,z:0},braking:(i%2),dt}):evaluateVehicleForces(s,{maxSpeed:v.maxSpeed,surface,braking:(i%2)});
 const power=f.forceX*s.velocityX+f.forceZ*s.velocityZ+f.torque*s.angularVelocity;
 if(power>1e-5)energy.push({vehicle:v.id,biome:b.id,i,power});
 }}
 const a=create(v,v.specialty),b=create(v,v.specialty);a.state.velocityZ=b.state.velocityZ=-v.maxSpeed*.9;for(let i=0;i<60;i++){const input={active:true,steering:i<30?.8:-.6};a.setInput(input);b.setInput(input);a.step(1/15);for(let j=0;j<8;j++)b.step(dt);}frame.push({vehicle:v.id,error:Math.max(...['x','z','heading','velocityX','velocityZ','angularVelocity'].map(k=>Math.abs(a.state[k]-b.state[k])))});
}
const regularCases=sweep.filter(r=>!VEHICLE_CONFIG.find(v=>v.id===r.vehicle).rewardDrift);
const report={scope:'CPU simulation only; no visual or browser playtesting',maneuverCases:sweep.length,passiveForceSamples:VEHICLE_CONFIG.length*BIOME_SEQUENCE.length*40,framePartitionCases:frame.length,correction,energyFailures:energy,framePartition:frame,worstRegularCases:[...regularCases].sort((a,b)=>b.slalomPeak-a.slalomPeak).slice(0,8),worstOwnBiomeCases:regularCases.filter(r=>VEHICLE_CONFIG.find(v=>v.id===r.vehicle).specialty===r.biome).sort((a,b)=>b.slalomPeak-a.slalomPeak).slice(0,8)};
const regularOwn=sweep.filter(r=>!VEHICLE_CONFIG.find(v=>v.id===r.vehicle).rewardDrift && VEHICLE_CONFIG.find(v=>v.id===r.vehicle).specialty===r.biome);
assert.equal(energy.length,0,'Unpowered and braking tire forces must dissipate energy');
assert.ok(frame.every(r=>r.error===0),'15fps and120fps fixed-step results differ');
assert.ok(regularOwn.every(r=>r.turn.minForward>0),'A regular supported car spun into reverse during cornering');
assert.ok(regularOwn.every(r=>r.slalomPeak<18),'Regular supported slide exceeded moderate-slip envelope');
assert.ok(regularOwn.every(r=>Math.abs(r.end.slip)<1),'A regular supported car failed to recover after steering release');
for(const r of correction){
 assert.ok(r.handling.wheelCross<r.stock.wheelCross*.85,`${r.vehicle}: maximum handling must materially improve identical-state countersteer response`);
 if(r.vehicle!=='bmwreward')assert.ok(r.handling.recover<r.stock.recover*.92,`${r.vehicle}: maximum handling must improve identical-state recovery`);
}
console.log(JSON.stringify({pass:true,scope:'CPU simulation only; no visual or browser playtesting',maneuverCases:sweep.length,passiveForceSamples:VEHICLE_CONFIG.length*BIOME_SEQUENCE.length*40,framePartitionCases:frame.length,maxRegularOwnBiomeSlipDegrees:Math.max(...regularOwn.map(r=>r.slalomPeak)),correction},null,2));
fs.writeFileSync(process.argv[3] || new URL('./independent-sweep.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
