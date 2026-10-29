import {CANYON_TRACK,canyonPointAt,projectCanyon} from './canyon-track.js';
import {crossesFinishLine} from './finish-celebration.js';

export const CANYON_TIMED_SECTIONS=Object.freeze([
  [245,17],[635,22],[1035,23],[1440,23],[1850,19],
  [2300,20],[2760,24],[3220,24],[CANYON_TRACK.finish,21],
].map(([progress,seconds])=>Object.freeze({progress,seconds})));

const gates=CANYON_TIMED_SECTIONS.map(({progress})=>({...canyonPointAt(progress),lineWidth:CANYON_TRACK.halfWidth*2}));
const sample=pose=>{
  const road=projectCanyon(pose?.x,pose?.z);
  return {x:pose?.x,z:pose?.z,progress:road?.progress??0,
    onRoad:!!road&&Math.abs(road.offset)<=CANYON_TRACK.halfWidth&&pose.grounded!==false&&pose.airborne!==true&&
      (!Number.isFinite(pose.upY)||pose.upY>=.5)&&(!Number.isFinite(pose.y)||Math.abs(pose.y-road.height)<3)};
};
function crossingFraction(previous,current,gate){
  if(!previous?.onRoad||!current.onRoad||!crossesFinishLine(previous,current,gate))return null;
  const fx=-Math.sin(gate.heading),fz=-Math.cos(gate.heading);
  const before=(previous.x-gate.x)*fx+(previous.z-gate.z)*fz;
  const after=(current.x-gate.x)*fx+(current.z-gate.z)*fz;
  return Math.max(0,Math.min(1,-before/(after-before)));
}

export function createCanyonCheckpointRun(){
  const state={active:false,finished:false,failed:false,index:0,total:CANYON_TIMED_SECTIONS.length,remaining:0,distance:0};
  let previous=null;
  const updateDistance=current=>{state.distance=state.finished?0:Math.abs(CANYON_TIMED_SECTIONS[state.index].progress-current.progress);};
  const fail=()=>{state.remaining=0;state.active=false;state.failed=true;};
  return {state,
    start(pose){
      previous=sample(pose);
      Object.assign(state,{active:true,finished:false,failed:false,index:0,remaining:CANYON_TIMED_SECTIONS[0].seconds});
      updateDistance(previous);return state;
    },
    update(dt,pose){
      if(!state.active)return state;
      const current=sample(pose),delta=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
      const fraction=delta>0?crossingFraction(previous,current,gates[state.index]):null;
      previous=current;updateDistance(current);
      if(fraction!==null&&delta*fraction<=state.remaining+1e-8){
        if(state.index===CANYON_TIMED_SECTIONS.length-1){state.active=false;state.finished=true;state.remaining=Math.max(0,state.remaining-delta*fraction);state.distance=0;return state;}
        state.index++;
        // Unused old time is discarded. Charge only the part of this frame
        // spent after crossing to the newly started section.
        state.remaining=CANYON_TIMED_SECTIONS[state.index].seconds-delta*(1-fraction);
        updateDistance(current);
      }else{
        state.remaining=Math.max(0,state.remaining-delta);
        if(state.remaining<=1e-8)fail();
      }
      return state;
    },
    reset(){previous=null;Object.assign(state,{active:false,finished:false,failed:false,index:0,remaining:0,distance:0});},
  };
}
