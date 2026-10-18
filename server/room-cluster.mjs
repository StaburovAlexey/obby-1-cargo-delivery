import {fork} from 'node:child_process';
import {createServer,IncomingMessage} from 'node:http';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {PROTOCOL_VERSION,ROOM_CAPACITY,WORLD_ID} from '../dist/online-protocol.js';

const entry=fileURLToPath(import.meta.url);
const integer=(value,fallback,name,min=1,max=1_000_000)=>{
  if(value===undefined||value==='')return fallback;
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<min||number>max)throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return number;
};
const send=(child,message,handle,callback)=>{
  if(!child.connected){callback?.(new Error('Worker IPC disconnected'));return false;}
  try{return child.send(message,handle,callback??(()=>{}));}catch(error){callback?.(error);return false;}
};

export function roomClusterOptionsFromEnv(env=process.env) {
  return {
    host:env.HOST||'127.0.0.1',port:integer(env.PORT,8082,'PORT',0,65535),
    workers:integer(env.WORKERS,1,'WORKERS',1,64),
    maxConnectionsPerWorker:integer(env.MAX_CONNECTIONS_PER_WORKER,500,'MAX_CONNECTIONS_PER_WORKER'),
    maxRoomsPerWorker:integer(env.MAX_ROOMS_PER_WORKER,25,'MAX_ROOMS_PER_WORKER'),
    allowedOrigins:(env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean),
  };
}

