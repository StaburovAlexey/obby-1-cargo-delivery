import assert from 'node:assert/strict';
import {BRIDGES} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/road-layout.js';
import {createAppDom} from './fixtures/app-dom.mjs';
const updates=[];let stops=0,unlocks=0,muted=false;
const audio={get muted(){return muted},setMuted(v){muted=!!v},stop(){stops++},unlock(){unlocks++;return Promise.resolve()},update(dt,state){updates.push(state)}};
const f=createAppDom({createAudio:()=>audio,search:'?dev=1'});
try{
 const d=f.debug,lamps=new Map();for(const v of d.garage.vehicles)v.visual={setBrakeLights:b=>lamps.set(v.id,b)};
 f.frame();assert(updates.at(-1).active);assert.equal(lamps.size,11);
 d.model.state.velocityZ=-10;d.model.setGear('R');d.model.setInput({active:true,steering:0});f.frame();assert(updates.at(-1).braking>0);assert(lamps.get('pickup')>0);assert([...lamps].filter(([,b])=>b>0).length===1);
 d.setUpgradeMenu(true);assert(stops>0);assert([...lamps.values()].every(v=>v===0));f.frame();assert(!updates.at(-1).active);d.setUpgradeMenu(false);
 f.ids.get('audio-toggle').dispatch('click');assert(muted);assert.equal(f.storage.getItem('urban-route-audio-muted'),'1');f.ids.get('audio-toggle').dispatch('click');assert(!muted);assert(unlocks>0);
 f.win.dispatch('blur');assert(!d.appFocused);assert([...lamps.values()].every(v=>v===0));f.win.dispatch('focus');
 f.doc.hidden=true;const stopped=stops;f.frame();assert(stops>stopped);f.doc.hidden=false;
 const b=BRIDGES[0],p=routePointAtProgress((b.from+b.to)/2);Object.assign(d.model.state,{x:p.x+p.right.x*(b.offset+5),z:p.z+p.right.z*(b.offset+5),heading:p.heading,velocityX:0,velocityZ:0});d.model.pause();f.frame();assert(!updates.at(-1).active,'fall silences engine');
 d.returnToGarage();d.gameplay.state.cooldown=0;d.enterVehicle('pickup');d.gameplay.state.fuels.pickup=0;f.frame();assert(!updates.at(-1).active,'empty tank silences engine');
 d.returnToGarage();f.frame();assert(!updates.at(-1).active);assert([...lamps.values()].every(v=>v===0));
 for(const v of d.garage.vehicles)v.visual=null;
 console.log('PASS actual app audio/brake integration: selected car only, genuine reverse braking, modal/blur/garage silence, mute persistence, no extra engines.');
}finally{f.dispose()}
