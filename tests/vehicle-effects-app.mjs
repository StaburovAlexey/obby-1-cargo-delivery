import assert from 'node:assert/strict';
import {BRIDGES} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/road-layout.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createTestServices} from './fixtures/yandex-services.mjs';
const updates=[];let stops=0,unlocks=0,muted=false;
const audio={get muted(){return muted},setMuted(v){muted=!!v},stop(){stops++},unlock(){unlocks++;return Promise.resolve()},update(dt,state){updates.push(state)}};
const services=await createTestServices();
const f=createAppDom({services,createAudio:()=>audio,search:'?dev=1'});
try{
 const d=f.debug,lamps=new Map();for(const v of d.garage.vehicles)v.visual={setBrakeLights:b=>lamps.set(v.id,b)};
 const advanceUntil=(predicate,message)=>{
  for(let i=0;i<180;i++){f.frame();if(predicate())return;}
  assert.fail(message);
 };
 const settle=()=>advanceUntil(()=>d.model.state.grounded&&d.model.state.wheelContacts.some(w=>w.grounded)&&Math.abs(d.model.state.velocityY)<.15,'vehicle must settle on physical wheel support');
 settle();assert(updates.at(-1).active);assert.equal(lamps.size,d.garage.vehicles.length);
 const heading=d.model.state.heading;
 d.model.body.setLinvel({x:-Math.sin(heading)*10,y:d.model.body.linvel().y,z:-Math.cos(heading)*10},true);
 d.model.setGear('R');d.model.setInput({active:true,steering:0});f.frame();assert(updates.at(-1).braking>0);assert(lamps.get('pickup')>0);assert([...lamps].filter(([,b])=>b>0).length===1);
 d.setUpgradeMenu(true);assert(stops>0);assert([...lamps.values()].every(v=>v===0));f.frame();assert(!updates.at(-1).active);d.setUpgradeMenu(false);
 f.ids.get('audio-toggle').dispatch('click');assert(muted);assert.equal((await services.cloud.initialize()).settings.audioVolume,0);f.ids.get('audio-toggle').dispatch('click');assert(!muted);assert(unlocks>0);
 f.win.dispatch('blur');assert(!d.appFocused);assert([...lamps.values()].every(v=>v===0));f.win.dispatch('focus');
 f.doc.hidden=true;const stopped=stops;f.frame();assert(stops>stopped);f.doc.hidden=false;
 const b=BRIDGES[0],p=routePointAtProgress((b.from+b.to)/2);
 d.model.pause();d.model.setPose({x:p.x+p.right.x*(b.offset+5),y:p.height+2,z:p.z+p.right.z*(b.offset+5),heading:p.heading});
 advanceUntil(()=>d.model.state.airborne&&d.model.state.wheelContacts.every(w=>!w.grounded)&&d.model.state.velocityY<-.1,'vehicle must physically fall clear of the bridge');
 assert(!updates.at(-1).active,'fall silences engine');
 d.returnToGarage();d.gameplay.state.cooldown=0;assert(d.enterVehicle('pickup'));settle();assert(updates.at(-1).active,'supported vehicle with fuel has an active engine');
 d.gameplay.state.fuels.pickup=0;f.frame();assert(!updates.at(-1).active,'empty tank silences engine');
 d.returnToGarage();f.frame();assert(!updates.at(-1).active);assert([...lamps.values()].every(v=>v===0));
 for(const v of d.garage.vehicles)v.visual=null;
 console.log('PASS actual app audio/brake integration: selected car only, genuine reverse braking, modal/blur/garage silence, mute persistence, no extra engines.');
}finally{f.dispose();services.cloud.destroy();services.platform.destroy();}
