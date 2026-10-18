import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {monitorEventLoopDelay} from 'node:perf_hooks';
const root=process.env.STRESS_SOURCE_ROOT?pathToFileURL(`${resolve(process.env.STRESS_SOURCE_ROOT)}/`):new URL('../',import.meta.url);
const {createRoomServer}=await import(new URL('server/room-server.mjs',root));
const app=createRoomServer({host:'127.0.0.1'});const address=await app.listen();
const loop=monitorEventLoopDelay({resolution:20});loop.enable();
let peakRss=process.memoryUsage().rss;
const sampler=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},100);sampler.unref();
process.on('message',async message=>{
  try{
    if(message.type==='reset'){loop.reset();peakRss=process.memoryUsage().rss;if(process.connected)process.send({event:'reply',requestId:message.requestId,value:{ok:true}});}
    if(message.type==='stats'&&process.connected)process.send({event:'reply',requestId:message.requestId,value:{...app.getStats(),pid:process.pid,cpuUsage:process.cpuUsage(),rssBytes:process.memoryUsage().rss,peakRssBytes:peakRss,eventLoopP95Ms:loop.percentile(95)/1e6,eventLoopMaxMs:loop.max/1e6}});
    if(message.type==='close'){clearInterval(sampler);loop.disable();await app.close();if(process.connected)process.disconnect();}
  }catch(error){if(process.connected)process.send({event:'reply',requestId:message.requestId,error:error.stack});}
});
process.on('disconnect',async()=>{clearInterval(sampler);loop.disable();await app.close();});
process.send({event:'ready',pid:process.pid,port:address.port});
