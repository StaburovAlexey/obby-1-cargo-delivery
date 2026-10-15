

import { routePointAtDistance, projectRoad } from '../../dist/road-layout.js';
import { roadGroundSurface } from '../../dist/driving-ground.js';
import { VEHICLE_DYNAMICS } from '../../dist/driving-model.js';
import { getUpgradeModifiers } from '../../dist/vehicle-upgrades.js';

const smooth = t => { t = Math.max(0,Math.min(1,t)); return t*t*(3-2*t); };
export const graphBranch = branch => branch === 'primary' ? 'main' : branch;
export function createNetworkRouteController({branch='primary',stations=[],target,vehicleId,levels,hazards,direction=1}) {
  let history;
  return {
    get history(){return history;},
    sample(state) {
      history = projectRoad(state.x,state.z,history);
      const lookAhead = 12 + Math.abs(state.speed) * .65;
      const distance = history.distance + direction*lookAhead;
      const next = routePointAtDistance(distance,{branch:graphBranch(branch)});


      let offset = 0;
      for (const station of stations) {
        if (target && station.distance >= target.distance) break;
        const weight = smooth((95-Math.abs(distance-station.distance))/45);
        offset = Math.max(offset,8*weight);
      }
      if(target) offset -= 8*smooth((distance-(target.distance-95))/50);
      const dx = next.x + offset*next.right.x - state.x;
      const dz = next.z + offset*next.right.z - state.z;
      const desiredHeading = Math.atan2(-direction*dx,-direction*dz);
      const error = Math.atan2(Math.sin(desiredHeading-state.heading),Math.cos(desiredHeading-state.heading));
      const desiredWheel = Math.atan(direction*2*3.2*Math.sin(error)/Math.max(1,Math.hypot(dx,dz)));
      const surface = hazards.surfaceAt(state.x,state.z,roadGroundSurface(state.x,state.z,vehicleId,history));
      const grip = Math.sqrt(Math.min(1,surface.frictionFactor*getUpgradeModifiers(levels).grip));
      const reverseGrip=direction<0?Math.min(1,surface.frictionFactor*getUpgradeModifiers(levels).grip):1;
      const response = Math.min(1,Math.abs(desiredWheel)/reverseGrip*(1+(state.linearSpeed/(grip*VEHICLE_DYNAMICS.steeringSpeedScale))**2)/.48);
      const magnitude = (-.55+Math.sqrt(.55*.55+1.8*response))/.9;
      return {active:true,steering:-Math.sign(desiredWheel)*(.08+.92*magnitude),projection:history,offset};
    },
  };
}
