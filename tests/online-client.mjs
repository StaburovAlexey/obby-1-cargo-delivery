import assert from 'node:assert/strict';
import test from 'node:test';
import {createOnlineClient} from '../dist/online-client.js';
import {createInitialPlayerState,PROTOCOL_VERSION,encodeDeltaPacket,decodeStatePacket} from '../dist/online-protocol.js';
const initial=overrides=>({...createInitialPlayerState(),...overrides});
const player=(id,slot,state={})=>({id,slot,number:slot+1,cadenceMs:100,state:initial(state)});
function fixture(){
  class Socket{
    static instances=[];readyState=0;bufferedAmount=0;sent=[];
    constructor(url){this.url=url;Socket.instances.push(this);}
    send(data){this.sent.push(typeof data==='string'?JSON.parse(data):data);}
    open(){this.readyState=1;this.onopen?.();}
    receive(data){this.onmessage?.({data:data instanceof Uint8Array?data.buffer:JSON.stringify(data)});}
    close(){this.readyState=3;this.onclose?.();}
  }
  const timers=new Map(),snapshots=[],statuses=[];let timerId=0,state=initial();
  const client=createOnlineClient({url:'ws://localhost/ws',WebSocketClass:Socket,getState:()=>state,onSnapshot:s=>snapshots.push(s),onStatus:s=>statuses.push(s),setTimer:(fn,ms)=>{const id=++timerId;timers.set(id,{fn:()=>{timers.delete(id);fn();},ms});return id;},clearTimer:id=>timers.delete(id)});
  client.start();const socket=Socket.instances.at(-1);socket.open();
  const welcome=(ws=socket,extra={})=>ws.receive({type:'welcome',version:PROTOCOL_VERSION,id:'self',roomId:'one',sequence:0,players:[player('self',0),player('peer',1)],seats:{},time:10,...extra});
  return {client,socket,Socket,timers,snapshots,statuses,welcome,set(patch){state={...state,...patch};},packets:()=>socket.sent.filter(p=>p instanceof Uint8Array)};
}
test('joins v2, sends 51-byte10Hz motion and suppresses stationary uploads to1Hz',()=>{
  const f=fixture();assert.deepEqual(f.socket.sent[0],{type:'join',version:PROTOCOL_VERSION});assert.equal(f.socket.binaryType,'arraybuffer');f.welcome();
  f.client.update(0);assert.equal(f.packets().length,1);assert.equal(f.packets()[0].length,51);
  for(let i=0;i<120;i++)f.client.update(1/60);assert.equal(f.packets().length,3,'initial plus two heartbeat uploads');
  let lastSeq=decodeStatePacket(f.packets().at(-1)).seq;f.set({position:[1,0,0],speed:5});f.client.update(1/60);assert.equal(decodeStatePacket(f.packets().at(-1)).seq,lastSeq+1,'stationary resume is next-frame immediate');
  const before=f.packets().length;for(let i=0;i<120;i++){f.set({position:[1+i*.1,0,0]});f.client.update(1/60);}assert.equal(f.packets().length-before,20);
  lastSeq=decodeStatePacket(f.packets().at(-1)).seq;f.set({paused:true});f.client.update(0);assert.equal(decodeStatePacket(f.packets().at(-1)).seq,lastSeq+1);
  f.set({characterId:'pack1'});f.client.update(0);assert.equal(f.socket.sent.at(-1).type,'profile');assert.equal(f.socket.sent.at(-1).state.characterId,'pack1');f.client.dispose();assert.equal(f.timers.size,0);
});
test('reconstructs complete roster from deltas, keeps far map peers, and resyncs missing sequence atomically',()=>{
  const f=fixture();f.welcome();const own=f.client.roomSnapshot.players[0];
  f.socket.receive(encodeDeltaPacket({sequence:1,time:20,players:[{slot:1,cadenceMs:500,state:initial({seq:2,position:[999,0,0]})}]}));
  assert.equal(f.client.roomSnapshot.players.length,2);assert.equal(f.client.roomSnapshot.players[0],own);assert.equal(f.client.players[0].state.position[0],999);assert.equal(f.client.players[0].cadenceMs,500);
  f.socket.receive({type:'roster',sequence:3,time:30,players:[player('new',2)]});assert.equal(f.socket.sent.at(-1).type,'resync');assert.equal(f.client.roomSnapshot.players.length,2);
  f.socket.receive(encodeDeltaPacket({sequence:4,time:40,players:[{slot:2,cadenceMs:100,state:initial({seq:1})}]}));assert.equal(f.socket.sent.filter(p=>p.type==='resync').length,1);
  f.socket.receive({type:'snapshot',version:PROTOCOL_VERSION,id:'self',roomId:'one',sequence:5,time:50,players:[player('self',0),player('new',2)],seats:{}});
  assert.equal(f.client.players[0].id,'new');assert.equal(f.timers.size,0);
  f.socket.receive({type:'roster',sequence:6,time:60,left:[{id:'new',slot:2}],seats:{}});assert.equal(f.client.players.length,0);
  f.socket.receive({type:'roster',sequence:7,time:70,players:[player('replacement',2,{characterId:'pack1'})]});assert.equal(f.client.players[0].id,'replacement');assert.equal(f.client.players[0].state.characterId,'pack1');f.client.dispose();
});
test('rejects unknown delta slots, malformed packets and conflicting static identities',()=>{
  for(const packet of [encodeDeltaPacket({sequence:1,time:20,players:[{slot:2,cadenceMs:100,state:initial()}]}),new Uint8Array([0xd7,2,2,20]),{type:'roster',sequence:1,time:20,players:[player('intruder',1)]}]){
    const f=fixture();f.welcome();f.socket.receive(packet);assert.equal(f.socket.sent.at(-1).type,'resync');assert.equal(f.client.players[0].id,'peer');f.client.dispose();
  }
});
test('exclusive seat requests settle on timeout, cancellation, backpressure and reconnect without stale state',async()=>{
  const f=fixture();f.welcome();const claim=f.client.claimSeat();assert.equal(claim,f.client.claimSeat());const request=f.socket.sent.at(-1);
  f.socket.receive({type:'seat:result',requestId:request.requestId,ok:true,seatId:'desk-01'});assert.equal(await claim,'desk-01');assert.equal(f.client.seatId,'desk-01');
  f.client.releaseSeat();assert.equal(f.client.seatId,null);assert.equal(f.socket.sent.at(-1).type,'seat:release');
  const canceled=f.client.claimSeat(),cancelId=f.socket.sent.at(-1).requestId;f.client.releaseSeat();assert.equal(await canceled,null);f.socket.receive({type:'seat:result',requestId:cancelId,ok:true,seatId:'desk-02'});assert.equal(f.client.seatId,null);
  const interrupted=f.client.claimSeat();f.socket.close();assert.equal(await interrupted,null);assert.equal(f.client.roomSnapshot,null);assert.equal(f.client.players.length,0);
  [...f.timers.values()].find(t=>t.ms===1000).fn();const next=f.Socket.instances.at(-1);next.open();f.welcome(next,{id:'new',roomId:'two',players:[player('new',0)]});assert.equal(f.client.roomId,'two');
  const timeout=f.client.claimSeat();[...f.timers.values()].find(t=>t.ms===8000).fn();assert.equal(await timeout,null);assert.equal(f.client.connected,false);f.client.dispose();assert.equal(f.timers.size,0);
  const slow=fixture();slow.welcome();slow.socket.bufferedAmount=100000;slow.client.releaseSeat();assert.equal(slow.client.connected,false);slow.client.dispose();
});
test('resync watchdog and invalid welcome close safely; old socket events cannot overwrite a new session',()=>{
  const f=fixture();f.welcome();f.socket.receive(new Uint8Array([1]));[...f.timers.values()].find(t=>t.ms===5000).fn();assert.equal(f.client.connected,false);
  [...f.timers.values()].find(t=>t.ms===1000).fn();const next=f.Socket.instances.at(-1);next.open();f.welcome(next,{id:'new',players:[player('new',0)]});f.socket.receive({type:'welcome',id:'old'});assert.equal(f.client.id,'new');f.client.dispose();
  const invalid=fixture();invalid.welcome(invalid.socket,{version:1});assert.equal(invalid.client.connected,false);assert.equal(invalid.socket.readyState,3);invalid.client.dispose();
});

test('repeated start during reconnect does not create overlapping sockets',()=>{
  const f=fixture();f.welcome();f.client.start();assert.equal(f.Socket.instances.length,1);
  f.socket.close();f.client.start();f.client.start();assert.equal(f.Socket.instances.length,1,'pending retry owns reconnect');
  [...f.timers.values()].find(t=>t.ms===1000).fn();assert.equal(f.Socket.instances.length,2);f.client.start();assert.equal(f.Socket.instances.length,2);f.client.dispose();assert.equal(f.timers.size,0);
});

test('text JSON cannot enter the trusted binary delta fast path',()=>{
  const f=fixture();f.welcome();
  f.socket.receive({type:'delta',sequence:1,time:20,players:[{slot:1,cadenceMs:-1,state:{position:[],characterId:'unknown',seatId:'desk-20'}}]});
  assert.equal(f.socket.sent.at(-1).type,'resync');assert.equal(f.client.players[0].state.characterId,'bacon');assert.deepEqual(f.client.players[0].state.position,[0,0,0]);assert.equal(f.client.players[0].state.seatId,null);f.client.dispose();
});
