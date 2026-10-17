import {initializeYandexPlatform} from './yandex-platform.js';
import {bootstrapGame} from './platform-services.js';

const development=typeof __URBAN_DEVELOPMENT__==='undefined'?true:__URBAN_DEVELOPMENT__;
const serverUrl=typeof __MULTIPLAYER_URL__==='undefined'?'ws://127.0.0.1:8082/ws':__MULTIPLAYER_URL__;
await bootstrapGame({initializePlatform:initializeYandexPlatform,development,serverUrl});
