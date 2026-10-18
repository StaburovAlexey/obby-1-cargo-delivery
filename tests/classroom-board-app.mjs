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

test('startup, trophy and physical board share one Yandex cache; return to hangar refreshes an expired cache without room traffic',async()=>{
 const originalNow=Date.now;let time=1000,reads=0,score=8765;Date.now=()=>time;
 const platform={id:'yandex',ready(){},gameplayStart(){},gameplayStop(){},showAd:async()=>({wasShown:false}),getLeaderboardStatus:async()=>({available:true,authorized:true}),
  getLeaderboardEntries:async()=>{reads++;return {entries:[{rank:3,score,player:{publicName:'Global Yandex driver'}}]};},getLeaderboardPlayerEntry:async()=>null};
 const f=createAppDom({startDriving:false,createCanvasContext:createRecordingCanvasContext,services:{development:false,serverUrl:'',platform}});
 try{
  const d=f.debug;await d.driftLeaderboard.load();assert.equal(reads,1);assert.equal(d.canyon.leaderboard,d.driftLeaderboard);
  d.gameplay.state.player={x:-41,z:47,heading:0};f.frame(1500);
  const context=d.garage.roomBoard.mesh.material.map.image.getContext('2d');assert.ok(context.texts.some(t=>t.text==='Global Yandex driver'));assert.equal(d.online,null);
  await d.hangarLeaderboardUi.open();assert.equal(reads,1);assert.equal(f.ids.get('hangar-drift-rows').children[0].children[1].textContent,'Global Yandex driver');d.hangarLeaderboardUi.close();
  d.returnToGarage();await d.driftLeaderboard.load();assert.equal(reads,1,'fast returns are cache hits');
  time+=30001;score=9876;d.returnToGarage();await d.driftLeaderboard.load();assert.equal(reads,2,'a later return refreshes the shared cache');
  d.gameplay.state.player={x:-41,z:47,heading:0};context.texts.length=0;f.frame(2500);assert.ok(context.texts.some(t=>t.text.replace(/\s/g,'')==='9876'));
  await d.hangarLeaderboardUi.open();assert.equal(reads,2);assert.equal(f.ids.get('hangar-drift-rows').children[0].children[2].textContent.replace(/\s/g,''),'9876');
 }finally{f.dispose();Date.now=originalNow;}
});
