export default async function(page){
  const errors=[],missing=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)missing.push({url:response.url(),status:response.status()});});
  await page.context().addInitScript(()=>{
    const handlers=new Map(),copy=value=>JSON.parse(JSON.stringify(value));
    const state={cloud:null,writes:0,localWrites:0,ready:[],starts:0,stops:0,ads:0,purchases:[],purchaseCalls:0,offlinePurchases:false};
    window.__sdkTest=state;
    state.emit=name=>{for(const callback of handlers.get(name)||[])callback();};
    const products=['dancing-npc-girl','jandel','kreekcraft','spyder-sammy','spider-man'].map(id=>({id:'skin_'+id,price:'39 TST',priceValue:'39',priceCurrencyCode:'TST',getPriceCurrencyImage(){return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="12" height="12"%3E%3Ccircle cx="6" cy="6" r="5" fill="gold"/%3E%3C/svg%3E';}}));
    const sdk={environment:{i18n:{lang:'en'}},on(name,callback){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(callback);},off(name,callback){handlers.get(name)?.delete(callback);},features:{LoadingAPI:{ready(){state.ready.push({playable:!!window.__sceneDebug?.startup.ready,frame:window.__sceneDebug?.renderer.info.render.frame});}},GameplayAPI:{start(){state.starts++;},stop(){state.stops++;}}},
      async getPlayer(){return {async getData(){return copy(state.cloud?{urbanRouteSave:state.cloud}:{});},async setData(data){state.writes++;state.cloud=copy(data.urbanRouteSave);}};},
      async getPayments(){return {async getCatalog(){return products;},async getPurchases(){if(state.offlinePurchases)throw Error('Mock entitlement service unavailable');return copy(state.purchases);},purchase({id}){state.purchaseCalls++;return new Promise(resolve=>{state.confirmPurchase=()=>{const purchase={productID:id,purchaseToken:'mock-permanent'};state.purchases.push(purchase);resolve(purchase);};});}};},
      adv:{showFullscreenAdv({callbacks}){state.ads++;callbacks.onOpen();setTimeout(()=>callbacks.onClose(false),100);}},
    };
    window.YaGames={init:async()=>sdk};
    Storage.prototype.setItem=function(){state.localWrites++;throw Error('Browser storage writes forbidden in this scenario');};
  });
  await page.goto('http://127.0.0.1:18081/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__sceneDebug?.startup.ready,{},{timeout:90000});
  const boot=await page.evaluate(()=>({ready:window.__sdkTest.ready,development:window.__urbanServices.development,language:window.__sceneDebug.localization.language}));
  if(boot.development||boot.language!=='en'||boot.ready.length!==1||!boot.ready[0].playable||boot.ready[0].frame<1)throw Error('Production SDK ready/language contract failed');
  await page.evaluate(()=>{const d=window.__sceneDebug,g=d.gameplay,s=d.garage.stands[12];Object.assign(g.state.player,{x:s.trigger.x,z:s.trigger.z});g.state.skinPurchaseCandidateId='spider-man';g.state.cooldown=100;d.followCharacter(1,true);});
  await page.waitForFunction(()=>{const label=document.getElementById('buy-skin-label');return /\s39$/.test(label.textContent)&&!label.textContent.includes('TST')&&label.querySelector('.portal-currency-icon');});
  const price=await page.locator('#buy-skin-label').textContent();
  const money=await page.evaluate(()=>window.__sceneDebug.gameplay.state.money);
  await page.locator('#buy-skin').click();
  await page.waitForFunction(()=>window.__sdkTest.purchaseCalls===1);
  const pending=await page.evaluate(()=>({paused:window.__urbanServices.pause.reasons.has('payment'),owned:window.__sceneDebug.gameplay.isSkinOwned('spider-man')}));
  if(!pending.paused||pending.owned)throw Error('Unconfirmed payment granted a skin');
  await page.evaluate(()=>window.__sdkTest.confirmPurchase());
  await page.waitForFunction(()=>window.__sceneDebug.gameplay.isSkinOwned('spider-man'));
  if(await page.evaluate(()=>window.__sceneDebug.gameplay.state.money)!==money)throw Error('Premium purchase spent game money');
  await page.evaluate(()=>window.__sceneDebug.advertising.update(240,{active:true,safe:true}));
  const countdown=await page.locator('#ad-countdown').textContent();
  if(!countdown.includes('3'))throw Error('Missing full advertising warning');
  await page.waitForFunction(()=>window.__sdkTest.ads===1&&!window.__urbanServices.pause.reasons.has('advertising'),{},{timeout:30000});
  await page.evaluate(()=>window.__sdkTest.emit('game_api_pause'));
  const paused=await page.evaluate(()=>({paused:window.__urbanServices.pause.reasons.has('platform'),stops:window.__sdkTest.stops}));
  if(!paused.paused||!paused.stops)throw Error('SDK pause failed');
  await page.evaluate(()=>window.__sdkTest.emit('game_api_resume'));
  await page.evaluate(()=>window.__urbanServices.cloud.flush());
  const result=await page.evaluate(()=>({writes:window.__sdkTest.writes,localWrites:window.__sdkTest.localWrites,cloudOwnsPremium:window.__sdkTest.cloud.career.ownedSkinIds.includes('spider-man'),ads:window.__sdkTest.ads,purchases:window.__sdkTest.purchaseCalls,pauseReasons:[...window.__urbanServices.pause.reasons]}));
  if(result.localWrites||!result.cloudOwnsPremium||result.pauseReasons.length)throw Error('Cloud ownership or pause cleanup failed');
  await page.screenshot({path:'/home/gilbertfrost/storage/dev/obby-cargo-delivery/output/playwright/yandex-production-mock.png'});
  if(errors.length||missing.length)throw Error(JSON.stringify({errors,missing}));
  return {mode:'production build with injected SDK mock, no real payments/ads',boot,price,pending,countdown,result,errors,missing};
}
