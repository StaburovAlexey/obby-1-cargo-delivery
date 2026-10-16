import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import WebSocket from 'ws';
import * as THREE from '../dist/vendor/three.module.js';
import {createRoomServer} from '../server/room-server.mjs';
import {createOnlineSession} from '../dist/online-session.js';
import {createGameplay} from '../dist/gameplay.js';
import {CLASSROOM_DESKS,CLASSROOM_ENTRIES} from '../dist/garage-scene.js';
import {createPauseState} from '../dist/pause-state.js';

const server=createRoomServer({port:0});
const address=await server.listen();
const previousWebSocket=globalThis.WebSocket;
globalThis.WebSocket=WebSocket;
const g=createGameplay({desks:CLASSROOM_DESKS});
g.state.player={...CLASSROOM_ENTRIES[0],heading:0};
let input={x:0,z:-1};
const session=createOnlineSession({THREE,scene:new THREE.Scene(),serverUrl:`ws://127.0.0.1:${address.port}/ws`,pause:createPauseState(),
  getContext:()=>({gameplay:g,paused:false}),
  onSeatChange:()=>{for(const event of g.events())if(event.type==='sit')input={x:0,z:0};},
});
async function until(condition){for(let i=0;i<100;i++){if(condition())return;await delay(10);}throw Error('Timed out');}
try{
 session.bindGameplay(g);session.start();await until(()=>session.client.connected);
 g.sitAtSchool('school-1');await until(()=>g.state.seatedId);
 g.walk(1/60,input);
 assert.equal(g.state.seatedId,'desk-01','server-confirmed seating must reset held movement before the next walking frame');
 g.walk(1/60,{x:1,z:0});
 assert.equal(g.state.seatedId,null,'new movement still stands up');
 console.log('PASS online seating with held movement and explicit stand-up');
}finally{session.dispose();await server.close();globalThis.WebSocket=previousWebSocket;}
