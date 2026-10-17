import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PREMIUM_SKIN_IDS,premiumProductId} from '../dist/premium-skins.js';
import {createVkPurchaseStore} from './vk-purchase-store.mjs';
import {uniqueParameters,verifyPayment,verifyLaunch,positiveId} from './vk-auth.mjs';

const knownProducts=new Set(PREMIUM_SKIN_IDS.map(premiumProductId));
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const paymentError=(res,code,message,critical=true)=>json(res,200,{error:{error_code:code,error_msg:message,critical}});
async function readBody(req){
  let size=0,oversize=false;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>65536)oversize=true;else if(!oversize)chunks.push(chunk);}
  if(oversize)throw new Error('VK callback body too large');
  return Buffer.concat(chunks).toString('utf8');
}

export function createVkServer(options={}){
  const appId=String(options.appId||''),secret=options.secret;
  if(!positiveId(appId)||typeof secret!=='string'||!secret)throw new Error('VK_APP_ID and VK_APP_SECRET are required');
  const gameUrl=new URL(String(options.gameUrl||''));
  if(gameUrl.protocol!=='https:'||gameUrl.username||gameUrl.password||gameUrl.search||gameUrl.hash)throw new Error('VK_GAME_URL must be a public HTTPS directory URL');
  if(!gameUrl.pathname.endsWith('/'))gameUrl.pathname+='/';
  if(!Array.isArray(options.products)||!options.products.length)throw new Error('VK products are required');
  const products=new Map();
  for(const item of options.products){
    if(!knownProducts.has(item.id)||products.has(item.id))throw new Error('Invalid or duplicate VK product');
    if(!Number.isSafeInteger(item.price)||item.price<1)throw new Error('VK product price must be a positive integer in votes');
    if(!item.title_ru||!item.title_en||item.title_ru.length>48||item.title_en.length>48||!/^[a-z0-9_-]+\.png$/.test(item.icon||''))throw new Error('Invalid VK product metadata');
    products.set(item.id,{...item});
  }
  const allowedOrigins=new Set(options.allowedOrigins||[gameUrl.origin]);
  for(const origin of allowedOrigins)if(new URL(origin).origin!==origin)throw new Error('VK allowed origins must be exact origins');
  const mode=options.paymentMode||'live';if(!['live','test'].includes(mode))throw new Error('Invalid VK payment mode');
  const testUsers=new Set((options.testUserIds||[]).map(String));
  if(mode==='test'&&!testUsers.size)throw new Error('VK test mode requires explicit test users');
  const store=createVkPurchaseStore(options.databasePath);
  let closed=false;
  const httpServer=createServer((req,res)=>{void handle(req,res).catch(error=>{
    if(res.headersSent){res.end();return;}
    if(req.url?.split('?')[0]==='/api/vk/payments/callback')paymentError(res,2,'Temporary payment storage error',false);
    else json(res,500,{error:'VK service unavailable'});
    options.onError?.(error);
  });});
  httpServer.headersTimeout=10000;httpServer.requestTimeout=10000;httpServer.maxHeadersCount=64;
  async function handle(req,res){
    const url=new URL(req.url,'http://localhost'),path=url.pathname;
    const origin=req.headers.origin;
    if(origin&&!allowedOrigins.has(origin)){json(res,403,{error:'Origin not allowed'});return;}
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){
      res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});res.end();return;
    }
    if(path==='/health'&&req.method==='GET'){json(res,200,{ok:!closed,service:'vk-purchases',paymentMode:mode});return;}
    if(path==='/api/vk/catalog'&&req.method==='GET'){
      json(res,200,{products:[...products.values()].map(item=>({id:item.id,title:item.title_ru,price:item.price}))});return;
    }
    if(path==='/api/vk/purchases'&&req.method==='GET'){
      let launch;
      try{launch=verifyLaunch(req.headers.authorization,secret,appId,{maxAgeSeconds:options.launchMaxAgeSeconds??86400});}
      catch{json(res,401,{error:'Invalid or expired VK launch authorization; reopen the game'});return;}
      if(mode==='test'&&!testUsers.has(launch.userId)){json(res,403,{error:'VK test user required'});return;}
      json(res,200,{purchases:store.purchases(appId,mode,launch.userId)});return;
    }
    if(path!=='/api/vk/payments/callback'){json(res,404,{error:'Not found'});return;}
    if(req.method!=='POST'){json(res,405,{error:'POST required'});return;}
    if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')){paymentError(res,11,'Form-encoded callback required');return;}
    let params;
    try{params=uniqueParameters(await readBody(req));verifyPayment(params,secret,appId);}
    catch{paymentError(res,10,'Invalid callback parameters or signature');return;}
    const notification=params.get('notification_type'),test=notification?.endsWith('_test');
    const userId=params.get('user_id');
    if(test&&!testUsers.has(userId)){paymentError(res,11,'Test payments are disabled for this user');return;}
    if(notification==='get_item'||notification==='get_item_test'){
      const item=products.get(params.get('item'));
      if(!item){paymentError(res,20,'Unknown product');return;}
      json(res,200,{response:{item_id:item.id,title:params.get('lang')==='en_US'?item.title_en:item.title_ru,
        photo_url:new URL('assets/inapp/'+item.icon,gameUrl).href,price:item.price}});return;
    }
    if(notification!=='order_status_change'&&notification!=='order_status_change_test'){paymentError(res,11,'Unsupported notification');return;}
    const productId=params.get('item_id')||params.get('item'),item=products.get(productId),orderId=params.get('order_id'),receiverId=params.get('receiver_id');
    const status=params.get('status'),price=params.get('item_price');
    if(!item||!positiveId(orderId)||!positiveId(receiverId)||receiverId!==userId||
      (params.has('item')&&params.get('item')!==productId)||!['chargeable','refunded'].includes(status)||
      (price!==null&&(!Number.isSafeInteger(Number(price))||Number(price)<1))){paymentError(res,11,'Invalid order');return;}
    let internalId;
    try{internalId=store.apply({appId,mode:test?'test':'live',orderId,userId,receiverId,productId,status,votes:price===null?item.price:Number(price)});}
    catch(error){if(error.message==='VK order identity mismatch'){paymentError(res,11,'Order identity mismatch');return;}throw error;}
    json(res,200,{response:{order_id:Number(orderId),app_order_id:internalId}});
  }
  return {httpServer,
    async listen(port=options.port??0,host=options.host??'127.0.0.1'){
      await new Promise((resolve,reject)=>{httpServer.once('error',reject);httpServer.listen(port,host,()=>{httpServer.off('error',reject);resolve();});});return httpServer.address();
    },
    async close(){if(closed)return;closed=true;if(httpServer.listening)await new Promise(resolve=>httpServer.close(resolve));store.close();},
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const products=JSON.parse(readFileSync(process.env.VK_PRODUCTS_FILE||new URL('./vk-products.json',import.meta.url),'utf8'));
    const price=process.env.VK_SKIN_PRICE_VOTES;
    if(price?.trim())for(const item of products)item.price=Number(price);
    const app=createVkServer({appId:process.env.VK_APP_ID,secret:process.env.VK_APP_SECRET,
      gameUrl:process.env.VK_GAME_URL,databasePath:process.env.VK_DATABASE_PATH,
      products,paymentMode:process.env.VK_PAYMENT_MODE||'live',testUserIds:(process.env.VK_TEST_USER_IDS||'').split(',').filter(Boolean),
      allowedOrigins:(process.env.VK_ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean)});
    const address=await app.listen(Number(process.env.VK_PORT||8085),process.env.VK_HOST||'127.0.0.1');
    console.log(JSON.stringify({event:'listening',service:'vk-purchases',...address}));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exitCode=0;});
  }catch(error){console.error('VK service configuration error: '+error.message);process.exitCode=1;}
}
