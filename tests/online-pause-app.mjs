import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {PROTOCOL_VERSION,createInitialPlayerState,decodeStatePacket} from '../dist/online-protocol.js';

test('pause, visibility, focus, cached-page and graphics transitions reach peers without a RAF callback',()=>{
 const originalSocket=globalThis.WebSocket;let socket;
 class Socket {
  readyState=1;bufferedAmount=0;sent=[];
  constructor(){socket=this;}
  send(value){this.sent.push(value);}
  close(){this.readyState=3;this.onclose?.();}
 }
 globalThis.WebSocket=Socket;
 const platform={ready(){},gameplayStart(){},gameplayStop(){},showAd:async()=>({wasShown:false})};
 const f=createAppDom({startDriving:false,services:{serverUrl:'ws://test-room',platform,cloud:{flush:async()=>{}}}});
 try{
  const d=f.debug;d.online.start();socket.onopen();
  socket.onmessage({data:JSON.stringify({type:'welcome',version:PROTOCOL_VERSION,sequence:0,id:'self',roomId:'room',time:0,seats:{},players:[{id:'self',slot:0,number:1,cadenceMs:100,state:createInitialPlayerState()}]})});
  d.online.update(0);
  const states=()=>socket.sent.filter(value=>value instanceof Uint8Array).map(value=>decodeStatePacket(value));
  assert.equal(states().at(-1).paused,false);const renders=d.renderer.renderCount;
  const changed=(action,paused)=>{const before=states().length;action();assert.equal(states().length,before+1,'one immediate wire update without advancing a frame');assert.equal(states().at(-1).paused,paused);assert.equal(d.renderer.renderCount,renders);};
  changed(()=>{f.doc.hidden=true;f.doc.dispatch('visibilitychange');},true);
  changed(()=>{f.doc.hidden=false;f.doc.dispatch('visibilitychange');},false);
  changed(()=>f.win.dispatch('blur'),true);changed(()=>f.win.dispatch('focus'),false);
  changed(()=>d.pauseState.set('platform',true),true);
  const pausedCount=states().length;d.pauseState.set('payment',true);d.pauseState.set('platform',false);assert.equal(states().length,pausedCount,'an overlapping pause must not send a false resume');
  changed(()=>d.pauseState.set('payment',false),false);
  changed(()=>f.win.dispatch('pagehide',{persisted:true}),true);
  changed(()=>f.win.dispatch('pageshow',{persisted:true}),false);
  changed(()=>d.renderer.domElement.dispatch('webglcontextlost'),true);
 }finally{f.dispose();globalThis.WebSocket=originalSocket;}
});
