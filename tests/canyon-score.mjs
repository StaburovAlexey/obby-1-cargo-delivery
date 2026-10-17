import test from 'node:test';
import assert from 'node:assert/strict';
import {CANYON_TRACK,canyonPointAt} from '../dist/canyon-track.js';
import {createDriftScore} from '../dist/drift-score.js';
import {sanitizeDriftRecord} from '../dist/drift-record.js';
import {freshCareer,sanitizeCareer} from '../dist/career-save.js';
import {createGameplay} from '../dist/gameplay.js';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';

const pose=(s,{angle=.5,speed=20,impactSpeed=0}={})=>{const p=canyonPointAt(s),heading=p.heading+angle;return {x:p.x,z:p.z,heading,velocityX:-Math.sin(p.heading)*speed,velocityZ:-Math.cos(p.heading)*speed,impactSpeed};};
const begin=()=>{const score=createDriftScore();score.start(pose(12));return score;};

test('forward drifting earns a linked combo and only a full valid course finishes',()=>{
 const score=begin();for(let s=14;s<=1840;s+=2)score.update(.1,pose(s));
 assert.ok(score.state.score>10000);assert.ok(score.state.maxCombo>=3);assert.equal(score.state.finished,true);assert.equal(score.state.valid,true);
 const result=score.result();assert.equal(result.trackId,'canyon-v1');assert.ok(result.durationMs>60000);
});
test('driving straight, spinning, pausing and impacts never farm drifting points',()=>{
 for(const sample of [{angle:0},{angle:2},{speed:2},{impactSpeed:4}]){const score=begin();for(let s=14;s<=80;s+=2)score.update(.1,pose(s,sample));assert.equal(score.state.score,0);}
 const score=begin();for(let s=14;s<=80;s+=2)score.update(.1,pose(s));const earned=score.state.score;score.update(.1,pose(82),{paused:true});assert.equal(score.state.score,earned);assert.equal(score.state.multiplier,1);assert.equal(score.state.rankedEligible,false);
});
test('backwards and repeated sectors cannot be scored again; teleports invalidate a run',()=>{
 const score=begin();for(let s=14;s<=80;s+=2)score.update(.1,pose(s));const earned=score.state.score;
 for(let s=78;s>=14;s-=2)score.update(.1,pose(s));for(let s=16;s<=80;s+=2)score.update(.1,pose(s));assert.equal(score.state.score,earned);
 score.update(.1,pose(1000));assert.equal(score.state.valid,false);assert.equal(score.result(),null);
 const late=createDriftScore();assert.equal(late.start(pose(1000)),false);
});
test('invalid time and forged save records are rejected and old saves remain readable',()=>{
 const score=begin();score.update(NaN,pose(14));assert.equal(score.state.valid,false);
 assert.equal(sanitizeDriftRecord({trackId:'other',score:900000}),null);
 assert.equal(sanitizeDriftRecord({version:1,trackId:'canyon-v1',score:Infinity,durationMs:100000,maxCombo:3}),null);
 const fresh=freshCareer();assert.equal(sanitizeCareer({...fresh,driftRecord:undefined}).driftRecord,null);
 const record={version:1,trackId:'canyon-v1',score:12000,durationMs:130000,maxCombo:4,verified:true};
 assert.deepEqual(sanitizeCareer({...fresh,driftRecord:record}).driftRecord,record);
});
test('a genuine finisher saves only a better drift result without delivery rewards',()=>{
 const g=createGameplay({career:earnedRewardCareer()}),before=g.snapshot(),record={version:1,trackId:'canyon-v1',score:12000,durationMs:130000,maxCombo:4,verified:false};
 assert.equal(g.recordDriftResult(record),true);assert.equal(g.snapshot().driftRecord.score,12000);assert.equal(g.recordDriftResult({...record,score:11000}),false);
 assert.equal(g.state.money,before.money);assert.equal(g.state.brains,before.brains);assert.equal(g.state.completedRuns,before.completedRuns);
 assert.equal(createGameplay().recordDriftResult(record),false);
});
