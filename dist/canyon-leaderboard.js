import {DRIFT_LEADERBOARD,sanitizeDriftRecord} from './drift-record.js';

// One instance is shared by the canyon, trophy dialog and classroom board.
// Room transport is deliberately not involved in scores or leaderboard reads.
export function createCanyonLeaderboard({platform,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const state={status:'idle',entries:[],player:null,canLogin:false,busy:false};
 let disposed=false,epoch=0,loading=null,cachedAt=-Infinity,bestSubmitted=-1,lastSubmit=-Infinity,queue=Promise.resolve();
 const listeners=new Set(),notify=()=>{for(const fn of listeners)fn(state);};
 const generation=()=>platform?.accountGeneration??0;
 const ownerGeneration=generation();
 const valid=(token,account)=>!disposed&&token===epoch&&account===ownerGeneration&&account===generation()&&!platform?.status?.reloadRequired;
 const supported=()=>platform?.id==='yandex'&&!platform.development&&typeof platform.getLeaderboardStatus==='function';
 const classify=error=>platform?.status?.reloadRequired||ownerGeneration!==generation()?'account-changed':error?.code==='AUTH_REQUIRED'?'auth-required':error?.code===404||error?.status===404?'missing-board':'error';
 const cleanEntry=e=>e&&Number.isSafeInteger(e.rank)&&e.rank>0&&Number.isSafeInteger(e.score)&&e.score>=0&&e.score<=100000000?
  {rank:e.rank,score:e.score,name:typeof e.player?.publicName==='string'?e.player.publicName.slice(0,64):''}:null;
 const clearAccount=()=>{if(state.status!=='account-changed'){epoch++;Object.assign(state,{entries:[],player:null,canLogin:false,busy:false,status:'account-changed'});notify();}return {...state};};
 async function access(){if(!supported())return {available:false,authorized:false};return platform.getLeaderboardStatus();}
 const api={
  get state(){if(!disposed&&(ownerGeneration!==generation()||platform?.status?.reloadRequired))clearAccount();return state;},
  subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
  load({force=false}={}){
   if(disposed)return Promise.resolve({...state,status:'cancelled'});
   if(ownerGeneration!==generation()||platform?.status?.reloadRequired)return Promise.resolve(clearAccount());
   if(loading)return loading;
   if(!force&&now()-cachedAt<30000)return Promise.resolve({...state});
   const token=epoch,account=generation();state.busy=true;if(state.status==='idle')state.status='loading';notify();
   const operation=(async()=>{
    try{
     const status=await access();if(!valid(token,account))return {...state,status:'cancelled'};
     state.canLogin=status.available&&!status.authorized;if(!status.available){state.status='unavailable';return {...state};}
     const response=await platform.getLeaderboardEntries(DRIFT_LEADERBOARD,{quantityTop:10,quantityAround:2,includeUser:status.authorized});
     const player=status.authorized?await platform.getLeaderboardPlayerEntry(DRIFT_LEADERBOARD):null;
     if(!valid(token,account))return {...state,status:'cancelled'};
     state.entries=(Array.isArray(response?.entries)?response.entries:[]).slice(0,20).map(cleanEntry).filter(Boolean);state.player=cleanEntry(player);state.status='ready';return {...state};
    }catch(error){if(valid(token,account))state.status=classify(error);return {...state,status:valid(token,account)?state.status:'account-changed'};}
    finally{
     if(token===epoch)state.busy=false;
     if(ownerGeneration!==generation()||platform?.status?.reloadRequired)clearAccount();
     else if(valid(token,account)){cachedAt=now();notify();}
    }
   })();loading=operation;operation.finally(()=>{if(loading===operation)loading=null;});return operation;
  },
  submit(input,{isCurrent=()=>true}={}){
   const record=sanitizeDriftRecord(input),token=epoch,account=generation();
   if(!record)return Promise.resolve({status:'invalid'});
   const usable=()=>valid(token,account)&&isCurrent();
   const operation=queue.then(async()=>{
    if(!usable())return {status:'cancelled'};
    try{
     const status=await access();if(!usable())return {status:'account-changed'};
     state.canLogin=status.available&&!status.authorized;
     if(!status.available)return {status:'unavailable'};
     if(!status.authorized)return {status:'auth-required'};
     const player=await platform.getLeaderboardPlayerEntry(DRIFT_LEADERBOARD);if(!usable())return {status:'cancelled'};
     const best=Math.max(bestSubmitted,Number.isSafeInteger(player?.score)?player.score:-1);
     if(record.score<=best)return {status:'not-improved'};
     const delay=1100-(now()-lastSubmit);if(delay>0)await wait(delay);
     if(!usable())return {status:'cancelled'};
     lastSubmit=now();await platform.setLeaderboardScore(DRIFT_LEADERBOARD,record.score,JSON.stringify({v:1,track:record.trackId,ms:record.durationMs,combo:record.maxCombo}));
     if(!valid(token,account))return {status:'account-changed'};
     bestSubmitted=record.score;lastSubmit=now();cachedAt=-Infinity;
     // Submission status must not replace the cached board's read status.
     // Refresh after an older in-flight read, so it cannot retain a stale score.
     const pendingRead=loading;
     void Promise.resolve(pendingRead).then(()=>{if(valid(token,account))return api.load({force:true});});
     return {status:'posted',score:record.score};
    }catch(error){return {status:classify(error)};}
   });queue=operation.catch(()=>{});return operation;
  },
  async login(){
   if(!supported()||disposed)return {status:'unavailable'};const token=epoch,account=generation();
   try{await platform.authorizeLeaderboard();if(!valid(token,account))return {status:'account-changed'};cachedAt=-Infinity;return {status:'authorized'};}catch(error){return {status:classify(error)};}
  },
  cancelPending(){epoch++;state.busy=false;loading=null;},
  dispose(){disposed=true;epoch++;state.busy=false;state.entries=[];state.player=null;listeners.clear();},
 };
 return api;
}