export function createRoomCluster(options={}) {
  const workerCount=integer(options.workers,1,'workers',1,64);
  const maxConnections=integer(options.maxConnectionsPerWorker,500,'maxConnectionsPerWorker');
  const maxRooms=integer(options.maxRoomsPerWorker,25,'maxRoomsPerWorker');
  const workerStaleMs=integer(options.workerStaleMs,5000,'workerStaleMs',1000);
  const shutdownTimeoutMs=integer(options.shutdownTimeoutMs,5000,'shutdownTimeoutMs',100);
  const startupTimeoutMs=integer(options.startupTimeoutMs,10000,'startupTimeoutMs',100);
  const metricsTimeoutMs=integer(options.metricsTimeoutMs,2000,'metricsTimeoutMs',100);
  const slots=new Map(),pendingStats=new Map();
  let closing=false,listening=false,listenPromise,closePromise,requestSequence=0,connectionSequence=0;
  const started=Date.now();
  const server=createServer({maxHeaderSize:8192},async(req,res)=>{
    if(req.method!=='GET'||req.url!=='/health'){
      res.writeHead(404,{'Content-Type':'text/plain','Connection':'close'});res.end('Not found');return;
    }
    const stats=await refreshStats().catch(()=>getStats());
    if(res.destroyed)return;
    res.writeHead(stats.ok?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({ok:stats.ok,version:PROTOCOL_VERSION,worldId:WORLD_ID,capacity:ROOM_CAPACITY,
      players:stats.players,rooms:stats.rooms,connections:stats.connections,uptimeSeconds:stats.uptimeSeconds,
      workers:stats.workers.map(worker=>({workerId:worker.workerId,ready:worker.ready,connections:worker.connections,
        players:worker.ready?(worker.stats.players??0):null,rooms:worker.ready?(worker.stats.rooms??0):null})),
      readyWorkers:stats.readyWorkers,configuredWorkers:workerCount,partial:stats.readyWorkers!==workerCount,
      limits:{connectionsPerWorker:maxConnections,roomsPerWorker:maxRooms,totalConnections:workerCount*maxConnections,totalRooms:workerCount*maxRooms}}));
  });
  server.headersTimeout=10_000;server.requestTimeout=10_000;server.keepAliveTimeout=5000;
  server.on('clientError',(_error,socket)=>socket.destroy());
  server.on('upgrade',(request,socket,head)=>{
    socket.on('error',()=>{});
    let path;try{path=new URL(request.url,'http://localhost').pathname;}catch{path='';}
    const reject=status=>socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    if(path!=='/ws'){reject(404);return;}
    if(closing){reject(503);return;}
    const worker=[...slots.values()].filter(isReady).filter(worker=>worker.connections.size<maxConnections)
      .sort((a,b)=>a.connections.size-b.connections.size||a.slot-b.slot)[0];
    if(!worker){reject(503);return;}
    socket.pause();
    const connectionId=++connectionSequence;
    worker.connections.add(connectionId);
    send(worker.child,{type:'room:upgrade',connectionId,head,request:{method:request.method,url:request.url,
      headers:request.headers,rawHeaders:request.rawHeaders,httpVersion:request.httpVersion,
      httpVersionMajor:request.httpVersionMajor,httpVersionMinor:request.httpVersionMinor}},socket,error=>{
      if(error){worker.connections.delete(connectionId);socket.destroy();}
    });
  });
  function isReady(worker) {
    return worker.ready&&worker.child.connected&&Date.now()-worker.lastReportAt<workerStaleMs;
  }
  function startWorker(slot,restarts=0) {
    const workerId=`w${slot+1}-${randomUUID()}`;
    const child=fork(entry,['--worker'],{serialization:'advanced',execArgv:options.workerExecArgv??[],stdio:['ignore','inherit','inherit','ipc'],
      env:{...process.env,ROOM_CLUSTER_WORKER_CONFIG:JSON.stringify({...options.workerOptions,workerId,
        maxConnections,maxRooms,allowedOrigins:options.allowedOrigins??[]})}});
    const worker={slot,workerId,child,ready:false,everReady:false,connections:new Set(),stats:{},lastReportAt:0,restarts,started:Date.now(),restartTimer:null};
    slots.set(slot,worker);
    worker.exited=new Promise(resolveExit=>child.once('exit',resolveExit));
    return new Promise((resolveReady,rejectReady)=>{
      let settled=false;
      const timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(new Error(`Worker ${workerId} startup timed out`));child.kill('SIGKILL');}},startupTimeoutMs);
      child.on('message',message=>{
        if(message?.type==='room:ready'||message?.type==='room:stats'){
          worker.stats=message.stats;worker.lastReportAt=Date.now();worker.ready=true;worker.everReady=true;
          if(message.type==='room:ready'&&!settled){settled=true;clearTimeout(timer);resolveReady(worker);}
          const pending=pendingStats.get(message.requestId);
          if(pending){pending.waiting.delete(workerId);if(!pending.waiting.size)pending.finish();}
        }else if(message?.type==='room:released')worker.connections.delete(message.connectionId);
      });
      const failed=error=>{
        worker.ready=false;
        if(!settled){settled=true;clearTimeout(timer);rejectReady(error);}
      };
      child.on('error',failed);
      child.once('exit',(code,signal)=>{
        failed(new Error(`Worker ${workerId} exited (${signal||code})`));
        worker.connections.clear();
        for(const pending of pendingStats.values())if(pending.waiting.delete(workerId)&&!pending.waiting.size)pending.finish();
        if(!closing&&(listening||worker.everReady)){
          const attempts=Date.now()-worker.started>30000?0:restarts+1;
          worker.restartTimer=setTimeout(()=>{
            if(!closing)startWorker(slot,attempts).catch(error=>options.onWorkerError?.(error));
          },Math.min(5000,100*2**Math.min(attempts,6)));
          options.onWorkerExit?.({workerId,pid:child.pid,code,signal});
        }
      });
    });
  }
  function getStats() {
    const workers=[...slots.values()].sort((a,b)=>a.slot-b.slot).map(worker=>({workerId:worker.workerId,
      pid:worker.child.pid,ready:isReady(worker),connections:worker.connections.size,stats:worker.stats}));
    const totals={players:0,rooms:0,seats:0};
    for(const worker of workers)if(worker.ready)for(const key of Object.keys(totals))totals[key]+=worker.stats[key]??0;
    const readyWorkers=workers.filter(worker=>worker.ready).length;
    return {...totals,ok:!closing&&listening&&readyWorkers===workerCount,workers,readyWorkers,configuredWorkers:workerCount,
      connections:workers.reduce((sum,worker)=>sum+worker.connections,0),uptimeSeconds:(Date.now()-started)/1000};
  }
  function refreshStats() {
    if(closing)return Promise.resolve(getStats());
    if(pendingStats.size)return pendingStats.values().next().value.promise;
    const requestId=++requestSequence;
    const waiting=new Set([...slots.values()].filter(worker=>worker.ready&&worker.child.connected).map(worker=>worker.workerId));
    if(!waiting.size)return Promise.resolve(getStats());
    let resolveStats;
    const promise=new Promise(resolve=>{resolveStats=resolve;});
    const pending={promise,waiting,finish(){clearTimeout(pending.timer);pendingStats.delete(requestId);resolveStats(getStats());}};
    pending.timer=setTimeout(()=>{
      for(const worker of slots.values())if(waiting.has(worker.workerId))worker.ready=false;
      pending.finish();
    },metricsTimeoutMs);
    pendingStats.set(requestId,pending);
    for(const worker of slots.values())if(waiting.has(worker.workerId))send(worker.child,{type:'room:stats',requestId});
    return promise;
  }
  async function close() {
    if(closePromise)return closePromise;
    closing=true;
    closePromise=(async()=>{
      for(const pending of pendingStats.values())pending.finish();
      const serverClosed=new Promise(resolveClose=>{
        if(!server.listening){resolveClose();return;}
        server.close(resolveClose);server.closeAllConnections();
      });
      const workers=[...slots.values()];
      for(const worker of workers){clearTimeout(worker.restartTimer);send(worker.child,{type:'room:close'});}
      const killTimer=setTimeout(()=>{for(const worker of workers)if(worker.child.exitCode===null&&worker.child.signalCode===null)worker.child.kill('SIGKILL');},shutdownTimeoutMs);
      await Promise.all(workers.map(worker=>worker.exited));
      clearTimeout(killTimer);await serverClosed;listening=false;
    })();
    return closePromise;
  }
  return {httpServer:server,getStats,refreshStats,close,
    async listen(port=options.port??0,host=options.host??'127.0.0.1') {
      if(closing)throw new Error('Room cluster is closed');
      if(listenPromise)return listenPromise;
      listenPromise=(async()=>{
        try{
          await Promise.all(Array.from({length:workerCount},(_,slot)=>startWorker(slot)));
          if(closing)throw new Error('Room cluster is closed');
          await new Promise((resolveListen,reject)=>{
            server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolveListen();});
          });
          listening=true;return server.address();
        }catch(error){await close();throw error;}
      })();
      return listenPromise;
    },
  };
}

