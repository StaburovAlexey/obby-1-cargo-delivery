import fs from 'node:fs/promises';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url),baselineRoot=new URL('output/fps-60/baseline/dist/',root),currentRoot=new URL('dist/',root);
const baseline=await import(new URL('road-hazards.js',baselineRoot)),current=await import(new URL('road-hazards.js',currentRoot));
const {routePointAtDistance,ROUTE_LENGTH}=await import(new URL('route-network.js',baselineRoot));
const base={frictionFactor:1,lateralDampingFactor:1,rollingFactor:1,engineFactor:1,speedFactor:1,coastingFactor:1,vibration:0};
const seed=42,sampleCount=4096,passes=2,rounds=5,systems={baseline:baseline.createRoadHazards(seed),current:current.createRoadHazards(seed)};
const patches=systems.baseline.poses.filter(h=>h.edgeBlend);
const worldPoint=(h,x,z)=>({x:h.x+Math.cos(h.heading)*x+Math.sin(h.heading)*z,z:h.z-Math.sin(h.heading)*x+Math.cos(h.heading)*z});
const cases={
 route:Array.from({length:sampleCount},(_,i)=>routePointAtDistance(ROUTE_LENGTH*i/(sampleCount-1))),
 patchEdges:Array.from({length:sampleCount},(_,i)=>{const h=patches[i%patches.length],angle=i*2.399963229728653;return worldPoint(h,Math.cos(angle)*h.width*.7,Math.sin(angle)*h.length*.7);}),
};
let sink=0;
function workload(system,points,count=passes){let checksum=0;for(let n=0;n<count;n++)for(const p of points){const surface=system.surfaceAt(p.x,p.z,base),patch=system.patchAt(p.x,p.z,.8);checksum+=surface.frictionFactor+(patch?1:0);}sink+=checksum;return checksum;}
const measurements={};
for(const [name,points] of Object.entries(cases)){
 assert.equal(workload(systems.baseline,points,1),workload(systems.current,points,1),'before/after results must match');
 for(let i=0;i<2;i++){workload(systems.baseline,points);workload(systems.current,points);}
 const times={baseline:[],current:[]};
 for(let round=0;round<rounds;round++)for(const variant of round%2?['current','baseline']:['baseline','current']){const start=performance.now();workload(systems[variant],points);times[variant].push(performance.now()-start);}
 const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
 measurements[name]={points:points.length,queriesPerSample:2,passesPerRound:passes,rounds,elapsedMs:times,medianMs:{baseline:median(times.baseline),current:median(times.current)},queriesPerRound:points.length*2*passes};
}
// Count real calls to the unchanged signed polygon distance in each runtime.
// Instrumented modules are used only for counts, never for elapsed samples.
for(const [variant,directory] of Object.entries({baseline:baselineRoot,current:currentRoot})){
 const moduleUrl=new URL('road-hazards.js',directory),source=await fs.readFile(moduleUrl,'utf8'),counterKey=`__fpsPolygonChecks_${variant}`;
 assert.ok(source.includes('export function roadHazardPatchDistance(h,x,z){'),'signed distance instrumentation target must exist');
 const instrumented=source.replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g,(_,quote,relative)=>`from ${quote}${new URL(relative,moduleUrl).href}${quote}`).replace('export function roadHazardPatchDistance(h,x,z){',`export function roadHazardPatchDistance(h,x,z){globalThis.${counterKey}++;`);
 assert.notEqual(instrumented,source);
 const module=await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString('base64')}`),system=module.createRoadHazards(seed);
 for(const [name,points] of Object.entries(cases)){globalThis[counterKey]=0;workload(system,points,1);measurements[name].polygonDistanceChecks??={};measurements[name].polygonDistanceChecks[variant]=globalThis[counterKey];}
 delete globalThis[counterKey];
}
for(const row of Object.values(measurements)){row.polygonChecksReductionPercent=(1-row.polygonDistanceChecks.current/row.polygonDistanceChecks.baseline)*100;row.elapsedMedianReductionPercent=(1-row.medianMs.current/row.medianMs.baseline)*100;}
const report={recordedAt:new Date().toISOString(),runtime:process.version,platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem(),seed,patchCount:patches.length,outlineEdgesPerPatch:patches[0].patchOutline.length,baseline:fileURLToPath(baselineRoot),current:fileURLToPath(currentRoot),measurements,scope:'Node CPU query workload; not a browser frame-time or Android GPU/FPS measurement. Existing browser/background applications may contribute load; use geometry operation counts as the deterministic comparison.',checksum:sink};
const output=new URL('physics-query-benchmark.json',import.meta.url);await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
