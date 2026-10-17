import {createDriftScore} from '../dist/drift-score.js';
import {projectCanyon,CANYON_TRACK} from '../dist/canyon-track.js';

export function createDriftVerifier(initial,now){
 if(initial?.mode!=='driving'||initial.vehicleId!=='bmwreward'||initial.paused||!Number.isFinite(now))return null;
 const position=initial.position;if(!Array.isArray(position)||position.length!==3)return null;
 const score=createDriftScore();if(!score.start({x:position[0],z:position[2]}))return null;
 let previous=initial,lastTime=now,startedAt=now,closed=false;
 return {
  observe(state,time){
   if(closed||!score.state.valid)return;
   const delta=(time-lastTime)/1000;
   if(state?.mode!=='driving'||state.vehicleId!=='bmwreward'||state.paused){score.invalidate('interrupted');return;}
   if(!Number.isFinite(delta)||delta>1){score.invalidate('network-gap');return;}
   if(delta<.035)return;
   const p=projectCanyon(state.position[0],state.position[2]);if(Math.abs(state.position[1]-p.height)>2.5){score.invalidate('height');return;}
   const dt=Math.max(.05,Math.min(.3,delta)),vx=(state.position[0]-previous.position[0])/dt,vz=(state.position[2]-previous.position[2])/dt;
   score.update(dt,{x:state.position[0],z:state.position[2],heading:state.heading,velocityX:vx,velocityZ:vz,impactSpeed:0});
   previous=state;lastTime=time;
  },
  finish(time){
   if(closed)return null;closed=true;const result=score.result();
   if(!result||!score.state.rankedEligible||time-startedAt<CANYON_TRACK.finish/55*1000||time-lastTime>1500)return null;
   return {...result,verified:true};
  },
  get state(){return score.state;},
 };
}
