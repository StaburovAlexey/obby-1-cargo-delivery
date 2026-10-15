

export function createStartupGate({onReady,onError,timeoutMs=120000,schedule=requestAnimationFrame,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let state='loading',timer;
  const fail=error=>{if(state!=='loading')return;state='failed';clearTimer(timer);onError?.(error);};
  return {
    get ready(){return state==='ready';},get state(){return state;},fail,
    start(assets,{prepare=()=>{},render=()=>{}}={}){
      timer=setTimer(()=>fail(new Error('Loading timed out')),timeoutMs);
      return Promise.resolve(assets).then(async()=>{
        if(state!=='loading')return;
        await prepare();
        if(state!=='loading')return;


        await new Promise((resolve,reject)=>schedule(()=>{try{if(state==='loading')render();resolve();}catch(e){reject(e);}}));
        await new Promise(resolve=>schedule(resolve));
        if(state!=='loading')return;
        clearTimer(timer);state='ready';onReady?.();
      }).catch(fail);
    },
  };
}
