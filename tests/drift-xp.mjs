import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {nitroCareer} from './fixtures/nitro-career.mjs';
const vehicles=VEHICLE_CONFIG.map((v,i)=>({id:v.id,park:{x:24,z:44+11*i}}));
function fixture(id){
 const spec=VEHICLE_CONFIG.find(v=>v.id===id),g=createGameplay({vehicles,career:nitroCareer(),developerMode:!!spec.devUnlock});
 if(spec.devUnlock){g.state.player={...vehicles.find(v=>v.id===id).park};assert.equal(g.unlockDeveloperVehicle(id),true);}
 assert.equal(g.enter(id),true);return g;
}
for(const spec of VEHICLE_CONFIG.filter(v=>v.rewardDrift))test(`${spec.id} earns 16 XP per actual moving second on both tracks`,()=>{
 assert.equal(spec.brainRate,16);
 const g=fixture(spec.id);
 for(const fps of [30,60,120]){
  const before=g.state.brains;
  for(let i=0;i<fps;i++)g.tickProgress(1/fps,{distance:20/fps,active:true});
  assert.ok(Math.abs(g.state.brains-before-16)<1e-6);
 }
 assert.equal(g.beginCanyonRun(),true);const before=g.state.brains;
 for(let i=0;i<60;i++)g.tickProgress(1/60,{distance:20/60,active:true});
 assert.ok(Math.abs(g.state.brains-before-16)<1e-6);
});
test('drift XP rejects idle, pauses, invalid movement and finish/biome tests; ordinary rates stay unchanged',()=>{
 const g=fixture('bmwreward'),before=g.state.brains;
 for(const [dt,input] of [[.1,{distance:0,active:true}],[.1,{distance:2,active:false}],[1,{distance:20,active:true}],[.1,{distance:100,active:true}]])assert.equal(g.tickProgress(dt,input),0);
 assert.equal(g.state.brains,before);
 assert.equal(g.beginBiomeTest('city'),true);assert.equal(g.tickProgress(.1,{distance:2,active:true}),0);
 const canyon=fixture('bmwreward');assert.equal(canyon.beginCanyonRun(),true);assert.equal(canyon.beginFinish('canyon',{x:0,z:0}),true);
 assert.equal(canyon.tickProgress(.1,{distance:2,active:true}),0);
 const pickup=fixture('pickup'),start=pickup.state.brains;
 for(let i=0;i<60;i++)pickup.tickProgress(1/60,{distance:20/60,active:true});
 assert.ok(Math.abs(pickup.state.brains-start-1)<1e-6);
});
