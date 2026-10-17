import {initializeVkPlatform} from './vk-platform.js';
import {bootstrapGame} from './platform-services.js';

const development=typeof __URBAN_DEVELOPMENT__==='undefined'?false:__URBAN_DEVELOPMENT__;
const serverUrl=typeof __MULTIPLAYER_URL__==='undefined'?'':__MULTIPLAYER_URL__;
const apiUrl=typeof __VK_API_URL__==='undefined'?'':__VK_API_URL__;
await bootstrapGame({initializePlatform:initializeVkPlatform,development,serverUrl,platformOptions:{apiUrl}});
