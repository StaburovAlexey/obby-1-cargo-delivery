import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import WebSocket from 'ws';
import {createRoomServer} from '../server/room-server.mjs';
import {decodeDeltaPacket,encodeStatePacket} from '../dist/online-protocol.js';
import {fixture,initial,delay,PROTOCOL_VERSION} from './helpers/online-room-fixture.mjs';

test('exports a programmatic room server',()=>assert.equal(typeof createRoomServer,'function'));
test('assigns twenty slots per room and keeps complete map rosters with stable player numbers',async t=>{
  const f=await fixture(t,{workerId:'worker-a'}),clients=[];
  for(let i=0;i<21;i++)clients.push(await f.join());
  assert.equal(new Set(clients.slice(0,20).map(c=>c.welcome.roomId)).size,1);
  assert.notEqual(clients[20].welcome.roomId,clients[0].welcome.roomId);
  assert.equal(clients[19].welcome.capacity,20);assert.equal(clients[19].welcome.players.length,20);
  assert.equal(new Set(clients.map(c=>c.welcome.id)).size,21);assert.match(clients[0].welcome.id,/^worker-a:/);
  await clients[0].wait(m=>m.players.length===20);
  clients[20].api.dispose();await delay(20);const left=clients[5];left.api.dispose();await clients[0].wait(m=>m.players.length===19&&!m.players.some(p=>p.id===left.welcome.id));
  const newcomer=await f.join();assert.equal(newcomer.welcome.roomId,clients[0].welcome.roomId);
  assert.equal(newcomer.welcome.players.find(p=>p.id===newcomer.api.id).number,21);
  assert.equal(newcomer.welcome.players.find(p=>p.id===newcomer.api.id).slot,5);
  const health=await (await fetch(`${f.http}/health`)).json();assert.equal(health.version,PROTOCOL_VERSION);assert.equal(health.players,20);assert.equal(health.rooms,1);assert.equal(health.workerId,'worker-a');
});
test('validates profile and binary state, rejects forged fields and stale sequences',async t=>{
  const f=await fixture(t),a=await f.join(),b=await f.join();
  a.movement(initial({position:[10,4,-100],speed:4}));
  const snapshot=await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.state.seq===1));
  assert.deepEqual(snapshot.players.find(p=>p.id===a.api.id).state.position,[10,4,-100]);
  for(const state of [initial({seq:2,characterId:'unknown'}),initial({seq:3,vehicleId:'unknown'}),initial({seq:4,position:[1e8,0,0]}),initial({seq:5,quaternion:[0,0,0,0]}),initial({seq:6,paused:'true'}),initial({seq:7,unexpected:1}),initial({seq:1,position:[99,0,0]}),initial({seq:8,position:[NaN,0,0]})])a.send({type:'profile',state});
  const broken=encodeStatePacket(initial({seq:9}));broken[12]=255;a.ws.send(broken);
  await delay(50);b.send({type:'resync'});const full=await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.state.seq===1));
  assert.equal(full.players.find(p=>p.id===a.api.id).state.seq,1);assert.ok(f.app.getStats().invalidMessages>=9);
});
test('reserves exclusive desks, retains paused seats, ignores forged seat IDs and releases on leave',async t=>{
  const f=await fixture(t),a=await f.join(),b=await f.join();
  assert.equal(await a.api.claimSeat(),'desk-01');assert.equal(await b.api.claimSeat(),'desk-02');assert.equal(await a.api.claimSeat(),'desk-01');
  a.send({type:'profile',state:initial({mode:'studying',paused:true,seatId:'desk-20'})});
  const snapshot=await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.state.paused));
  assert.equal(snapshot.seats['desk-01'],a.api.id);assert.equal(snapshot.players.find(p=>p.id===a.api.id).state.seatId,'desk-01');
  a.api.dispose();await b.wait(m=>m.players.length===1);
  const c=await f.join();assert.equal(await c.api.claimSeat(),'desk-01');c.api.releaseSeat();
  const released=await b.wait(m=>!m.seats['desk-01']&&m.seats['desk-02']);assert.equal(released.seats['desk-02'],b.api.id);
});
test('reclaims empty rooms, times out unjoined sockets and detects dead heartbeats',async t=>{
  const f=await fixture(t,{heartbeatMs:30,joinTimeoutMs:50});const idle=await f.connect();await once(idle.ws,'close');
  assert.equal(f.app.getStats().connections,0);const dead=await f.join({autoPong:false});assert.equal(await dead.api.claimSeat(),'desk-01');
  await once(dead.ws,'close');dead.api.dispose();await delay(10);assert.equal(f.app.getStats().rooms,0);assert.equal(f.app.getStats().players,0);
});
test('enforces origin, path, old protocol, payload and message rate limits',async t=>{
  const f=await fixture(t,{allowedOrigins:['https://game.example','https://*.yandex.net'],maxMessagesPerSecond:5,maxPayload:2048});
  for(const origin of ['https://evil.example','https://bad-yandex.net'])await assert.rejects(f.connect({origin}));
  const a=await f.connect({origin:'https://game.example'});const rejected=once(a.ws,'close');a.send({type:'join',version:1});assert.equal((await rejected)[0],1008);
  const b=await f.join({origin:'https://draft.yandex.net'});const close=once(b.ws,'close');b.ws.send('x'.repeat(2049));await close;b.api.dispose();
  const c=await f.join({origin:'https://game.example'});const rateClose=once(c.ws,'close');for(let i=0;i<10;i++)c.movement(initial({seq:i+1}));await rateClose;c.api.dispose();
  const bad=new WebSocket(f.url.replace('/ws','/bad'));bad.on('error',()=>{});await assert.rejects(once(bad,'open'));
  assert.equal((await fetch(`${f.http}/missing`)).status,404);assert.equal((await fetch(`${f.http}/health`)).status,200);
});
test('disconnects a genuinely buffered receiver even when all players are stationary',async t=>{
  const f=await fixture(t,{softBackpressureBytes:4096,hardBackpressureBytes:8192});let serverSocket;f.app.wss.once('connection',socket=>{serverSocket=socket;});
  const slow=await f.join();slow.ws._socket.pause();const padding=JSON.stringify({type:'padding',data:'x'.repeat(1024*1024)});
  for(let i=0;i<32&&serverSocket.bufferedAmount<=8192;i++)serverSocket.send(padding);
  assert.ok(serverSocket.bufferedAmount>8192);const deadline=Date.now()+2000;while(f.app.getStats().connections&&Date.now()<deadline)await delay(10);
  assert.equal(f.app.getStats().connections,0);assert.equal(f.app.getStats().backpressureDisconnects,1);slow.api.dispose();slow.ws._socket.resume();
});
test('recovers skipped control and movement with one complete snapshot, including slot reuse and seats',async t=>{
  const f=await fixture(t,{softBackpressureBytes:100,hardBackpressureBytes:10000,maxSkippedSnapshots:100});let serverSocket;
  f.app.wss.once('connection',socket=>{serverSocket=socket;});const slow=await f.join(),old=await f.join();await slow.wait(m=>m.players.length===2);
  let backlog=200;Object.defineProperty(serverSocket,'bufferedAmount',{get:()=>backlog});
  old.api.dispose();const replacement=await f.join();assert.equal(await replacement.api.claimSeat(),'desk-01');replacement.send({type:'profile',state:initial({characterId:'pack1',position:[500,0,0],seatId:'desk-01',mode:'studying'})});
  await delay(120);assert.ok(f.app.getStats().skippedSnapshots>0);backlog=0;
  const healed=await slow.wait(m=>m.players.some(p=>p.id===replacement.api.id&&p.state.characterId==='pack1'));
  assert.equal(healed.players.length,2);assert.equal(healed.seats['desk-01'],replacement.api.id);assert.ok(!healed.players.some(p=>p.id===old.welcome.id));
  const full=slow.wire.filter(frame=>!frame.binary).map(frame=>JSON.parse(frame.bytes)).filter(m=>m.type==='snapshot');assert.equal(full.length,1);
});
test('sends 10Hz near and 2Hz far binary deltas with hysteresis and immediate teleports/pauses',async t=>{
  const f=await fixture(t),a=await f.join(),b=await f.join();
  let sequence=0;const send=(x,extra={})=>a.movement(initial({seq:++sequence,position:[x,0,0],speed:5,...extra}));
  send(150);await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.cadenceMs===500));
  b.wire.length=0;for(let i=0;i<10;i++){send(150+i);await delay(100);}
  const count=()=>b.wire.filter(f=>f.binary).map(f=>decodeDeltaPacket(f.bytes)).flatMap(p=>p?.players??[]).filter(p=>p.slot===a.welcome.players[0].slot).length;
  assert.ok(count()>=1&&count()<=3,`far count ${count()}`);
  send(75);await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.state.position[0]===75&&p.cadenceMs===100));
  send(90);await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.state.position[0]===90&&p.cadenceMs===100));
  send(105);await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.state.position[0]===105&&p.cadenceMs===500));
  send(90);await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.state.position[0]===90&&p.cadenceMs===500));
  const start=Date.now();send(5000,{teleportId:1,paused:true});const immediate=await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.state.teleportId===1));assert.ok(Date.now()-start<200);assert.equal(immediate.players.find(p=>p.id===a.api.id).state.paused,true);
});
test('removes server scoring and ranking from all room messages',async t=>{
  const f=await fixture(t),a=await f.join();a.send({type:'drift:start',requestId:'removed'});await delay(30);
  assert.equal(f.app.getStats().invalidMessages,1);assert.ok(!('driftLeaderboard'in a.welcome));assert.ok(!a.wire.filter(f=>!f.binary).map(f=>JSON.parse(f.bytes)).some(m=>m.type==='drift:result'));
});

