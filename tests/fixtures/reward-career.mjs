import {FINISH_LINE_SPEC} from '../../dist/finish-line.js';


import {createGameplay} from '../../dist/gameplay.js';
import {freshCareer} from '../../dist/career-save.js';
import {createCareerRouteTracker} from '../../dist/career-route-tracker.js';
import {VEHICLE_CONFIG,FINAL_DELIVERY_CHECKPOINT,ECONOMY_CONFIG} from '../../dist/economy-config.js';
import {routePointAtProgress} from '../../dist/route-network.js';
import {BRIDGES} from '../../dist/road-bridges.js';

export function rewardRoutePose(q,{branch='main',bridgeEdgeOffset=0}={}) {
  const p=routePointAtProgress(q,{branch});let offset=0;
  for(const bridge of BRIDGES)if(q>=bridge.from-45&&q<=bridge.to+45){
    const blend=q<bridge.from?(q-bridge.from+45)/45:q>bridge.to?(bridge.to+45-q)/45:1;
    offset=(bridge.offset+bridgeEdgeOffset)*Math.max(0,Math.min(1,blend));break;
  }
  if(q>FINAL_DELIVERY_CHECKPOINT.progress-50)offset=8*Math.min(1,(q-FINAL_DELIVERY_CHECKPOINT.progress+50)/50);
  return {...p,x:p.x+p.right.x*offset,z:p.z+p.right.z*offset,routeContext:p};
}
export function completeRewardRoute(game,{branch='main',tracker=createCareerRouteTracker(),bridgeEdgeOffset=0}={}) {
  const end=FINISH_LINE_SPEC.progress;
  for(let q=-6;q<=end;q+=2){
    tracker.update(game,rewardRoutePose(q,{branch,bridgeEdgeOffset}),.05);
    if(q<end)game.drive(0,rewardRoutePose(q,{branch,bridgeEdgeOffset}).x,rewardRoutePose(q,{branch,bridgeEdgeOffset}).z);
    if(!game.state.run?.loaded)throw Error(`Reward fixture lost cargo at ${q}`);
  }
  const final=rewardRoutePose(end,{branch});
  tracker.update(game,final,.05);game.drive(0,final.x,final.z);
  const events=game.events();
  if(!events.some(event=>event.type==='finish-reward'&&event.routeCompleted))throw Error('Reward fixture did not finish the route');
  for(let i=0;i<40;i++)game.advanceFinish(.05);
  game.events();return events;
}
export function earnedRewardCareer({career,branch='main'}={}) {
  const final=rewardRoutePose(FINAL_DELIVERY_CHECKPOINT.progress);
  const initial=career||freshCareer();
  const game=createGameplay({career:{...initial,ownedVehicleIds:[...new Set([...initial.ownedVehicleIds,'ashhauler'])]},
    vehicles:VEHICLE_CONFIG.map((v,i)=>({id:v.id,park:{x:24,z:44+11*i}})),
    deliveries:[{...FINAL_DELIVERY_CHECKPOINT,x:final.x,z:final.z,radius:ECONOMY_CONFIG.checkpointRadius}],
  });
  if(!game.enter('ashhauler'))throw Error('Reward fixture could not start');
  completeRewardRoute(game,{branch});return game.snapshot();
}
