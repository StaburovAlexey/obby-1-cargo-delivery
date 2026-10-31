import test from 'node:test';
import assert from 'node:assert/strict';
import {createNitro,NITRO_LEVELS,nitroDriftPoints} from '../dist/vehicle-nitro.js';
const pose={heading:0,velocityX:10,velocityZ:-20,grounded:true,upY:1,gear:'D',active:true};
for(let level=1;level<=5;level++)test(`level ${level}: one click consumes one charge for two simulated seconds`,()=>{
 const n=createNitro();n.start(level);assert.equal(n.state.charges,level);
 assert.equal(n.activate(pose),true);assert.equal(n.activate(pose),false);
 for(let i=0;i<120;i++)n.step(1/60,pose,{distance:0,onRoad:true});
 assert.equal(n.state.remaining,0);assert.equal(n.state.charges,level-1);
 n.addPoints(NITRO_LEVELS[level-1].points/2);assert.equal(n.state.progress,.5);
 n.addPoints(NITRO_LEVELS[level-1].points/2);assert.equal(n.state.charges,level);assert.equal(n.state.progress,0);
});
test('charge caps, cancellation and no regeneration during boost',()=>{
 const n=createNitro();n.start(3);n.activate(pose);n.addPoints(999999);assert.equal(n.state.charges,2);
 n.cancel();n.activate(pose);n.cancel();n.addPoints(NITRO_LEVELS[2].points*1.5);assert.equal(n.state.charges,2);assert.equal(n.state.progress,.5);
 n.addPoints(999999);assert.equal(n.state.charges,3);assert.equal(n.state.progress,0);
 n.start(0);assert.equal(n.activate(pose),false);
});
test('only genuine road drift scores: no reverse, air, impact, spin or teleport',()=>{
 assert.ok(nitroDriftPoints(.1,pose,{distance:2,onRoad:true})>0);
 for(const patch of [{grounded:false},{upY:0},{blocked:true},{impactSpeed:2},{velocityZ:20},{velocityX:0},{gear:'R'}])assert.equal(nitroDriftPoints(.1,{...pose,...patch},{distance:2,onRoad:true}),0);
 assert.equal(nitroDriftPoints(.1,pose,{distance:100,onRoad:true}),0);
 assert.equal(nitroDriftPoints(.1,pose,{distance:2,onRoad:false}),0);
});

test('nitro can start after releasing the gas, including zero analog throttle',()=>{
 const n=createNitro();n.start(1);
 assert.equal(n.activate({...pose,active:false,speedDemand:0}),true);
 n.step(.1,{...pose,active:false,speedDemand:0},{distance:0,onRoad:true});
 assert.equal(n.state.remaining,1.9);
});
for(const input of [{brake:1},{handbrake:1},{gear:'R'},{speedDemand:-1}])test(`braking/reverse cancels nitro without refund: ${JSON.stringify(input)}`,()=>{
 const n=createNitro();n.start(2);n.activate(pose);
 n.step(.1,{...pose,...input},{distance:0,onRoad:true});
 assert.equal(n.state.remaining,0);assert.equal(n.state.charges,1);
 assert.equal(n.activate({...pose,...input}),false);
});
