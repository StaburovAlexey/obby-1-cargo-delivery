import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {crossesFinishLine,createFinishCelebration} from '../dist/finish-celebration.js';
import {FINISH_LINE_SPEC as LINE} from '../dist/finish-line.js';
import {createGameplay,GAMEPLAY} from '../dist/gameplay.js';
import {FUEL_STATION_SPECS,DELIVERY_SPECS} from '../dist/garage-scene.js';
import {VEHICLE_CONFIG,FINAL_DELIVERY_CHECKPOINT as FINAL} from '../dist/economy-config.js';
import {freshCareer,sanitizeCareer} from '../dist/career-save.js';
import {createCareerRouteTracker} from '../dist/career-route-tracker.js';
import {rewardRoutePose} from './fixtures/reward-career.mjs';
const at=(delta,offset=0)=>{const p=rewardRoutePose(LINE.progress+delta);return {...p,x:p.x+p.right.x*offset,z:p.z+p.right.z*offset};};
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS',name);};
check('forward physical crossing only, bounded segment and road width',()=>{
 assert(crossesFinishLine(at(-1),at(1)));assert(!crossesFinishLine(at(1),at(-1)));assert(!crossesFinishLine(null,at(1)));
 assert(!crossesFinishLine(at(-1),at(-.1)));assert(!crossesFinishLine(at(0),at(1)));assert(!crossesFinishLine(at(-100),at(1)));assert(!crossesFinishLine(at(-1,30),at(1,30)));
});
check('only final fuel and delivery removed; all earlier stops retained',()=>{
 assert.equal(FUEL_STATION_SPECS.length,15);assert.equal(DELIVERY_SPECS.length,15);
 assert(!FUEL_STATION_SPECS.some(s=>s.checkpointId===FINAL.id));assert(!DELIVERY_SPECS.some(s=>s.checkpointId===FINAL.id));
 assert.equal(DELIVERY_SPECS.at(-1).checkpointId,'checkpoint-15');
});
const vehicles=VEHICLE_CONFIG.map((v,i)=>({id:v.id,park:{x:24,z:44+11*i}}));
const make=(options={})=>{const g=createGameplay({vehicles,career:{...freshCareer(),ownedVehicleIds:['pickup','ashhauler']},...options});assert(g.enter('ashhauler'));g.events();return g;};
const crossing=g=>{for(const delta of [-1,1]){const p=at(delta);g.drive(0,p.x,p.z);}return g.events();};
const track=g=>{const t=createCareerRouteTracker();for(let q=-6;q<LINE.progress;q+=2){const p=rewardRoutePose(q);t.update(g,p,.05);g.drive(0,p.x,p.z);assert(g.state.run?.loaded);}const p=at(1);t.update(g,p,.05);return p;};
let saved;
check('continuous route pays and unlocks once at line, persists proof before celebration, normal hangar after 2s',()=>{
 let writes=0;const g=make({persistence:{save(value){writes++;saved=value;g.drive(0,at(1).x,at(1).z);return true;}}});
 const p=track(g);g.drive(0,p.x,p.z);const events=g.events();assert.equal(events.filter(e=>e.type==='finish').length,1);assert.equal(events.filter(e=>e.type==='finish-reward').length,1);assert.equal(events.filter(e=>e.type==='vehicle-unlocked').length,1);
 assert.equal(g.state.eventMode,'finish');assert.equal(g.state.mode,'driving');assert.equal(g.state.completedRuns,1);assert(g.state.money>=FINAL.reward);assert(g.isOwned('bmwreward'));assert.equal(writes,1);assert.deepEqual(sanitizeCareer(saved),saved);
 const money=g.state.money;for(let i=0;i<10;i++)crossing(g);assert.equal(g.state.money,money);assert.equal(writes,1);
 for(let i=0;i<39;i++)g.advanceFinish(.05);assert.equal(g.state.mode,'driving');g.advanceFinish(.05);assert.equal(g.state.mode,'walking');assert.deepEqual(g.state.player,GAMEPLAY.spawn);assert.equal(g.state.selectedId,null);assert.equal(g.state.eventMode,null);assert.equal(g.state.run,null);assert.equal(g.state.completedRuns,1);assert.equal(g.events().filter(e=>e.type==='garage').length,1);g.advanceFinish(.05);assert.equal(g.events().length,0);
});
check('later legitimate run pays once without repeating BMW unlock, legacy proof remains valid',()=>{
 const legacy={...saved,routeCompletion:{...saved.routeCompletion,endProgress:FINAL.progress,sampleCount:Math.ceil(FINAL.progress/2)+20}};assert(sanitizeCareer(legacy).routeCompletion);
 const g=make({career:saved}),p=track(g);g.drive(0,p.x,p.z);const events=g.events();assert.equal(events.filter(e=>e.type==='finish-reward').length,1);assert(!events.some(e=>e.type==='vehicle-unlocked'));assert.equal(g.state.completedRuns,saved.completedRuns+1);assert.equal(g.state.ownedVehicleIds.filter(id=>id==='bmwreward').length,1);
});
check('dev, preview, teleport, missing cargo, backwards crossing, empty tank cannot earn final reward',()=>{
 for(const kind of ['dev','preview','teleport','missing','reverse','empty']){
 const g=make({developerMode:kind==='dev'});if(kind==='preview')g.beginBiomeTest('volcanic');if(kind==='missing')g.state.run.loaded=false;if(kind==='empty')g.state.fuels.ashhauler=0;
 if(kind==='teleport'){const t=createCareerRouteTracker();t.update(g,GAMEPLAY.roadSpawn,.05);t.update(g,at(-1),.05);}
 let events;if(kind==='reverse'){for(const d of [1,-1]){const p=at(d);g.drive(0,p.x,p.z);}events=g.events();assert.notEqual(g.state.eventMode,'finish');}else events=crossing(g);
 assert(!events.some(e=>e.type==='finish-reward'||e.type==='vehicle-unlocked'),kind);assert.equal(g.state.money,0,kind);assert.equal(g.state.routeCompletion,null,kind);
 }
});
check('crossing consumes final segment fuel before reward and a new run resets crossing state',()=>{
 const g=make(),p=track(g);g.state.fuels.ashhauler=.001;g.drive(2,p.x,p.z);assert.equal(g.state.mode,'walking');assert.equal(g.state.money,0);assert.equal(g.state.routeCompletion,null);
 const dev=make({developerMode:true});crossing(dev);for(let i=0;i<40;i++)dev.advanceFinish(.05);dev.state.cooldown=0;assert(dev.enter('ashhauler'));dev.events();const after=at(1);dev.drive(0,after.x,after.z);assert.equal(dev.state.eventMode,null);assert.equal(crossing(dev).filter(e=>e.type==='finish').length,1);
});
check('removed final trigger cannot pay/refuel even if stale specs are supplied',()=>{
 const p=rewardRoutePose(FINAL.progress),g=make({stations:[{...p,id:`fuel-${FINAL.id}`,radius:20}],deliveries:[{...FINAL,...p,id:`delivery-${FINAL.id}`,radius:20}]});g.state.fuels.ashhauler=10;g.drive(0,p.x,p.z);assert.equal(g.state.fuels.ashhauler,10);assert.equal(g.state.money,0);assert.equal(g.state.eventMode,null);
});
check('confetti bounded, pause-safe, clearable/reusable with idempotent GPU resource disposal',()=>{
 const f=createFinishCelebration(THREE);assert(!f.active);f.start({x:10,y:3,z:20});assert(f.active);assert.equal(f.group.children[0].count,160);f.update(.05,{paused:true});assert.equal(f.elapsed,0);f.update(.05);assert.equal(f.elapsed,.05);assert([...f.group.children[0].instanceMatrix.array].every(Number.isFinite));f.clear();assert(!f.active);f.start({x:0,z:0});assert.equal(f.elapsed,0);let n=0;const mesh=f.group.children[0];mesh.geometry.addEventListener('dispose',()=>n++);mesh.material.addEventListener('dispose',()=>n++);mesh.addEventListener('dispose',()=>n++);f.dispose();f.dispose();assert.equal(n,3);assert.equal(f.group.children.length,0);assert(!f.active);
});
console.log(`${checks} finish sequence checks passed (CPU).`);
