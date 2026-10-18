import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from 'ws';
import {createRoomServer} from '../server/room-server.mjs';
import {PROTOCOL_VERSION,createInitialPlayerState,decodeDeltaPacket} from '../dist/online-protocol.js';

test('the board receives room membership and movement without room rankings or score verification',async t=>{
 const server=createRoomServer({maxMessagesPerSecond:10000});await server.listen();
 const clients=[];t.after(async()=>{for(const c of clients)c.ws.terminate();await server.close();});
 async function join(){
  const ws=new WebSocket(`ws://127.0.0.1:${server.httpServer.address().port}/ws`),messages=[];
  ws.on('message',(raw,binary)=>messages.push(binary?decodeDeltaPacket(raw):JSON.parse(raw)));
  await once(ws,'open');
  const c={ws,messages,send:value=>ws.send(JSON.stringify(value)),async wait(match){
   const end=Date.now()+3000;
   while(Date.now()<end){const found=messages.findIndex(match);if(found>=0)return messages.splice(found,1)[0];await new Promise(r=>setTimeout(r,5));}
   throw Error('room response timeout');
  }};
  clients.push(c);c.send({type:'join',version:PROTOCOL_VERSION});c.welcome=await c.wait(m=>m?.type==='welcome');return c;
 }
 const driver=await join(),viewer=await join();
 assert.equal(driver.welcome.players[0].number,1);
 assert.equal(viewer.welcome.players.find(p=>p.id===viewer.welcome.id).number,2);
 assert.equal(Object.hasOwn(viewer.welcome,'driftLeaderboard'),false);
 const state={...createInitialPlayerState(),seq:1,mode:'driving',vehicleId:'bmwreward',position:[700,0,-400]};
 driver.send({type:'profile',state});
 const update=await viewer.wait(m=>m?.type==='roster'&&m.players?.some(p=>p.id===driver.welcome.id&&p.state.seq===1));
 assert.deepEqual(update.players[0].state.position,[700,0,-400]);assert.equal(Object.hasOwn(update,'driftLeaderboard'),false);
 const invalid=server.getStats().invalidMessages;
 driver.send({type:'drift:finish',requestId:'forged',runId:'fake',score:99999999});
 for(let i=0;i<100&&server.getStats().invalidMessages===invalid;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(server.getStats().invalidMessages,invalid+1,'obsolete scoring RPC is rejected');
 assert.ok(!driver.messages.some(m=>m?.type==='drift:result'));
 driver.ws.terminate();const left=await viewer.wait(m=>m?.type==='roster'&&m.left?.some(p=>p.id===driver.welcome.id));
 assert.equal(Object.hasOwn(left,'driftLeaderboard'),false);
 const newcomer=await join();assert.equal(newcomer.welcome.roomId,viewer.welcome.roomId);assert.equal(newcomer.welcome.players.find(p=>p.id===newcomer.welcome.id).number,3,'display numbers stay stable when a slot is reused');
 assert.ok(newcomer.welcome.players.every(p=>!Object.hasOwn(p,'score')));
});
