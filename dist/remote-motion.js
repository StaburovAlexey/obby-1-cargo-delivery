const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));

export function createRemoteMotion({delayMs=200,farDelayMs=550}={}){
  const histories=new Map();
  return {
    receive(players,time){
      const present=new Set();
      for(const {id,state,cadenceMs}of players){
        if(!state?.position||!state.quaternion)continue;present.add(id);
        let record=histories.get(id)||{samples:[],delay:delayMs,target:-Infinity};
        const last=record.samples.at(-1)?.state;
        const discontinuity=last&&['teleportId','mode','vehicleId','characterId','paused','seatId'].some(key=>last[key]!==state[key]);
        if(discontinuity)record={samples:[],delay:record.delay,target:-Infinity};
        record.delay=cadenceMs===500?Math.max(delayMs,farDelayMs):delayMs;
        // Reconstructed rosters include untouched peers. Their original receive times
        // must stay intact; otherwise a near peer would freeze every far update.
        if(record.samples.length&&Number.isInteger(state.seq)&&last.seq===state.seq&&!discontinuity){histories.set(id,record);continue;}
        record.samples.push({time,state});if(record.samples.length>16)record.samples.shift();histories.set(id,record);
      }
      for(const id of histories.keys())if(!present.has(id))histories.delete(id);
    },
    sample(id,time){
      const record=histories.get(id),h=record?.samples;if(!h?.length)return null;
      // Hysteresis changes the delay gradually in playback time: never rewind a car
      // when it switches to the lower-rate far stream.
      const target=Math.max(record.target,time-record.delay);record.target=target;
      let a=h[0],b=h.at(-1);
      if(target<=a.time)return a.state;if(target>=b.time)return b.state;
      for(let i=1;i<h.length;i++)if(h[i].time>=target){a=h[i-1];b=h[i];break;}
      const t=Math.max(0,Math.min(1,(target-a.time)/Math.max(1,b.time-a.time)));
      const mix=(x,y)=>x+(y-x)*t,qa=a.state.quaternion,qb=b.state.quaternion;
      const sign=qa.reduce((sum,n,i)=>sum+n*qb[i],0)<0?-1:1;
      const quaternion=qa.map((n,i)=>mix(n,qb[i]*sign)),length=Math.hypot(...quaternion)||1;
      const result={...a.state,position:a.state.position.map((n,i)=>mix(n,b.state.position[i])),quaternion:quaternion.map(n=>n/length)};
      for(const key of ['speed','steer','wheelSpin','bodyPitch','bodyRoll','bodyBob','jumpElapsed'])result[key]=mix(Number(a.state[key])||0,Number(b.state[key])||0);
      result.heading=(a.state.heading||0)+wrap((b.state.heading||0)-(a.state.heading||0))*t;
      result.braking=!!h.at(-1).state.braking;
      if(a.state.airborne&&!b.state.airborne)result.jumpElapsed=a.state.jumpElapsed;
      return result;
    },
    clear(){histories.clear();},
  };
}
