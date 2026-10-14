import {initializeYandexPlatform} from './yandex-platform.js';
import {createCloudCareer} from './cloud-career.js';
import {createPremiumSkins,PREMIUM_SKIN_IDS} from './premium-skins.js';
import {createPauseState} from './pause-state.js';

const development=typeof __URBAN_DEVELOPMENT__==='undefined'?true:__URBAN_DEVELOPMENT__;
const serverUrl=typeof __MULTIPLAYER_URL__==='undefined'?'ws://127.0.0.1:8081/ws':__MULTIPLAYER_URL__;
const pause=createPauseState();
const platform=await initializeYandexPlatform({development,
  onPause:()=>pause.set('platform',true),onResume:()=>pause.set('platform',false)});
const cloud=createCloudCareer({platform,onReplace:()=>{pause.set('cloud-reload',true);location.reload();}});
const initial=await cloud.initialize();
const premium=createPremiumSkins({platform,onBusy:value=>pause.set('payment',value)});
// Catalog failures leave premium buttons unavailable and ordinary play usable.
await premium.initialize().catch(error=>console.warn('Purchases currently unavailable',error));
const cached=premium.status.failed?initial.career.ownedSkinIds.filter(id=>PREMIUM_SKIN_IDS.includes(id)):[];
const allowed=new Set([...cached,...premium.ownedIds,...cloud.legacyPremiumIds]);
initial.career.ownedSkinIds=initial.career.ownedSkinIds.filter(id=>!PREMIUM_SKIN_IDS.includes(id)||allowed.has(id));
for(const id of allowed)if(!initial.career.ownedSkinIds.includes(id))initial.career.ownedSkinIds.push(id);
if(!initial.career.ownedSkinIds.includes(initial.career.characterId))initial.career.characterId='bacon';
const loadedSettings=initial.settings;
if(!loadedSettings.language)loadedSettings.language=platform.language;
window.__urbanServices={platform,cloud,premium,pause,serverUrl,development,initialCareer:initial.career,settings:loadedSettings};
window.addEventListener('online',()=>{void cloud.flush();void premium.initialize().catch(error=>console.warn('Purchase refresh failed',error));});
await import('./app.js');
