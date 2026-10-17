import {PREMIUM_SKIN_IDS,premiumProductId} from './premium-skins.js';

const SAVE_KEY='urbanRouteSave_vk';
const products=new Set(PREMIUM_SKIN_IDS.map(premiumProductId));
const copy=value=>structuredClone(value);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function bounded(operation,ms,label){
  let timer;
  return Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),ms);})]).finally(()=>clearTimeout(timer));
}

function developmentPlatform(language='ru'){
  let save=null,ready=false,playing=false;
  const status={paused:false,reloadRequired:false,development:true};
  return {id:'vk',name:'ВКонтакте',development:true,language:language==='ru'?'ru':'en',status,
    ready(){if(ready)return false;ready=true;return true;},
    gameplayStart(){if(playing)return false;playing=true;return true;},gameplayStop(){const previous=playing;playing=false;return previous;},
    loadSave:async()=>copy(save),saveSave:async value=>{save=copy(value);},getCatalog:async()=>[],getPurchases:async()=>[],
    purchase:async()=>{throw new Error('VK purchases unavailable in development');},
    showAd:async(callbacks={})=>{callbacks.onClose?.(false);return {wasShown:false};},destroy(){playing=false;},
  };
}

export async function initializeVkPlatform(options={}){
  if(options.development===true)return developmentPlatform(options.language);
  const bridge=options.bridge||(await import('@vkontakte/vk-bridge')).default;
  const timeoutMs=Math.max(1,Number(options.timeoutMs)||15000);
  const status={paused:false,reloadRequired:false,development:false};
  let destroyed=false,ready=false,playing=false,advertising=false;
  const pendingPurchases=new Set();
  const ensure=()=>{if(destroyed)throw new Error('VK platform destroyed');};
  const send=(method,params)=>{ensure();return bounded(()=>bridge.send(method,params),timeoutMs,method);};
  await send('VKWebAppInit');
  const raw=new URLSearchParams(options.launchSearch??globalThis.location?.search??'');
  let launch;
  if(raw.has('sign')&&raw.has('vk_user_id'))launch=Object.fromEntries(raw);
  else launch=await send('VKWebAppGetLaunchParams');
  const signed=new URLSearchParams();
  for(const [key,value]of Object.entries(launch||{}))if(key.startsWith('vk_')||key==='sign')signed.set(key,String(value));
  const apiUrl=String(options.apiUrl||'').replace(/\/$/,'');
  if(apiUrl&&!/^https?:\/\//.test(apiUrl))throw new Error('VK API URL must be an HTTP(S) origin');
  const fetcher=options.fetch||globalThis.fetch;
  const language=(launch?.vk_language||options.language||'ru')==='ru'?'ru':'en';
  const supported=method=>bounded(()=>typeof bridge.supportsAsync==='function'?bridge.supportsAsync(method):typeof bridge.supports==='function'?bridge.supports(method):true,timeoutMs,'VK capability discovery');
  const onEvent=event=>{
    if(destroyed)return;
    const type=event?.detail?.type;
    if(type==='VKWebAppViewHide'){status.paused=true;playing=false;options.onPause?.();}
    if(type==='VKWebAppViewRestore'){status.paused=false;options.onResume?.();}
  };
  bridge.subscribe(onEvent);
  const request=async endpoint=>{
    ensure();
    if(!launch?.sign||!launch?.vk_user_id)throw new Error('VK signed launch parameters unavailable');
    const response=await bounded(async()=>{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{return await fetcher(`${apiUrl}/api/vk/${endpoint}`,{headers:{Authorization:`VK ${signed}`},signal:controller.signal,cache:'no-store'});}
      finally{clearTimeout(timer);}
    },timeoutMs,'VK purchases API');
    if(!response.ok)throw new Error('VK purchases API unavailable ('+response.status+')');
    const result=await bounded(()=>response.json(),timeoutMs,'VK purchases API response');ensure();return result;
  };
  const purchases=async()=>{
    const result=await request('purchases');
    if(!Array.isArray(result?.purchases))throw new Error('Invalid VK purchases response');
    return result.purchases.filter(item=>products.has(item?.productID)).map(item=>({productID:item.productID}));
  };
  return {id:'vk',name:'ВКонтакте',development:false,language,status,bridge,
    ready(){ensure();if(ready)return false;ready=true;return true;},
    gameplayStart(){ensure();if(playing||status.paused)return false;playing=true;return true;},
    gameplayStop(){const previous=playing;playing=false;return previous;},
    async loadSave(){
      const result=await send('VKWebAppStorageGet',{keys:[SAVE_KEY]});ensure();
      if(!Array.isArray(result?.keys))throw new Error('Invalid VK storage response');
      const value=result.keys.find(item=>item.key===SAVE_KEY)?.value;
      if(value===''||value===undefined)return null;
      if(typeof value!=='string')throw new Error('Corrupt VK save');
      try{return JSON.parse(value);}catch{throw new Error('Corrupt VK save JSON');}
    },
    async saveSave(envelope){
      const value=JSON.stringify(envelope);
      if(new TextEncoder().encode(value).byteLength>4096)throw new Error('VK save exceeds storage size limit (4096 bytes)');
      const result=await send('VKWebAppStorageSet',{key:SAVE_KEY,value});
      if(result?.result!==true)throw new Error('VK save was not confirmed');
    },
    async getCatalog(){
      const result=await request('catalog');
      if(!Array.isArray(result?.products))throw new Error('Invalid VK catalog response');
      return result.products.filter(item=>products.has(item?.id)&&Number.isSafeInteger(item.price)&&item.price>0)
        .map(item=>({id:item.id,title:item.title,price:String(item.price),priceValue:String(item.price),priceCurrencyCode:'VK_VOTES',currencyLabel:language==='ru'?'гол.':'votes'}));
    },
    getPurchases:purchases,
    async purchase(productId){
      ensure();if(!products.has(productId))throw new Error('Unknown VK product');
      if((await purchases()).some(item=>item.productID===productId)){pendingPurchases.delete(productId);return {productID:productId};}
      if(!pendingPurchases.has(productId)){
        if(!await supported('VKWebAppShowOrderBox'))throw new Error('VK purchases unavailable on this client');
        const result=await bridge.send('VKWebAppShowOrderBox',{type:'item',item:productId});ensure();
        if(result?.status!=='success')throw new Error(result?.status==='cancel'?'VK purchase cancelled':'VK purchase failed');
        pendingPurchases.add(productId);
      }
      const deadline=Date.now()+Math.max(1,options.purchaseTimeoutMs??30000);
      do{
        const owned=await purchases();
        if(owned.some(item=>item.productID===productId)){pendingPurchases.delete(productId);return {productID:productId};}
        if(Date.now()>=deadline)break;
        await sleep(Math.min(options.pollIntervalMs??1000,Math.max(1,deadline-Date.now())));
      }while(!destroyed);
      throw new Error('VK purchase awaits server confirmation; retry purchase refresh');
    },
    async showAd(callbacks={}){
      ensure();if(advertising)throw new Error('VK advertisement already open');
      advertising=true;
      try{
        if(!await supported('VKWebAppShowNativeAds')||!(await send('VKWebAppCheckNativeAds',{ad_format:'interstitial'}))?.result){callbacks.onClose?.(false);return {wasShown:false};}
        callbacks.onOpen?.();
        const result=await bounded(()=>bridge.send('VKWebAppShowNativeAds',{ad_format:'interstitial'}),Math.max(timeoutMs,options.adTimeoutMs??120000),'VK advertisement');
        const wasShown=result?.result===true;callbacks.onClose?.(wasShown);return {wasShown};
      }catch(error){callbacks.onError?.(error);throw error;}
      finally{advertising=false;}
    },
    destroy(){if(destroyed)return;destroyed=true;playing=false;bridge.unsubscribe(onEvent);},
  };
}
