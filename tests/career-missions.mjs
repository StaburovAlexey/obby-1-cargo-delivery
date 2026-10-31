import test from 'node:test';
import assert from 'node:assert/strict';
import {CAREER_MISSIONS} from '../dist/career-missions.js';
import {freshMissions,sanitizeMissions,getCareerMissions} from '../dist/mission-progress.js';
import {freshCareer,sanitizeCareer,createCareerStore} from '../dist/career-save.js';
import {createGameplay} from '../dist/gameplay.js';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import {nitroCareer} from './fixtures/nitro-career.mjs';
import {CLASSROOM_DESKS} from '../dist/garage-scene.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';

test('35 постоянных заданий имеют согласованные награды и тексты без моделей',()=>{
 assert.equal(CAREER_MISSIONS.length,35);
 assert.equal(new Set(CAREER_MISSIONS.map(m=>m.id)).size,35);
 assert.equal(CAREER_MISSIONS.reduce((n,m)=>n+m.cash,0),50300);
 assert.equal(CAREER_MISSIONS.reduce((n,m)=>n+m.brains,0),17050);
 assert.equal(CAREER_MISSIONS.slice(0,21).reduce((n,m)=>n+m.cash,0),15300);
 for(const mission of CAREER_MISSIONS){
  assert.equal(Object.isFrozen(mission),true);
  assert.doesNotMatch(mission.name+' '+mission.description,/BMW|Cadillac|Koenigsegg|Phoenix|пикап|E30|Interceptor/i);
 }
});

test('новый блок не сбрасывает существующую карьеру и не переносит старые циклы',()=>{
 const previous={...earnedRewardCareer(),money:12345,brains:6789};delete previous.missions;
 previous.retention.missionSequence=100;previous.retention.missionProgress=2;
 const saved=sanitizeCareer(previous);
 assert.equal(saved.money,12345);assert.equal(saved.brains,6789);
 assert.deepEqual(saved.routeCompletion,previous.routeCompletion);
 assert.deepEqual(saved.missions,freshMissions());
 assert.equal(getCareerMissions(saved).find(m=>m.id==='full-route').status,'ready');
 assert.equal(getCareerMissions(saved).find(m=>m.id==='clean-deliveries-1').progress,0);
 assert.deepEqual(sanitizeCareer(saved),saved);
});

test('финальная доставка засчитывает вулканический биом и готовит обе награды',()=>{
 const career=earnedRewardCareer();
 assert.equal(career.completedRuns,1);assert.equal(career.missions.stats.cleanDeliveries,1);
 assert.ok(career.missions.stats.deliveredBiomeIds.includes('volcanic'));
 const missions=getCareerMissions(career);
 assert.equal(missions.find(m=>m.id==='delivery-volcanic').status,'ready');
 assert.equal(missions.find(m=>m.id==='full-route').status,'ready');
 assert.deepEqual(career.missions.claimedIds,[]);
});

test('все условия считаются параллельно, готовые сверху, полученные в порядке получения',()=>{
 const career=freshCareer();career.completedRuns=10;
 career.missions.claimedIds=['deliveries-3','first-delivery'];
 const views=getCareerMissions(career);
 assert.deepEqual(views.filter(m=>m.status==='ready').map(m=>m.id),['deliveries-10']);
 assert.deepEqual(views.slice(-2).map(m=>m.id),['deliveries-3','first-delivery']);
 assert.equal(views.find(m=>m.id==='deliveries-50').progress,10);
});

test('очистка сохраняет порядок получения и не исполняет геттеры',()=>{
 const value=freshMissions();value.claimedIds=['deliveries-3','unknown','first-delivery','deliveries-3'];
 value.stats.cleanDeliveries=-1;value.stats.nitroUses=Infinity;
 assert.deepEqual(sanitizeMissions(value).claimedIds,['deliveries-3','first-delivery']);
 assert.equal(sanitizeMissions(value).stats.cleanDeliveries,0);
 assert.equal(sanitizeMissions(value).stats.nitroUses,0);
 const malicious={version:1};Object.defineProperty(malicious,'stats',{get(){throw new Error('getter');}});
 assert.deepEqual(sanitizeMissions(malicious),freshMissions());
});

test('награда и ID сохраняются вместе и повторный клик не начисляет валюту',()=>{
 let raw,writes=0;const persistence=createCareerStore({storage:{getItem:()=>raw??null,setItem:(key,value)=>{raw=value;writes++;}}});
 const game=createGameplay({career:{...freshCareer(),completedRuns:1},persistence});
 assert.equal(game.claimCareerMission('first-delivery'),true);
 assert.equal(writes,1);assert.equal(game.state.money,100);assert.equal(game.state.brains,50);
 const saved=JSON.parse(raw);assert.deepEqual(saved.missions.claimedIds,['first-delivery']);
 assert.equal(saved.money,100);assert.equal(saved.brains,50);
 assert.equal(game.claimCareerMission('first-delivery'),false);assert.equal(writes,1);
 const reload=createGameplay({persistence});assert.equal(reload.claimCareerMission('first-delivery'),false);
 assert.equal(reload.claimCareerMission('deliveries-50'),false);
});

