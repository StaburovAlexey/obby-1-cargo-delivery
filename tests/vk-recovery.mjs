import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initializeVkPlatform} from '../dist/vk-platform.js';
import {createPremiumSkins} from '../dist/premium-skins.js';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {createCloudCareer} from '../dist/cloud-career.js';
import {createPauseState} from '../dist/pause-state.js';
import {createAppDom} from './fixtures/app-dom.mjs';

function fixture(){
  let owned=false,dialogs=0;
  const bridge={subscribe(){},unsubscribe(){},supportsAsync:async()=>true,send:async method=>{
    if(method==='VKWebAppGetLaunchParams')return {vk_user_id:7,vk_app_id:42,vk_language:'ru',sign:'signed'};
    if(method==='VKWebAppShowOrderBox'){dialogs++;return {status:'success',order_id:'99'};}
    return {result:true};
  }};
  return {bridge,get dialogs(){return dialogs;},set owned(value){owned=value;},fetch:async()=>({ok:true,json:async()=>({purchases:owned?[{productID:'skin_jandel'}]:[]})})};
}
test('a confirmed late purchase is recovered without opening another payment dialog',async()=>{
  const f=fixture(),p=await initializeVkPlatform({...f,purchaseTimeoutMs:2,pollIntervalMs:1});
  await assert.rejects(p.purchase('skin_jandel'),/confirmation/i);assert.equal(f.dialogs,1);
  f.owned=true;assert.deepEqual(await p.purchase('skin_jandel'),{productID:'skin_jandel'});assert.equal(f.dialogs,1);p.destroy();
});
test('retrying an order still awaiting its callback does not open a second payment dialog',async()=>{
  const f=fixture(),p=await initializeVkPlatform({...f,purchaseTimeoutMs:2,pollIntervalMs:1});
  await assert.rejects(p.purchase('skin_jandel'));await assert.rejects(p.purchase('skin_jandel'));assert.equal(f.dialogs,1);p.destroy();
});
test('lost SDK capability responses time out and invoke the advertisement error callback',async()=>{
  const f=fixture(),errors=[];f.bridge.supportsAsync=()=>new Promise(()=>{});
  const p=await initializeVkPlatform({...f,timeoutMs:5});
  const outcome=await Promise.race([p.showAd({onError:error=>errors.push(error)}).then(()=> 'success',()=> 'rejected'),new Promise(resolve=>setTimeout(()=>resolve('stalled'),40))]);
  assert.equal(outcome,'rejected');assert.equal(errors.length,1);p.destroy();
});
test('successful VK entitlement refresh removes refunded rights but transient errors retain the last snapshot',async()=>{
  let purchases=[{productID:'skin_jandel'}],offline=false;
  const premium=createPremiumSkins({platform:{id:'vk',getCatalog:async()=>[],getPurchases:async()=>{if(offline)throw Error('offline');return purchases;}}});
  await premium.initialize();assert(premium.ownedIds.has('jandel'));
  offline=true;await premium.initialize();assert(premium.ownedIds.has('jandel'));
  offline=false;purchases=[];await premium.initialize();assert(!premium.ownedIds.has('jandel'));
});
test('authoritative VK refunds remove the active skin and persist the default character without losing ordinary skins',()=>{
  let saved;const gameplay=createGameplay({career:{...freshCareer(),ownedSkinIds:['bacon','pack1','jandel'],characterId:'jandel'},persistence:{save:value=>{saved=value;return true;}}});
  assert.equal(typeof gameplay.reconcilePremiumSkins,'function');
  assert.equal(gameplay.reconcilePremiumSkins([]),true);
  assert.deepEqual(gameplay.state.ownedSkinIds,['bacon','pack1']);assert.equal(gameplay.state.characterId,'bacon');assert.equal(saved.characterId,'bacon');
  assert.equal(gameplay.reconcilePremiumSkins([]),false);
});
test('VK cloud merging cannot resurrect a refunded premium skin from the previous cloud snapshot',async()=>{
  let data={version:1,updatedAt:10,settings:{language:'ru'},legacyPremiumIds:[],career:{...freshCareer(),ownedSkinIds:['bacon','jandel']}};
  const cloud=createCloudCareer({platform:{id:'vk',language:'ru',loadSave:async()=>structuredClone(data),saveSave:async value=>{data=structuredClone(value);}},legacyStorage:null,writeDelayMs:0});
  await cloud.initialize();cloud.store.save(freshCareer());await cloud.flush();assert.deepEqual(data.career.ownedSkinIds,['bacon']);cloud.destroy();
});
test('a VK entitlement refresh updates the running app and persists its refunded character fallback',async()=>{
  let purchases=[{productID:'skin_jandel'}],saved;
  const platform={id:'vk',name:'ВКонтакте',ready(){},gameplayStart(){},gameplayStop(){},showAd:async()=>({wasShown:false}),getCatalog:async()=>[{id:'skin_jandel',price:'6',currencyLabel:'гол.'}],getPurchases:async()=>purchases};
  const premium=createPremiumSkins({platform});await premium.initialize();
  const career={...freshCareer(),ownedSkinIds:['bacon','jandel'],characterId:'jandel'};
  const services={platform,premium,pause:createPauseState(),development:false,serverUrl:'',initialCareer:career,settings:{audioVolume:1,language:'ru'},cloud:{store:{load:()=>career,save:value=>{saved=value;return true;}},status:{},flush:async()=>true,setSettings(){}}};
  const app=createAppDom({startDriving:false,services});
  try{
    await Promise.resolve();assert(app.debug.gameplay.isSkinOwned('jandel'));
    purchases=[];await premium.initialize();await Promise.resolve();
    assert.equal(app.debug.gameplay.isSkinOwned('jandel'),false);assert.equal(app.debug.gameplay.state.characterId,'bacon');assert.equal(saved.characterId,'bacon');
  }finally{app.dispose();}
});
test('a blank uniform-price environment value preserves configured per-product prices',()=>{
  const directory=mkdtempSync(join(tmpdir(),'obby-vk-price-'));
  try{
    const file=join(directory,'products.json');writeFileSync(file,JSON.stringify([{id:'skin_jandel',price:6,title_ru:'Jandel',title_en:'Jandel',icon:'skin_jandel.png'}]));
    const result=spawnSync(process.execPath,['server/vk-server.mjs'],{encoding:'utf8',timeout:600,env:{...process.env,VK_APP_ID:'42',VK_APP_SECRET:'unit-secret',VK_GAME_URL:'https://game.example.test/',VK_PRODUCTS_FILE:file,VK_DATABASE_PATH:join(directory,'purchases.sqlite'),VK_SKIN_PRICE_VOTES:'',VK_PORT:'0'}});
    assert.match(result.stdout,/"event":"listening"/);assert.doesNotMatch(result.stderr,/price must/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
