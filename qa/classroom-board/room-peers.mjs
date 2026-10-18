import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import WebSocket from 'ws';
import {createInitialPlayerState} from '../../dist/online-protocol.js';
import {CLASSROOM_DESKS} from '../../dist/garage-scene.js';
import {canyonPointAt} from '../../dist/canyon-track.js';

const url=process.argv[2]||'ws://127.0.0.1:8082/ws',clients=[];
async function join(){
 const ws=new WebSocket(url),messages=[],listeners=new Set();
 ws.on('message',raw=>{const message=JSON.parse(raw);messages.push(message);if(messages.length>40)messages.shift();for(const fn of listeners)fn(message);});
 await once(ws,'open');
 const client={ws,seq:0,timer:null,send:value=>ws.send(JSON.stringify(value)),wait(match){
  const found=messages.find(match);if(found)return Promise.resolve(found);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{listeners.delete(receive);reject(Error('Room reply timeout'));},5000);
   const receive=message=>{if(match(message)){clearTimeout(timer);listeners.delete(receive);resolve(message);}};listeners.add(receive);});
 },state(values){this.send({type:'state',state:{...createInitialPlayerState(),...values,seq:++this.seq}});}};
 clients.push(client);client.send({type:'join',version:1});client.welcome=await client.wait(m=>m.type==='welcome');return client;
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{for(const c of clients){clearInterval(c.timer);c.ws.close();}process.exitCode=0;});
try{
 for(let i=0;i<2;i++){
  const student=await join();student.send({type:'seat:claim',requestId:'desk'});const reservation=await student.wait(m=>m.requestId==='desk');
  const desk=CLASSROOM_DESKS.find(d=>d.id===reservation.seatId);if(!desk)throw Error('No free classroom seat');
  const pose={mode:'studying',position:[desk.seat.x,.5,desk.seat.z],seatId:desk.id};
  student.state(pose);student.timer=setInterval(()=>student.state(pose),100);
  console.log(JSON.stringify({event:'student',id:student.welcome.id,seatId:desk.id}));
 }
 const driver=await join();
 const pose=progress=>{const p=canyonPointAt(progress),heading=p.heading+.5;return {mode:'driving',vehicleId:'bmwreward',
  position:[p.x,p.height,p.z],heading,quaternion:[0,Math.sin(heading/2),0,Math.cos(heading/2)],speed:45};};
 driver.state(pose(12));driver.send({type:'drift:start',requestId:'run'});const start=await driver.wait(m=>m.requestId==='run');
 if(!start.ok)throw Error('Server refused drift start');
 const began=performance.now();let finished=false;
 driver.timer=setInterval(()=>{
  const progress=Math.min(1840,12+(performance.now()-began)*.045);
  driver.state({...pose(progress),speed:finished?0:45});
  if(progress===1840&&!finished){finished=true;driver.send({type:'drift:finish',requestId:'finish',runId:start.runId});}
 },100);
 const result=await driver.wait(m=>m.requestId==='finish').catch(error=>{if(error.message==='Room reply timeout')return null;throw error;});
 if(result)console.log(JSON.stringify({event:'result',...result}));
 else {
  console.log(JSON.stringify({event:'driving',note:'A real-time run takes about 41 seconds.'}));
  driver.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.requestId==='finish')console.log(JSON.stringify({event:'result',...m}));});
 }
}catch(error){console.error(error);for(const c of clients){clearInterval(c.timer);c.ws.terminate();}process.exitCode=1;}
