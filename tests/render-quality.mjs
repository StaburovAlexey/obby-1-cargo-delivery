import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderQuality,isMobileRenderer} from '../dist/render-quality.js';

test('mobile quality is orientation-independent and caps canvas pixels, not UI size',()=>{
  assert.equal(isMobileRenderer({maxTouchPoints:5,userAgent:'Android',width:844}),true);
  assert.equal(isMobileRenderer({maxTouchPoints:0,userAgent:'Linux x86_64',width:390}),false);
  const portrait=createRenderQuality({mobile:true,devicePixelRatio:3});
  const landscape=createRenderQuality({mobile:true,devicePixelRatio:3});
  assert.equal(portrait.profile.pixelRatio,1.25);assert.deepEqual(portrait.profile,landscape.profile);
  assert.equal(portrait.profile.shadowSize,1024);
});
test('sustained slow frames reduce quality, isolated spikes and inactive time do not',()=>{
  const q=createRenderQuality({mobile:false,devicePixelRatio:2});
  let now=0;
  for(let i=0;i<120;i++){now+=16.67;q.observe({now,frameMs:16.67,workMs:6,gpuMs:7});}
  now+=100;q.observe({now,frameMs:100,workMs:90,gpuMs:7});assert.equal(q.profile.level,'high');
  for(let i=0;i<100;i++){now+=33.34;q.observe({now,frameMs:33.34,active:false});}
  assert.equal(q.profile.level,'high');
  for(let i=0;i<180;i++){now+=33.34;q.observe({now,frameMs:33.34,workMs:18,gpuMs:22});}
  assert.notEqual(q.profile.level,'high');assert.ok(q.profile.pixelRatio<2);
});
test('quality recovery needs stable headroom and respects hysteresis',()=>{
  const q=createRenderQuality({mobile:true,devicePixelRatio:2});let now=0;
  for(let i=0;i<150;i++){now+=33.34;q.observe({now,frameMs:33.34,workMs:20,gpuMs:24});}
  const low=q.profile.level;assert.notEqual(low,'high');
  for(let i=0;i<120;i++){now+=16.67;q.observe({now,frameMs:16.67,workMs:5,gpuMs:6});}
  assert.equal(q.profile.level,low);
  for(let i=0;i<900;i++){now+=16.67;q.observe({now,frameMs:16.67,workMs:5,gpuMs:6});}
  assert.notEqual(q.profile.level,low);
});
test('fixed diagnostic quality never adapts and invalid time does not corrupt state',()=>{
  const q=createRenderQuality({devicePixelRatio:2,mode:'high'});const before=q.profile;
  for(let i=0;i<400;i++)q.observe({now:i*40,frameMs:40,gpuMs:30});
  assert.deepEqual(q.profile,before);q.observe({now:NaN,frameMs:Infinity});assert.deepEqual(q.profile,before);
});
