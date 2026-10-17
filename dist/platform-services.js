import {createCloudCareer} from './cloud-career.js';
import {createPremiumSkins,PREMIUM_SKIN_IDS} from './premium-skins.js';
import {createPauseState} from './pause-state.js';

export async function createGameServices({platform,development=false,serverUrl='',pause=createPauseState()}={}) {
  const cloud=createCloudCareer({platform,...(platform.id==='vk'?{legacyStorage:null}:{}),onReplace:()=>{pause.set('cloud-reload',true);globalThis.location.reload();}});
  const initial=await cloud.initialize();
  const premium=createPremiumSkins({platform,onBusy:value=>pause.set('payment',value)});
  await premium.initialize().catch(error=>console.warn('Purchases currently unavailable',error));
  const cached=platform.id!=='vk'&&premium.status.failed?initial.career.ownedSkinIds.filter(id=>PREMIUM_SKIN_IDS.includes(id)):[];
  const allowed=new Set([...cached,...premium.ownedIds,...(platform.id==='vk'?[]:cloud.legacyPremiumIds)]);
  initial.career.ownedSkinIds=initial.career.ownedSkinIds.filter(id=>!PREMIUM_SKIN_IDS.includes(id)||allowed.has(id));
  for(const id of allowed)if(!initial.career.ownedSkinIds.includes(id))initial.career.ownedSkinIds.push(id);
  if(!initial.career.ownedSkinIds.includes(initial.career.characterId))initial.career.characterId='bacon';
  const settings=initial.settings;
  if(!settings.language)settings.language=platform.language;
  return {platform,cloud,premium,pause,serverUrl,development,initialCareer:initial.career,settings};
}

export async function bootstrapGame({initializePlatform,development,serverUrl,platformOptions={},loadApp=()=>import('./app.js')}={}) {
  const pause=createPauseState();
  let services;
  const refreshPurchases=()=>{if(services)void services.premium.initialize().catch(error=>console.warn('Purchase refresh failed',error));};
  const platform=await initializePlatform({...platformOptions,development,onPause:()=>pause.set('platform',true),onResume:()=>{pause.set('platform',false);if(services?.platform.id==='vk')refreshPurchases();}});
  services=await createGameServices({platform,development,serverUrl,pause});
  window.__urbanServices=services;
  window.addEventListener('online',()=>{void services.cloud.flush();void services.premium.initialize().catch(error=>console.warn('Purchase refresh failed',error));});
  if(platform.id==='vk')window.addEventListener('focus',refreshPurchases);
  await loadApp();
  return services;
}
