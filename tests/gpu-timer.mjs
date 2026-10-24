import test from 'node:test';
import assert from 'node:assert/strict';
import {createGpuTimer} from '../dist/gpu-timer.js';
import {createRenderProfiler} from '../dist/render-profiler.js';

function context(){
  let id=0,current=null,available=false,disjoint=false,deleted=0;
  const ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};
  const gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,CURRENT_QUERY:5,
    getExtension:()=>ext,isContextLost:()=>false,createQuery:()=>({id:++id}),
    beginQuery(_,query){assert.equal(current,null);current=query;},endQuery(){current=null;},
    getQuery:()=>current,getParameter:()=>disjoint,
    getQueryParameter:(_,key)=>key===3?available:7_500_000,deleteQuery(){deleted++;}};
  return {gl,get deleted(){return deleted;},available(value){available=value;},disjoint(value){disjoint=value;}};
}
test('unsupported and disabled GPU timers do not issue GL queries',()=>{
  const timer=createGpuTimer({getExtension:()=>null},{enabled:true});
  assert.equal(timer.begin(),false);timer.end();timer.poll();
  assert.deepEqual(timer.report(),{available:false,samples:0,lastMs:null,meanMs:null,p95Ms:null,pending:0});
  timer.dispose();
});
test('GPU results are read only when available and pending queries stay bounded',()=>{
  const c=context(),timer=createGpuTimer(c.gl,{enabled:true,sampleEvery:1,maxPending:2});
  assert.equal(timer.begin(),true);timer.end();assert.equal(timer.begin(),true);timer.end();
  assert.equal(timer.begin(),false);timer.poll();assert.equal(timer.report().samples,0);
  c.available(true);timer.poll();assert.equal(timer.report().samples,2);
  assert.equal(timer.report().lastMs,7.5);assert.equal(timer.report().meanMs,7.5);
  assert.equal(timer.report().p95Ms,7.5);assert.equal(c.deleted,2);timer.dispose();
});
test('disjoint results and reset are discarded without inventing GPU timings',()=>{
  const c=context(),timer=createGpuTimer(c.gl,{enabled:true,sampleEvery:1});
  timer.begin();timer.end();c.disjoint(true);timer.poll();assert.equal(timer.report().samples,0);
  assert.equal(timer.report().pending,0);c.disjoint(false);c.available(true);
  timer.begin();timer.end();timer.poll();assert.equal(timer.report().samples,1);
  timer.reset();assert.equal(timer.report().samples,0);assert.equal(timer.report().lastMs,null);
  timer.begin();timer.end();timer.dispose();assert.equal(timer.report().pending,0);
});
test('profiler preserves real GPU results separately from CPU submission time',()=>{
  const profiler=createRenderProfiler({enabled:true});
  profiler.record({now:0,active:true});
  const gpu={available:true,samples:4,lastMs:12.5,meanMs:11.8,p95Ms:12.8,pending:1};
  profiler.record({now:16.67,active:true,renderCpuMs:2,gpu});
  assert.deepEqual(profiler.report().gpu,gpu);assert.equal(profiler.report().renderCpuMeanMs,2);
  profiler.dispose();
});
test('profiler reset also resets the GPU sampling window',()=>{
  let resets=0;const profiler=createRenderProfiler({enabled:true,onReset(){resets++;}});
  profiler.record({now:0,active:true,gpu:{available:true,samples:100,lastMs:11,meanMs:10,p95Ms:14,pending:0}});
  profiler.reset();assert.equal(resets,1);assert.deepEqual(profiler.report().gpu,{available:false});
  profiler.dispose();
});

function restorableContext(){
  let generation=0,lost=false,current=null,ready=false,extensionReads=0;
  const listeners=new Map(),calls=[];
  const extension=()=>({TIME_ELAPSED_EXT:10+generation*2,GPU_DISJOINT_EXT:11+generation*2});
  const canvas={
    addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},
    removeEventListener(type,listener){listeners.get(type)?.delete(listener);},
  };
  const valid=query=>{assert.equal(lost,false,'lost contexts must issue no query commands');assert.equal(query?.generation,generation,'old query handles must never be reused');};
  const gl={canvas,QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,CURRENT_QUERY:3,
    isContextLost:()=>lost,getExtension(){extensionReads++;return extension();},
    createQuery(){assert.equal(lost,false);return {generation};},
    beginQuery(target,query){valid(query);assert.equal(target,extension().TIME_ELAPSED_EXT);assert.equal(current,null);current=query;calls.push('begin');},
    endQuery(target){valid(current);assert.equal(target,extension().TIME_ELAPSED_EXT);current=null;calls.push('end');},
    deleteQuery(query){valid(query);calls.push('delete');},
    getQuery(target){assert.equal(target,extension().TIME_ELAPSED_EXT);return current;},
    getParameter(target){assert.equal(target,extension().GPU_DISJOINT_EXT);return false;},
    getQueryParameter(query,key){valid(query);calls.push('result');return key===1?ready:6_000_000;},
  };
  const dispatch=type=>{for(const listener of listeners.get(type)||[])listener({type});};
  return {gl,calls,listeners,get extensionReads(){return extensionReads;},ready(value){ready=value;},
    lose({event=true}={}){lost=true;current=null;if(event)dispatch('webglcontextlost');},
    restore(){generation++;lost=false;dispatch('webglcontextrestored');},
  };
}

test('context loss drops active and pending handles plus timings, and restoration reacquires the extension',()=>{
  const c=restorableContext(),timer=createGpuTimer(c.gl,{enabled:true,sampleEvery:1});
  timer.begin();timer.end();c.ready(true);timer.poll();assert.equal(timer.lastMs,6);
  c.ready(false);timer.begin();timer.end();timer.begin();
  assert.equal(timer.report().pending,1);const callsBeforeLoss=c.calls.length;
  c.lose();
  assert.deepEqual(timer.report(),{available:false,samples:0,lastMs:null,meanMs:null,p95Ms:null,pending:0});
  timer.end();timer.poll();timer.reset();assert.equal(timer.begin(),false);
  assert.equal(c.calls.length,callsBeforeLoss,'loss cleanup only forgets invalidated handles');
  c.restore();assert.equal(c.extensionReads,2,'restored contexts need a fresh extension');
  assert.equal(timer.begin(),true);timer.end();c.ready(true);timer.poll();assert.equal(timer.lastMs,6);
  timer.dispose();timer.dispose();
  for(const listeners of c.listeners.values())assert.equal(listeners.size,0,'dispose detaches context lifecycle listeners');
  c.lose();c.restore();assert.equal(c.extensionReads,2,'disposed timers stay detached');
});

test('loss detected before its event prevents end, reset and dispose from touching stale handles',()=>{
  for(const action of ['end','reset','dispose']){
    const c=restorableContext(),timer=createGpuTimer(c.gl,{enabled:true,sampleEvery:1});
    timer.begin();timer.end();timer.begin();const callsBeforeLoss=c.calls.length;
    c.lose({event:false});timer[action]();
    assert.equal(c.calls.length,callsBeforeLoss,action+' must not touch lost queries');
    assert.equal(timer.report().pending,0);assert.equal(timer.lastMs,null);timer.dispose();
  }
});
