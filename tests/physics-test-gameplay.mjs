import assert from 'node:assert/strict';
import test from 'node:test';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';

const vehicles=VEHICLE_CONFIG.map((v,i)=>({id:v.id,park:{x:40,z:40+i*20}}));
const make=()=>createGameplay({vehicles,career:freshCareer()});

test('test-track entry cancels cargo without payment and suspends fuel and rewards',()=>{
 const g=make();assert.equal(g.enter('pickup'),true);
 const money=g.state.money,brains=g.state.brains;g.state.fuels.pickup=17;
 assert.equal(typeof g.beginPhysicsTest,'function');
 assert.equal(g.beginPhysicsTest(),true);
 assert.equal(g.state.eventMode,'physics-test');assert.equal(g.state.run,null);
 for(let i=0;i<100;i++){g.drive(2,-200,-200);g.tickProgress(.05,{distance:2,active:true});}
 assert.equal(g.state.fuels.pickup,17);assert.equal(g.state.money,money);assert.equal(g.state.brains,brains);
 assert.equal(g.state.mode,'driving');assert.equal(g.state.selectedId,'pickup');
 assert.equal(g.beginFinish('main',{x:-200,z:-200}),false);
 assert.equal(g.endPhysicsTest(),true);assert.equal(g.state.eventMode,null);assert.equal(g.state.testMode,true);assert.equal(g.state.run,null);
 g.drive(1,0,0);assert.ok(g.state.fuels.pickup<17);
});

test('test mode does not leak through a garage return or create a run on re-entry',()=>{
 const g=make();assert.equal(typeof g.beginPhysicsTest,'function');assert.equal(g.beginPhysicsTest(),false);
 g.enter('pickup');g.beginPhysicsTest();assert.equal(g.beginPhysicsTest(),false);
 g.returnToGarage();assert.equal(g.state.eventMode,null);assert.equal(g.state.testMode,false);
 g.state.cooldown=0;assert.equal(g.enter('pickup'),true);assert.equal(g.state.run.loaded,true);
});
