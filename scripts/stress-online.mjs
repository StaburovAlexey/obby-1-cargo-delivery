import {fork,execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg.replace(/^--/,''),true]:[arg.slice(2,at),arg.slice(at+1)];}));
const users=String(args.users||'100,200,500,1000').split(',').map(Number);
const duration=Number(args.duration||15),clientsPerWorker=Number(args['clients-per-worker']||100),metricsTimeout=Number(args['metrics-timeout-ms']||30000);
if(!users.length||users.some(n=>!Number.isInteger(n)||n<20||n>2000||n%20)||!Number.isFinite(duration)||duration<.5||duration>3600||!Number.isInteger(clientsPerWorker)||clientsPerWorker<20||clientsPerWorker>200||clientsPerWorker%20||!Number.isFinite(metricsTimeout)||metricsTimeout<100)throw new Error('Use --users=100,200,500,1000 --duration=15 --clients-per-worker=100 --metrics-timeout-ms=30000');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const percentile=(values,p)=>values.length?values.sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]:0;
const round=value=>Math.round(value*100)/100;
const log=value=>console.log(JSON.stringify(value));
const sum=(values,key)=>values.reduce((total,value)=>total+(Number(value[key])||0),0);
const max=(values,key)=>values.reduce((largest,value)=>Math.max(largest,Number(value[key])||0),0);
function host(){
  const cpu=os.cpus().reduce((result,c)=>{for(const [key,value] of Object.entries(c.times)){result.total+=value;if(key==='idle')result.idle+=value;}return result;},{total:0,idle:0});
  let swapUsedMB=null;try{const data=readFileSync('/proc/meminfo','utf8');swapUsedMB=round((Number(/SwapTotal:\s+(\d+)/.exec(data)?.[1]||0)-Number(/SwapFree:\s+(\d+)/.exec(data)?.[1]||0))/1024);}catch{}
  let topCpu=[];try{topCpu=execFileSync('ps',['-eo','comm=,pcpu=','--sort=-pcpu'],{encoding:'utf8',timeout:2000}).trim().split('\n').slice(0,8).map(line=>{const match=/^\s*(.*?)\s+([\d.]+)\s*$/.exec(line);return match?{command:match[1],cpuPercent:Number(match[2])}:null;}).filter(Boolean);}catch{}
  return {at:new Date().toISOString(),logicalCpus:os.cpus().length,loadAverage:os.loadavg().map(round),availableMemoryMB:round(os.freemem()/1048576),totalMemoryMB:round(os.totalmem()/1048576),swapUsedMB,topCpu,cpu};
}
function worker(file){
  const child=fork(new URL(file,import.meta.url),[],{stdio:['ignore','ignore','inherit','ipc']});
  let serial=0,exited=false,readyResolve,readyReject;const pending=new Map();
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const timer=setTimeout(()=>{readyReject(new Error(`Worker startup timeout ${file}`));child.kill('SIGKILL');},metricsTimeout);
  const fail=error=>{readyReject(error);for(const request of pending.values()){clearTimeout(request.timer);request.reject(error);}pending.clear();};
  child.on('error',fail);
  child.on('exit',(code,signal)=>{exited=true;clearTimeout(timer);fail(new Error(`Worker ${child.pid} exited (${code??signal})`));});
  child.on('message',message=>{
    if(message.event==='ready'){clearTimeout(timer);readyResolve(message);}
    if(message.event==='reply'){
      const request=pending.get(message.requestId);if(!request)return;pending.delete(message.requestId);clearTimeout(request.timer);
      if(message.error)request.reject(new Error(message.error));else request.resolve(message.value);
    }
  });
  return {child,ready,
    request(type,data={},timeout=metricsTimeout){
      if(exited||!child.connected)return Promise.reject(new Error(`Worker ${child.pid} is disconnected`));
      return new Promise((resolve,reject)=>{
        const requestId=++serial;
        const deadline=setTimeout(()=>{pending.delete(requestId);reject(new Error(`${type} response timeout from worker ${child.pid} after ${timeout}ms`));},timeout);
        pending.set(requestId,{resolve,reject,timer:deadline});
        child.send({type,...data,requestId},error=>{if(error){const request=pending.get(requestId);if(request){pending.delete(requestId);clearTimeout(request.timer);reject(error);}}});
      });
    },
    async close(){
      if(exited)return;const done=new Promise(resolve=>child.once('exit',resolve));
      if(child.connected)child.send({type:'close'},()=>{});else child.kill('SIGTERM');
      const force=setTimeout(()=>child.kill('SIGKILL'),5000);await done;clearTimeout(force);
    }
  };
}
async function waitFor(predicate,timeout=metricsTimeout){
  const deadline=performance.now()+timeout;
  while(performance.now()<deadline){if(await predicate())return;await delay(50);}throw new Error('Timed out waiting for settled room/seat counts');
}
async function step(count){
  const beforeHost=host(),loaders=[];let server,phase='server-start',before,lastStats,start=0,pulse,loadMetrics=[];
  let report;
  try{
    server=worker('../server/stress-worker.mjs');const address=await server.ready;
    log({event:'step:start',users:count,serverPid:address.pid,host:beforeHost});
    phase='clients-connect';
    for(let from=0;from<count;from+=clientsPerWorker){const loader=worker('../server/stress-client-worker.mjs');loader.from=from;loader.count=Math.min(clientsPerWorker,count-from);loaders.push(loader);}
    await Promise.all(loaders.map(async loader=>{await loader.ready;await loader.request('connect',{url:`ws://127.0.0.1:${address.port}/ws`,from:loader.from,count:loader.count});}));
    phase='seat-claims';await Promise.all(loaders.map(loader=>loader.request('claim')));
    await waitFor(async()=>{const inspections=await Promise.all(loaders.map(loader=>loader.request('inspect',{fullSeats:true})));return inspections.every(value=>value.settled);});
    phase='seat-release';await Promise.all(loaders.map(loader=>loader.request('release')));
    await waitFor(async()=>{lastStats=await server.request('stats');return lastStats.players===count&&lastStats.seats===count/5;});
    before=lastStats;start=performance.now();phase='moving';
    await Promise.all(loaders.map(loader=>loader.request('start')));
    let pulseBusy=false;
    pulse=setInterval(()=>{
      if(pulseBusy)return;pulseBusy=true;
      server.request('stats').then(stats=>{lastStats=stats;log({event:'progress',users:count,elapsedSeconds:round((performance.now()-start)/1000),players:stats.players,rooms:stats.rooms,rssMB:round(stats.rssBytes/1048576),eventLoopP95Ms:round(stats.eventLoopP95Ms)});}).catch(error=>log({event:'progress:error',users:count,error:error.message})).finally(()=>{pulseBusy=false;});
    },5000);
    await delay(duration*350);phase='reconnect';
    for(let index=0;index<Math.max(1,Math.floor(count*.01));index++){
      const loader=loaders.find(value=>index>=value.from&&index<value.from+value.count);
      await loader.request('disconnectOne',{index});
      await waitFor(async()=>{lastStats=await server.request('stats');return lastStats.players===count-1;});
      await loader.request('replaceOne',{index});
    }
    phase='moving';await delay(duration*650);phase='collect';clearInterval(pulse);
    await waitFor(async()=>{const inspections=await Promise.all(loaders.map(loader=>loader.request('inspect')));return inspections.every(value=>value.settled);});
    loadMetrics=await Promise.all(loaders.map(loader=>loader.request('stop')));
    lastStats=await server.request('stats');const seconds=(performance.now()-start)/1000;
    const rooms=new Set(loadMetrics.flatMap(value=>value.rooms));const errors=loadMetrics.flatMap(value=>value.errors).slice(0,50);
    if(lastStats.players!==count||lastStats.rooms!==count/20||lastStats.seats!==count/5||rooms.size!==count/20)errors.push(`Count mismatch: players=${lastStats.players},rooms=${lastStats.rooms}/${rooms.size},seats=${lastStats.seats}`);
    if(lastStats.invalidMessages)errors.push(`${lastStats.invalidMessages} valid moving states rejected`);
    const afterHost=host(),cpuUs=lastStats.cpuUsage.user+lastStats.cpuUsage.system-before.cpuUsage.user-before.cpuUsage.system;
    const receivedSnapshots=sum(loadMetrics,'receivedSnapshots'),sentStates=sum(loadMetrics,'sentStates');
    const tickDeliveryRatio=receivedSnapshots/(count*seconds*10),stateDeliveryRatio=sentStates/(count*seconds*10);
    const hostTotal=afterHost.cpu.total-beforeHost.cpu.total,hostIdle=afterHost.cpu.idle-beforeHost.cpu.idle;
    report={event:'step',users:count,rooms:rooms.size,durationSeconds:round(seconds),ok:errors.length===0,targetMet:errors.length===0&&tickDeliveryRatio>=.95&&stateDeliveryRatio>=.95,reconnects:sum(loadMetrics,'reconnects'),errors,server:{pid:lastStats.pid,cpuPercent:round(cpuUs/seconds/10000),rssMB:round(lastStats.rssBytes/1048576),peakRssMB:round(lastStats.peakRssBytes/1048576),eventLoopP95Ms:round(lastStats.eventLoopP95Ms),eventLoopMaxMs:round(lastStats.eventLoopMaxMs),meanTickDurationMs:round((lastStats.tickDurationTotalMs-before.tickDurationTotalMs)/Math.max(1,lastStats.tickCount-before.tickCount)),maxTickDurationMs:round(lastStats.maxTickDurationMs),skippedSnapshots:lastStats.skippedSnapshots,backpressureDisconnects:lastStats.backpressureDisconnects,players:lastStats.players,seats:lastStats.seats},generator:{processes:loaders.length,pids:loadMetrics.map(value=>value.pid),clientsPerProcess:clientsPerWorker,cpuPercent:round(sum(loadMetrics,'cpuPercent')),rssMB:round(sum(loadMetrics,'rssBytes')/1048576),peakRssMB:round(sum(loadMetrics,'peakRssBytes')/1048576),eventLoopP95Ms:round(max(loadMetrics,'eventLoopP95Ms')),eventLoopMaxMs:round(max(loadMetrics,'eventLoopMaxMs'))},host:{before:beforeHost,after:afterHost,busyCpuPercent:round(hostTotal?(1-hostIdle/hostTotal)*100:0)},delivery:{receivedSnapshots,snapshotsPerClientSecond:round(receivedSnapshots/count/seconds),tickDeliveryRatio:round(tickDeliveryRatio),statesPerClientSecond:round(sentStates/count/seconds),minClientTicks:Math.min(...loadMetrics.map(value=>value.minClientTicks)),gapP95Ms:round(percentile(loadMetrics.flatMap(value=>value.gaps),.95)),gapMaxMs:round(max(loadMetrics,'maxGap')),ageP95Ms:round(percentile(loadMetrics.flatMap(value=>value.ages),.95))},throughput:{sentStates,uploadBytesPerSecond:round(sum(loadMetrics,'sentStateBytes')/seconds),sentMessagesPerSecond:round((lastStats.sentMessages-before.sentMessages)/seconds),sentBytesPerSecond:round((lastStats.sentBytes-before.sentBytes)/seconds),receivedBytesPerSecond:round(sum(loadMetrics,'receivedBytes')/seconds)}};
  }catch(error){
    clearInterval(pulse);
    // Emit a result even when a child fails; prior JSON reports remain reviewable.
    report={event:'step',users:count,rooms:lastStats?.rooms??0,durationSeconds:start?round((performance.now()-start)/1000):0,ok:false,targetMet:false,phase,errors:[error.message],server:lastStats||null,generator:{processes:loaders.length,pids:loaders.map(loader=>loader.child.pid)},host:{before:beforeHost,after:host()}};
  }finally{
    clearInterval(pulse);await Promise.allSettled(loaders.map(loader=>loader.close()));if(server)await server.close();
  }
  log(report);return report;
}
const reports=[];
for(const count of users)reports.push(await step(count));
const ok=reports.every(report=>report.ok),targetMet=reports.every(report=>report.targetMet);
log({event:'complete',ok,targetMet,steps:reports.length,scope:'loopback; server and client batches use separate processes; host contention recorded; ok=protocol/count checks; targetMet=at least95%of10Hz input/output; no VPS capacity claim'});
if(!ok)process.exitCode=1;
