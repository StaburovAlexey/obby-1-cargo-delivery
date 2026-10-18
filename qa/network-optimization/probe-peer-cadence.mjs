import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import WebSocket from 'ws';
import {createRoomServer} from '../../server/room-server.mjs';
import {createOnlineClient} from '../../dist/online-client.js';
import {createInitialPlayerState} from '../../dist/online-protocol.js';
import {VEHICLE_CONFIG} from '../../dist/economy-config.js';

// Independent semantic cadence probe. Counts distinct remote-player sequence
// advances, not snapshot callbacks (which can include self-only/control frames).
for(const mode of ['near','far','stationary']){
  const server=createRoomServer({host:'127.0.0.1'}),address=await server.listen(),clients=[];
  let measure=false,tick=0,interval;
  try{
    for(let index=0;index<20;index++){
      const record={index,state:createInitialPlayerState(),last:new Map(),updates:0};
      record.client=createOnlineClient({url:`ws://127.0.0.1:${address.port}/ws`,WebSocketClass:WebSocket,getState:()=>record.state,
        onSnapshot:snapshot=>{for(const player of snapshot.players){const previous=record.last.get(player.id);if(measure&&previous!==undefined&&previous!==player.state.seq)record.updates++;record.last.set(player.id,player.state.seq);}}});
      clients.push(record);record.client.start();
    }
    const deadline=performance.now()+5000;
    while(!clients.every(record=>record.client.connected&&record.client.players.length===19)){
      assert.ok(performance.now()<deadline,'Complete roster must settle');await delay(10);
    }
    const move=()=>{
      tick++;
      for(const record of clients){
        const phase=mode==='stationary'?0:tick*.1,base=mode==='far'?record.index*600:record.index;
        record.state={...createInitialPlayerState(),mode:'driving',vehicleId:VEHICLE_CONFIG[0].id,position:[base+Math.sin(phase),0,Math.cos(phase)],speed:mode==='stationary'?0:10,wheelSpin:mode==='stationary'?0:phase};
        record.client.update(.1);
      }
    };
    move();interval=setInterval(move,100);await delay(2100);
    const start=performance.now();measure=true;await delay(4100);measure=false;
    const seconds=(performance.now()-start)/1000,remoteRelationships=20*19,updates=clients.reduce((sum,record)=>sum+record.updates,0),hz=updates/remoteRelationships/seconds;
    const minimum=mode==='near'?8.5:mode==='far'?1.5:.6,maximum=mode==='near'?11:mode==='far'?3:1.5;
    assert.ok(hz>=minimum&&hz<=maximum,`${mode} remote cadence ${hz.toFixed(2)}Hz outside ${minimum}..${maximum}`);
    assert.equal(server.getStats().invalidMessages,0);
    for(const record of clients)assert.equal(record.client.roomSnapshot.players.length,20);
    console.log(JSON.stringify({event:'peer-cadence',mode,clients:20,remoteRelationships,seconds:Number(seconds.toFixed(3)),distinctRemoteUpdates:updates,observedRemoteHz:Number(hz.toFixed(3)),minimum,maximum,ok:true}));
  }finally{clearInterval(interval);for(const record of clients)record.client.dispose();await server.close();}
}
