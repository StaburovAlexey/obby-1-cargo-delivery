import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {WebSocketServer,WebSocket} from 'ws';
import {PROTOCOL_VERSION,ROOM_CAPACITY,SNAPSHOT_HZ,WORLD_ID,SEAT_IDS,createInitialPlayerState,sanitizePlayerState} from '../dist/online-protocol.js';

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
  const heartbeatMs=positive(options.heartbeatMs,15_000);
  const joinTimeoutMs=positive(options.joinTimeoutMs,5_000);
  const maxPayload=positive(options.maxPayload,4096);
  const maxMessagesPerSecond=positive(options.maxMessagesPerSecond,40);
  const maxConnections=positive(options.maxConnections,2000);
  const maxRooms=positive(options.maxRooms,100);
  const softBackpressureBytes=positive(options.softBackpressureBytes,256*1024);
  const hardBackpressureBytes=positive(options.hardBackpressureBytes,1024*1024);
  const maxSkippedSnapshots=positive(options.maxSkippedSnapshots,10);
  const allowedOrigins=options.allowedOrigins||[];
  const rooms=new Map(),availableRooms=new Set(),connections=new Set();
  const loopDelay=monitorEventLoopDelay({resolution:20});loopDelay.enable();
  const counters={accepted:0,disconnected:0,invalidMessages:0,receivedMessages:0,receivedBytes:0,sentMessages:0,sentBytes:0,snapshots:0,skippedSnapshots:0,backpressureDisconnects:0,heartbeatDisconnects:0,tickCount:0,tickDurationTotalMs:0,maxTickDurationMs:0};
  const started=performance.now();let closing=false;
  const httpServer=createServer((req,res)=>{
    if(req.url==='/health'&&req.method==='GET') {
      const stats=getStats();res.writeHead(closing?503:200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({ok:!closing,version:PROTOCOL_VERSION,worldId:WORLD_ID,capacity:ROOM_CAPACITY,players:stats.players,rooms:stats.rooms,connections:stats.connections,uptimeSeconds:stats.uptimeSeconds}));
    } else {res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
  });
  httpServer.headersTimeout=10_000;httpServer.requestTimeout=10_000;
  const wss=new WebSocketServer({noServer:true,maxPayload,perMessageDeflate:false,clientTracking:false});
  httpServer.on('upgrade',(req,socket,head)=>{
    let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{path='';}
    let status=path!=='/ws'?404:closing||connections.size>=maxConnections?503:!originAllowed(req.headers.origin,allowedOrigins)?403:0;
    if(status){socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  function releaseSeat(conn) {
    if(conn.seatId&&conn.room)conn.room.seats.delete(conn.seatId);
    conn.seatId=null;
    if(conn.state)conn.state={...conn.state,seatId:null,mode:conn.state.mode==='studying'?'walking':conn.state.mode};
  }
  function detach(conn) {
    if(!connections.delete(conn))return;
    clearTimeout(conn.joinTimer);clearTimeout(conn.closeTimer);releaseSeat(conn);
    if(conn.room){const room=conn.room;room.players.delete(conn.id);if(!room.players.size){rooms.delete(room.id);availableRooms.delete(room);}else availableRooms.add(room);conn.room=null;}
    counters.disconnected++;
  }
  function end(conn,code=1008,reason='Invalid message',terminate=false) {
    if(conn.ended)return;conn.ended=true;detach(conn);
    if(terminate){conn.ws.terminate();return;}
    conn.ws.close(code,reason);conn.closeTimer=setTimeout(()=>conn.ws.terminate(),250);conn.closeTimer.unref();
  }
  function send(conn,payload,snapshot=false) {
    if(conn.ended||conn.ws.readyState!==WebSocket.OPEN)return false;
    const buffered=conn.ws.bufferedAmount;
    if(buffered>hardBackpressureBytes){counters.backpressureDisconnects++;end(conn,1013,'Slow receiver',true);return false;}
    if(buffered>softBackpressureBytes&&snapshot){counters.skippedSnapshots++;if(++conn.skipped>=maxSkippedSnapshots){counters.backpressureDisconnects++;end(conn,1013,'Slow receiver',true);}return false;}
    conn.skipped=0;
    counters.sentMessages++;counters.sentBytes+=typeof payload==='string'?Buffer.byteLength(payload):payload.length;
    conn.ws.send(payload,{binary:false},error=>{if(error)end(conn,1011,'Send failed',true);});return true;
  }
  function roomPayload(room,type='snapshot',extra={}) {
    return {type,...extra,time:Date.now(),players:[...room.players.values()].map(conn=>({id:conn.id,state:conn.state})),seats:Object.fromEntries(room.seats)};
  }
  function invalid(conn) {counters.invalidMessages++;if(++conn.invalid>=30)end(conn);}
  wss.on('connection',ws=>{
    const conn={ws,id:randomUUID(),room:null,state:createInitialPlayerState(),seatId:null,alive:true,ended:false,invalid:0,tokens:maxMessagesPerSecond,rateAt:performance.now(),skipped:0};
    connections.add(conn);counters.accepted++;
    conn.joinTimer=setTimeout(()=>end(conn,1008,'Join timeout'),joinTimeoutMs);conn.joinTimer.unref();
    ws.on('pong',()=>{conn.alive=true;});ws.on('close',()=>{clearTimeout(conn.closeTimer);detach(conn);});ws.on('error',()=>end(conn,1008,'Socket error',true));
    ws.on('message',(raw,isBinary)=>{
      if(conn.ended)return;
      counters.receivedMessages++;counters.receivedBytes+=raw.length;
      const now=performance.now();conn.tokens=Math.min(maxMessagesPerSecond,conn.tokens+(now-conn.rateAt)*maxMessagesPerSecond/1000);conn.rateAt=now;
      if(conn.tokens<1){end(conn,1008,'Message rate exceeded');return;}conn.tokens--;
      if(isBinary){invalid(conn);return;}
      let message;try{message=JSON.parse(raw);}catch{invalid(conn);return;}
      if(!message||typeof message!=='object'||Array.isArray(message)){invalid(conn);return;}
      if(!conn.room) {
        if(message.type!=='join'||message.version!==PROTOCOL_VERSION||!exactKeys(message,['type','version'])){end(conn,1008,'Join protocol mismatch');return;}
        let room=availableRooms.values().next().value;
        if(!room){if(rooms.size>=maxRooms){end(conn,1013,'Server full');return;}room={id:`room-${randomUUID()}`,players:new Map(),seats:new Map()};rooms.set(room.id,room);availableRooms.add(room);}
        room.players.set(conn.id,conn);conn.room=room;if(room.players.size===ROOM_CAPACITY)availableRooms.delete(room);
        clearTimeout(conn.joinTimer);
        send(conn,JSON.stringify(roomPayload(room,'welcome',{id:conn.id,roomId:room.id,capacity:ROOM_CAPACITY})));return;
      }
      if(message.type==='state'&&exactKeys(message,['type','state'])) {
        const state=sanitizePlayerState(message.state,{seatId:conn.seatId,previousSeq:conn.state.seq});
        if(!state){invalid(conn);return;}conn.state=state;
      } else if(message.type==='seat:claim'&&exactKeys(message,['type','requestId'])&&typeof message.requestId==='string'&&/^[A-Za-z0-9_.:-]{1,64}$/.test(message.requestId)) {
        const seatId=conn.seatId||SEAT_IDS.find(id=>!conn.room.seats.has(id))||null;
        if(seatId){conn.room.seats.set(seatId,conn.id);conn.seatId=seatId;conn.state={...conn.state,seatId};}
        send(conn,JSON.stringify({type:'seat:result',requestId:message.requestId,ok:!!seatId,seatId}));
      } else if(message.type==='seat:release'&&exactKeys(message,['type']))releaseSeat(conn);
      else invalid(conn);
    });
  });
  const tick=setInterval(()=>{
    const start=performance.now();counters.tickCount++;
    for(const room of rooms.values()) {
      const payload=Buffer.from(JSON.stringify(roomPayload(room)));
      counters.snapshots++;
      for(const conn of room.players.values())send(conn,payload,true);
    }
    const elapsed=performance.now()-start;counters.tickDurationTotalMs+=elapsed;counters.maxTickDurationMs=Math.max(counters.maxTickDurationMs,elapsed);
  },1000/SNAPSHOT_HZ);tick.unref();
  const heartbeat=setInterval(()=>{
    for(const conn of connections) {
      if(!conn.alive){counters.heartbeatDisconnects++;end(conn,1008,'Heartbeat timeout',true);continue;}
      conn.alive=false;try{conn.ws.ping();}catch{end(conn,1008,'Heartbeat failed',true);}
    }
  },heartbeatMs);heartbeat.unref();
  function getStats() {
    let players=0,seats=0;for(const room of rooms.values()){players+=room.players.size;seats+=room.seats.size;}
    return {...counters,connections:connections.size,rooms:rooms.size,players,seats,worldId:WORLD_ID,uptimeSeconds:(performance.now()-started)/1000,meanTickDurationMs:counters.tickCount?counters.tickDurationTotalMs/counters.tickCount:0,eventLoopP95Ms:loopDelay.percentile(95)/1e6,eventLoopMaxMs:loopDelay.max/1e6};
  }
  return {httpServer,wss,getStats,
    async listen(port=options.port??0,host=options.host??'127.0.0.1') {
      if(httpServer.listening)return httpServer.address();
      await new Promise((resolve,reject)=>{httpServer.once('error',reject);httpServer.listen(port,host,()=>{httpServer.off('error',reject);resolve();});});return httpServer.address();
    },
    async close() {
      if(closing)return;closing=true;clearInterval(tick);clearInterval(heartbeat);loopDelay.disable();
      for(const conn of [...connections])end(conn,1001,'Server shutdown',true);
      await new Promise(resolve=>wss.close(resolve));
      if(httpServer.listening)await new Promise(resolve=>{httpServer.close(resolve);httpServer.closeIdleConnections();});
    }
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const app=createRoomServer({port:Number(process.env.PORT||8081),host:process.env.HOST||'127.0.0.1',allowedOrigins:(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean),maxConnections:positive(process.env.MAX_CONNECTIONS,2000),maxRooms:positive(process.env.MAX_ROOMS,100)});
  const address=await app.listen();console.log(JSON.stringify({event:'listening',...address,worldId:WORLD_ID}));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exitCode=0;});
}
