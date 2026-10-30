import {PREMIUM_COSMETIC_PRODUCTS,premiumCosmeticProductId} from './shop-cosmetics.js';
import {VEHICLE_NEON_CATALOG} from './vehicle-neon-catalog.js';
import {createCloudCareer} from './cloud-career.js';
import {createPremiumSkins,PREMIUM_SKIN_IDS} from './premium-skins.js';
import {createPauseState} from './pause-state.js';
import {installBrowserGestureGuard} from './browser-gestures.js';

export async function createGameServices({platform,development=false,serverUrl='',pause=createPauseState()}={}) {
  const cloud=createCloudCareer({platform,...(platform.id==='vk'?{legacyStorage:null}:{}),onReplace:()=>{pause.set('cloud-reload',true);globalThis.location.reload();}});
  const initial=await cloud.initialize();
  const premium=createPremiumSkins({platform,onBusy:value=>pause.set('payment',value)});
  await premium.initialize().catch(error=>console.warn('Purchases currently unavailable',error));
  const neon=createPremiumSkins({platform,ids:VEHICLE_NEON_CATALOG.filter(x=>x.currency==='yandex').map(x=>x.id),productId:id=>`neon_${id}`,onBusy:value=>pause.set('neon-payment',value)});
  await neon.initialize();
  initial.career.ownedNeonIds=initial.career.ownedNeonIds.filter(id=>!VEHICLE_NEON_CATALOG.find(x=>x.id===id&&x.currency==='yandex')||neon.ownedIds.has(id)||neon.status.failed);
  for(const id of neon.ownedIds)if(!initial.career.ownedNeonIds.includes(id))initial.career.ownedNeonIds.push(id);
  if(!initial.career.ownedNeonIds.includes(initial.career.selectedNeonId))initial.career.selectedNeonId=null;
  const cached=platform.id!=='vk'&&premium.status.failed?initial.career.ownedSkinIds.filter(id=>PREMIUM_SKIN_IDS.includes(id)):[];
  const allowed=new Set([...cached,...premium.ownedIds,...(platform.id==='vk'?[]:cloud.legacyPremiumIds)]);
  initial.career.ownedSkinIds=initial.career.ownedSkinIds.filter(id=>!PREMIUM_SKIN_IDS.includes(id)||allowed.has(id));
  for(const id of allowed)if(!initial.career.ownedSkinIds.includes(id))initial.career.ownedSkinIds.push(id);
  if(!initial.career.ownedSkinIds.includes(initial.career.characterId))initial.career.characterId='bacon';
  const liveries=createPremiumSkins({platform,ids:PREMIUM_COSMETIC_PRODUCTS.map(item=>item.key),productId:premiumCosmeticProductId,onBusy:value=>pause.set('livery-payment',value)});
  await liveries.initialize();
  if(!liveries.status.failed)initial.career.cosmetics.premiumOwned=[...liveries.ownedIds];
  for(const [vehicleId,id]of Object.entries(initial.career.cosmetics.liveries)){
    const key=`livery:${vehicleId}:${id}`,paid=PREMIUM_COSMETIC_PRODUCTS.some(item=>item.key===key);
    if(paid&&!initial.career.cosmetics.owned.includes(key)&&!initial.career.cosmetics.premiumOwned.includes(key))delete initial.career.cosmetics.liveries[vehicleId];
  }
  for(const type of ['smoke','tracks']){
    const key=`${type}:${initial.career.cosmetics[type]}`;
    if(PREMIUM_COSMETIC_PRODUCTS.some(item=>item.key===key)&&!initial.career.cosmetics.owned.includes(key)&&!initial.career.cosmetics.premiumOwned.includes(key))initial.career.cosmetics[type]='standard';
  }
  const settings=initial.settings;
  if(!settings.language)settings.language=platform.language;
  return {platform,cloud,premium,neon,liveries,pause,serverUrl,development,initialCareer:initial.career,settings};
}

export async function bootstrapGame({initializePlatform,development,serverUrl,platformOptions={},loadApp=()=>import('./app.js')}={}) {
  installBrowserGestureGuard();
  const pause=createPauseState();
  let services;
  const refreshPurchases=()=>{if(services){void services.premium.initialize();void services.neon.initialize();void services.liveries.initialize();}};
  const platform=await initializePlatform({...platformOptions,development,onPause:()=>pause.set('platform',true),onResume:()=>{pause.set('platform',false);if(services?.platform.id==='vk')refreshPurchases();}});
  services=await createGameServices({platform,development,serverUrl,pause});
  window.__urbanServices=services;
  window.addEventListener('online',()=>{void services.cloud.flush();refreshPurchases();});
  if(platform.id==='vk')window.addEventListener('focus',refreshPurchases);
  await loadApp();
  return services;
}
