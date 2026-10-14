import {initializeYandexPlatform} from '../../dist/yandex-platform.js';
import {createCloudCareer} from '../../dist/cloud-career.js';
import {createPremiumSkins} from '../../dist/premium-skins.js';
import {createPauseState} from '../../dist/pause-state.js';

export async function createTestServices({platform}={}){
  platform??=await initializeYandexPlatform({development:true,language:'ru'});
  const cloud=createCloudCareer({platform,legacyStorage:null,writeDelayMs:0});
  const initial=await cloud.initialize(),pause=createPauseState();
  const premium=createPremiumSkins({platform,onBusy:value=>pause.set('payment',value)});
  await premium.initialize();
  return {platform,cloud,premium,pause,development:true,serverUrl:'',initialCareer:initial.career,settings:initial.settings};
}
