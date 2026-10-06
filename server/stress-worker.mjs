// Separate server process: client JSON parsing and orchestration do not pollute these measurements.
import {createRoomServer} from './room-server.mjs';
const app=createRoomServer();const address=await app.listen();
let peakRss=process.memoryUsage().rss;
const sampler=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},100);sampler.unref();
process.on('message',async message=>{
  try{
    if(message.type==='stats'&&process.connected)process.send({event:'reply',requestId:message.requestId,value:{...app.getStats(),pid:process.pid,cpuUsage:process.cpuUsage(),rssBytes:process.memoryUsage().rss,peakRssBytes:peakRss}});
    if(message.type==='close'){clearInterval(sampler);await app.close();if(process.connected)process.disconnect();}
  }catch(error){if(process.connected)process.send({event:'reply',requestId:message.requestId,error:error.stack});}
});
process.on('disconnect',async()=>{clearInterval(sampler);await app.close();});
process.send({event:'ready',pid:process.pid,port:address.port});
