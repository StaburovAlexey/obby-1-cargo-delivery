import {BRIDGES} from './road-bridges.js';
import {FORK_DEFINITIONS} from './route-network-config.js';
import {projectRoad,routePointAtProgress} from './route-network.js';
// Ridge arms have higher ascent and peak grades at every fork. See the CPU audit.
export const HARD_BRANCHES=Object.freeze(Object.fromEntries(FORK_DEFINITIONS.map(f=>[f.id,'main'])));
export function createCareerRouteTracker(){
 let runId=null,previous=null,invalid=false,active=new Map(),done=new Set();
 const reset=()=>{runId=null;previous=null;invalid=false;active.clear();done.clear();};
 return {reset,update(game,pose,dt){
  const run=game?.state.run;
  if(!run?.loaded||game.state.testMode||game.state.mode!=='driving'){reset();return;}
  if(run.id!==runId){reset();runId=run.id;}
  if(!Number.isFinite(pose?.x)||!Number.isFinite(pose?.z)||!Number.isFinite(dt)||dt<=0||dt>.1)return;
  if(game.recordRouteSample&&!game.recordRouteSample({runId,x:pose.x,z:pose.z,dt})){reset();return;}
  const p=projectRoad(pose.x,pose.z,pose.routeContext),point={...p,x:pose.x,z:pose.z};
  if(!previous){previous=point;return;}
  const step=Math.hypot(pose.x-previous.x,pose.z-previous.z);
  if(step>80*dt+.5){invalid=true;active.clear();game.recordRunCollision({runId});game.invalidateRun({runId});}
  if(invalid){previous=point;return;}
  for(const b of BRIDGES){
   if(done.has(b.id))continue;
   if(!active.has(b.id)&&previous.progress<=b.from-3&&p.progress>b.from-3)active.set(b.id,{valid:true});
   const a=active.get(b.id);if(!a)continue;
   if(p.progress<b.from-4)a.valid=false;
   if(p.progress>=b.from&&p.progress<=b.to&&Math.abs(p.offset-b.offset)>b.halfWidth-1.535+.03)a.valid=false;
   if(p.progress>=b.to+3){if(a.valid)game.recordBridgeCrossing({runId,bridgeId:b.id});done.add(b.id);active.delete(b.id);}
  }
  for(const f of FORK_DEFINITIONS){
   if(done.has(f.id))continue;
   if(!active.has(f.id)&&previous.progress<=f.from&&p.progress>f.from)active.set(f.id,{valid:true,interior:false});
   const a=active.get(f.id);if(!a)continue;
   if(p.progress<f.from-3)a.valid=false;
   if(p.progress>f.from&&p.progress<f.to){
    const main=routePointAtProgress(p.progress,{branch:'main'}),alt=routePointAtProgress(p.progress,{branch:'alternate'});
    const separated=Math.hypot(main.x-alt.x,main.z-alt.z)>32;
    if(separated){a.interior=true;if(p.branch!==HARD_BRANCHES[f.id]||Math.abs(p.offset)>14.5)a.valid=false;}
   }
   if(p.progress>=f.to){if(a.valid&&a.interior)game.recordHardBranch({runId,forkId:f.id,branch:HARD_BRANCHES[f.id]});done.add(f.id);active.delete(f.id);}
  }
  previous=point;
 }};
}
