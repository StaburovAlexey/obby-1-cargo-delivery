import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import WebSocket from 'ws';
import {createRoomCluster,roomClusterOptionsFromEnv} from '../server/room-cluster.mjs';
import {PROTOCOL_VERSION,createInitialPlayerState} from '../dist/online-protocol.js';
import {createOnlineClient} from '../dist/online-client.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,predicate,timeout=5000) {
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await read();if(predicate(value))return value;await delay(20);}
  throw new Error('Condition timed out');
}
async function connect(url,options={}) {
  const ws=new WebSocket(url,options),messages=[];
  ws.on('error',()=>{});
  ws.on('message',(bytes,isBinary)=>{if(!isBinary)messages.push(JSON.parse(bytes));});
  await once(ws,'open');
  const client={ws,messages,send:value=>ws.send(JSON.stringify(value)),wait:predicate=>until(()=>messages.find(predicate),Boolean)};
  client.send({type:'join',version:PROTOCOL_VERSION});
  client.welcome=await client.wait(message=>message.type==='welcome');
  return client;
}
async function fixture(t,options={}) {
  const app=createRoomCluster({workers:2,maxConnectionsPerWorker:40,maxRoomsPerWorker:2,...options});
  const clients=[];const address=await app.listen(0,'127.0.0.1');
  t.after(async()=>{for(const client of clients)client.ws.terminate();await app.close();});
  return {app,http:`http://127.0.0.1:${address.port}`,url:`ws://127.0.0.1:${address.port}/ws`,
    async join(options){const client=await connect(this.url,options);clients.push(client);return client;}};
}

test('cluster environment parsing has explicit per-worker limits and rejects unsafe values',()=>{
  assert.deepEqual(roomClusterOptionsFromEnv({}),{host:'127.0.0.1',port:8082,workers:1,maxConnectionsPerWorker:500,maxRoomsPerWorker:25,allowedOrigins:[]});
  const config=roomClusterOptionsFromEnv({WORKERS:'4',MAX_CONNECTIONS_PER_WORKER:'500',MAX_ROOMS_PER_WORKER:'25',PORT:'0',ALLOWED_ORIGINS:' https://one.example,https://two.example '});
  assert.equal(config.workers,4);assert.equal(config.port,0);assert.equal(config.maxConnectionsPerWorker,500);
  assert.equal(config.maxRoomsPerWorker,25);assert.deepEqual(config.allowedOrigins,['https://one.example','https://two.example']);
  for(const WORKERS of ['0','1.5','NaN','65'])assert.throws(()=>roomClusterOptionsFromEnv({WORKERS}),/WORKERS/);
  assert.throws(()=>roomClusterOptionsFromEnv({MAX_CONNECTIONS_PER_WORKER:'-1'}),/MAX_CONNECTIONS_PER_WORKER/);
  assert.throws(()=>roomClusterOptionsFromEnv({PORT:'65536'}),/PORT/);
});

test('one loopback endpoint distributes sockets across workers without sharing rooms or seats',{timeout:20000},async t=>{
  const f=await fixture(t);const clients=[];
  for(let i=0;i<44;i++)clients.push(await f.join());
  const byWorker=Map.groupBy(clients,client=>client.welcome.workerId);
  assert.equal(byWorker.size,2);
  assert.equal(new Set(clients.map(client=>client.welcome.id)).size,44);
  const byRoom=Map.groupBy(clients,client=>client.welcome.roomId);
  assert.equal(byRoom.size,4);
  for(const [workerId,members] of byWorker){
    assert.match(workerId,/^w[12]-/);assert.equal(members.length,22);
    for(const member of members){
      assert.ok(member.welcome.roomId.includes(workerId));
      assert.ok(member.welcome.players.every(player=>player.id.includes(workerId)),'welcome must never contain another worker’s player');
    }
  }
  for(const members of byRoom.values()){
    assert.ok(members.length<=20);assert.equal(members.at(-1).welcome.players.length,members.length);
    assert.equal(new Set(members.map(client=>client.welcome.workerId)).size,1);
    for(const [index,client] of members.entries())client.send({type:'seat:claim',requestId:`seat-${index}`});
    const seats=await Promise.all(members.map(client=>client.wait(message=>message.type==='seat:result')));
    assert.ok(seats.every(seat=>seat.ok));assert.equal(new Set(seats.map(seat=>seat.seatId)).size,members.length);
  }
  const response=await fetch(`${f.http}/health`),health=await response.json();
  assert.equal(response.status,200);assert.equal(health.players,44);assert.equal(health.rooms,4);assert.equal(health.connections,44);
  assert.equal(health.readyWorkers,2);assert.equal(health.configuredWorkers,2);assert.equal(health.capacity,20);
  assert.deepEqual(health.workers.map(worker=>worker.connections),[22,22]);
  assert.deepEqual(health.limits,{connectionsPerWorker:40,roomsPerWorker:2,totalConnections:80,totalRooms:4});
  assert.equal((await f.app.refreshStats()).seats,44);
});

