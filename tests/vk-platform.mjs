import test from 'node:test';
import assert from 'node:assert/strict';

const module=await import('../dist/vk-platform.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const initialize=options=>{assert.equal(typeof module.initializeVkPlatform,'function','VK adapter must exist');return module.initializeVkPlatform(options);};
function bridgeFixture(){
  let value='',listener;const calls=[];
  const bridge={send:async(method,params)=>{
    calls.push([method,params]);
    if(method==='VKWebAppStorageGet')return {keys:[{key:'urbanRouteSave_vk',value}]};
    if(method==='VKWebAppStorageSet'){value=params.value;return {result:true};}
    if(method==='VKWebAppGetLaunchParams')return {vk_user_id:7,vk_app_id:42,vk_language:'ru',vk_ts:123,sign:'signed'};
    return {result:true};
  },supportsAsync:async()=>true,subscribe(fn){listener=fn;},unsubscribe(){listener=undefined;}};
  return {bridge,calls,emit:type=>listener?.({detail:{type,data:{}}}),get value(){return value;},set value(v){value=v;}};
}
test('VK uses its own persistent storage and preserves complete JSON',async()=>{
  const f=bridgeFixture(),platform=await initialize({bridge:f.bridge});
  assert.equal(platform.id,'vk');assert.equal(platform.language,'ru');assert.equal(await platform.loadSave(),null);
  const data={version:1,updatedAt:10,career:{text:'тест'.repeat(170)}};
  await platform.saveSave(data);assert.deepEqual(await platform.loadSave(),data);
  assert.equal(f.calls[0][0],'VKWebAppInit');assert.equal(f.calls.find(([m])=>m==='VKWebAppStorageSet')[1].key,'urbanRouteSave_vk');
  const before=f.value;await assert.rejects(platform.saveSave({text:'я'.repeat(5000)}),/size|large|limit/i);assert.equal(f.value,before);
  f.value='{broken';await assert.rejects(platform.loadSave(),/corrupt|JSON/i);platform.destroy();
});
test('VK hide and restore hold platform pause independently of advertising',async()=>{
  const f=bridgeFixture(),changes=[];const platform=await initialize({bridge:f.bridge,onPause:()=>changes.push('pause'),onResume:()=>changes.push('resume')});
  platform.ready();platform.gameplayStart();f.emit('VKWebAppViewHide');assert.equal(platform.status.paused,true);
  f.emit('VKWebAppViewRestore');assert.equal(platform.status.paused,false);assert.deepEqual(changes,['pause','resume']);platform.destroy();
});
test('unavailable VK ads close without opening a pause and ad failures release their callback',async()=>{
  const f=bridgeFixture(),events=[];f.bridge.send=async(method)=>method==='VKWebAppGetLaunchParams'?{vk_language:'en'}:method==='VKWebAppCheckNativeAds'?{result:false}:{result:true};
  const platform=await initialize({bridge:f.bridge});
  assert.deepEqual(await platform.showAd({onOpen:()=>events.push('open'),onClose:shown=>events.push(shown)}),{wasShown:false});assert.deepEqual(events,[false]);platform.destroy();
});
test('VK purchase waits for the signed server entitlement instead of trusting the payment window',async()=>{
  const f=bridgeFixture();let reads=0,complete;
  const send=f.bridge.send;f.bridge.send=(method,params)=>method==='VKWebAppShowOrderBox'?new Promise(resolve=>{complete=resolve;}):send(method,params);
  const fetch=async(url,options)=>{assert.match(options.headers.Authorization,/^VK /);reads++;return {ok:true,json:async()=>({purchases:reads>2?[{productID:'skin_jandel'}]:[]})};};
  const platform=await initialize({bridge:f.bridge,fetch,apiUrl:'https://api.example.test',pollIntervalMs:1,purchaseTimeoutMs:30});
  const pending=platform.purchase('skin_jandel');await new Promise(resolve=>setTimeout(resolve,10));assert.equal(reads,1);
  complete({status:'success',order_id:'99'});assert.deepEqual(await pending,{productID:'skin_jandel'});assert.equal(reads,3);platform.destroy();
});
test('explicit development VK never sends real storage, advertisement or purchase calls',async()=>{
  const platform=await initialize({development:true,bridge:{send(){throw Error('real VK call');}}});
  await platform.saveSave({version:1});assert.deepEqual(await platform.loadSave(),{version:1});
  assert.deepEqual(await platform.getPurchases(),[]);await assert.rejects(platform.purchase('skin_jandel'),/development|unavailable/i);platform.destroy();
});
