import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {projectLabelPixel} from '../dist/world-label-projection.js';
import {WORLD_LABEL_DROP} from '../dist/progression-hud.js';
const f=createAppDom({startDriving:false});let checked=0;const categories={vehicle:0,skin:0,school:0};
try{const d=f.debug;for(const rect of [{left:0,top:0,width:390,height:844},{left:0,top:0,width:390,height:640},{left:24,top:37,width:720,height:360},{left:11,top:18,width:320,height:600}]){
 f.ids.get('viewport').bounds=rect;f.ids.get('world-labels').bounds={left:7,top:13,width:850,height:900};f.win.dispatch('resize');
 for(const position of [[8,65],[-20,70],[-40,70]])for(const yaw of [Math.PI/2,-Math.PI/2,Math.PI,0]){
  d.gameplay.state.player.x=position[0];d.gameplay.state.player.z=position[1];d.gameplay.state.player.heading=yaw;d.cameraState.state.yaw=yaw;d.followCharacter(1,true);f.frame();
  assert(Math.abs(d.camera.aspect-rect.width/rect.height)<1e-10);
  const verify=(id,anchor)=>{const el=f.ids.get(id);if(el.hidden)return;const ndc=new THREE.Vector3(anchor.x,anchor.y,anchor.z).project(d.camera),expected=projectLabelPixel(ndc,rect,f.ids.get('world-labels').bounds);assert(Math.abs(parseFloat(el.style.left)-expected.x)<1e-7,id+' x');assert(Math.abs(parseFloat(el.style.top)-expected.y)<1e-7,id+' y');checked++;categories[id.split('-')[0]]++;};
  d.garage.vehicles.forEach((v,i)=>verify('vehicle-price-'+(i+1),{...v.priceAnchor,y:v.priceAnchor.y-WORLD_LABEL_DROP}));
  d.garage.stands.forEach((s,i)=>verify('skin-label-'+(i+1),{x:s.x,y:5-WORLD_LABEL_DROP,z:s.z}));
  d.garage.classroomEntries.forEach((s,i)=>{
    const id='school-label-'+(i+1);verify(id,{...s.labelAnchor,y:s.labelAnchor.y-WORLD_LABEL_DROP});
    const el=f.ids.get(id);if(!el.hidden)assert.equal(Number(el.style.getPropertyValue('--school-scale')),1,id+' keeps its full size through camera and viewport changes');
  });
 }
}
console.log({checked,categories});assert(checked>=32);for(const count of Object.values(categories))assert(count>0);const p=projectLabelPixel({x:.5,y:.2},{left:24,top:37,width:720,height:360},{left:7,top:13});assert.deepEqual(p,{x:557,y:168});
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');assert(html.indexOf('vehicle-price-11')<html.indexOf('</div>\n    <button id="buy-vehicle"'));
const css=fs.readFileSync(new URL('../dist/progression-ui.css',import.meta.url),'utf8');assert(css.includes('.learning-world-label{position:absolute;'));
console.log(categories);console.log('PASS '+checked+' exact world anchors through camera orbit, mobile toolbar height, landscape, offsets and resize; no label spreading; all labels share one layer.');
}finally{f.dispose()}
