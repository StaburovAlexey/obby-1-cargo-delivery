import {CANYON_TRACK,projectCanyon} from './canyon-track.js';
export const DRIFT_RULES=Object.freeze({minSpeed:9,minAngle:12*Math.PI/180,maxAngle:60*Math.PI/180,maxSpeed:55,comboGrace:1.2,pointsPerMeter:10});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function createDriftScore(){
 const state={started:false,valid:true,finished:false,rankedEligible:true,reason:null,score:0,multiplier:1,maxCombo:1,comboDistance:0,elapsed:0,progress:0,maxProgress:0,checkpoints:0,driftDistance:0};
 let previous=null,grace=0,fraction=0;
 const breakCombo=()=>{state.comboDistance=0;state.multiplier=1;grace=0;};
 const invalidate=reason=>{state.valid=false;state.rankedEligible=false;state.reason=reason;breakCombo();return false;};
 return {state,
  start(pose){const p=projectCanyon(pose?.x,pose?.z);if(!p||p.progress>30||p.progress<0||Math.abs(p.offset)>6)return false;Object.assign(state,{started:true,valid:true,finished:false,rankedEligible:true,reason:null,score:0,multiplier:1,maxCombo:1,comboDistance:0,elapsed:0,progress:p.progress,maxProgress:p.progress,checkpoints:0,driftDistance:0});previous={x:pose.x,z:pose.z,progress:p.progress};grace=fraction=0;return true;},
  update(dt,pose,{paused=false}={}){
   if(!state.started||!state.valid||state.finished)return state;
   if(!Number.isFinite(dt)||dt<=0||dt>.3){invalidate('time-gap');return state;}
   if(!pose||!['x','z','heading','velocityX','velocityZ'].every(k=>Number.isFinite(pose[k]))){invalidate('invalid-pose');return state;}
   if(paused){state.rankedEligible=false;state.reason='paused';breakCombo();return state;}
   const p=projectCanyon(pose.x,pose.z,{progress:previous.progress}),step=Math.hypot(pose.x-previous.x,pose.z-previous.z);
   if(step>DRIFT_RULES.maxSpeed*dt+.6||Math.abs(p.progress-previous.progress)>DRIFT_RULES.maxSpeed*dt+1){invalidate('teleport');return state;}
   state.elapsed+=dt;if(state.elapsed>600){invalidate('timeout');return state;}
   const forward=-Math.sin(pose.heading)*pose.velocityX-Math.cos(pose.heading)*pose.velocityZ,lateral=Math.cos(pose.heading)*pose.velocityX-Math.sin(pose.heading)*pose.velocityZ;
   const speed=Math.hypot(pose.velocityX,pose.velocityZ),angle=Math.abs(Math.atan2(lateral,forward));
   const delta=p.progress-previous.progress,newDistance=Math.max(0,p.progress-state.maxProgress);
   const bad=Math.abs(p.offset)>CANYON_TRACK.halfWidth-.1||forward<=0||angle>DRIFT_RULES.maxAngle||(pose.impactSpeed||0)>1.2||pose.blocked||delta<-.05;
   const drifting=!bad&&speed>=DRIFT_RULES.minSpeed&&angle>=DRIFT_RULES.minAngle&&newDistance>0&&delta>0;
   if(bad)breakCombo();
   else if(drifting){
    grace=0;state.comboDistance+=newDistance;state.multiplier=Math.min(5,1+Math.floor(state.comboDistance/80));state.maxCombo=Math.max(state.maxCombo,state.multiplier);state.driftDistance+=newDistance;
    const angleQuality=clamp(angle/(35*Math.PI/180),.35,1.25),speedQuality=clamp(speed/22,.5,1.3);
    fraction+=newDistance*DRIFT_RULES.pointsPerMeter*angleQuality*speedQuality*state.multiplier;const points=Math.floor(fraction);state.score+=points;fraction-=points;
   }else{grace+=dt;if(grace>DRIFT_RULES.comboGrace)breakCombo();}
   while(state.checkpoints<CANYON_TRACK.checkpoints.length&&p.progress>=CANYON_TRACK.checkpoints[state.checkpoints])state.checkpoints++;
   state.progress=p.progress;state.maxProgress=Math.max(state.maxProgress,p.progress);previous={x:pose.x,z:pose.z,progress:p.progress};
   if(p.progress>=CANYON_TRACK.finish&&state.checkpoints===CANYON_TRACK.checkpoints.length&&state.elapsed>=CANYON_TRACK.finish/DRIFT_RULES.maxSpeed)state.finished=true;
   return state;
  },
  disqualify(reason='interrupted'){state.rankedEligible=false;state.reason=reason;breakCombo();},
  invalidate,
  result(){return state.finished&&state.valid?{version:1,trackId:CANYON_TRACK.id,score:state.score,durationMs:Math.round(state.elapsed*1000),maxCombo:state.maxCombo,verified:false}:null;},
 };
}