test('stationary motion resumes immediately even for a far viewer just sent a heartbeat',async t=>{
  const f=await fixture(t),a=await f.join(),b=await f.join();
  a.movement(initial({position:[1000,0,0]}));await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.state.seq===1));
  a.movement(initial({seq:2,position:[1000,0,0]}));await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.state.seq===2));
  const now=Date.now();a.movement(initial({seq:3,position:[1001,0,0],speed:5}));
  await b.wait(m=>m.players.some(p=>p.id===a.api.id&&p.state.seq===3));assert.ok(Date.now()-now<200,'far resume bypasses the500ms gate');
});

test('hard backpressure during a seat reply releases ownership without crashing the room',async t=>{
  const f=await fixture(t,{softBackpressureBytes:100,hardBackpressureBytes:200});let serverSocket;
  f.app.wss.once('connection',socket=>{serverSocket=socket;});const a=await f.join(),b=await f.join();await b.wait(m=>m.players.length===2);
  Object.defineProperty(serverSocket,'bufferedAmount',{get:()=>201});
  const closed=once(a.ws,'close');a.send({type:'seat:claim',requestId:'overloaded'});await closed;a.api.dispose();
  const end=Date.now()+1000;while(f.app.getStats().players!==1&&Date.now()<end)await delay(5);
  assert.equal(f.app.getStats().players,1);assert.equal(f.app.getStats().seats,0);assert.equal(await b.api.claimSeat(),'desk-01');
});
