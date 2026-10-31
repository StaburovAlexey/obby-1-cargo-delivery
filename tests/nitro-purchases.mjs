import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer,sanitizeCareer} from '../dist/career-save.js';
import {nitroCareer} from './fixtures/nitro-career.mjs';

test('production nitro requires route proof and both currencies',()=>{
 const g=createGameplay({career:{...freshCareer(),money:100000,brains:10000}});
 assert.equal(g.getNitroOffer().unlocked,false);assert.equal(g.buyNitro(1),false);
 for(const patch of [{money:19999},{brains:1999}]){
 const g=createGameplay({career:{...nitroCareer(),...patch}});const before=g.snapshot();assert.equal(g.buyNitro(1),false);assert.deepEqual(g.snapshot(),before);
 }
});
test('five sequential purchases deduct both balances once and persist shared level',()=>{
 const g=createGameplay({career:nitroCareer()});
 for(let level=1;level<=5;level++){
 assert.equal(g.buyNitro(level),true);assert.equal(g.buyNitro(level),false);
 assert.equal(g.state.money,100000-level*20000);assert.equal(g.state.brains,10000-level*2000);
 assert.equal(createGameplay({career:g.snapshot()}).state.nitroLevel,level);
 }
 assert.equal(g.buyNitro(6),false);assert.equal(g.getNitroOffer().maxed,true);
});
test('old saves and invalid route proof cannot enable nitro',()=>{
 assert.equal(sanitizeCareer(freshCareer()).nitroLevel,0);
 assert.equal(sanitizeCareer({...freshCareer(),nitroLevel:5}).nitroLevel,0);
 assert.equal(sanitizeCareer({...nitroCareer(),nitroLevel:99}).nitroLevel,5);
});

test('level survives real cloud save/reload without persisting charge state',async()=>{
 const {createCloudCareer}=await import('../dist/cloud-career.js');let data=null;
 const platform={async loadSave(){return data;},async saveSave(value){data=JSON.parse(JSON.stringify(value));}};
 const first=createCloudCareer({platform,legacyStorage:null,writeDelayMs:0});await first.initialize();
 const second=createCloudCareer({platform,legacyStorage:null,writeDelayMs:0});
 try{
 const g=createGameplay({career:nitroCareer(),persistence:first.store});assert.equal(g.buyNitro(1),true);await first.flush();
 const loaded=await second.initialize();assert.equal(loaded.career.nitroLevel,1);assert.equal(loaded.career.money,80000);assert.equal(loaded.career.brains,8000);assert.equal(loaded.career.nitro,undefined);
 }finally{first.destroy();second.destroy();}
});
test('only a garage departure refills charges; canyon transitions do not',()=>{
 const g=createGameplay({career:{...nitroCareer(),nitroLevel:3},vehicles:[{id:'bmwreward',position:{x:0,z:0}}]});
 assert.equal(g.enter('bmwreward'),true);assert.equal(g.nitro.state.charges,3);
 g.nitro.state.charges=1;g.nitro.state.progress=.4;g.nitro.state.remaining=1;
 assert.equal(g.beginCanyonRun(),true);assert.equal(g.nitro.state.charges,1);g.endCanyonRun();assert.equal(g.nitro.state.progress,.4);
 g.returnToGarage();assert.equal(g.nitro.state.remaining,0);g.state.cooldown=0;g.enter('bmwreward');assert.equal(g.nitro.state.charges,3);assert.equal(g.nitro.state.progress,0);
});


test('development unlocks nitro purchases and all upgrades without completing the route',()=>{
 const g=createGameplay({developerMode:true,career:{...freshCareer(),money:100000,brains:10000},vehicles:[{id:'bmwreward',position:{x:0,z:0}}]});
 assert.equal(g.getNitroOffer().unlocked,true);
 for(let level=1;level<=5;level++)assert.equal(g.buyNitro(level),true);
 assert.equal(g.state.nitroLevel,5);assert.equal(g.state.money,0);assert.equal(g.state.brains,0);
 assert.equal(g.state.routeCompletion,null);
 assert.equal(g.enter('bmwreward'),true);assert.equal(g.getDrivingNitro('bmwreward').state.charges,5);
});
test('development still requires money and XP for nitro',()=>{
 for(const patch of [{money:19999,brains:2000},{money:20000,brains:1999}]){
  const g=createGameplay({developerMode:true,career:{...freshCareer(),...patch}});
  assert.equal(g.getNitroOffer().unlocked,true);assert.equal(g.buyNitro(1),false);
  assert.equal(g.state.money,patch.money);assert.equal(g.state.brains,patch.brains);
 }
});
