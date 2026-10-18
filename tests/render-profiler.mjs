import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderProfiler} from '../dist/render-profiler.js';
test('disabled diagnostics allocate no recorder or UI',()=>assert.equal(createRenderProfiler({enabled:false}),null));
test('frame statistics count complete intervals and renderer shadow-inclusive counters',()=>{
 const p=createRenderProfiler({enabled:true,baseline:true});
 const info={render:{calls:9,triangles:100},memory:{geometries:10,textures:4}};
 for(let i=0;i<=60;i++)p.record({now:i*1000/60,active:true,info,roomCount:20,loadedPeers:19,renderCpuMs:2});
 const r=p.report();assert.equal(r.samples,60);assert.ok(Math.abs(r.fps-60)<.01);assert.equal(r.frameMs.p95,16.7);
 assert.equal(r.roomCount,20);assert.equal(r.loadedPeers,19);assert.equal(r.render.calls,9);assert.equal(r.render.triangles,100);assert.equal(r.mode,'baseline');p.dispose();
});
test('pauses, background, loading, suspension and clock resets never become frame stalls',()=>{
 const p=createRenderProfiler({enabled:true});
 p.record({now:0,active:true});p.record({now:20,active:true});p.record({now:1000,active:false});
 p.record({now:2000,active:true});p.record({now:2030,active:true});p.suspend();p.record({now:9000,active:true});
 p.record({now:8990,active:true});assert.equal(p.report().samples,2);assert.equal(p.report().frameMs.max,30);p.dispose();
});
test('real active stalls stay in the report and reset/disposal are complete',()=>{
 const p=createRenderProfiler({enabled:true});p.record({now:0,active:true});p.record({now:500,active:true});
 assert.equal(p.report().frameMs.max,500);assert.equal(p.report().fps,2);p.reset();assert.equal(p.report().samples,0);
 p.dispose();p.record({now:1000,active:true});assert.equal(p.report().samples,0);
});
test('long sessions retain accurate bounded aggregate statistics',()=>{
 const p=createRenderProfiler({enabled:true});
 for(let i=0;i<=100000;i++)p.record({now:i*20,active:true});
 const r=p.report();assert.equal(r.samples,100000);assert.equal(r.frameMs.p99,20);assert.equal(r.fps,50);p.dispose();
});
test('overflow stall percentiles are rounded for a readable phone overlay',()=>{
 const p=createRenderProfiler({enabled:true});p.record({now:0,active:true});p.record({now:2650.100000000006,active:true});
 assert.equal(p.report().frameMs.p95,2650.1);p.dispose();
});
