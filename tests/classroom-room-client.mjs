import test from 'node:test';
import assert from 'node:assert/strict';
import {createOnlineClient} from '../dist/online-client.js';
import {createInitialPlayerState} from '../dist/online-protocol.js';

test('the board receives the complete server roster including self and clears it on reconnect',()=>{
 let socket;
 class Socket {
  readyState=1;bufferedAmount=0;
  constructor(){socket=this;}
  send(){}
  close(){this.onclose?.();}
  receive(message){this.onmessage({data:JSON.stringify(message)});}
 }
 const timers=new Map();let nextTimer=0;
 const client=createOnlineClient({url:'ws://room',WebSocketClass:Socket,getState:()=>({...createInitialPlayerState(),position:[999,0,999]}),
  setTimer:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimer:id=>timers.delete(id)});
 client.start();socket.onopen();
 const self={id:'self',number:1,state:{...createInitialPlayerState(),position:[-41,0,47]}},peer={id:'peer',number:2,state:{...createInitialPlayerState(),position:[200,0,-300]}};
 socket.receive({type:'welcome',id:'self',roomId:'one',players:[self,peer],seats:{},driftLeaderboard:[{playerId:'peer',number:2,score:12345,durationMs:90000,maxCombo:3}],time:100});
 assert.ok(client.roomSnapshot,'the current room snapshot is available to the board');
 assert.deepEqual(client.roomSnapshot.players,[self,peer],'the local map marker must also use the room server pose');
 assert.equal(client.players.length,1,'remote character rendering still excludes self');
 assert.equal(client.roomSnapshot.selfId,'self');assert.equal(client.roomSnapshot.roomId,'one');
 assert.equal(client.roomSnapshot.driftLeaderboard[0].score,12345);
 socket.receive({type:'snapshot',players:[self],seats:{},driftLeaderboard:[],time:200});
 assert.equal(client.roomSnapshot.players.length,1);assert.deepEqual(client.roomSnapshot.driftLeaderboard,[]);
 socket.close();assert.equal(client.roomSnapshot,null);
 [...timers.values()].at(-1)();socket.onopen();
 socket.receive({type:'welcome',id:'new',roomId:'two',players:[{...self,id:'new',number:1}],seats:{},time:300});
 assert.equal(client.roomSnapshot.roomId,'two');assert.equal(client.roomSnapshot.selfId,'new');
 assert.deepEqual(client.roomSnapshot.driftLeaderboard,[],'an older server without a ranking cannot retain the old room ranking');
 client.dispose();assert.equal(client.roomSnapshot,null);
});
