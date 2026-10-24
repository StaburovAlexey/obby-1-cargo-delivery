import fs from 'node:fs/promises';
import os from 'node:os';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
const root=new URL('../../',import.meta.url),directories={baseline:new URL('output/fps-60/baseline/dist/',root),current:new URL('dist/',root)},seed=42,frames=60,rounds=3,dt=1/60,player={x:0,z:0,heading:0};
const runtimes={},systems={},timings={baseline:[],current:[]};
for(const [variant,directory] of Object.entries(directories)){runtimes[variant]=await import(new URL('road-hazards.js',directory));systems[variant]=runtimes[variant].createRoadHazards(seed);}
const run=system=>{for(let frame=0;frame<frames;frame++)system.update(dt,player);};
for(let round=0;round<2;round++)for(const variant of ['baseline','current']){systems[variant].reset();run(systems[variant]);}
assert.deepEqual(systems.current.poses,systems.baseline.poses,'warmup must retain all exact mover poses');
for(let round=0;round<rounds;round++){
 for(const variant of round%2?['current','baseline']:['baseline','current']){systems[variant].reset();const start=performance.now();run(systems[variant]);timings[variant].push(performance.now()-start);}
 assert.deepEqual(systems.current.poses,systems.baseline.poses,`all fields must remain exact in round ${round}`);
}
function resolveImports(source,url,routeOverride){return source.replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g,(_,quote,relative)=>{const resolved=new URL(relative,url).href;return `from ${quote}${routeOverride&&relative==='./route-network.js'?routeOverride:resolved}${quote}`;});}
const dataUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const projections={};
for(const [variant,directory] of Object.entries(directories)){
 const routeUrl=new URL('route-network.js',directory),routeSource=await fs.readFile(routeUrl,'utf8'),key=`__fpsMoverProjections_${variant}`,needle='export function projectRoad(x,z,history){';assert.ok(routeSource.includes(needle));
 const routeOverride=dataUrl(resolveImports(routeSource.replace(needle,`${needle}globalThis.${key}++;`),routeUrl));
 const hazardsUrl=new URL('road-hazards.js',directory),hazardsSource=await fs.readFile(hazardsUrl,'utf8'),module=await import(dataUrl(resolveImports(hazardsSource,hazardsUrl,routeOverride)));
 try{globalThis[key]=0;const system=module.createRoadHazards(seed);globalThis[key]=0;run(system);projections[variant]=globalThis[key];assert.deepEqual(system.poses,systems[variant].poses,'instrumentation must preserve poses');}finally{delete globalThis[key];}
}
assert.equal(projections.baseline,systems.baseline.movers.length*frames,'baseline must project every mover at every tick');assert.equal(projections.current,0,'all indexed movers must avoid route projection');
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)],medianMs={baseline:median(timings.baseline),current:median(timings.current)};
const report={recordedAt:new Date().toISOString(),runtime:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,seed,frames,dt,rounds,warmupRounds:2,movers:systems.current.movers.length,moverUpdatesPerRound:frames*systems.current.movers.length,elapsedMs:timings,medianMs,medianMicrosecondsPerMover:{baseline:medianMs.baseline*1000/(frames*systems.current.movers.length),current:medianMs.current*1000/(frames*systems.current.movers.length)},projectRoadCalls:projections,projectionReductionPercent:(1-projections.current/projections.baseline)*100,elapsedMedianReductionPercent:(1-medianMs.current/medianMs.baseline)*100,allPoseFieldsExact:true,scope:'Node roadHazards.update fixed-tick CPU workload versus the copied dirty runtime. Timed modules are uninstrumented; projection counts use separate instrumented imports. No hazards or physics are skipped. This is not GPU timing or Android FPS evidence.'};
await fs.writeFile(new URL('road-plane-benchmark.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
