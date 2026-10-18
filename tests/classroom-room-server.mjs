import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from 'ws';
import {createRoomServer} from '../server/room-server.mjs';
import {createInitialPlayerState} from '../dist/online-protocol.js';
import {canyonPointAt} from '../dist/canyon-track.js';

test('room standings contain only present players and their best server-verified completed run',async t=>{
 let clock=0;
 const server=createRoomServer({driftNow:()=>clock,maxMessagesPerSecond:100000});await server.listen();
 const clients=[],serverSockets=[];
 server.wss.on('connection',ws=>serverSockets.push(ws));
 t.after(async()=>{for(const c of clients)c.ws.terminate();await server.close();});
 async function join(){
  const ws=new WebSocket(`ws://127.0.0.1:${server.httpServer.address().port}/ws`),messages=[];
  ws.on('message',raw=>messages.push(JSON.parse(raw)));
  await once(ws,'open');
  const c={ws,serverSocket:serverSockets.at(-1),messages,send:value=>ws.send(JSON.stringify(value)),async wait(match){
   const end=Date.now()+3000;
   while(Date.now()<end){const found=messages.findIndex(match);if(found>=0)return messages.splice(found,1)[0];await new Promise(r=>setTimeout(r,5));}
   throw Error('room response timeout');
  }};
  clients.push(c);c.send({type:'join',version:1});c.welcome=await c.wait(m=>m.type==='welcome');return c;
 }
 const driver=await join(),viewer=await join();
 assert.equal(driver.welcome.players[0].number,1);
 assert.equal(viewer.welcome.players.find(p=>p.id===viewer.welcome.id).number,2);
 assert.deepEqual(viewer.welcome.driftLeaderboard,[]);
 for(let i=2;i<20;i++)await join();
 const otherRoom=await join();assert.notEqual(otherRoom.welcome.roomId,driver.welcome.roomId);
 let request=0;const sequences=new Map();
 async function pose(client,progress,angle=.5,tick=100){
  clock+=tick;const p=canyonPointAt(progress),seq=(sequences.get(client)||0)+1;sequences.set(client,seq);
  const processed=once(client.serverSocket,'message');
  client.send({type:'state',state:{...createInitialPlayerState(),seq,mode:'driving',vehicleId:'bmwreward',position:[p.x,p.height,p.z],heading:p.heading+angle,speed:20}});
  await processed;
 }
 async function run(angle,client=driver,step=2,tick=100){
  await pose(client,12,angle,tick);const startId=`start-${++request}`;
  client.send({type:'drift:start',requestId:startId});const start=await client.wait(m=>m.requestId===startId);assert.equal(start.ok,true);
  for(let s=12+step;s<=1840;s+=step)await pose(client,s,angle,tick);
  const finishId=`finish-${request}`;client.send({type:'drift:finish',requestId:finishId,runId:start.runId});
  const finish=await client.wait(m=>m.requestId===finishId);assert.equal(finish.ok,true);assert.equal(finish.result.verified,true);return finish.result;
 }
 const first=await run(.5);assert.ok(first.score>10000);
 let snapshot=await viewer.wait(m=>m.type==='snapshot'&&m.driftLeaderboard?.length===1);
 assert.equal(snapshot.driftLeaderboard[0].playerId,driver.welcome.id);assert.equal(snapshot.driftLeaderboard[0].score,first.score);
 assert.deepEqual((await otherRoom.wait(m=>m.type==='snapshot')).driftLeaderboard,[]);
 const lower=await run(.25);assert.ok(lower.score<first.score);
 viewer.messages.length=0;snapshot=await viewer.wait(m=>m.type==='snapshot');assert.equal(snapshot.driftLeaderboard[0].score,first.score);
 const better=await run(.7);assert.ok(better.score>first.score);
 snapshot=await viewer.wait(m=>m.type==='snapshot'&&m.driftLeaderboard?.[0]?.score===better.score);assert.equal(snapshot.driftLeaderboard[0].number,1);
 driver.send({type:'drift:finish',requestId:'forged',runId:'foreign',score:99999999});
 viewer.messages.length=0;snapshot=await viewer.wait(m=>m.type==='snapshot');assert.equal(snapshot.driftLeaderboard[0].score,better.score);
 const slow=await run(.95,driver,4,120),fast=await run(.95,viewer,4,100);
 assert.equal(fast.score,slow.score);assert.ok(fast.durationMs<slow.durationMs);
 snapshot=await viewer.wait(m=>m.type==='snapshot'&&m.driftLeaderboard?.length===2);
 assert.deepEqual(snapshot.driftLeaderboard.map(r=>r.playerId),[viewer.welcome.id,driver.welcome.id],'shorter duration breaks an equal-score tie');
 driver.ws.terminate();snapshot=await viewer.wait(m=>m.type==='snapshot'&&!m.players.some(p=>p.id===driver.welcome.id));
 assert.deepEqual(snapshot.driftLeaderboard.map(r=>r.playerId),[viewer.welcome.id]);
 const otherLeft=once(otherRoom.serverSocket,'close');otherRoom.ws.terminate();await otherLeft;
 const newcomer=await join();assert.equal(newcomer.welcome.roomId,viewer.welcome.roomId);assert.equal(newcomer.welcome.players.find(p=>p.id===newcomer.welcome.id).number,21,'numbers stay stable when a place becomes free');
});
