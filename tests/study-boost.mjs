import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStudyBoost} from '../dist/study-boost.js';
test('one minute doubles study income, including the expiration boundary',()=>{
 const b=createStudyBoost();assert.equal(b.reward(2,.1),.2);assert.equal(b.activate(),true);assert.equal(b.activate(),false);
 for(let i=0;i<599;i++)assert.ok(Math.abs(b.reward(2,.1)-.4)<1e-9);
 assert.ok(Math.abs(b.reward(2,.2)-.6)<1e-8);assert.equal(b.remaining,0);assert.equal(b.reward(2,.1),.2);
});
test('inactive study does not consume the reward; invalid deltas cannot earn',()=>{
 const b=createStudyBoost();b.activate();assert.equal(b.reward(0,.1),0);assert.equal(b.remaining,60);
 for(const dt of [0,-1,NaN,Infinity])assert.equal(b.reward(2,dt),0);
 assert.equal(b.remaining,60);
});
