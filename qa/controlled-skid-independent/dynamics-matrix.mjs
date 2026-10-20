#!/usr/bin/env node
// Independent QA: no production imports beyond public model/catalog APIs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import crypto from 'node:crypto';

const checkout = path.resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const output = path.resolve(process.argv[3] || fileURLToPath(new URL('dynamics-report.json', import.meta.url)));
const baseline = path.resolve(process.argv[4] || '/tmp/controlled-skid-baseline');
const moduleAt = (root, name) => import(pathToFileURL(path.join(root, 'dist', name + '.js')));
const {VEHICLE_CONFIG, BIOME_SEQUENCE} = await moduleAt(checkout, 'economy-config');
const {createDrivingModel, evaluateVehicleForces} = await moduleAt(checkout, 'driving-model');
const {surfaceForBiome} = await moduleAt(checkout, 'biome-surfaces');
const {createDrivingModel: oldModel} = await moduleAt(baseline, 'driving-model');
const {surfaceForBiome: oldSurface} = await moduleAt(baseline, 'biome-surfaces');
const vehicles = VEHICLE_CONFIG.filter(v => !v.rewardOnly);
const failures = [];
const check = (condition, label, data) => { if (!condition) failures.push({label, data}); };
const sourceNames = ['driving-model.js','drift-dynamics.js','biome-surfaces.js','vehicle-upgrades.js','economy-config.js'];
const hashes = () => Object.fromEntries(sourceNames.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(checkout, 'dist', name))).digest('hex')]));
const before = hashes();
const numericKeys = ['x','z','heading','velocityX','velocityZ','angularVelocity','frontWheelAngle'];
const metrics = s => {
  const longitudinal = -Math.sin(s.heading) * s.velocityX - Math.cos(s.heading) * s.velocityZ;
  const lateral = Math.cos(s.heading) * s.velocityX - Math.sin(s.heading) * s.velocityZ;
  return {slip: Math.atan2(lateral, Math.max(.001, Math.abs(longitudinal))) * 180 / Math.PI, lateral, longitudinal};
};
const make = (v, biome, levels, extra = {}, old = false) => (old ? oldModel : createDrivingModel)({
  x:0,z:0,heading:0,vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>levels,
  groundSurface:()=> (old ? oldSurface : surfaceForBiome)(biome,v.id),...extra,
});
function phase(model, seconds, fps, input) {
  model.setInput(input);
  let peakSlip = 0, maxYaw = 0, minForward = Infinity, nonfinite = false;
  for (let frame=0;frame<seconds*fps;frame++) {
    model.step(1/fps);
    const state = model.state, m = metrics(state);
    nonfinite ||= numericKeys.some(k => !Number.isFinite(state[k]));
    peakSlip = Math.max(peakSlip, Math.abs(m.slip));
    maxYaw = Math.max(maxYaw, Math.abs(state.angularVelocity));
    minForward = Math.min(minForward,m.longitudinal);
  }
  return {peakSlip,maxYaw,minForward,nonfinite,end:metrics(model.state)};
}

