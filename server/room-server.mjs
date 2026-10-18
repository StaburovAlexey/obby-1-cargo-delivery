import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {WebSocketServer,WebSocket} from 'ws';
import {PROTOCOL_VERSION,ROOM_CAPACITY,SNAPSHOT_HZ,WORLD_ID,SEAT_IDS,NEAR_ENTER_DISTANCE,NEAR_EXIT_DISTANCE,
  createInitialPlayerState,sanitizePlayerState,decodeStatePacket,encodeValidatedStatePacket,encodeDeltaPacketFromRecords,nextPacketSequence,isImmediateStateChange,sameMovement} from '../dist/online-protocol.js';

const exactKeys=(message,keys)=>Object.keys(message).length===keys.length&&keys.every(key=>Object.hasOwn(message,key));
const positive=(value,fallback)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
function originAllowed(origin,patterns) {
  if(!origin||!patterns.length)return true;
  let url;try {url=new URL(origin);if(url.origin!==origin)return false;}catch{return false;}
  return patterns.some(pattern=>{
    if(pattern===origin)return true;
    const match=/^(https?):\/\/\*\.([a-z0-9.-]+)(:\d+)?$/.exec(pattern);
    return !!match&&url.protocol===`${match[1]}:`&&url.port===(match[3]?.slice(1)||'')&&url.hostname.endsWith(`.${match[2]}`);
  });
}

