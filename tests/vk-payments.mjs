import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const module=await import('../server/vk-server.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const secret='unit-test-secret';
const products=[{id:'skin_jandel',title_ru:'Джандель',title_en:'Jandel',price:6,icon:'skin_jandel.png'}];
function callback(fields={}){
  const body=new URLSearchParams({notification_type:'order_status_change',app_id:'42',user_id:'7',receiver_id:'7',order_id:'99',item:'skin_jandel',item_id:'skin_jandel',item_title:'Jandel',item_price:'6',date:'123',status:'chargeable',...fields});
  const text=[...body].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('')+secret;
  body.set('sig',createHash('md5').update(text).digest('hex'));return body;
}
function auth(fields={}){
  const params=new URLSearchParams({vk_app_id:'42',vk_user_id:'7',vk_ts:String(Math.floor(Date.now()/1000)),vk_language:'ru',...fields});params.sort();
  params.set('sign',createHmac('sha256',secret).update(params.toString()).digest('base64url'));return 'VK '+params;
}
async function fixture(t,options={}){
  assert.equal(typeof module.createVkServer,'function','VK payment service must exist');
  const directory=await mkdtemp(join(tmpdir(),'obby-vk-payments-'));
  const config={appId:42,secret,products,gameUrl:'https://game.example.test/vk/',databasePath:join(directory,'purchases.sqlite'),allowedOrigins:['https://game.example.test'],...options};
  const app=module.createVkServer(config);const address=await app.listen();const base=`http://127.0.0.1:${address.port}`;
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const post=async body=>(await fetch(base+'/api/vk/payments/callback',{method:'POST',body})).json();
  const owned=async authorization=>(await fetch(base+'/api/vk/purchases',{headers:{Authorization:authorization||auth()}}));
  return {app,config,base,post,owned};
}
test('signed VK callback grants a permanent skin once and survives a service restart',async t=>{
  const f=await fixture(t);const first=await f.post(callback());
  assert.equal(first.response.order_id,99);assert.ok(Number.isSafeInteger(first.response.app_order_id));
  assert.deepEqual(await f.post(callback()),first);
  assert.deepEqual(await (await f.owned()).json(),{purchases:[{productID:'skin_jandel'}]});
  await f.app.close();const restarted=module.createVkServer(f.config);await restarted.listen();
  t.after(()=>restarted.close());
  const address=restarted.httpServer.address();const result=await fetch(`http://127.0.0.1:${address.port}/api/vk/purchases`,{headers:{Authorization:auth()}});
  assert.deepEqual(await result.json(),{purchases:[{productID:'skin_jandel'}]});
});
test('forged, duplicate-parameter and wrong-app callbacks cannot mint purchases',async t=>{
  const f=await fixture(t);
  const forged=callback();forged.set('user_id','8');assert.ok((await f.post(forged)).error);
  const duplicate=callback();duplicate.append('user_id','8');assert.ok((await f.post(duplicate)).error);
  assert.ok((await f.post(callback({app_id:'41'}))).error);
  assert.ok((await f.post(callback({item_id:'unknown'}))).error);
  assert.ok((await f.post(callback({status:'cancelled'}))).error);
  assert.deepEqual(await (await f.owned()).json(),{purchases:[]});
});
test('reusing an order ID with a different recipient is rejected',async t=>{
  const f=await fixture(t);await f.post(callback());
  assert.ok((await f.post(callback({user_id:'8',receiver_id:'8'}))).error);
  assert.deepEqual(await (await f.owned(auth({vk_user_id:'8'}))).json(),{purchases:[]});
});
test('test payments never enter the live entitlement list even when order IDs overlap',async t=>{
  const f=await fixture(t,{testUserIds:['7']});
  assert.ok((await f.post(callback({notification_type:'order_status_change_test'}))).response);
  assert.deepEqual(await (await f.owned()).json(),{purchases:[]});
  assert.ok((await f.post(callback())).response);
  assert.deepEqual(await (await f.owned()).json(),{purchases:[{productID:'skin_jandel'}]});
});
test('refund removes ownership and delayed chargeable retries cannot regrant the order',async t=>{
  const f=await fixture(t);await f.post(callback());
  assert.ok((await f.post(callback({status:'refunded'}))).response);
  assert.deepEqual(await (await f.owned()).json(),{purchases:[]});
  await f.post(callback());assert.deepEqual(await (await f.owned()).json(),{purchases:[]});
});
test('launch signatures, application IDs, timestamps and CORS isolate purchase reads',async t=>{
  const f=await fixture(t);
  for(const header of ['VK vk_user_id=7&sign=bad',auth({vk_app_id:'41'}),auth({vk_ts:'1'})])assert.equal((await f.owned(header)).status,401);
  const denied=await fetch(f.base+'/api/vk/purchases',{headers:{Authorization:auth(),Origin:'https://evil.example.test'}});assert.equal(denied.status,403);
  const preflight=await fetch(f.base+'/api/vk/purchases',{method:'OPTIONS',headers:{Origin:'https://game.example.test','Access-Control-Request-Headers':'authorization'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://game.example.test');
});
test('VK item metadata uses explicitly configured votes and public HTTPS icon URLs',async t=>{
  const f=await fixture(t);const result=await f.post(callback({notification_type:'get_item',item:'skin_jandel',lang:'en_US'}));
  assert.deepEqual(result,{response:{item_id:'skin_jandel',title:'Jandel',photo_url:'https://game.example.test/vk/assets/inapp/skin_jandel.png',price:6}});
  const catalogue=await (await fetch(f.base+'/api/vk/catalog')).json();assert.equal(catalogue.products[0].price,6);
});
test('production service refuses missing prices and cannot use an ephemeral database',()=>{
  assert.equal(typeof module.createVkServer,'function');
  const config={appId:42,secret,products,gameUrl:'https://game.example.test',databasePath:':memory:'};
  assert.throws(()=>module.createVkServer(config),/persistent|database/i);
  assert.throws(()=>module.createVkServer({...config,databasePath:'/tmp/unused-vk.sqlite',products:[{...products[0],price:null}]}),/price/i);
});