const matrix = [];
for (const v of vehicles) for (const level of [0,5,10]) for (const fps of [15,30,60]) {
  const ownIndex = BIOME_SEQUENCE.findIndex(b=>b.id===v.specialty);
  const next = BIOME_SEQUENCE[ownIndex+1]?.id;
  for (const biome of [v.specialty,...(next?[next]:[])]) {
    const levels = {handling:level,grip:level};
    const m = make(v,biome,levels);
    phase(m,25,fps,{active:true});
    const top = m.state.speed;
    const corner = phase(m,3,fps,{active:true,steering:1});
    let slalomPeak = 0;
    for (let i=0;i<4;i++) slalomPeak = Math.max(slalomPeak,phase(m,1,fps,{active:true,steering:i%2?.7:-.7}).peakSlip);
    const recovery = phase(m,6,fps,{active:false,steering:0});
    const row = {vehicle:v.id,biome,level,fps,top,corner,slalomPeak,recovery,final:Object.fromEntries(numericKeys.map(k=>[k,m.state[k]]))};
    matrix.push(row);
    check(!corner.nonfinite&&!recovery.nonfinite,'finite matrix state',row);
    if (biome===v.specialty) {
      check(corner.minForward>0,'no own-biome reverse spin',row);
      check(corner.peakSlip<25&&slalomPeak<30,'bounded own-biome controlled skid',row);
      check(Math.abs(recovery.end.slip)<2&&Math.abs(m.state.angularVelocity)<.05,'release recovery',row);
    }
  }
}
let maximumFrameError = 0;
for (const row of matrix.filter(r=>r.fps===15)) {
  for (const other of matrix.filter(r=>r.vehicle===row.vehicle&&r.biome===row.biome&&r.level===row.level&&r.fps!==15)) {
    const error = Math.max(...numericKeys.map(k=>Math.abs(row.final[k]-other.final[k])));
    maximumFrameError = Math.max(maximumFrameError,error);
    check(error<1e-9,'15/30/60 fps final-state equivalence',{vehicle:row.vehicle,biome:row.biome,level:row.level,error});
  }
}
const upgradeRows = [];
for (const v of vehicles) {
  const peaks = [0,5,10].map(level=>matrix.find(r=>r.vehicle===v.id&&r.biome===v.specialty&&r.level===level&&r.fps===60).corner.peakSlip);
  check(peaks[1]<peaks[0]&&peaks[2]<peaks[1],'own-biome combined upgrade skid monotonicity',{vehicle:v.id,peaks});
  const grip = [], handling = [];
  for (const level of [0,5,10]) {
    const g = make(v,v.specialty,{grip:level});
    g.state.velocityZ=-Math.min(15,v.maxSpeed*.8); g.state.velocityX=3;
    let t=0;
    while (t<10&&Math.abs(metrics(g.state).lateral)>.1) {g.step(1/120);t+=1/120;}
    grip.push(t);
    const h=make(v,v.specialty,{handling:level});
    h.state.velocityZ=-Math.min(15,v.maxSpeed*.8);
    phase(h,.1,120,{steering:1});
    handling.push(Math.abs(h.state.frontWheelAngle));
  }
  check(grip[1]<=grip[0]&&grip[2]<grip[0],'grip improves same-state lateral recovery',{vehicle:v.id,grip});
  check(handling[1]>handling[0]&&handling[2]>handling[1],'handling improves same-state steering response',{vehicle:v.id,handling});
  upgradeRows.push({vehicle:v.id,commonSpeedCornerPeak:peaks,lateralRecoverySeconds:grip,rackAfter100ms:handling});
}

const baselineCorners=[];
for(const v of vehicles){
  const m=make(v,v.specialty,{}, {},true);
  phase(m,25,60,{active:true});const corner=phase(m,3,60,{active:true,steering:1});
  const current=matrix.find(r=>r.vehicle===v.id&&r.biome===v.specialty&&r.level===0&&r.fps===60).corner;
  baselineCorners.push({vehicle:v.id,baselinePeak:corner.peakSlip,currentPeak:current.peakSlip});
  check(current.peakSlip>corner.peakSlip+.5,'ordinary high-speed skid is meaningfully more visible',baselineCorners.at(-1));
}

const ownMaximumRows=[];
for(const v of vehicles){
  const rows=[];
  for(const level of [0,5,10]){
    const m=make(v,v.specialty,{speed:level,handling:level,grip:level});
    phase(m,25,60,{active:true});const entrySpeed=m.state.speed;
    const corner=phase(m,3,60,{active:true,steering:1});
    const centered=phase(m,5,60,{active:true,steering:0});
    rows.push({vehicle:v.id,level,entrySpeed,corner,centered});
    check(corner.minForward>0&&corner.peakSlip<25&&Math.abs(centered.end.slip)<.2,'all-upgrades own-top-speed skid and held-throttle recovery',rows.at(-1));
  }
  check(rows[1].corner.peakSlip<rows[0].corner.peakSlip&&rows[2].corner.peakSlip<rows[1].corner.peakSlip,'speed upgrades do not erase control improvement',rows);
  ownMaximumRows.push(...rows);
}

const slopes=[];
for (const v of vehicles) for (const level of [0,5,10]) for (const fps of [15,30,60]) for (const grade of [-.083,-.075,.075,.083]) {
  const m=make(v,v.specialty,{handling:level,grip:level},{groundGradient:()=>({x:0,z:-grade})});
  phase(m,12,fps,{active:true});
  const result=phase(m,2,fps,{active:true,steering:.4});
  const recovered=phase(m,5,fps,{active:false});
  const row={vehicle:v.id,level,fps,grade,speed:m.state.speed,...result,recovered};slopes.push(row);
  check(!result.nonfinite&&result.minForward>0&&result.peakSlip<25,'bounded uphill/downhill steering',row);
}

