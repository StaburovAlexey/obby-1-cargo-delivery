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

const far=createRemoteMotion(),farPlayer=(seq,x,extra={})=>[{id:'far',cadenceMs:500,state:{...state(x),seq,...extra}}];
far.receive(farPlayer(1,0),1000);far.receive(farPlayer(2,10),1500);
assert.equal(far.sample('far',1600).position[0],1,'2Hz stream uses550ms buffered interpolation');
far.receive(farPlayer(2,10),1600);
assert.equal(far.sample('far',1700).position[0],3,'reconstructed unchanged roster entries never add motion samples');
far.receive(farPlayer(3,20,{paused:true}),1750);assert.equal(far.sample('far',1751).position[0],20,'pause switches immediately without the old playback tail');
far.receive(farPlayer(4,21,{paused:false}),1770);assert.equal(far.sample('far',1771).paused,false,'resume does not replay stale paused states');

const tier=createRemoteMotion({delayMs:150});
tier.receive([{id:'tier',cadenceMs:100,state:{...state(0),seq:1}}],1000);
tier.receive([{id:'tier',cadenceMs:100,state:{...state(10),seq:2}}],1100);
const beforeTier=tier.sample('tier',1200).position[0];
tier.receive([{id:'tier',cadenceMs:500,state:{...state(10),seq:2}}],1210);
assert.equal(tier.sample('tier',1210).position[0],beforeTier,'near→far delay changes never rewind playback');
tier.receive([{id:'tier',cadenceMs:500,state:{...state(60),seq:3}}],1600);
assert.ok(tier.sample('tier',1750).position[0]>=beforeTier);

const angles=createRemoteMotion({delayMs:150});
angles.receive([{id:'turn',state:{...state(0),seq:1,heading:Math.PI-.01,wheelSpin:100,braking:false}}],1000);
angles.receive([{id:'turn',state:{...state(0),seq:2,heading:-Math.PI+.01,wheelSpin:110,quaternion:[0,0,0,-1],braking:true}}],1100);
const half=angles.sample('turn',1200);
assert.ok(Math.abs(Math.abs(half.heading)-Math.PI)<1e-9,'wrapped headings take the short arc');assert.equal(half.wheelSpin,105,'wheel turns remain unwrapped');
assert.equal(half.braking,true,'discrete braking is never a truthy fractional0/1 blend');assert.equal(Math.abs(half.quaternion[3]),1,'antipodal quaternion keeps the same rotation');
console.log('PASS adaptive2Hz interpolation, monotonic tier transitions, immediate pause/resume, heading wrap and discrete brake lights');