test('сбой записи повторяет готовый снимок без повторной выдачи',()=>{
 let fail=true,raw;const persistence=createCareerStore({storage:{getItem:()=>raw??null,setItem:(key,value)=>{if(fail)throw new Error('offline');raw=value;}}});
 const game=createGameplay({career:{...freshCareer(),completedRuns:1},persistence});
 assert.equal(game.claimCareerMission('first-delivery'),true);assert.equal(game.state.saveFailed,true);
 assert.equal(game.claimCareerMission('first-delivery'),false);fail=false;
 assert.equal(game.flushProgress(),true);assert.equal(JSON.parse(raw).money,100);
 assert.deepEqual(JSON.parse(raw).missions.claimedIds,['first-delivery']);
});

test('все зачётные финиши считаются без повторения одной попытки и без смены рекорда',()=>{
 const game=createGameplay({career:earnedRewardCareer()});
 const result={version:1,trackId:'canyon-v1',score:10000,durationMs:130000,maxCombo:4};
 assert.equal(game.recordCanyonFinish(result,'attempt-1'),true);
 assert.equal(game.recordCanyonFinish(result,'attempt-1'),false);
 assert.equal(game.recordCanyonFinish({...result,score:5000},'attempt-2'),true);
 assert.equal(game.state.missions.stats.canyonFinishes,2);
 assert.equal(game.state.driftRecord.score,10000);
 assert.equal(game.recordCanyonFinish({...result,durationMs:1},'attempt-3'),false);
});

test('тренировочный рекорд не открывает задания, а зачётный счёт сохраняется отдельно',()=>{
 const game=createGameplay({career:earnedRewardCareer()});
 const result={version:1,trackId:'canyon-v1',score:45000,durationMs:130000,maxCombo:4};
 assert.equal(game.recordDriftResult(result),true);
 assert.equal(game.getCareerMissions().find(m=>m.id==='canyon-score-45000').status,'progress');
 assert.equal(game.recordCanyonFinish({...result,score:10000},'eligible'),true);
 assert.equal(game.state.driftRecord.score,45000);assert.equal(game.state.missions.stats.canyonBestScore,10000);
 assert.equal(game.getCareerMissions().find(m=>m.id==='canyon-score-10000').status,'ready');
 assert.equal(game.getCareerMissions().find(m=>m.id==='canyon-score-45000').status,'progress');
 const reload=createGameplay({career:game.snapshot()});
 assert.equal(reload.state.missions.stats.canyonBestScore,10000);
 const legacy={...earnedRewardCareer(),driftRecord:result};delete legacy.missions;
 assert.equal(sanitizeCareer(legacy).missions.stats.canyonBestScore,45000);
});

test('режим разработчика не меняет задания и не выдаёт награды',()=>{
 const career={...freshCareer(),completedRuns:10};const game=createGameplay({career,developerMode:true});
 const before=game.snapshot();assert.equal(game.claimCareerMission('first-delivery'),false);
 assert.equal(game.recordCanyonFinish({version:1,trackId:'canyon-v1',score:10000,durationMs:130000,maxCombo:4},'dev'),false);
 assert.deepEqual(game.snapshot(),before);
});

test('время учёбы не ускоряется усилителем и не идёт на паузе или в тестовом режиме',()=>{
 const game=createGameplay({desks:CLASSROOM_DESKS});
 game.state.seatedId=CLASSROOM_DESKS[0].id;game.state.seatedSchoolId='school-1';
 game.activateStudyBoost();game.tickProgress(.1,{active:true});
 assert.equal(game.state.missions.stats.studySeconds,.1);
 game.tickProgress(.1,{active:false});game.tickProgress(1,{active:true});
 assert.equal(game.state.missions.stats.studySeconds,.1);
 game.state.testMode=true;game.tickProgress(.1,{active:true});
 assert.equal(game.state.missions.stats.studySeconds,.1);
 const dev=createGameplay({desks:CLASSROOM_DESKS,developerMode:true});
 dev.state.seatedId=CLASSROOM_DESKS[0].id;dev.state.seatedSchoolId='school-1';dev.tickProgress(.1,{active:true});
 assert.equal(dev.state.missions.stats.studySeconds,0);
});

test('нитро учитывает только успешный расход заряда',()=>{
 const vehicles=VEHICLE_CONFIG.map((vehicle,index)=>({id:vehicle.id,park:{x:24,z:44+11*index}}));
 const game=createGameplay({career:{...nitroCareer(),nitroLevel:1},vehicles});
 game.state.mode='driving';game.state.selectedId='bmwreward';game.nitro.start(1);
 const pose={gear:'D',grounded:true,upY:1,heading:0,velocityX:0,velocityZ:-10,brake:false,handbrake:false,speedDemand:0};
 assert.equal(game.activateNitro(pose),true);assert.equal(game.state.missions.stats.nitroUses,1);
 assert.equal(game.activateNitro(pose),false);assert.equal(game.state.missions.stats.nitroUses,1);
 game.nitro.cancel();game.nitro.start(1);game.state.testMode=true;
 assert.equal(game.activateNitro(pose),true);assert.equal(game.state.missions.stats.nitroUses,1);
});