const wrongBiomes=[];
for(const v of vehicles) for(const b of BIOME_SEQUENCE) {
  const index=BIOME_SEQUENCE.findIndex(x=>x.id===v.specialty), gap=BIOME_SEQUENCE.findIndex(x=>x.id===b.id)-index;
  if(gap<=0)continue;
  const surface=surfaceForBiome(b.id,v.id),original=oldSurface(b.id,v.id);
  check(JSON.stringify(surface)===JSON.stringify(original),'wrong-biome surface/economy profile unchanged',{vehicle:v.id,biome:b.id,surface,original});
  check(surface.speedFactor===.75&&surface.handlingFactor===.75&&surface.fuelFactor===gap+1,'wrong-biome penalties retained',{vehicle:v.id,biome:b.id,surface});
  const measurements=[];
  for(const old of [true,false]) {
    const m=make(v,b.id,{}, {},old);phase(m,25,60,{active:true});
    const result=phase(m,3,60,{active:true,steering:.7});
    measurements.push({...result,final:Object.fromEntries(numericKeys.map(k=>[k,m.state[k]]))});
  }
  wrongBiomes.push({vehicle:v.id,biome:b.id,baseline:measurements[0],current:measurements[1]});
  check(measurements[1].peakSlip===measurements[0].peakSlip&&numericKeys.every(k=>measurements[0].final[k]===measurements[1].final[k]),'wrong-biome complete trajectory exactly unchanged',{vehicle:v.id,biome:b.id,measurements});
}

// The BMW is a protected separate dynamics path. Compare complete maneuvers,
// including reverse/handbrake, to the unedited repository snapshot.
const bmw=VEHICLE_CONFIG.find(v=>v.rewardDrift),bmwRows=[];
for(const biome of BIOME_SEQUENCE.map(b=>b.id)) for(const level of [0,5,10]) for(const fps of [15,30,60]) {
  const levels={speed:level,handling:level,grip:level};
  const a=make(bmw,biome,levels),b=make(bmw,biome,levels,{},true);
  let maxError=0;
  for(const [seconds,input] of [[4,{active:true}],[3,{active:true,steering:.8}],[1,{active:true,steering:-.6,handbrake:1}],[2,{active:false}],[4,{speedDemand:-.5,steering:.4}]]) {
    phase(a,seconds,fps,input);phase(b,seconds,fps,input);
    maxError=Math.max(maxError,...numericKeys.map(k=>Math.abs(a.state[k]-b.state[k])));
  }
  bmwRows.push({biome,level,fps,maxError});check(maxError===0,'BMW trajectory exactly unchanged',{biome,level,fps,maxError});
}
const lowSpeedRows=[];
for(const v of vehicles)for(const level of [0,5,10])for(const gear of ['D','R']){
  const levels={handling:level,grip:level},a=make(v,v.specialty,levels),b=make(v,v.specialty,levels,{},true);
  const sign=gear==='D'?1:-1;let maxError=0;
  for(const [seconds,input] of [[3,{speedDemand:sign*4/v.maxSpeed}],[2,{speedDemand:sign*4/v.maxSpeed,steering:.5}],[2,{speedDemand:sign*4/v.maxSpeed,steering:-.5}],[3,{}]]){
    phase(a,seconds,60,input);phase(b,seconds,60,input);
    maxError=Math.max(maxError,...numericKeys.map(k=>Math.abs(a.state[k]-b.state[k])));
  }
  lowSpeedRows.push({vehicle:v.id,level,gear,maxError});
  check(maxError===0,'4m/s forward/reverse precision exactly unchanged',{vehicle:v.id,level,gear,maxError});
}
let passiveSamples=0,maxPassivePower=-Infinity;
for(const v of vehicles)for(const b of BIOME_SEQUENCE)for(let i=0;i<40;i++) {
  const state={heading:i*.73,velocityX:Math.sin(i*.3)*45,velocityZ:Math.cos(i*.4)*45,angularVelocity:Math.sin(i)*2,frontWheelAngle:Math.sin(i*.6)*.6,gear:'D',active:false};
  const f=evaluateVehicleForces(state,{maxSpeed:v.maxSpeed,surface:surfaceForBiome(b.id,v.id),braking:i%2});
  const power=f.forceX*state.velocityX+f.forceZ*state.velocityZ+f.torque*state.angularVelocity;
  maxPassivePower=Math.max(maxPassivePower,power);passiveSamples++;
  check(power<=1e-6,'passive forces cannot create energy',{vehicle:v.id,biome:b.id,i,power});
}
const after=hashes();
check(JSON.stringify(before)===JSON.stringify(after),'sources stable during test',{before,after});
const report={passed:failures.length===0,scope:'Independent CPU solver verification; no browser rendering, real-device touch or complete fuel-economy journeys.',generatedAt:new Date().toISOString(),checkout,baseline,sourceHashes:before,sourceHashesAfter:after,counts:{matrix:matrix.length,slopes:slopes.length,ownMaximum:ownMaximumRows.length,wrongBiome:wrongBiomes.length,bmw:bmwRows.length,lowSpeed:lowSpeedRows.length,passiveSamples},maximumFrameError,maxPassivePower,upgradeRows,baselineCorners,matrix,slopes,ownMaximumRows,wrongBiomes,bmwRows,lowSpeedRows,failures};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,counts:report.counts,maximumFrameError,maxPassivePower,upgradeRows,failures},null,2));
process.exitCode=report.passed?0:1;
