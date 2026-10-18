import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import WebSocket from 'ws';

// One harness runs the actual production client from either checkout. No protocol
// encoder, suppressor, roster merge or cadence logic is duplicated by the load driver.
const root=process.env.STRESS_SOURCE_ROOT?pathToFileURL(`${resolve(process.env.STRESS_SOURCE_ROOT)}/`):new URL('../',import.meta.url);
const [{createOnlineClient},{createInitialPlayerState,PROTOCOL_VERSION},{CHARACTER_CATALOG},{VEHICLE_CONFIG}]=await Promise.all([
  import(new URL('dist/online-client.js',root)),import(new URL('dist/online-protocol.js',root)),
  import(new URL('dist/character-catalog.js',root)),import(new URL('dist/economy-config.js',root)),
]);
const clients=[],errors=[],gaps=[],ages=[],remoteGaps=[];
const loop=monitorEventLoopDelay({resolution:20});loop.enable();
let url,from=0,workload='near',measuring=false,interval,started=0,simulationStarted=0,cpuStart,peakRss=process.memoryUsage().rss;
let receivedSnapshots=0,receivedBytes=0,receivedMessages=0,receivedBinaryMessages=0,receivedJsonMessages=0,sentStates=0,sentStateBytes=0,sentBytes=0,sentMessages=0,updateCalls=0,maxGap=0,gapSamples=0,ageSamples=0,remoteGapSamples=0,maxRemoteGap=0,maxMovingRemoteGap=0,reconnects=0;
const sampler=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},100);sampler.unref();
const record=error=>{if(errors.length<50)errors.push(String(error));};
// Deterministic reservoir; reproducible sampling does not affect the workload.
let randomSeed=0x51f15e;
function sample(values,value,seen){if(values.length<5000)values.push(value);else{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;const i=Math.floor(randomSeed/0x100000000*seen);if(i<values.length)values[i]=value;}}
function stateFor(client,time){
  const seated=client.index%5===0,walking=client.index%5===1,still=workload==='stationary'||seated;
  const phase=still?client.index*.13:time*.8+client.index*.13;
  const heading=still?0:Math.sin(phase)*.5,speed=still?0:walking?5:20+Math.sin(phase)*3;
  const baseX=workload==='far'?(client.index%45)*600:0,baseZ=workload==='far'?Math.floor(client.index/45)*600:0;
  return {...createInitialPlayerState(),characterId:CHARACTER_CATALOG[client.index%CHARACTER_CATALOG.length].id,
    mode:seated?'studying':walking?'walking':'driving',vehicleId:walking||seated?null:VEHICLE_CONFIG[client.index%VEHICLE_CONFIG.length].id,
    position:[baseX+Math.sin(phase)*10,still?0:Math.sin(time*.2),baseZ+Math.cos(phase)*10],
    quaternion:[0,Math.sin(heading/2),0,Math.cos(heading/2)],heading,speed,steer:still||walking?0:Math.sin(phase)*.3,
    wheelSpin:still?0:time*speed/.6,bodyPitch:still?0:Math.sin(phase)*.02,bodyRoll:still?0:Math.sin(phase+.5)*.03,
    bodyBob:still?0:Math.sin(time*7)*.02,braking:!still&&Math.sin(phase)>.95,
    airborne:false,jumpElapsed:0,paused:false,seatId:client.api?.seatId??null};
}
async function connect(index,generation=0){
  const client={index,generation,api:null,ws:null,id:null,roomId:null,snapshot:null,ticks:0,lastTick:0,expectedClose:false,observed:new Map(),state:null};
  return new Promise((resolveJoin,reject)=>{
    let joined=false;
    const timeout=setTimeout(()=>{client.expectedClose=true;client.api?.dispose();reject(new Error(`Join timeout ${index}`));},15000);
    class InstrumentedWebSocket extends WebSocket {
      constructor(address){
        super(address);client.ws=this;
        this.on('message',(bytes,isBinary)=>{if(measuring){receivedBytes+=bytes.byteLength;receivedMessages++;if(isBinary)receivedBinaryMessages++;else receivedJsonMessages++;}});
        this.on('close',code=>{if(!client.expectedClose)record(`Unexpected close ${index}: ${code}`);if(!joined){clearTimeout(timeout);reject(new Error(`Closed before join ${index}`));}});
        this.on('error',error=>{if(!client.expectedClose)record(error.message);if(!joined){clearTimeout(timeout);reject(error);}});
      }
      send(data,...args){
        if(measuring){
          const length=typeof data==='string'?Buffer.byteLength(data):data.byteLength;
          sentBytes+=length;sentMessages++;
          let state=typeof data!=='string';if(!state){try{state=JSON.parse(data).type==='state';}catch{}}
          if(state){sentStates++;sentStateBytes+=length;}
        }
        return super.send(data,...args);
      }
    }
    client.api=createOnlineClient({url,WebSocketClass:InstrumentedWebSocket,getState:()=>client.state,
      onStatus:status=>{if(status.connected&&!joined){joined=true;clearTimeout(timeout);client.id=status.id;client.roomId=status.roomId;resolveJoin(client);}},
      onSnapshot:snapshot=>{
        client.snapshot=snapshot;
        if(!measuring||!snapshot.time)return;
        receivedSnapshots++;client.ticks++;const now=performance.now();
        if(client.lastTick){const gap=now-client.lastTick;maxGap=Math.max(maxGap,gap);sample(gaps,gap,++gapSamples);}
        client.lastTick=now;sample(ages,Math.max(0,Date.now()-snapshot.time),++ageSamples);
        const present=new Set();
        for(const player of snapshot.players){
          present.add(player.id);const previous=client.observed.get(player.id),seq=player.state?.seq;
          if(!Number.isInteger(seq)){record(`Invalid player seq ${index}/${player.id}`);continue;}
          if(previous&&seq<previous.seq)record(`Regressed player seq ${index}/${player.id}: ${previous.seq} -> ${seq}`);
          if(!previous||seq!==previous.seq){
            if(previous){const gap=now-previous.at;maxRemoteGap=Math.max(maxRemoteGap,gap);if(Math.abs(player.state.speed)>0.01)maxMovingRemoteGap=Math.max(maxMovingRemoteGap,gap);sample(remoteGaps,gap,++remoteGapSamples);}
            client.observed.set(player.id,{seq,at:now});
          }
        }
        for(const id of client.observed.keys())if(!present.has(id))client.observed.delete(id);
      }});
    client.state=stateFor(client,0);client.api.start();
  });
}
async function claim(client){if(!await client.api.claimSeat())throw new Error(`Seat claim rejected ${client.index}`);}
function inspect(expectFullSeats=false){
  const rooms=new Set();let settled=true,maxStateSilenceMs=0,maxMovingStateSilenceMs=0,knownRemotePlayers=0,uninitializedRemotePlayers=0;
  for(const client of clients){
    if(client.expectedClose||!client.api.connected){settled=false;continue;}
    const roster=client.api.roomSnapshot?.players;
    if(!roster||roster.length!==20){settled=false;continue;}
    const ids=new Set(roster.map(player=>player.id));
    if(ids.size!==20||!ids.has(client.api.id))throw new Error('Duplicate/missing roster player IDs');
    if(client.api.players.length!==19||client.api.players.some(player=>player.id===client.api.id))throw new Error('Invalid reconstructed remote roster');
    const holders=Object.values(client.api.seats);
    if(new Set(holders).size!==holders.length||holders.some(id=>!ids.has(id)))throw new Error('Invalid exclusive seat ownership');
    for(const player of roster){
      if(player.state.seatId&&client.api.seats[player.state.seatId]!==player.id)throw new Error('State/seat ownership mismatch');
      if(!Array.isArray(player.state.position)||!player.state.position.every(Number.isFinite))throw new Error('Invalid remote position');
    }
    if(expectFullSeats&&holders.length!==20)settled=false;
    if(measuring)for(const player of client.api.players){
      knownRemotePlayers++;
      if(player.state.seq===0)uninitializedRemotePlayers++;
      const observed=client.observed.get(player.id);if(observed){const silence=performance.now()-observed.at;maxStateSilenceMs=Math.max(maxStateSilenceMs,silence);if(Math.abs(player.state.speed)>0.01)maxMovingStateSilenceMs=Math.max(maxMovingStateSilenceMs,silence);}
    }
    rooms.add(client.api.roomId);
  }
  return {settled,rooms:[...rooms],clients:clients.length,knownRemotePlayers,uninitializedRemotePlayers,maxStateSilenceMs,maxMovingStateSilenceMs,errors:[...errors]};
}
function move(){
  const time=(performance.now()-simulationStarted)/1000;
  for(const client of clients){if(client.expectedClose||!client.api.connected)continue;client.state=stateFor(client,time);client.api.update(.1);if(measuring)updateCalls++;}
}
function metrics(){
  const cpu=cpuStart?process.cpuUsage(cpuStart):{user:0,system:0};
  const seconds=started?(performance.now()-started)/1000:0;
  return {pid:process.pid,protocolVersion:PROTOCOL_VERSION,workload,seconds,clients:clients.length,errors:[...errors],reconnects,
    receivedSnapshots,receivedBytes,receivedMessages,receivedBinaryMessages,receivedJsonMessages,sentStates,sentStateBytes,sentBytes,sentMessages,updateCalls,
    maxGap,gaps,ages,remoteGaps,maxRemoteGap,maxMovingRemoteGap,remoteGapSamples,minClientTicks:clients.length?Math.min(...clients.map(c=>c.ticks)):0,
    cpuUs:cpu.user+cpu.system,cpuPercent:seconds?(cpu.user+cpu.system)/seconds/10000:0,rssBytes:process.memoryUsage().rss,peakRssBytes:peakRss,
    eventLoopP95Ms:loop.percentile(95)/1e6,eventLoopMaxMs:loop.max/1e6};
}
process.on('message',async message=>{
  try{
    let value;
    if(message.type==='connect'){
      url=message.url;from=message.from;workload=message.workload??'near';
      if(new URL(url).hostname!=='127.0.0.1')throw new Error('Stress generator is loopback-only');
      if(!['near','far','stationary'].includes(workload))throw new Error(`Unknown workload ${workload}`);
      for(let offset=0;offset<message.count;offset+=20)clients.push(...await Promise.all(Array.from({length:Math.min(20,message.count-offset)},(_,i)=>connect(from+offset+i))));
      value={clients:clients.length,protocolVersion:PROTOCOL_VERSION};
    }else if(message.type==='claim'){await Promise.all(clients.map(claim));value={ok:true};}
    else if(message.type==='release'){for(const client of clients)if(client.index%5)client.api.releaseSeat();value={ok:true};}
    else if(message.type==='inspect')value=inspect(message.fullSeats);
    else if(message.type==='warmup'){simulationStarted=performance.now();move();interval=setInterval(move,100);value={ok:true};}
    else if(message.type==='start'){
      started=performance.now();cpuStart=process.cpuUsage();peakRss=process.memoryUsage().rss;loop.reset();measuring=true;
      if(!interval){simulationStarted=performance.now();move();interval=setInterval(move,100);}value={ok:true};
    }else if(message.type==='disconnectOne'){
      const client=clients[message.index-from];client.expectedClose=true;client.api.dispose();client.ws.terminate();value={ok:true};
    }else if(message.type==='replaceOne'){
      const offset=message.index-from,client=await connect(message.index,1);clients[offset]=client;if(message.index%5===0)await claim(client);reconnects++;value={ok:true};
    }else if(message.type==='stop'){
      clearInterval(interval);const inspection=inspect(false);measuring=false;value={...metrics(),...inspection};
    }else if(message.type==='metrics')value=metrics();
    else if(message.type==='close'){
      clearInterval(interval);clearInterval(sampler);measuring=false;loop.disable();
      for(const client of clients){client.expectedClose=true;client.api.dispose();client.ws.terminate();}process.disconnect();return;
    }else throw new Error(`Unknown command ${message.type}`);
    if(process.connected)process.send({event:'reply',requestId:message.requestId,value});
  }catch(error){if(process.connected)process.send({event:'reply',requestId:message.requestId,error:error.stack});}
});
process.on('disconnect',()=>{clearInterval(interval);clearInterval(sampler);for(const client of clients){client.expectedClose=true;client.api.dispose();client.ws.terminate();}loop.disable();});
process.send({event:'ready',pid:process.pid,protocolVersion:PROTOCOL_VERSION});