test('admission respects per-worker caps and frees capacity after rejection and disconnect',{timeout:15000},async t=>{
  const f=await fixture(t,{maxConnectionsPerWorker:2,maxRoomsPerWorker:1,allowedOrigins:['https://game.example']});
  await assert.rejects(connect(f.url,{origin:'https://wrong.example'}));
  await until(()=>f.app.getStats(),stats=>stats.connections===0);
  const clients=await Promise.all(Array.from({length:4},()=>f.join({origin:'https://game.example'})));
  await assert.rejects(connect(f.url,{origin:'https://game.example'}),/503/);
  assert.equal(f.app.getStats().connections,4);
  clients[0].ws.terminate();await until(()=>f.app.getStats(),stats=>stats.connections===3);
  const replacement=await f.join({origin:'https://game.example'});
  assert.equal(replacement.welcome.workerId,clients[0].welcome.workerId);
  assert.notEqual(replacement.welcome.id,clients[0].welcome.id);
  assert.equal((await f.app.refreshStats()).players,4);
  assert.equal((await fetch(`${f.http}/missing`)).status,404);
  await assert.rejects(connect(f.url.replace('/ws','/missing'),{origin:'https://game.example'}),/404/);
});

test('worker crash removes its rooms, leaves other sockets alive, and restarts with a fresh incarnation',{timeout:15000},async t=>{
  const f=await fixture(t);const clients=[];
  for(let i=0;i<6;i++)clients.push(await f.join());
  const stats=await f.app.refreshStats(),failed=stats.workers[0],survivor=stats.workers[1];
  const lost=clients.filter(client=>client.welcome.workerId===failed.workerId);
  const alive=clients.filter(client=>client.welcome.workerId===survivor.workerId);
  const closed=Promise.all(lost.map(client=>once(client.ws,'close')));
  process.kill(failed.pid,'SIGKILL');await closed;
  await until(()=>f.app.getStats(),value=>value.readyWorkers===2&&!value.workers.some(worker=>worker.workerId===failed.workerId));
  assert.ok(alive.every(client=>client.ws.readyState===WebSocket.OPEN));
  const after=await f.app.refreshStats();assert.equal(after.players,3);assert.equal(after.connections,3);assert.equal(after.rooms,1);
  const rejoined=await f.join();
  assert.notEqual(rejoined.welcome.workerId,failed.workerId);assert.notEqual(rejoined.welcome.roomId,lost[0].welcome.roomId);
  assert.notEqual(rejoined.welcome.id,lost[0].welcome.id);assert.equal(rejoined.welcome.players.length,1);
  assert.ok(rejoined.welcome.players.every(player=>!lost.some(client=>client.welcome.id===player.id)));
  assert.deepEqual(rejoined.welcome.seats,{});
  const survivorClient=alive[0];survivorClient.send({type:'seat:claim',requestId:'still-alive'});
  assert.equal((await survivorClient.wait(message=>message.requestId==='still-alive')).ok,true);
});

test('cluster shutdown closes upgraded sockets and all child processes',{timeout:15000},async t=>{
  const f=await fixture(t);const client=await f.join(),pids=f.app.getStats().workers.map(worker=>worker.pid);
  const closed=once(client.ws,'close');await f.app.close();await closed;
  assert.equal(f.app.getStats().ok,false);
  for(const pid of pids)assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');
  await f.app.close();await assert.rejects(f.app.listen(),/closed/);
});


