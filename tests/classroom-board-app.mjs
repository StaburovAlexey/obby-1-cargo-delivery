import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {createRoomServer} from '../server/room-server.mjs';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createRecordingCanvasContext} from './fixtures/classroom-canvas.mjs';

test('the running app paints its physical classroom board from the live room and stops painting away from class',async()=>{
 const server=createRoomServer();await server.listen();
 const originalSocket=globalThis.WebSocket;globalThis.WebSocket=WebSocket;
 const platform={ready(){},gameplayStart(){},gameplayStop(){},showAd:async()=>({wasShown:false})};
 const f=createAppDom({startDriving:false,createCanvasContext:createRecordingCanvasContext,
  services:{serverUrl:`ws://127.0.0.1:${server.httpServer.address().port}/ws`,platform}});
 try{
  const d=f.debug,board=d.garage.roomBoard;assert.ok(board,'the garage owns a live classroom board');
  assert.equal(board.mesh.parent,d.garage.hangar);
  d.online.start();
  for(let i=0;i<100&&!d.online.client.connected;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(d.online.client.connected,true);
  d.gameplay.state.player={x:-41,z:47,heading:0};f.frame(1500);
  const context=board.mesh.material.map.image.getContext('2d');
  assert.ok(context.texts.some(t=>t.text==='1/20'),'the physical board receives the online session snapshot');
  assert.equal(context.dots.length,0,'the local observer has no map dot');
  const version=board.mesh.material.map.version;
  d.gameplay.state.player={x:1000,z:-1000,heading:0};f.frame(2500);
  assert.equal(board.mesh.material.map.version,version);
  let disposed=0;board.mesh.material.map.addEventListener('dispose',()=>disposed++);
  d.rebuild(42);assert.equal(disposed,1);assert.notEqual(d.garage.roomBoard,board);assert.equal(board.mesh.parent,null);
 }finally{f.dispose();await server.close();globalThis.WebSocket=originalSocket;}
});
