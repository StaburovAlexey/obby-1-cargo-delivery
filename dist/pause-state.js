export function createPauseState(){
  const reasons=new Set(),listeners=new Set();
  return {
    set(reason,value){
      const changed=value?!reasons.has(reason):reasons.has(reason);
      if(value)reasons.add(reason);else reasons.delete(reason);
      if(changed)for(const listener of listeners)listener(reasons.size>0);
    },
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    get paused(){return reasons.size>0;},get reasons(){return new Set(reasons);},
  };
}