export function createRoomServer(options={}) {
  const workerId=String(options.workerId??options.processId??`p${process.pid}`).replace(/[^A-Za-z0-9_-]/g,'').slice(0,64)||`p${process.pid}`;
  const heartbeatMs=positive(options.heartbeatMs,15_000),joinTimeoutMs=positive(options.joinTimeoutMs,5_000);
  const maxPayload=positive(options.maxPayload,4096),maxMessagesPerSecond=positive(options.maxMessagesPerSecond,40);
  const maxConnections=positive(options.maxConnections,2000),maxRooms=positive(options.maxRooms,100);
  const softBackpressureBytes=positive(options.softBackpressureBytes,256*1024),hardBackpressureBytes=positive(options.hardBackpressureBytes,1024*1024);
  const maxSkippedSnapshots=positive(options.maxSkippedSnapshots,10),allowedOrigins=options.allowedOrigins||[];
  const rooms=new Map(),availableRooms=new Set(),connections=new Set();
  const loopDelay=monitorEventLoopDelay({resolution:20});loopDelay.enable();
  const counters={accepted:0,disconnected:0,invalidMessages:0,receivedMessages:0,receivedBytes:0,sentMessages:0,sentBytes:0,snapshots:0,fullSnapshots:0,deltaSnapshots:0,movementRecords:0,skippedSnapshots:0,backpressureDisconnects:0,heartbeatDisconnects:0,tickCount:0,tickDurationTotalMs:0,maxTickDurationMs:0};
  const started=performance.now();let closing=false;
  const httpServer=createServer((req,res)=>{
    if(req.url==='/health'&&req.method==='GET') {
      const stats=getStats();res.writeHead(closing?503:200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({ok:!closing,version:PROTOCOL_VERSION,workerId,worldId:WORLD_ID,capacity:ROOM_CAPACITY,players:stats.players,rooms:stats.rooms,connections:stats.connections,uptimeSeconds:stats.uptimeSeconds}));
    } else {res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
  });
  httpServer.headersTimeout=10_000;httpServer.requestTimeout=10_000;
  const wss=new WebSocketServer({noServer:true,maxPayload,perMessageDeflate:false,clientTracking:false});
  httpServer.on('upgrade',(req,socket,head)=>{
    let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{path='';}
    const status=path!=='/ws'?404:closing||connections.size>=maxConnections?503:!originAllowed(req.headers.origin,allowedOrigins)?403:0;
    if(status){socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  function nearFor(viewer,target,previous){
    if(viewer===target)return true;
    const a=viewer.state.position,b=target.state.position,distance=Math.hypot(a[0]-b[0],a[2]-b[2]);
    return distance<=(previous?.near?NEAR_EXIT_DISTANCE:NEAR_ENTER_DISTANCE);
  }
  function playerPayload(target,viewer){return {id:target.id,slot:target.slot,number:target.number,cadenceMs:nearFor(viewer,target,viewer.sent.get(target.slot))?100:500,state:target.state};}
  function seatMap(room){return Object.fromEntries(room.seats);}
  function releaseSeat(conn,notify=true){
    const occupied=conn.seatId;
    if(occupied&&conn.room)conn.room.seats.delete(occupied);
    conn.seatId=null;
    if(conn.state&&(occupied||conn.state.mode==='studying')){conn.state={...conn.state,seatId:null,mode:conn.state.mode==='studying'?'walking':conn.state.mode};conn.revision++;conn.packet=encodeValidatedStatePacket(conn.state);}
    if(occupied&&conn.room&&notify)broadcastControl(conn.room,'seats',{seats:seatMap(conn.room),players:[conn]});
  }
  function detach(conn){
    if(!connections.delete(conn))return;
    clearTimeout(conn.joinTimer);clearTimeout(conn.closeTimer);releaseSeat(conn,false);
    if(conn.room){
      const room=conn.room;room.players.delete(conn.id);conn.room=null;
      if(!room.players.size){rooms.delete(room.id);availableRooms.delete(room);}
      else{availableRooms.add(room);broadcastControl(room,'roster',{left:[{id:conn.id,slot:conn.slot}],seats:seatMap(room)});}
    }
    counters.disconnected++;
  }
  function end(conn,code=1008,reason='Invalid message',terminate=false){
    if(conn.ended)return;conn.ended=true;detach(conn);
    if(terminate){conn.ws.terminate();return;}
    conn.ws.close(code,reason);conn.closeTimer=setTimeout(()=>conn.ws.terminate(),250);conn.closeTimer.unref();
  }
  function canSend(conn,replication=false){
    if(conn.ended||conn.ws.readyState!==WebSocket.OPEN)return false;
    if(conn.ws.bufferedAmount>hardBackpressureBytes){counters.backpressureDisconnects++;end(conn,1013,'Slow receiver',true);return false;}
    if(replication&&conn.ws.bufferedAmount>softBackpressureBytes){
      conn.needsFull=true;counters.skippedSnapshots++;
      if(++conn.skipped>=maxSkippedSnapshots){counters.backpressureDisconnects++;end(conn,1013,'Slow receiver',true);}
      return false;
    }
    conn.skipped=0;return true;
  }
  function send(conn,payload,binary=false){
    if(!canSend(conn))return false;
    try{
      conn.ws.send(payload,{binary},error=>{if(error)end(conn,1011,'Send failed',true);});
      if(conn.ended)return false;
      counters.sentMessages++;counters.sentBytes+=typeof payload==='string'?Buffer.byteLength(payload):payload.byteLength;return true;
    }catch{end(conn,1011,'Send failed',true);return false;}
  }
  function remember(conn,target,time,cadenceMs){conn.sent.set(target.slot,{revision:target.revision,near:cadenceMs===100,sentAt:time});}
  function fullSnapshot(conn,type='snapshot'){
    if(!conn.room||!canSend(conn,true))return false;
    const sequence=type==='welcome'?0:nextPacketSequence(conn.sequence),time=Date.now();
    const players=[...conn.room.players.values()].map(target=>playerPayload(target,conn));
    if(!send(conn,JSON.stringify({type,version:PROTOCOL_VERSION,workerId,id:conn.id,roomId:conn.room.id,capacity:ROOM_CAPACITY,sequence,time,players,seats:seatMap(conn.room)})))return false;
    conn.sequence=sequence;conn.needsFull=false;conn.sent.clear();
    for(const player of players)remember(conn,conn.room.players.get(player.id),time,player.cadenceMs);
    counters.snapshots++;counters.fullSnapshots++;return true;
  }
  function broadcastControl(room,type,{players=[],...extra}={},exclude=null){
    for(const viewer of [...room.players.values()]){
      if(viewer===exclude)continue;
      if(!canSend(viewer,true))continue;
      if(viewer.needsFull){fullSnapshot(viewer);continue;}
      const sequence=nextPacketSequence(viewer.sequence),time=Date.now();
      const updates=players.filter(target=>target.room===room).map(target=>playerPayload(target,viewer));
      if(send(viewer,JSON.stringify({type,sequence,time,...extra,...(updates.length?{players:updates}:{})}))){
        viewer.sequence=sequence;
        for(const player of updates)remember(viewer,room.players.get(player.id),time,player.cadenceMs);
        for(const player of extra.left||[])viewer.sent.delete(player.slot);
      }
    }
  }
  function replicate(viewer,time,urgentTarget=null){
    if(!viewer.room||!canSend(viewer,true))return;
    if(viewer.needsFull){fullSnapshot(viewer);return;}
    const players=[];
    for(const target of viewer.room.players.values()){
      if(urgentTarget&&target!==urgentTarget)continue;
      const previous=viewer.sent.get(target.slot),near=nearFor(viewer,target,previous),cadenceMs=near?100:500;
      if(previous?.revision===target.revision&&previous.near===near)continue;
      if(!urgentTarget&&previous?.near===near&&time-previous.sentAt<cadenceMs-2)continue;
      players.push({slot:target.slot,cadenceMs,movement:target.packet.subarray(4),target});
    }
    if(!players.length)return;
    const sequence=nextPacketSequence(viewer.sequence),payload=encodeDeltaPacketFromRecords({sequence,time,players});
    if(payload&&send(viewer,payload,true)){
      viewer.sequence=sequence;for(const player of players)remember(viewer,player.target,time,player.cadenceMs);
      counters.snapshots++;counters.deltaSnapshots++;counters.movementRecords+=players.length;
    }
  }
  function acceptState(conn,state,profile=false){
    const before=conn.state,packet=encodeValidatedStatePacket(state),now=Date.now(),changed=!sameMovement(packet,conn.packet);
    const resumed=changed&&(now-conn.lastMotionAt>=250||Math.abs(before.speed)<.05&&Math.abs(state.speed)>=.05);
    conn.state=state;conn.packet=packet;conn.revision++;if(changed)conn.lastMotionAt=now;
    if(profile&&(before.characterId!==state.characterId||before.vehicleId!==state.vehicleId))broadcastControl(conn.room,'roster',{players:[conn]});
    else if(resumed||isImmediateStateChange(before,state))for(const viewer of [...conn.room.players.values()])replicate(viewer,Date.now(),conn);
  }
  function invalid(conn){counters.invalidMessages++;if(++conn.invalid>=30)end(conn);}
  wss.on('connection',ws=>{
    const conn={ws,id:`${workerId}:${randomUUID()}`,room:null,state:createInitialPlayerState(),seatId:null,alive:true,ended:false,invalid:0,tokens:maxMessagesPerSecond,rateAt:performance.now(),skipped:0,needsFull:false,sequence:0,revision:0,sent:new Map(),lastResync:-Infinity,lastMotionAt:Date.now(),packet:encodeValidatedStatePacket(createInitialPlayerState())};
    connections.add(conn);counters.accepted++;
    conn.joinTimer=setTimeout(()=>end(conn,1008,'Join timeout'),joinTimeoutMs);conn.joinTimer.unref();
    ws.on('pong',()=>{conn.alive=true;});ws.on('close',()=>{clearTimeout(conn.closeTimer);detach(conn);});ws.on('error',()=>end(conn,1008,'Socket error',true));
    ws.on('message',(raw,isBinary)=>{
      if(conn.ended)return;
      counters.receivedMessages++;counters.receivedBytes+=raw.length;
      const now=performance.now();conn.tokens=Math.min(maxMessagesPerSecond,conn.tokens+(now-conn.rateAt)*maxMessagesPerSecond/1000);conn.rateAt=now;
      if(conn.tokens<1){end(conn,1008,'Message rate exceeded');return;}conn.tokens--;
      if(isBinary){
        if(!conn.room){end(conn,1008,'Join protocol mismatch');return;}
        const state=decodeStatePacket(raw,conn.state,{seatId:conn.seatId,previousSeq:conn.state.seq});
        if(!state){invalid(conn);return;}acceptState(conn,state);return;
      }
      let message;try{message=JSON.parse(raw);}catch{invalid(conn);return;}
      if(!message||typeof message!=='object'||Array.isArray(message)){invalid(conn);return;}
      if(!conn.room){
        if(message.type!=='join'||message.version!==PROTOCOL_VERSION||!exactKeys(message,['type','version'])){end(conn,1008,'Join protocol mismatch');return;}
        let room=availableRooms.values().next().value;
        if(!room){if(rooms.size>=maxRooms){end(conn,1013,'Server full');return;}room={id:`${workerId}:room-${randomUUID()}`,players:new Map(),seats:new Map(),nextPlayerNumber:0};rooms.set(room.id,room);availableRooms.add(room);}
        conn.number=++room.nextPlayerNumber;conn.slot=Array.from({length:ROOM_CAPACITY},(_,i)=>i).find(slot=>![...room.players.values()].some(player=>player.slot===slot));
        room.players.set(conn.id,conn);conn.room=room;if(room.players.size===ROOM_CAPACITY)availableRooms.delete(room);
        clearTimeout(conn.joinTimer);fullSnapshot(conn,'welcome');broadcastControl(room,'roster',{players:[conn]},conn);return;
      }
      if(message.type==='profile'&&exactKeys(message,['type','state'])){
        const state=sanitizePlayerState(message.state,{seatId:conn.seatId,previousSeq:conn.state.seq});
        if(!state){invalid(conn);return;}acceptState(conn,state,true);
      }else if(message.type==='resync'&&exactKeys(message,['type'])){
        if(now-conn.lastResync<1000){invalid(conn);return;}conn.lastResync=now;conn.needsFull=true;fullSnapshot(conn);
      }else if(message.type==='seat:claim'&&exactKeys(message,['type','requestId'])&&typeof message.requestId==='string'&&/^[A-Za-z0-9_.:-]{1,64}$/.test(message.requestId)){
        const seatId=conn.seatId||SEAT_IDS.find(id=>!conn.room.seats.has(id))||null;
        if(seatId){conn.room.seats.set(seatId,conn.id);conn.seatId=seatId;conn.state={...conn.state,seatId};conn.revision++;conn.packet=encodeValidatedStatePacket(conn.state);}
        send(conn,JSON.stringify({type:'seat:result',requestId:message.requestId,ok:!!seatId,seatId}));
        if(seatId&&conn.room&&!conn.ended)broadcastControl(conn.room,'seats',{seats:seatMap(conn.room),players:[conn]});
      }else if(message.type==='seat:release'&&exactKeys(message,['type']))releaseSeat(conn);
      else invalid(conn);
    });
  });
  const tick=setInterval(()=>{
    const start=performance.now();counters.tickCount++;const time=Date.now();
    for(const room of rooms.values())for(const conn of [...room.players.values()])replicate(conn,time);
    const elapsed=performance.now()-start;counters.tickDurationTotalMs+=elapsed;counters.maxTickDurationMs=Math.max(counters.maxTickDurationMs,elapsed);
  },1000/SNAPSHOT_HZ);tick.unref();
  const heartbeat=setInterval(()=>{
    for(const conn of [...connections]){
      if(!conn.alive){counters.heartbeatDisconnects++;end(conn,1008,'Heartbeat timeout',true);continue;}
      conn.alive=false;try{conn.ws.ping();}catch{end(conn,1008,'Heartbeat failed',true);}
    }
  },heartbeatMs);heartbeat.unref();
  function getStats(){
    let players=0,seats=0;for(const room of rooms.values()){players+=room.players.size;seats+=room.seats.size;}
    return {...counters,workerId,connections:connections.size,rooms:rooms.size,players,seats,worldId:WORLD_ID,uptimeSeconds:(performance.now()-started)/1000,meanTickDurationMs:counters.tickCount?counters.tickDurationTotalMs/counters.tickCount:0,eventLoopP95Ms:loopDelay.percentile(95)/1e6,eventLoopMaxMs:loopDelay.max/1e6};
  }
  return {httpServer,wss,getStats,
    async listen(port=options.port??0,host=options.host??'127.0.0.1'){
      if(httpServer.listening)return httpServer.address();
      await new Promise((resolve,reject)=>{httpServer.once('error',reject);httpServer.listen(port,host,()=>{httpServer.off('error',reject);resolve();});});return httpServer.address();
    },
    async close(){
      if(closing)return;closing=true;clearInterval(tick);clearInterval(heartbeat);loopDelay.disable();
      for(const conn of [...connections])end(conn,1001,'Server shutdown',true);
      await new Promise(resolve=>wss.close(resolve));
      if(httpServer.listening)await new Promise(resolve=>{httpServer.close(resolve);httpServer.closeIdleConnections();});
    }
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const app=createRoomServer({port:Number(process.env.PORT||8082),host:process.env.HOST||'127.0.0.1',workerId:process.env.WORKER_ID,allowedOrigins:(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean),maxConnections:positive(process.env.MAX_CONNECTIONS,2000),maxRooms:positive(process.env.MAX_ROOMS,100)});
  const address=await app.listen();console.log(JSON.stringify({event:'listening',...address,workerId:app.getStats().workerId,worldId:WORLD_ID}));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exitCode=0;});
}
