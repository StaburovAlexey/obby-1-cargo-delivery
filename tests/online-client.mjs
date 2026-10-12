import assert from 'node:assert/strict';
import {createOnlineClient} from '../dist/online-client.js';

class Socket {
  static instances=[];
  readyState=0; bufferedAmount=0; sent=[];
  constructor(url){this.url=url;Socket.instances.push(this);}
  send(text){this.sent.push(JSON.parse(text));}
  open(){this.readyState=1;this.onopen?.();}
  receive(data){this.onmessage?.({data:JSON.stringify(data)});}
  close(){this.readyState=3;this.onclose?.();}
}
const timers=new Map();let timerId=0;
const snapshots=[],statuses=[];
const client=createOnlineClient({url:'ws://localhost/ws',WebSocketClass:Socket,
  getState:()=>({position:[0,0,0]}),onSnapshot:s=>snapshots.push(s),onStatus:s=>statuses.push(s),
  setTimer:fn=>{timers.set(++timerId,fn);return timerId;},clearTimer:id=>timers.delete(id)});
client.start();let socket=Socket.instances.at(-1);socket.open();
assert.deepEqual(socket.sent[0],{type:'join',version:1});
socket.receive({type:'welcome',id:'self',roomId:'one',players:[{id:'self',state:{}},{id:'other',state:{}}],seats:{},time:10});
assert(client.connected);assert.equal(client.id,'self');assert.equal(client.players.length,1);
client.update(.1);assert.equal(socket.sent.at(-1).type,'state');assert.equal(socket.sent.at(-1).state.seq,1);
const claim=client.claimSeat();const request=socket.sent.at(-1);
socket.receive({type:'seat:result',requestId:request.requestId,ok:true,seatId:'desk-01'});
assert.equal(await claim,'desk-01');assert.equal(client.seatId,'desk-01');
client.releaseSeat();assert.equal(client.seatId,null);assert.equal(socket.sent.at(-1).type,'seat:release');
const interrupted=client.claimSeat();socket.close();assert.equal(await interrupted,null);
assert(!client.connected);assert.equal(client.players.length,0);assert(snapshots.at(-1).players.length===0);
const retry=[...timers.values()].at(-1);timers.clear();retry();socket=Socket.instances.at(-1);socket.open();
socket.receive({type:'welcome',id:'new',roomId:'two',players:[],seats:{},time:20});assert(client.connected);
const cancelled=client.claimSeat(),cancelledId=socket.sent.at(-1).requestId;client.releaseSeat();
assert.equal(await cancelled,null);
socket.receive({type:'seat:result',requestId:cancelledId,ok:true,seatId:'desk-02'});assert.equal(client.seatId,null);
const before=socket.sent.filter(m=>m.type==='state').length;for(let i=0;i<120;i++)client.update(1/60);
assert.equal(socket.sent.filter(m=>m.type==='state').length-before,20,'10Hz must not depend on render frame rate');
socket.bufferedAmount=100000;client.releaseSeat();assert(!client.connected,'failed release must invalidate the connection holding the seat');
client.dispose();assert(!client.connected);assert.equal(timers.size,0);
console.log('PASS online client: handshake, pacing, full snapshots, exclusive-seat requests, disconnect cleanup and reconnect.');
