import {once} from 'node:events';
import WebSocket from 'ws';
import {createRoomServer} from '../../server/room-server.mjs';
import {createOnlineClient} from '../../dist/online-client.js';
import {PROTOCOL_VERSION,createInitialPlayerState,encodeStatePacket} from '../../dist/online-protocol.js';
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const initial=(overrides={})=>({...createInitialPlayerState(),seq:1,...overrides});
export async function fixture(t,options={}){
  const app=createRoomServer(options),address=await app.listen(),clients=[];
  t.after(async()=>{for(const c of clients){c.api?.dispose();c.ws.terminate();}await app.close();});
  return {app,url:`ws://127.0.0.1:${address.port}/ws`,http:`http://127.0.0.1:${address.port}`,
    async connect(opts={}){
      const ws=new WebSocket(this.url,opts),messages=[];ws.on('error',()=>{});ws.on('message',(bytes,binary)=>{if(!binary)messages.push(JSON.parse(bytes));});
      await once(ws,'open');const c={ws,messages,send:message=>ws.send(JSON.stringify(message))};clients.push(c);return c;
    },
    async join(opts={}){
      let ws;const messages=[],wire=[];let state=initial();
      class Socket extends WebSocket{constructor(url){super(url,opts);ws=this;this.on('message',(bytes,binary)=>wire.push({bytes:Buffer.from(bytes),binary}));}}
      const api=createOnlineClient({url:this.url,WebSocketClass:Socket,getState:()=>state,onSnapshot:snapshot=>messages.push({...snapshot,players:api.roomSnapshot?.players??snapshot.players})});
      api.start();const c={api,ws,messages,wire,setState(value){state=value;},send(message){ws.send(JSON.stringify(message));},movement(value){ws.send(encodeStatePacket(value));},async wait(predicate,timeout=2000){
        const end=Date.now()+timeout;while(Date.now()<end){const i=messages.findIndex(predicate);if(i>=0)return messages.splice(i,1)[0];await delay(5);}throw Error(`Message timeout; received ${JSON.stringify(messages.slice(-2))}`);
      }};clients.push(c);
      const end=Date.now()+2000;while(!api.connected&&Date.now()<end)await delay(5);
      if(!api.connected)throw Error('Join timeout');
      c.welcome=wire.filter(frame=>!frame.binary).map(frame=>JSON.parse(frame.bytes)).find(message=>message.type==='welcome');return c;
    }
  };
}
export {PROTOCOL_VERSION};
