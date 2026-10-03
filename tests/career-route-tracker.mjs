import assert from 'node:assert/strict';
import {createCareerRouteTracker,HARD_BRANCHES} from '../dist/career-route-tracker.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {FORK_DEFINITIONS} from '../dist/route-network-config.js';
import {routePointAtProgress} from '../dist/route-network.js';
function fixture(){const hits={bridge:[],hard:[],collision:0},state={mode:'driving',testMode:false,run:{id:'run1',loaded:true}};return {state,hits,recordBridgeCrossing:x=>hits.bridge.push(x),recordHardBranch:x=>hits.hard.push(x),recordRunCollision:()=>hits.collision++,invalidateRun:()=>{state.run=null;}};}
function sweep(t,g,a,b,{branch='main',offset=0}={}){for(let q=a;q<=b;q+=.5){const p=routePointAtProgress(q,{branch});t.update(g,{x:p.x+p.right.x*offset,z:p.z+p.right.z*offset,routeContext:p},.05);}}
for(const b of BRIDGES){const t=createCareerRouteTracker(),g=fixture();sweep(t,g,b.from-5,b.to+5,{offset:b.offset});assert.equal(g.hits.bridge.length,1,b.id);sweep(t,g,b.from-5,b.to+5,{offset:b.offset});assert.equal(g.hits.bridge.length,1,'no repeated loop payout');}
for(const f of FORK_DEFINITIONS){for(const branch of ['main','alternate']){const t=createCareerRouteTracker(),g=fixture();sweep(t,g,f.from-2,f.to+2,{branch});assert.equal(g.hits.hard.length,branch==='main'?1:0,f.id+'/'+branch);}const t=createCareerRouteTracker(),g=fixture();sweep(t,g,(f.from+f.to)/2,f.to+2);assert.equal(g.hits.hard.length,0,'partial traversal rejected');}
{const b=BRIDGES[0],t=createCareerRouteTracker(),g=fixture();sweep(t,g,b.from-5,b.from-4);sweep(t,g,b.to+4,b.to+5);assert.equal(g.hits.bridge.length,0);assert.equal(g.hits.collision,1,'teleport invalidates run telemetry');g.state.run={id:'run2',loaded:true};sweep(t,g,b.from-5,b.to+5,{offset:b.offset});assert.equal(g.hits.bridge.length,1,'new run resets invalid state');}
{const b=BRIDGES[0],t=createCareerRouteTracker(),g=fixture();g.state.testMode=true;sweep(t,g,b.from-5,b.to+5,{offset:b.offset});assert.equal(g.hits.bridge.length,0);g.state.testMode=false;g.state.run=null;sweep(t,g,b.from-5,b.to+5);assert.equal(g.hits.bridge.length,0);}
assert.equal(Object.keys(HARD_BRANCHES).length,4);
console.log(`PASS actual route telemetry: ${BRIDGES.length} bridges, both branches of all forks, partial/jump/repeat/test/no-cargo/new-run guards.`);
