import test from 'node:test';
import assert from 'node:assert/strict';
import {createOnlineClient} from '../dist/online-client.js';
import {PROTOCOL_VERSION,createInitialPlayerState,encodeDeltaPacket} from '../dist/online-protocol.js';

test('the map reuses the complete reconstructed room roster across sparse deltas, removals and reconnects',()=>{
 let socket;
 class Socket {
  readyState=1;bufferedAmount=0;
  constructor(){socket=this;}
  send(){}
  close(){this.onclose?.();}
  receive(message){this.onmessage({data:message instanceof Uint8Array?message:JSON.stringify(message)});}
 }
 const timers=new Map();let nextTimer=0;
 const client=createOnlineClient({url:'ws://room',WebSocketClass:Socket,getState:()=>({...createInitialPlayerState(),position:[999,0,999]}),
  setTimer:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimer:id=>timers.delete(id)});
 client.start();socket.onopen();
 const self={id:'self',slot:0,number:1,cadenceMs:100,state:{...createInitialPlayerState(),position:[-41,0,47]}},peer={id:'peer',slot:1,number:2,cadenceMs:500,state:{...createInitialPlayerState(),position:[200,0,-300]}};
 socket.receive({type:'welcome',version:PROTOCOL_VERSION,sequence:0,id:'self',roomId:'one',players:[self,peer],seats:{},time:100});
 assert.ok(client.roomSnapshot);assert.deepEqual(client.roomSnapshot.players,[self,peer]);assert.equal(client.players.length,1);
 assert.equal(client.roomSnapshot.selfId,'self');assert.equal(client.roomSnapshot.roomId,'one');assert.equal(Object.hasOwn(client.roomSnapshot,'driftLeaderboard'),false);
 socket.receive(encodeDeltaPacket({sequence:1,time:200,players:[{...peer,state:{...peer.state,seq:1,position:[220,0,-300]}}]}));
 assert.equal(client.roomSnapshot.players.length,2,'a sparse delta retains known room members');assert.deepEqual(client.roomSnapshot.players[0],self);assert.deepEqual(client.players[0].state.position,[220,0,-300]);
 socket.receive({type:'roster',sequence:2,time:300,left:[{id:'peer',slot:1}],seats:{}});
 assert.equal(client.roomSnapshot.players.length,1);assert.equal(client.players.length,0);
 socket.close();assert.equal(client.roomSnapshot,null);
 [...timers.values()].at(-1)();socket.onopen();
 socket.receive({type:'welcome',version:PROTOCOL_VERSION,sequence:0,id:'new',roomId:'two',players:[{...self,id:'new',number:1}],seats:{},time:400});
 assert.equal(client.roomSnapshot.roomId,'two');assert.equal(client.roomSnapshot.selfId,'new');assert.equal(Object.hasOwn(client.roomSnapshot,'driftLeaderboard'),false);
 client.dispose();assert.equal(client.roomSnapshot,null);
});
