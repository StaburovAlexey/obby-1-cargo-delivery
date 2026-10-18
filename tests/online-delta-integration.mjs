import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {setTimeout as delay} from 'node:timers/promises';
import {createRoomServer} from '../server/room-server.mjs';
import {createOnlineClient} from '../dist/online-client.js';
import {createInitialPlayerState} from '../dist/online-protocol.js';

async function until(predicate,label,timeout=6000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){if(predicate())return;await delay(10);}
 assert.fail(`Timed out: ${label}`);
}
async function fixture(t){
 const server=createRoomServer();const address=await server.listen();const clients=[];
 const interval=setInterval(()=>clients.forEach(c=>c.client.update(.02)),20);
 t.after(async()=>{clearInterval(interval);clients.forEach(c=>c.client.dispose());await server.close();});
 const join=async(position=[0,0,0],Socket=WebSocket)=>{
  const record={state:{...createInitialPlayerState(),position},snapshots:[]};
  record.client=createOnlineClient({url:`ws://127.0.0.1:${address.port}/ws`,WebSocketClass:Socket,getState:()=>record.state,onSnapshot:s=>record.snapshots.push(s)});
  clients.push(record);record.client.start();await until(()=>record.client.connected,'connect');return record;
 };
 return {server,join};
}

test('production clients retain far stationary map players and reconcile joins, seats and leaves',async t=>{
 const {join}=await fixture(t);const a=await join(),b=await join([500,0,-500]);
 await until(()=>a.client.players.some(p=>p.id===b.client.id&&Math.abs(p.state.position[0]-500)<.03),'far map pose');
 assert.equal(a.client.roomSnapshot.players.length,2);
 const seat=await b.client.claimSeat();assert.ok(seat);
 b.state={...b.state,mode:'studying',seatId:seat,paused:true};
 await until(()=>a.client.seats[seat]===b.client.id&&a.client.players[0]?.state.mode==='studying','seated stationary pose');
 await delay(1200);assert.equal(a.client.players.length,1,'no timeout-based removal of quiet players');
 b.client.releaseSeat();b.state={...b.state,mode:'walking',seatId:null,paused:false,teleportId:1,position:[2,0,2]};
 await until(()=>!a.client.seats[seat]&&a.client.players[0]?.state.teleportId===1,'release and teleport');
 const formerId=b.client.id;b.client.dispose();
 await until(()=>!a.client.players.some(p=>p.id===formerId),'explicit departure');
 assert.equal(a.client.roomSnapshot.players.length,1);
});

test('a lost binary frame triggers recovery without losing the complete roster',async t=>{
 let dropped=0,armed=false;
 class LossySocket extends WebSocket {
  emit(event,...args){if(event==='message'&&args[1]===true&&armed&&!dropped){dropped++;return true;}return super.emit(event,...args);}
 }
 const {join}=await fixture(t);const a=await join([0,0,0],LossySocket),b=await join([1,0,1]);
 await until(()=>a.client.players.length===1,'initial roster');armed=true;
 for(let i=1;i<=15;i++){b.state={...b.state,position:[i,0,i],speed:2};await delay(110);}
 b.state={...b.state,position:[15,0,15],speed:0};
 await until(()=>a.client.players[0]?.state.position[0]===15,'resynchronized final pose');
 assert.equal(dropped,1);assert.equal(a.client.roomSnapshot.players.length,2);
 assert.equal(new Set(a.client.roomSnapshot.players.map(p=>p.id)).size,2);
});
