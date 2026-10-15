
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import WebSocket from 'ws';
import {createInitialPlayerState} from '../dist/online-protocol.js';
import {CHARACTER_CATALOG} from '../dist/character-catalog.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
const clients=[];const errors=[];const gaps=[],ages=[];
const loop=monitorEventLoopDelay({resolution:20});loop.enable();
let url,from=0,measuring=false,interval,started=0,cpuStart,peakRss=process.memoryUsage().rss;
let receivedSnapshots=0,receivedBytes=0,sentStates=0,sentStateBytes=0,maxGap=0,gapSamples=0,ageSamples=0,reconnects=0;
const sampler=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},100);sampler.unref();
const record=error=>{if(errors.length<50)errors.push(String(error));};
function sample(values,value,seen){if(values.length<5000)values.push(value);else{const i=Math.floor(Math.random()*seen);if(i<values.length)values[i]=value;}}
async function connect(index,generation=0) {
  const ws=new WebSocket(url);
  const client={ws,index,generation,seq:0,id:null,roomId:null,seatId:null,snapshot:null,ticks:0,lastTick:0,expectedClose:false,pending:new Map()};
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`Join timeout ${index}`)),15000);
    ws.on('open',()=>ws.send(JSON.stringify({type:'join',version:1})));
    ws.on('error',error=>{clearTimeout(timeout);reject(error);if(!client.expectedClose)record(error.message);});
    ws.on('close',code=>{if(!client.expectedClose)record(`Unexpected close ${index}: ${code}`);if(!client.id){clearTimeout(timeout);reject(new Error(`Closed before join ${index}`));}});
    ws.on('message',bytes=>{
      let message;try{message=JSON.parse(bytes);}catch{record('Invalid JSON from server');return;}
      if(message.type==='welcome'){clearTimeout(timeout);Object.assign(client,{id:message.id,roomId:message.roomId,snapshot:message});resolve(client);}
      if(message.type==='seat:result'){const pending=client.pending.get(message.requestId);client.pending.delete(message.requestId);if(message.ok)client.seatId=message.seatId;pending?.(message);}
      if(message.type==='snapshot'){
        client.snapshot=message;
        if(measuring){
          receivedSnapshots++;receivedBytes+=bytes.length;client.ticks++;const now=performance.now();
          if(client.lastTick){const gap=now-client.lastTick;maxGap=Math.max(maxGap,gap);sample(gaps,gap,++gapSamples);}
          client.lastTick=now;sample(ages,Math.max(0,Date.now()-message.time),++ageSamples);
        }
      }
    });
  });
}
async function claim(client){
  const requestId=`${client.index}:${client.generation}`;
  const result=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`Seat response timeout ${client.index}`)),15000);
    client.pending.set(requestId,message=>{clearTimeout(timeout);resolve(message);});
    client.ws.send(JSON.stringify({type:'seat:claim',requestId}));
  });
  if(!result.ok)throw new Error('Seat claim rejected in non-full seat allocation');
}
function inspect(expectFullSeats=false){
  const rooms=new Set();let settled=true;
  for(const client of clients){
    if(client.expectedClose){settled=false;continue;}
    const snapshot=client.snapshot;if(!snapshot||snapshot.players.length!==20){settled=false;continue;}
    const ids=new Set(snapshot.players.map(player=>player.id));
    if(ids.size!==20)throw new Error('Duplicate player IDs');
    const holders=Object.values(snapshot.seats);
    if(new Set(holders).size!==holders.length||holders.some(id=>!ids.has(id)))throw new Error('Invalid exclusive seat ownership');
    for(const player of snapshot.players)if(player.state.seatId&&snapshot.seats[player.state.seatId]!==player.id)throw new Error('State/seat ownership mismatch');
    if(expectFullSeats&&holders.length!==20)settled=false;
    rooms.add(client.roomId);
  }
  return {settled,rooms:[...rooms],clients:clients.length,errors:[...errors]};
}
function move(){
  const time=(performance.now()-started)/1000;
  for(const client of clients){
    if(client.ws.readyState!==WebSocket.OPEN||client.expectedClose)continue;
    const seated=client.index%5===0,walking=client.index%5===1,phase=time*.3+client.index*.13;
    const heading=Math.sin(phase)*.5,speed=seated?0:walking?5:20+Math.sin(phase)*3;
    const state={...createInitialPlayerState(),seq:++client.seq,characterId:CHARACTER_CATALOG[client.index%CHARACTER_CATALOG.length].id,mode:seated?'studying':walking?'walking':'driving',vehicleId:walking||seated?null:VEHICLE_CONFIG[client.index%VEHICLE_CONFIG.length].id,position:seated?[client.index%20,0,0]:[Math.sin(phase)*25,Math.sin(time*.2)*2,-time*speed-client.index],quaternion:[0,Math.sin(heading/2),0,Math.cos(heading/2)],heading,speed,steer:seated||walking?0:Math.sin(phase)*.3,wheelSpin:time*speed/.6,bodyPitch:Math.sin(phase)*.02,bodyRoll:Math.sin(phase+.5)*.03,bodyBob:Math.sin(time*7)*.02,braking:!seated&&Math.sin(phase)>.95,airborne:walking&&time%4<.3,jumpElapsed:walking?time%4:0,paused:seated&&Math.sin(time)>.5,seatId:client.seatId};
    const wire=JSON.stringify({type:'state',state});client.ws.send(wire);sentStates++;sentStateBytes+=Buffer.byteLength(wire);
  }
}
function metrics(){
  const cpu=cpuStart?process.cpuUsage(cpuStart):{user:0,system:0};
  const seconds=started?(performance.now()-started)/1000:0;
  return {pid:process.pid,seconds,clients:clients.length,errors:[...errors],reconnects,receivedSnapshots,receivedBytes,sentStates,sentStateBytes,maxGap,gaps,ages,minClientTicks:clients.length?Math.min(...clients.map(c=>c.ticks)):0,cpuUs:cpu.user+cpu.system,cpuPercent:seconds?(cpu.user+cpu.system)/seconds/10000:0,rssBytes:process.memoryUsage().rss,peakRssBytes:peakRss,eventLoopP95Ms:loop.percentile(95)/1e6,eventLoopMaxMs:loop.max/1e6};
}
process.on('message',async message=>{
  try{
    let value;
    if(message.type==='connect'){
      url=message.url;from=message.from;
      for(let offset=0;offset<message.count;offset+=20)clients.push(...await Promise.all(Array.from({length:Math.min(20,message.count-offset)},(_,i)=>connect(from+offset+i))));
      value={clients:clients.length};
    } else if(message.type==='claim'){await Promise.all(clients.map(claim));value={ok:true};}
    else if(message.type==='release'){
      for(const client of clients)if(client.index%5){client.ws.send(JSON.stringify({type:'seat:release'}));client.seatId=null;}value={ok:true};
    } else if(message.type==='inspect')value=inspect(message.fullSeats);
    else if(message.type==='start'){
      started=performance.now();cpuStart=process.cpuUsage();peakRss=process.memoryUsage().rss;loop.reset();measuring=true;move();interval=setInterval(move,100);value={ok:true};
    } else if(message.type==='disconnectOne'){
      const client=clients[message.index-from];client.expectedClose=true;client.ws.terminate();value={ok:true};
    } else if(message.type==='replaceOne'){
      const offset=message.index-from,client=await connect(message.index,1);clients[offset]=client;if(message.index%5===0)await claim(client);reconnects++;value={ok:true};
    } else if(message.type==='stop'){
      clearInterval(interval);measuring=false;value={...metrics(),...inspect(false)};
    } else if(message.type==='metrics')value=metrics();
    else if(message.type==='close'){
      clearInterval(interval);clearInterval(sampler);measuring=false;loop.disable();
      for(const client of clients){client.expectedClose=true;client.ws.terminate();}
      process.disconnect();return;
    } else throw new Error(`Unknown command ${message.type}`);
    if(process.connected)process.send({event:'reply',requestId:message.requestId,value});
  }catch(error){if(process.connected)process.send({event:'reply',requestId:message.requestId,error:error.stack});}
});
process.on('disconnect',()=>{clearInterval(interval);clearInterval(sampler);for(const client of clients){client.expectedClose=true;client.ws.terminate();}loop.disable();});
process.send({event:'ready',pid:process.pid});