async function runWorker() {
  if(!process.send)throw new Error('Room workers must be launched by room-cluster.mjs');
  const {createRoomServer}=await import('./room-server.mjs');
  const app=createRoomServer(JSON.parse(process.env.ROOM_CLUSTER_WORKER_CONFIG));
  let closing=false,peakRssBytes=process.memoryUsage().rss;
  const report=(type,requestId)=>{
    const rssBytes=process.memoryUsage().rss;peakRssBytes=Math.max(peakRssBytes,rssBytes);
    send(process,{type,requestId,stats:{...app.getStats(),pid:process.pid,cpuUsage:process.cpuUsage(),rssBytes,peakRssBytes}});
  };
  const sample=setInterval(()=>report('room:stats'),1000);sample.unref();
  const close=async()=>{
    if(closing)return;closing=true;clearInterval(sample);await app.close();
    if(process.connected)process.disconnect();
  };
  process.on('message',(message,socket)=>{
    if(message?.type==='room:upgrade'){
      if(!socket){send(process,{type:'room:released',connectionId:message.connectionId});return;}
      socket.on('error',()=>{});
      socket.once('close',()=>send(process,{type:'room:released',connectionId:message.connectionId}));
      if(closing){socket.destroy();return;}
      const request=new IncomingMessage(socket);
      Object.assign(request,message.request);
      try{app.httpServer.emit('upgrade',request,socket,message.head);socket.resume();}catch{socket.destroy();}
    }else if(message?.type==='room:stats')report('room:stats',message.requestId);
    else if(message?.type==='room:close')void close();
  });
  process.once('disconnect',()=>void close());
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void close());
  report('room:ready');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.includes('--worker'))await runWorker();
  else{
    let app;
    try{
      app=createRoomCluster({...roomClusterOptionsFromEnv(),onWorkerExit:event=>console.error(JSON.stringify({event:'worker-exit',...event})),
        onWorkerError:error=>console.error(JSON.stringify({event:'worker-error',error:error.message}))});
      const address=await app.listen();
      console.log(JSON.stringify({event:'listening',...address,worldId:WORLD_ID,workers:app.getStats().configuredWorkers}));
      for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exitCode=0;});
    }catch(error){console.error(`Room cluster startup failed: ${error.message}`);if(app)await app.close();process.exitCode=1;}
  }
}