test('production clients reconstruct only their own worker room and remove departed peers without ghosts',{timeout:15000},async t=>{
  const f=await fixture(t),clients=[];
  t.after(()=>{for(const client of clients)client.dispose();});
  const add=async index=>{
    const client=createOnlineClient({url:f.url,WebSocketClass:WebSocket,
      getState:()=>({...createInitialPlayerState(),position:[index*100,0,index*10],speed:index+1})});
    clients.push(client);client.start();await until(()=>client.connected,Boolean);return client;
  };
  for(let i=0;i<4;i++)await add(i);
  await until(()=>clients,every=>every.every(client=>client.players.length===1));
  const byRoom=Map.groupBy(clients,client=>client.roomId);assert.equal(byRoom.size,2);
  for(const client of clients)client.update(1);
  await until(()=>clients,every=>every.every(client=>client.roomSnapshot.players.every(player=>player.state.seq===1)));
  for(const members of byRoom.values()){
    const expected=new Set(members.map(client=>client.id));
    for(const client of members){
      assert.deepEqual(new Set(client.roomSnapshot.players.map(player=>player.id)),expected);
      for(const player of client.roomSnapshot.players){
        const index=clients.findIndex(candidate=>candidate.id===player.id);
        assert.deepEqual(player.state.position,[index*100,0,index*10]);
      }
    }
  }
  const gone=clients[0],oldId=gone.id,roomId=gone.roomId;
  assert.equal(await gone.claimSeat(),'desk-01');gone.dispose();
  const survivor=clients.find(client=>client.connected&&client.roomId===roomId);
  await until(()=>survivor.roomSnapshot,value=>value.players.length===1&&!Object.values(value.seats).includes(oldId));
  await until(()=>f.app.getStats(),value=>value.connections===3);
  const replacement=await add(4);assert.notEqual(replacement.id,oldId);assert.equal(replacement.roomId,roomId);
  assert.equal(await replacement.claimSeat(),'desk-01');
  await until(()=>survivor.roomSnapshot,value=>value.players.length===2);
  assert.ok(clients.filter(client=>client.connected).every(client=>client.roomSnapshot.players.every(player=>player.id!==oldId)));
});


test('health reports unavailable workers honestly while routing new sockets to responsive workers',{timeout:15000},async t=>{
  const f=await fixture(t,{metricsTimeoutMs:200});
  await f.join();await f.join();
  const frozen=(await f.app.refreshStats()).workers[0];
  process.kill(frozen.pid,'SIGSTOP');
  try{
    const response=await fetch(`${f.http}/health`),health=await response.json();
    assert.equal(response.status,503);assert.equal(health.partial,true);assert.equal(health.readyWorkers,1);
    const unavailable=health.workers.find(worker=>worker.workerId===frozen.workerId);
    assert.equal(unavailable.ready,false);assert.equal(unavailable.players,null);assert.equal(unavailable.rooms,null);
    assert.equal(health.players,1);assert.equal(health.connections,2);
    const replacement=await f.join();assert.notEqual(replacement.welcome.workerId,frozen.workerId);
  }finally{process.kill(frozen.pid,'SIGCONT');}
  await until(()=>f.app.getStats(),stats=>stats.readyWorkers===2);
  const response=await fetch(`${f.http}/health`),health=await response.json();
  assert.equal(response.status,200);assert.equal(health.partial,false);assert.equal(health.players,3);assert.equal(health.connections,3);
});


test('closing during worker startup never opens the listener and reaps every child',{timeout:15000},async()=>{
  const app=createRoomCluster({workers:4});
  const listening=app.listen(0,'127.0.0.1').then(()=>null,error=>error);
  const pids=app.getStats().workers.map(worker=>worker.pid);assert.equal(pids.length,4);
  await app.close();assert.ok(await listening instanceof Error);assert.equal(app.httpServer.listening,false);
  for(const pid of pids)assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');
});


test('a worker that dies after ready while another is still starting is replaced',{timeout:15000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'online-startup-race-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const preload=join(directory,'startup-race.mjs'),marker=join(directory,'crashed');
  await writeFile(preload,`
    import {writeFileSync} from 'node:fs';
    const {workerId}=JSON.parse(process.env.ROOM_CLUSTER_WORKER_CONFIG);
    if(workerId.startsWith('w2-'))await new Promise(resolve=>setTimeout(resolve,700));
    if(workerId.startsWith('w1-')){
      let first=false;try{writeFileSync(${JSON.stringify(marker)},'first',{flag:'wx'});first=true;}catch{}
      if(first){const original=process.send.bind(process);process.send=(message,...args)=>{
        const result=original(message,...args);if(message.type==='room:ready')setTimeout(()=>process.exit(42),20);return result;
      };}
    }
  `);
  const exits=[],app=createRoomCluster({workers:2,workerExecArgv:['--import',pathToFileURL(preload).href],onWorkerExit:event=>exits.push(event)});
  t.after(()=>app.close());
  const listening=app.listen(0,'127.0.0.1'),firstId=app.getStats().workers[0].workerId;
  const address=await listening;
  await until(()=>app.getStats(),stats=>stats.readyWorkers===2&&stats.workers.every(worker=>worker.workerId!==firstId));
  assert.ok(exits.some(exit=>exit.workerId===firstId&&exit.code===42));
  const response=await fetch(`http://127.0.0.1:${address.port}/health`);assert.equal(response.status,200);
});
