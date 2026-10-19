import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
const effects=[];const audio={muted:false,setMuted(){},unlock(){},stop(){},update(dt,s){effects.push(s)}};
const f=createAppDom({search:'?dev=1',createAudio:()=>audio});
try{const d=f.debug;f.frame();assert.equal(d.roadHazards.movers.length,30);assert.equal(d.roadHazardsScene.stats.movers,30);
 const initial=JSON.stringify(d.roadHazards.poses);for(let i=0;i<80;i++)f.frame();assert.notEqual(JSON.stringify(d.roadHazards.poses),initial);
 d.setUpgradeMenu(true);const frozen=JSON.stringify(d.roadHazards.poses);for(let i=0;i<4;i++)f.frame();assert.equal(JSON.stringify(d.roadHazards.poses),frozen);d.setUpgradeMenu(false);
 const h=d.roadHazards.movers.find(h=>h.type==='repair'),s=d.model.state;d.model.pause();
 Object.assign(s,{x:h.x+Math.sin(h.heading)*7,z:h.z+Math.cos(h.heading)*7,heading:h.heading,velocityX:-Math.sin(h.heading)*10,velocityZ:-Math.cos(h.heading)*10});d.model.setInput({active:true,steering:0});
 let hit=false;for(let i=0;i<120;i++){f.frame();if(s.blocked){hit=true;break;}}assert(hit);assert(effects.some(e=>e.impact>0),'moving-object collision feeds real impact audio');
 d.returnToGarage();assert.equal(d.roadHazards.elapsed,0);assert(d.roadHazards.rocks.every(r=>r.altitude===0));assert.equal(d.roadHazardsScene.stats.movers,30);
 console.log('PASS production app: all30 move/render, pause and garage reset, newly moving repair collider feeds impact audio, basalt grounded.');
}finally{f.dispose()}
