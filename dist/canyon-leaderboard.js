import {DRIFT_LEADERBOARD,sanitizeDriftRecord} from './drift-record.js';

export function createCanyonLeaderboard({platform,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const state={status:'idle',entries:[],player:null,canLogin:false,busy:false};
 let disposed=false,epoch=0,loading=null,cachedAt=-Infinity,bestSubmitted=-1,lastSubmit=-Infinity,queue=Promise.resolve();
 const generation=()=>platform?.accountGeneration??0;
 const ownerGeneration=generation();
 const valid=(token,account)=>!disposed&&token===epoch&&account===ownerGeneration&&account===generation()&&!platform?.status?.reloadRequired;
 const supported=()=>platform?.id==='yandex'&&!platform.development&&typeof platform.getLeaderboardStatus==='function';
 const classify=error=>platform?.status?.reloadRequired?'account-changed':error?.code==='AUTH_REQUIRED'?'auth-required':error?.code===404||error?.status===404?'missing-board':'error';
 const cleanEntry=e=>({rank:Number.isSafeInteger(e?.rank)&&e.rank>0?e.rank:0,score:Number.isSafeInteger(e?.score)&&e.score>=0?e.score:0,name:typeof e?.player?.publicName==='string'?e.player.publicName.slice(0,64):''});
 async function access(){if(!supported())return {available:false,authorized:false};return platform.getLeaderboardStatus();}
 return {state,
  load(){
   if(disposed)return Promise.resolve({...state,status:'cancelled'});
   if(ownerGeneration!==generation()||platform?.status?.reloadRequired){epoch++;Object.assign(state,{entries:[],player:null,canLogin:false,busy:false,status:'account-changed'});return Promise.resolve({...state});}
   if(loading)return loading;
   if(now()-cachedAt<30000)return Promise.resolve({...state});
   const token=epoch,account=generation();state.busy=true;
   const operation=(async()=>{
    try{
     const status=await access();if(!valid(token,account))return {...state,status:'cancelled'};
     state.canLogin=status.available&&!status.authorized;if(!status.available){state.status='unavailable';return {...state};}
     const response=await platform.getLeaderboardEntries(DRIFT_LEADERBOARD,{quantityTop:10,quantityAround:2,includeUser:status.authorized});
     const player=status.authorized?await platform.getLeaderboardPlayerEntry(DRIFT_LEADERBOARD):null;
     if(!valid(token,account))return {...state,status:'cancelled'};
     state.entries=(Array.isArray(response?.entries)?response.entries:[]).slice(0,20).map(cleanEntry);state.player=player?cleanEntry(player):null;state.status='ready';cachedAt=now();return {...state};
    }catch(error){if(valid(token,account))state.status=classify(error);return {...state,status:valid(token,account)?state.status:'account-changed'};}
    finally{if(token===epoch)state.busy=false;if(valid(token,account))cachedAt=now();}
   })();loading=operation;operation.finally(()=>{if(loading===operation)loading=null;});return operation;
  },
  submit(input){
   const record=sanitizeDriftRecord(input),token=epoch,account=generation();
   if(!record?.verified)return Promise.resolve({status:'unverified'});
   const operation=queue.then(async()=>{
    if(!valid(token,account))return {status:'cancelled'};state.busy=true;
    try{
     const status=await access();if(!valid(token,account))return {status:'account-changed'};
     state.canLogin=status.available&&!status.authorized;
     if(!status.available)return {status:state.status='unavailable'};
     if(!status.authorized)return {status:state.status='auth-required'};
     const player=await platform.getLeaderboardPlayerEntry(DRIFT_LEADERBOARD);if(!valid(token,account))return {status:'account-changed'};
     const best=Math.max(bestSubmitted,Number.isSafeInteger(player?.score)?player.score:-1);
     if(record.score<=best)return {status:state.status='not-improved'};
     const delay=1100-(now()-lastSubmit);if(delay>0)await wait(delay);
     if(!valid(token,account))return {status:'cancelled'};
     lastSubmit=now();await platform.setLeaderboardScore(DRIFT_LEADERBOARD,record.score,JSON.stringify({v:1,track:record.trackId,ms:record.durationMs,combo:record.maxCombo}));
     if(!valid(token,account))return {status:'account-changed'};
     bestSubmitted=record.score;lastSubmit=now();cachedAt=-Infinity;return {status:state.status='posted',score:record.score};
    }catch(error){return {status:state.status=classify(error)};}finally{if(token===epoch)state.busy=false;}
   });queue=operation.catch(()=>{});return operation;
  },
  async login(){
   if(!supported()||disposed)return {status:'unavailable'};const token=epoch,account=generation();
   try{await platform.authorizeLeaderboard();if(!valid(token,account))return {status:'account-changed'};cachedAt=-Infinity;return {status:'authorized'};}catch(error){return {status:classify(error)};}
  },
  cancelPending(){epoch++;state.busy=false;},
  dispose(){disposed=true;epoch++;state.busy=false;state.entries=[];state.player=null;},
 };
}
