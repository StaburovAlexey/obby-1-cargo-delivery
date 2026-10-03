import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAppDom} from './fixtures/app-dom.mjs';
const flush=async()=>{for(let i=0;i<70;i++)await Promise.resolve();};
let resolveVehicles;
const pending=new Promise(resolve=>resolveVehicles=resolve);
const f=createAppDom({startDriving:false,realStartup:true,attachVehicleVisuals:(_,garage)=>{garage.vehicleVisuals={ready:pending};}});
try{
 const d=f.debug,p={...d.gameplay.state.player};
 assert.equal(d.startup.ready,false);assert.equal(d.enterVehicle('pickup'),false);
 f.frame();await flush();assert.equal(d.renderer.renderCount,0);assert.deepEqual(d.gameplay.state.player,p);
 assert.equal(f.ids.get('loading').hidden,false);
 resolveVehicles({loaded:11,total:11});await flush();
 for(let i=0;i<8&&!d.renderer.renderCount;i++){f.frame();await flush();}
 assert.equal(d.renderer.renderCount,1);assert.equal(d.startup.ready,false);assert.equal(f.ids.get('loading').hidden,false);
 for(let i=0;i<8&&!d.startup.ready;i++){f.frame();await flush();}
 assert.equal(d.startup.ready,true);assert.equal(f.ids.get('loading').hidden,true);assert.equal(f.ids.get('audio-toggle').hidden,false);
 d.gameplay.state.cooldown=0;assert(d.enterVehicle('pickup'));
}finally{f.dispose();}
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
assert.match(html,/<body class="is-loading">/);assert.match(html,/id="audio-toggle" hidden/);
console.log('PASS actual app startup: no early simulation/input/render; waits for all vehicles + displays; rendered scene before reveal; in-game audio returns. CPU mock renderer only.');
for(const result of [Promise.resolve({loaded:10,total:11}),Promise.reject(new Error('vehicle unavailable'))]){
 const broken=createAppDom({startDriving:false,realStartup:true,attachVehicleVisuals:(_,garage)=>{garage.vehicleVisuals={ready:result};}});
 try{await flush();assert.equal(broken.debug.startup.state,'failed');assert.equal(broken.ids.get('error').hidden,false);assert.equal(broken.debug.enterVehicle('pickup'),false);assert.equal(broken.debug.renderer.renderCount,0);}finally{broken.dispose();}
}
console.log('PASS incomplete/rejected vehicle loads show retry error and keep gameplay blocked.');
