import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import WebSocket from 'ws';

const backend = await import('../server/room-server.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const {createRoomServer} = backend;
const skip = typeof createRoomServer !== 'function';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function initial(overrides = {}) {
  return {seq:1,mode:'walking',characterId:'bacon',vehicleId:null,position:[1,0,2],quaternion:[0,0,0,1],heading:0,speed:0,steer:0,wheelSpin:0,bodyPitch:0,bodyRoll:0,bodyBob:0,braking:false,airborne:false,jumpElapsed:0,paused:false,teleportId:0,seatId:null,...overrides};
}
async function client(url, options = {}) {
  const ws = new WebSocket(url, options); const messages=[];
  ws.on('error', () => {});
  ws.on('message', bytes => messages.push(JSON.parse(bytes)));
  await once(ws,'open');
  return {ws,messages,send: value => ws.send(JSON.stringify(value)),async wait(predicate, timeout=2000) {
    const end=Date.now()+timeout;
    while(Date.now()<end) {const i=messages.findIndex(predicate); if(i>=0) return messages.splice(i,1)[0]; await delay(5);}
    throw new Error(`Message timeout; received ${JSON.stringify(messages.slice(-2))}`);
  }};
}
async function fixture(t,options={}) {
  const app=createRoomServer(options); const address=await app.listen(); const clients=[];
  t.after(async()=>{for(const c of clients)c.ws.terminate(); await app.close();});
  return {app,url:`ws://127.0.0.1:${address.port}/ws`,http:`http://127.0.0.1:${address.port}`,async connect(opts) {const c=await client(this.url,opts);clients.push(c);return c;},async join(opts) {const c=await this.connect(opts);c.send({type:'join',version:1});c.welcome=await c.wait(m=>m.type==='welcome');return c;}};
}
test('exports a programmatic room server',()=>assert.equal(typeof createRoomServer,'function'));
test('assigns only twenty players to each automatic fixed-world room', {skip},async t=>{
  const f=await fixture(t); const clients=[];
  for(let i=0;i<21;i++) clients.push(await f.join());
  assert.equal(new Set(clients.slice(0,20).map(c=>c.welcome.roomId)).size,1);
  assert.notEqual(clients[20].welcome.roomId,clients[0].welcome.roomId);
  assert.equal(clients[19].welcome.capacity,20); assert.equal(clients[19].welcome.players.length,20);
  assert.equal(new Set(clients.map(c=>c.welcome.id)).size,21);
  const health=await (await fetch(`${f.http}/health`)).json();
  assert.equal(health.ok,true); assert.equal(health.players,21); assert.equal(health.rooms,2); assert.equal(health.worldId,'current-seed-42');
});
test('broadcasts validated moving states and rejects forged IDs, fields, stale sequences and nonfinite payloads', {skip},async t=>{
  const f=await fixture(t); const a=await f.join(); const b=await f.join();
  a.send({type:'state',state:initial({position:[10,4,-100],speed:4})});
  let snapshot=await b.wait(m=>m.type==='snapshot'&&m.players.some(p=>p.id===a.welcome.id&&p.state.seq===1));
  assert.deepEqual(snapshot.players.find(p=>p.id===a.welcome.id).state.position,[10,4,-100]);
  for(const state of [initial({seq:2,characterId:'unknown'}),initial({seq:3,vehicleId:'unknown'}),initial({seq:4,position:[1e8,0,0]}),initial({seq:5,quaternion:[0,0,0,0]}),initial({seq:6,paused:'true'}),initial({seq:7,unexpected:1}),initial({seq:1,position:[99,0,0]})]) a.send({type:'state',state});
  a.send({type:'state',state:initial({seq:8,position:[NaN,0,0]})});
  await delay(130); b.messages.length=0;
  snapshot=await b.wait(m=>m.type==='snapshot');
  assert.equal(snapshot.players.find(p=>p.id===a.welcome.id).state.seq,1);
  assert.ok(f.app.getStats().invalidMessages>=8);
});
test('reserves exclusive first-free desks atomically, retains paused desk and releases on leave', {skip},async t=>{
  const f=await fixture(t); const a=await f.join(); const b=await f.join();
  a.send({type:'seat:claim',requestId:'a'}); b.send({type:'seat:claim',requestId:'b'});
  const sa=await a.wait(m=>m.type==='seat:result'); const sb=await b.wait(m=>m.type==='seat:result');
  assert.equal(sa.ok,true);assert.equal(sa.seatId,'desk-01');assert.equal(sb.seatId,'desk-02');
  a.send({type:'seat:claim',requestId:'again'});assert.equal((await a.wait(m=>m.requestId==='again')).seatId,'desk-01');
  a.send({type:'state',state:initial({mode:'studying',paused:true,seatId:'desk-20'})});
  const snap=await b.wait(m=>m.type==='snapshot'&&m.players.some(p=>p.id===a.welcome.id&&p.state.paused));
  assert.equal(snap.seats['desk-01'],a.welcome.id);assert.equal(snap.players.find(p=>p.id===a.welcome.id).state.seatId,'desk-01');
  a.ws.terminate(); await b.wait(m=>m.type==='snapshot'&&m.players.length===1);
  const c=await f.join(); c.send({type:'seat:claim',requestId:'reuse'});assert.equal((await c.wait(m=>m.type==='seat:result')).seatId,'desk-01');
  c.send({type:'seat:release'});const released=await b.wait(m=>m.type==='snapshot'&&!m.seats['desk-01']);assert.equal(released.seats['desk-02'],b.welcome.id);
});
test('reclaims empty rooms, times out unjoined sockets and detects dead heartbeats', {skip},async t=>{
  const f=await fixture(t,{heartbeatMs:30,joinTimeoutMs:50});
  const idle=await f.connect(); const idleClose=once(idle.ws,'close');await idleClose;
  assert.equal(f.app.getStats().connections,0);
  const dead=await f.join({autoPong:false});dead.send({type:'seat:claim',requestId:'dead'});await dead.wait(m=>m.type==='seat:result');
  await once(dead.ws,'close');await delay(10);
  assert.equal(f.app.getStats().rooms,0);assert.equal(f.app.getStats().players,0);
});
test('enforces origin, path, protocol, payload and message rate limits without crashing', {skip},async t=>{
  const f=await fixture(t,{allowedOrigins:['https://game.example','https://*.yandex.net'],maxMessagesPerSecond:5,maxPayload:2048});
  for(const origin of ['https://evil.example','https://bad-yandex.net']) await assert.rejects(client(f.url,{origin}));
  const a=await f.connect({origin:'https://game.example'});a.send({type:'join',version:2});await once(a.ws,'close');
  const b=await f.join({origin:'https://draft.yandex.net'}); const close=once(b.ws,'close');b.ws.send('x'.repeat(2049));await close;
  const c=await f.join({origin:'https://game.example'});const rateClose=once(c.ws,'close');for(let i=0;i<10;i++)c.send({type:'state',state:initial({seq:i+1})});await rateClose;
  assert.equal((await fetch(`${f.http}/missing`)).status,404);
  assert.equal((await fetch(`${f.http}/health`)).status,200);
});
test('disconnects a real receiver whose socket buffers exceed the backpressure limit', {skip},async t=>{
  const f=await fixture(t,{softBackpressureBytes:4096,hardBackpressureBytes:8192});
  let serverSocket;f.app.wss.once('connection',socket=>{serverSocket=socket;});
  const slow=await f.join();slow.ws._socket.pause();
  const padding=JSON.stringify({type:'padding',data:'x'.repeat(1024*1024)});
  for(let i=0;i<32&&serverSocket.bufferedAmount<=8192;i++)serverSocket.send(padding);
  assert.ok(serverSocket.bufferedAmount>8192,'real paused TCP receiver must create a send backlog');
  const deadline=Date.now()+2000;
  while(f.app.getStats().connections&&Date.now()<deadline)await delay(10);
  assert.equal(f.app.getStats().connections,0);
  assert.equal(f.app.getStats().backpressureDisconnects,1);
  assert.equal(f.app.getStats().rooms,0);slow.ws._socket.resume();
});
test('sends shared snapshots as browser-compatible text WebSocket frames', {skip},async t=>{
  const f=await fixture(t);const a=await f.join();
  const [,isBinary]=await once(a.ws,'message');assert.equal(isBinary,false);
});
