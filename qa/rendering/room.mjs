import {once} from 'node:events';
import WebSocket from 'ws';
import {createRoomServer} from '../../server/room-server.mjs';
import {createInitialPlayerState} from '../../dist/online-protocol.js';

// A dedicated loopback room; the development HTTP server proxies phone WS
// requests here. One browser plus these nineteen peers fills exactly one room.
const port=Number(process.argv.find(x=>x.startsWith('--port='))?.split('=')[1]||8092);
const server=createRoomServer(),peers=[],ids=new Set();let human=null,timer,stopping=false;
async function stop(){
 if(stopping)return;stopping=true;clearInterval(timer);
 for(const p of peers)p.ws.terminate();
 await server.close();
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void stop());
try{
 await server.listen({host:'127.0.0.1',port});
 for(let i=0;i<19;i++){
  const ws=new WebSocket('ws://127.0.0.1:'+port+'/ws'),peer={ws,seq:0,id:null};
  peers.push(peer);
  ws.on('message',raw=>{
   const message=JSON.parse(raw);
   if(message.type==='welcome'){peer.id=message.id;ids.add(message.id);}
   if(message.players)human=message.players.find(p=>!ids.has(p.id))||null;
  });
  await once(ws,'open');ws.send(JSON.stringify({type:'join',version:1}));
  while(!peer.id)await new Promise(resolve=>setTimeout(resolve,5));
 }
 human=null;
 timer=setInterval(()=>{
  for(const [i,p]of peers.entries()){
   if(p.ws.readyState!==WebSocket.OPEN)continue;
   const s=human?.state,heading=s?.heading||0,right={x:Math.cos(heading),z:-Math.sin(heading)},forward={x:-Math.sin(heading),z:-Math.cos(heading)};
   const driving=s?.mode==='driving',across=(i%3-1)*(driving?7:4),along=(Math.floor(i/3)-2)*(driving?10:4);
   const origin=s?.position||[-32,.5,55],phase=performance.now()/1000+i;
   const position=[origin[0]+right.x*across+forward.x*along,origin[1],origin[2]+right.z*across+forward.z*along];
   if(!driving){position[0]+=Math.sin(phase)*.2;position[2]+=Math.cos(phase)*.2;}
   p.ws.send(JSON.stringify({type:'state',state:{...createInitialPlayerState(),seq:++p.seq,mode:driving?'driving':'walking',
    characterId:'dancing-npc-girl',vehicleId:driving?'bmwreward':null,position,
    heading,quaternion:[0,Math.sin(heading/2),0,Math.cos(heading/2)],speed:driving?s.speed:1,
    steer:s?.steer||0,wheelSpin:s?.wheelSpin||0,bodyPitch:s?.bodyPitch||0,bodyRoll:s?.bodyRoll||0,bodyBob:s?.bodyBob||0,teleportId:s?.teleportId||0}}));
  }
 },100);
 console.log(JSON.stringify({ready:true,roomPort:port,peers:19,capacity:20,note:'Open one browser on the dedicated frontend. Peers follow that browser; close desktop QA before joining from iPhone.'}));
}catch(error){console.error(error);await stop();process.exitCode=1;}
