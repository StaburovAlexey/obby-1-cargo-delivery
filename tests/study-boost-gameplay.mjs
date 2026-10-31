import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {CLASSROOM_DESKS} from '../dist/garage-scene.js';
import {SCHOOL_CONFIG} from '../dist/progression-config.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('actual study earnings double for exactly a minute and pause outside study',()=>{
 const g=createGameplay({desks:CLASSROOM_DESKS}),rate=SCHOOL_CONFIG[0].rate;
 g.state.seatedId=CLASSROOM_DESKS[0].id;g.state.seatedSchoolId='school-1';
 near(g.tickProgress(.1,{active:true}),rate*.1);assert.equal(g.activateStudyBoost(),true);
 near(g.tickProgress(.1,{active:true}),rate*.2);near(g.studyBoostRemaining,59.9);
 g.tickProgress(.1,{active:false});g.tickProgress(1,{active:true});near(g.studyBoostRemaining,59.9);
 g.state.seatedId=null;g.tickProgress(.1,{active:true});near(g.studyBoostRemaining,59.9);
 g.state.seatedId=CLASSROOM_DESKS[0].id;
 for(let i=0;i<599;i++)g.tickProgress(.1,{active:true});
 assert.equal(g.studyBoostRemaining,0);near(g.state.brains,rate*120+rate*.1);
 near(g.tickProgress(.1,{active:true}),rate*.1);
});
test('earned XP persists but temporary reward cannot be renewed by reloading',()=>{
 let saved;const g=createGameplay({desks:CLASSROOM_DESKS,persistence:{save:v=>(saved=v,true)}});
 g.state.seatedId=CLASSROOM_DESKS[0].id;g.state.seatedSchoolId='school-1';g.activateStudyBoost();g.tickProgress(.1,{active:true});g.flushProgress();
 const reloaded=createGameplay({career:saved,desks:CLASSROOM_DESKS});near(reloaded.state.brains,g.state.brains);assert.equal(reloaded.studyBoostRemaining,0);
});
