import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeYandexPlatform} from '../dist/yandex-platform.js';
import {createCanyonLeaderboard} from '../dist/canyon-leaderboard.js';
const record={version:1,trackId:'canyon-v1',score:24000,durationMs:130000,maxCombo:4,verified:true};
function fixture({authorized=true,missing=false}={}){
 const events=new Map(),calls=[];let score=5000;
 const sdk={environment:{i18n:{lang:'ru'}},on:(n,f)=>events.set(n,f),off(){},features:{GameplayAPI:{start(){},stop(){}},LoadingAPI:{ready(){}}},
  isAvailableMethod:async name=>name.endsWith('getEntries')||authorized,getPlayer:async()=>({isAuthorized:()=>authorized,getUniqueID:()=> 'same-player'}),
  auth:{async openAuthDialog(){calls.push('login');authorized=true;}},
  leaderboards:{async getEntries(name,options){calls.push(['entries',name,options]);if(missing)throw Object.assign(Error('not found'),{code:404});return {userRank:2,entries:[{rank:1,score:30000,player:{publicName:'Driver'}},{rank:2,score,player:{publicName:'You'}}]};},async getPlayerEntry(name){calls.push(['player',name]);return {rank:2,score,player:{publicName:'You'}};},async setScore(name,value,extra){calls.push(['set',name,value,extra]);score=value;}},
 };
 return {sdk,events,calls};
}

test('Yandex rankings use the current native SDK and submit only an improved verified result',async()=>{
 const f=fixture(),platform=await initializeYandexPlatform({sdk:f.sdk}),board=createCanyonLeaderboard({platform});
 try{
  const loaded=await board.load();assert.equal(loaded.entries.length,2);assert.equal(loaded.player.score,5000);
  assert.equal((await board.submit(record)).status,'posted');assert.equal((await board.submit({...record,score:12000})).status,'not-improved');
  const sets=f.calls.filter(c=>c[0]==='set');assert.equal(sets.length,1);assert.equal(sets[0][1],'canyonDriftV1');assert.equal(sets[0][2],24000);
  assert.equal((await board.submit({...record,verified:false,score:40000})).status,'unverified');
 }finally{board.dispose();platform.destroy();}
});
test('anonymous players can read rankings and login opens only on an explicit action',async()=>{
 const f=fixture({authorized:false}),platform=await initializeYandexPlatform({sdk:f.sdk}),board=createCanyonLeaderboard({platform});
 try{
  const loaded=await board.load();assert.equal(loaded.entries.length,2);assert.equal(loaded.canLogin,true);assert.equal(f.calls.includes('login'),false);
  assert.equal((await board.submit(record)).status,'auth-required');assert.equal(f.calls.filter(c=>c[0]==='set').length,0);
  await board.login();assert.equal(f.calls.includes('login'),true);assert.equal((await board.submit(record)).status,'posted');
 }finally{board.dispose();platform.destroy();}
});
test('missing console leaderboard and unsupported platforms leave local play available',async()=>{
 const f=fixture({missing:true}),platform=await initializeYandexPlatform({sdk:f.sdk}),board=createCanyonLeaderboard({platform});
 try{assert.equal((await board.load()).status,'missing-board');}finally{board.dispose();platform.destroy();}
 const vk=createCanyonLeaderboard({platform:{id:'vk'}});assert.equal((await vk.load()).status,'unavailable');vk.dispose();
});
test('concurrent submissions serialize and SDK reads are cached within rate limits',async()=>{
 let time=0;const f=fixture(),platform=await initializeYandexPlatform({sdk:f.sdk}),board=createCanyonLeaderboard({platform,now:()=>time,wait:async ms=>{time+=ms;}});
 try{
  await Promise.all([board.load(),board.load(),board.load()]);assert.equal(f.calls.filter(c=>c[0]==='entries').length,1);
  await Promise.all([board.submit(record),board.submit({...record,score:25000}),board.submit({...record,score:10000})]);
  assert.deepEqual(f.calls.filter(c=>c[0]==='set').map(c=>c[2]),[24000,25000]);assert.ok(time>=1000);
 }finally{board.dispose();platform.destroy();}
});
test('account changes invalidate delayed leaderboard responses and stale submissions',async()=>{
 const f=fixture();let resolve;f.sdk.leaderboards.getEntries=()=>new Promise(r=>resolve=r);const platform=await initializeYandexPlatform({sdk:f.sdk});
 const reading=platform.getLeaderboardEntries('canyonDriftV1',{});await new Promise(r=>setImmediate(r));f.events.get('ACCOUNT_SELECTION_DIALOG_OPENED')();resolve({entries:[]});
 await assert.rejects(reading,/account/i);platform.destroy();
});
test('an account switch also clears cached personal ranking data',async()=>{
 const f=fixture(),platform=await initializeYandexPlatform({sdk:f.sdk}),board=createCanyonLeaderboard({platform});
 try{await board.load();f.events.get('ACCOUNT_SELECTION_DIALOG_OPENED')();const next=await board.load();assert.equal(next.status,'account-changed');assert.deepEqual(next.entries,[]);assert.equal(next.player,null);}finally{board.dispose();platform.destroy();}
});
