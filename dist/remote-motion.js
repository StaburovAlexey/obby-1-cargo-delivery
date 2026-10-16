export function createRemoteMotion({delayMs=200}={}){
  const histories=new Map();
  return {
    receive(players,time){
      const present=new Set();
      for(const {id,state}of players){
        if(!state?.position||!state.quaternion)continue;present.add(id);
        let history=histories.get(id)||[];const last=history.at(-1)?.state;
        if(last&&(last.teleportId!==state.teleportId||last.mode!==state.mode||last.vehicleId!==state.vehicleId||last.characterId!==state.characterId))history=[];
        // Server ticks can repeat a player's last update; these are not new motion samples.
        if(history.length&&Number.isInteger(state.seq)&&last.seq===state.seq&&last.seatId===state.seatId)continue;
        history.push({time,state});if(history.length>8)history.shift();histories.set(id,history);
      }
      for(const id of histories.keys())if(!present.has(id))histories.delete(id);
    },
    sample(id,time){
      const h=histories.get(id);if(!h?.length)return null;
      const target=time-delayMs;let a=h[0],b=h.at(-1);
      if(target<=a.time)return a.state;if(target>=b.time)return b.state;
      for(let i=1;i<h.length;i++)if(h[i].time>=target){a=h[i-1];b=h[i];break;}
      const t=Math.max(0,Math.min(1,(target-a.time)/Math.max(1,b.time-a.time)));
      const mix=(x,y)=>x+(y-x)*t,qa=a.state.quaternion,qb=b.state.quaternion;
      const sign=qa.reduce((sum,n,i)=>sum+n*qb[i],0)<0?-1:1;
      const quaternion=qa.map((n,i)=>mix(n,qb[i]*sign)),length=Math.hypot(...quaternion)||1;
      const result={...a.state,position:a.state.position.map((n,i)=>mix(n,b.state.position[i])),quaternion:quaternion.map(n=>n/length)};
      for(const key of ['speed','steer','wheelSpin','bodyPitch','bodyRoll','bodyBob','braking','jumpElapsed'])result[key]=mix(Number(a.state[key])||0,Number(b.state[key])||0);
      if(a.state.airborne&&!b.state.airborne)result.jumpElapsed=a.state.jumpElapsed;
      return result;
    },
    clear(){histories.clear();},
  };
}
