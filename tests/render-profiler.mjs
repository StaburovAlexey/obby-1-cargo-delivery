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
test('overflow stall percentiles report a bound instead of the largest stall',()=>{
 const p=createRenderProfiler({enabled:true});let now=0;p.record({now,active:true});
 for(let i=0;i<99;i++){now+=2500;p.record({now,active:true});}
 p.record({now:now+10000,active:true});
 const r=p.report();
 assert.equal(r.frameMs.p50,'>2000');assert.equal(r.frameMs.p95,'>2000');assert.equal(r.frameMs.p99,'>2000');
 assert.equal(r.frameMs.max,10000);assert.deepEqual(r.frameMs.overflow,{aboveMs:2000,samples:100});p.dispose();
});
test('overflow retains a readable exact maximum and the histogram boundary stays numeric',()=>{
 const p=createRenderProfiler({enabled:true});p.record({now:0,active:true});p.record({now:2650.100000000006,active:true});
 assert.equal(p.report().frameMs.max,2650.1);p.reset();
 p.record({now:0,active:true});p.record({now:2000,active:true});
 assert.equal(p.report().frameMs.p95,2000);assert.deepEqual(p.report().frameMs.overflow,{aboveMs:2000,samples:0});p.dispose();
});
test('current FPS follows the latest second while session percentiles retain earlier frames',()=>{
 const p=createRenderProfiler({enabled:true});
 for(let now=0;now<=1000;now+=20)p.record({now,active:true});
 for(let now=1100;now<=3000;now+=100)p.record({now,active:true});
 const r=p.report();
 assert.equal(r.current.fps,10);assert.equal(r.current.samples,10);
 assert.equal(r.current.elapsedSeconds,1);assert.deepEqual(r.current.frameMs,Array(10).fill(100));
 assert.equal(r.samples,70);assert.equal(r.frameMs.p50,20);assert.equal(r.frameMs.p95,100);
 assert.equal(r.fps,23.33);p.dispose();
});
test('the recent frame graph remains bounded at high frame rates and through long runs',()=>{
 const p=createRenderProfiler({enabled:true});
 for(let now=0;now<=100000;now++)p.record({now,active:true});
 const r=p.report();assert.equal(r.samples,100000);assert.equal(r.current.fps,1000);
 assert.ok(r.current.frameMs.length<=240);assert.equal(r.current.samples,r.current.frameMs.length);
 assert.ok(r.current.frameMs.every(ms=>ms===1));p.dispose();
});
test('suspension, inactive frames, reset and clock rewind clear the current window immediately',()=>{
 const p=createRenderProfiler({enabled:true});
 p.record({now:0,active:true});p.record({now:20,active:true});assert.equal(p.report().current.fps,50);
 p.suspend();assert.equal(p.report().current.fps,0);
 p.record({now:1000,active:true});assert.equal(p.report().current.samples,0);
 p.record({now:1020,active:true});p.record({now:2000,active:false});assert.equal(p.report().current.samples,0);
 p.record({now:3000,active:true});p.record({now:3100,active:true});assert.equal(p.report().current.fps,10);
 p.record({now:2900,active:true});assert.equal(p.report().current.samples,0);
 assert.equal(p.report().samples,3);p.record({now:2920,active:true});p.reset();
 assert.equal(p.report().current.samples,0);assert.equal(p.report().samples,0);p.dispose();
});
test('stage timings average valid samples independently and retain renderer memory and DPR',()=>{
 const p=createRenderProfiler({enabled:true});p.record({now:0,active:true});
 p.record({now:20,active:true,timings:{physics:4,logic:2,ui:0,network:1,culling:.5,render:3,frame:12},physicsSteps:2,pixelRatio:1.5,
  info:{render:{calls:3,triangles:50},memory:{geometries:7,textures:2}}});
 p.record({now:40,active:true,timings:{physics:8,logic:NaN,ui:-1,network:3,culling:1.5,render:5,frame:18},physicsSteps:4});
 const r=p.report();
 assert.deepEqual(r.timingsMeanMs,{physics:6,logic:2,ui:0,network:2,culling:1,render:4,frame:15});
 assert.deepEqual(r.current.timingsMeanMs,r.timingsMeanMs);assert.deepEqual(r.physicsSteps,{last:4,mean:3});
 assert.equal(r.pixelRatio,1.5);assert.deepEqual(r.memory,{geometries:7,textures:2});
 assert.deepEqual(r.gpu,{available:false});
 p.reset();assert.equal(p.report().timingsMeanMs.physics,0);assert.deepEqual(p.report().physicsSteps,{last:0,mean:0});p.dispose();
});
class DiagnosticElement{
 constructor(tag){this.tagName=tag;this.children=[];this.style={};this.attributes={};this.listeners={};this.textWrites=0;this.hidden=false;}
 append(...elements){for(const element of elements){element.parent=this;this.children.push(element);}}
 setAttribute(key,value){this.attributes[key]=String(value);}
 addEventListener(type,listener){this.listeners[type]=listener;}
 set textContent(value){this.text=value;this.textWrites++;}
 get textContent(){return this.text??'';}
 click(){this.listeners.click?.({stopPropagation(){}});}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
}
function diagnosticDocument(){
 const body=new DiagnosticElement('body');
 return{body,createElement:tag=>new DiagnosticElement(tag)};
}
function descendant(root,id){if(root.id===id)return root;for(const child of root.children){const found=descendant(child,id);if(found)return found;}return null;}
test('compact diagnostics update at most four times per second and toggle details without canvas',()=>{
 const doc=diagnosticDocument(),p=createRenderProfiler({enabled:true,document:doc});
 const panel=descendant(doc.body,'render-performance'),output=descendant(panel,'render-performance-values');
 const details=descendant(panel,'render-performance-details'),toggle=descendant(panel,'render-performance-toggle');
 assert.ok(details);assert.ok(toggle);assert.equal(details.hidden,true);
 const initialWrites=output.textWrites;
 for(let now=0;now<250;now+=10)p.record({now,active:true,timings:{render:2,frame:3},pixelRatio:2});
 assert.equal(output.textWrites,initialWrites+1);p.record({now:250,active:true});assert.equal(output.textWrites,initialWrites+2);
 assert.match(output.textContent,/FPS 100/);assert.match(output.textContent,/p95.*p99/);
 toggle.click();assert.equal(details.hidden,false);assert.equal(toggle.attributes['aria-expanded'],'true');
 assert.match(details.textContent,/GPU.*недоступ/);assert.match(details.textContent,/DPR 2/);
 const graph=descendant(panel,'render-performance-graph');assert.ok(graph);assert.ok(graph.children.length>0&&graph.children.length<=120);
 assert.ok(graph.children.some(bar=>!bar.hidden));
 toggle.click();assert.equal(details.hidden,true);p.dispose();assert.equal(doc.body.children.length,0);
});
test('suspension immediately replaces visible FPS and active status once without another game frame',()=>{
 const doc=diagnosticDocument(),p=createRenderProfiler({enabled:true,document:doc});
 const panel=descendant(doc.body,'render-performance'),output=descendant(panel,'render-performance-values');
 const graph=descendant(panel,'render-performance-graph');
 p.record({now:0,active:true});p.record({now:250,active:true,timings:{physics:5}});
 assert.match(output.textContent,/FPS 4/);assert.match(output.textContent,/измерение/);
 const writes=output.textWrites;p.suspend();
 assert.match(output.textContent,/FPS 0/);assert.match(output.textContent,/пауза\/загрузка/);
 assert.equal(output.textWrites,writes+1);assert.ok(graph.children.every(bar=>bar.hidden));
 p.suspend();p.record({now:270,active:false});p.record({now:280,active:false});
 assert.equal(output.textWrites,writes+1);p.dispose();
});
test('inactive transition clears visible FPS immediately but repeated inactive frames remain throttled',()=>{
 const doc=diagnosticDocument(),p=createRenderProfiler({enabled:true,document:doc});
 const output=descendant(doc.body,'render-performance-values');
 p.record({now:0,active:true});p.record({now:250,active:true});
 const writes=output.textWrites;p.record({now:270,active:false});
 assert.match(output.textContent,/FPS 0/);assert.match(output.textContent,/пауза\/загрузка/);
 assert.equal(output.textWrites,writes+1);
 p.record({now:280,active:false});p.record({now:290,active:false});assert.equal(output.textWrites,writes+1);p.dispose();
});
test('reset immediately replaces visible session and rolling statistics without another game frame',()=>{
 const doc=diagnosticDocument(),p=createRenderProfiler({enabled:true,document:doc});
 const panel=descendant(doc.body,'render-performance'),output=descendant(panel,'render-performance-values');
 const details=descendant(panel,'render-performance-details');
 p.record({now:0,active:true});p.record({now:250,active:true});
 assert.match(output.textContent,/FPS 4/);const writes=output.textWrites;p.reset();
 assert.match(output.textContent,/FPS 0/);assert.match(output.textContent,/p95 0/);
 assert.match(details.textContent,/Кадров 0/);assert.equal(output.textWrites,writes+1);p.dispose();
});
