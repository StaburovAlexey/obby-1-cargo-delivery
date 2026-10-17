import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from 'ws';
import {createDriftVerifier} from '../server/drift-verifier.mjs';
import {createRoomServer} from '../server/room-server.mjs';
import {canyonPointAt} from '../dist/canyon-track.js';
import {createInitialPlayerState} from '../dist/online-protocol.js';
import {createOnlineClient} from '../dist/online-client.js';
const state=s=>{const p=canyonPointAt(s);return {...createInitialPlayerState(),mode:'driving',vehicleId:'bmwreward',position:[p.x,p.height,p.z],heading:p.heading+.5,speed:20};};

test('the server derives a complete score from observed movement rather than a claimed score',()=>{
 const run=createDriftVerifier(state(12),0);assert.ok(run);let time=0;
 for(let s=14;s<=1840;s+=2){time+=100;run.observe(state(s),time);}
 const result=run.finish(time);assert.equal(result.verified,true);assert.ok(result.score>10000);assert.equal(result.trackId,'canyon-v1');assert.equal(run.finish(time),null);
});
test('server rejects jumps, paused attempts, late starts and another vehicle',()=>{
 assert.equal(createDriftVerifier(state(1000),0),null);assert.equal(createDriftVerifier({...state(12),vehicleId:'pickup'},0),null);
 for(const [pose,time]of [[state(1000),100],[{...state(14),paused:true},100],[state(14),4000]]){const run=createDriftVerifier(state(12),0);run.observe(pose,time);assert.equal(run.finish(time)?.verified??false,false);}
});

test('a cancelled start cannot restore its room run after an already received reply',async()=>{
 let socket;
 class Socket{readyState=1;bufferedAmount=0;sent=[];constructor(){socket=this;}send(value){this.sent.push(JSON.parse(value));}close(){}}
 const client=createOnlineClient({url:'ws://room',WebSocketClass:Socket,getState:()=>state(12)});client.start();socket.onopen();socket.onmessage({data:JSON.stringify({type:'welcome',id:'self',roomId:'one',players:[],seats:{}})});
 const starting=client.startDriftRun(),request=socket.sent.at(-1);socket.onmessage({data:JSON.stringify({type:'drift:result',requestId:request.requestId,ok:true,runId:'cancelled'})});client.cancelDriftRun();
 assert.equal(await starting,null);assert.equal(await client.finishDriftRun('cancelled'),null);client.dispose();
});
test('real room binds each drift request to its own connection and keeps peers in the room',async()=>{
 const server=createRoomServer();await server.listen();const socket=new WebSocket(`ws://127.0.0.1:${server.httpServer.address().port}/ws`),messages=[],waiters=[];
 socket.on('message',raw=>{const m=JSON.parse(raw);messages.push(m);for(const waiter of [...waiters])if(waiter.match(m)){waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(m);}});
 const wait=match=>{const found=messages.find(match);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('room reply timeout')),2000);waiters.push({match,resolve:m=>{clearTimeout(timeout);resolve(m);}});});};
 try{
  await once(socket,'open');socket.send(JSON.stringify({type:'join',version:1}));const welcome=await wait(m=>m.type==='welcome');assert.ok(welcome.roomId);
  socket.send(JSON.stringify({type:'state',state:{...state(12),seq:1}}));socket.send(JSON.stringify({type:'drift:start',requestId:'one'}));const started=await wait(m=>m.type==='drift:result'&&m.requestId==='one');assert.equal(started.ok,true);
  socket.send(JSON.stringify({type:'drift:finish',requestId:'wrong',runId:'foreign-run'}));assert.equal((await wait(m=>m.requestId==='wrong')).ok,false);
  socket.send(JSON.stringify({type:'drift:finish',requestId:'early',runId:started.runId}));assert.equal((await wait(m=>m.requestId==='early')).ok,false);
  assert.equal(server.getStats().players,1);assert.equal(server.getStats().rooms,1);
 }finally{socket.terminate();await server.close();}
});
