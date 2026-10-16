import assert from 'node:assert/strict';
import {createRemoteMotion} from '../dist/remote-motion.js';
const motion=createRemoteMotion({delayMs:150});
const state=(x,teleportId=0)=>({mode:'walking',characterId:'bacon',position:[x,0,0],quaternion:[0,0,0,1],speed:5,teleportId});
motion.receive([{id:'a',state:state(0)}],1000);motion.receive([{id:'a',state:state(10)}],1100);
assert.equal(motion.sample('a',1200).position[0],5);
motion.receive([{id:'a',state:state(1000,1)}],1200);
assert.equal(motion.sample('a',1201).position[0],1000,'teleport is never interpolated across the world');
motion.receive([],1300);assert.equal(motion.sample('a',1400),null);
motion.receive([{id:'b',state:{...state(0),airborne:true,jumpElapsed:.65}}],1500);
motion.receive([{id:'b',state:{...state(0),airborne:false,jumpElapsed:0}}],1600);
assert(motion.sample('b',1700).jumpElapsed>=.65,'landing must not rewind the airborne animation');
console.log('PASS remote motion: buffered interpolation, teleport discontinuity and departed-player removal.');
const walking=createRemoteMotion();
const walker=(seq,x)=>[{id:'walker',state:{...state(x),seq}}];
walking.receive(walker(1,0),1000);
walking.receive(walker(2,.45),1100);
walking.receive(walker(2,.45),1200);
assert(Math.abs(walking.sample('walker',1250).position[0]-.225)<1e-9,
  'the playback buffer must cover one repeated 10Hz snapshot');
walking.receive(walker(4,1.35),1300);
assert(Math.abs(walking.sample('walker',1400).position[0]-.9)<1e-9,
  'a repeated server snapshot must not insert a stop into steady walking');
console.log('PASS steady remote walking across repeated server snapshots');
