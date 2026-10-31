import {DRIFT_RULES,baseDriftPoints} from './drift-score.js';
export const NITRO_PRICE=Object.freeze({money:20000,brains:2000});
export const NITRO_LEVELS=Object.freeze([2000,1667,1333,1000,667].map((points,i)=>Object.freeze({charges:i+1,points})));
export const sanitizeNitroLevel=value=>Number.isFinite(value)?Math.max(0,Math.min(5,Math.floor(value))):0;
export function nitroDriftPoints(dt,pose,{distance=0,onRoad=false}={}){
 if(!(dt>0&&dt<=.1)||!onRoad||!pose.grounded||pose.airborne||pose.upY<.5||pose.blocked||pose.impactSpeed>1.2||pose.gear==='R')return 0;
 const {heading,velocityX,velocityZ}=pose;
 if(![heading,velocityX,velocityZ,distance].every(Number.isFinite)||distance<=0||distance>DRIFT_RULES.maxSpeed*dt+.05)return 0;
 const forward=-Math.sin(heading)*velocityX-Math.cos(heading)*velocityZ;
 const lateral=Math.cos(heading)*velocityX-Math.sin(heading)*velocityZ;
 const speed=Math.hypot(velocityX,velocityZ),angle=Math.abs(Math.atan2(lateral,forward));
 if(forward<=0||speed<DRIFT_RULES.minSpeed||angle<DRIFT_RULES.minAngle||angle>DRIFT_RULES.maxAngle)return 0;
 return baseDriftPoints(distance,angle,speed);
}
export const isNitroInterrupted=pose=>pose.brake>0||pose.handbrake>0||pose.gear==='R'||pose.speedDemand<0;
export function createNitro(){
 const state={level:0,charges:0,progress:0,remaining:0};
 const api={state,
  start(level){state.level=sanitizeNitroLevel(level);state.charges=state.level;state.progress=state.remaining=0;},
  setLevel(level){state.level=sanitizeNitroLevel(level);state.charges=Math.min(state.charges,state.level);if(!state.level)state.progress=state.remaining=0;},
  cancel(){state.remaining=0;},
  canActivate(pose){return state.charges>0&&state.remaining===0&&!!pose&&pose.gear==='D'&&pose.grounded&&pose.upY>.5&&!isNitroInterrupted(pose)&&(-Math.sin(pose.heading)*pose.velocityX-Math.cos(pose.heading)*pose.velocityZ)>.1;},
  activate(pose){if(!api.canActivate(pose))return false;state.charges--;state.remaining=2;return true;},
  addPoints(points){if(!state.level||state.remaining>0||state.charges>=state.level||!Number.isFinite(points)||points<=0)return;
   const total=state.progress+points/NITRO_LEVELS[state.level-1].points,whole=Math.floor(total+1e-10);
   state.charges=Math.min(state.level,state.charges+whole);state.progress=state.charges===state.level?0:Math.max(0,total-whole);
  },
  step(dt,pose,road){if(!(dt>0&&dt<=.1))return;
   if(state.remaining>0){if(isNitroInterrupted(pose)){api.cancel();return;}state.remaining=Math.max(0,state.remaining-dt);if(state.remaining<1e-8)state.remaining=0;return;}
   api.addPoints(nitroDriftPoints(dt,pose,road));
  },
 };
 return api;
}
