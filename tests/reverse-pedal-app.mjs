import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {BRIDGES} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/route-network.js';
const app=createAppDom(),d=app.debug,reverse=app.ids.get('reverse-pedal');
const touch=(type)=>reverse.dispatch(type,{pointerId:12,button:0,clientX:60,clientY:70});
const neutral=()=>{assert.equal(d.model.state.active,false);assert.equal(d.input.state.reversePointerId,undefined);assert.equal(reverse.captures.size,0);};
try{
 touch('pointerdown');assert.equal(d.model.state.gear,'R');assert.equal(d.model.state.active,true);
 touch('pointerup');neutral();assert.equal(d.model.state.gear,'R');assert.equal(d.model.state.speedDemand,null);
 for(const action of [()=>d.setUpgradeMenu(true),()=>d.setBiomeMenu(true)]){
  touch('pointerdown');action();neutral();touch('pointerdown');neutral();d.setUpgradeMenu(false);d.setBiomeMenu(false);neutral();
 }
 touch('pointerdown');app.win.dispatch('blur');neutral();app.win.dispatch('focus');
 d.setBiomeMenu(true);assert.equal(d.travelToBiome('forest'),true);
 const b=BRIDGES.find(b=>b.biome==='forest'),p=routePointAtProgress((b.from+b.to)/2);
 d.model.pause();Object.assign(d.model.state,{x:p.x+p.right.x*(b.offset+1.3),z:p.z+p.right.z*(b.offset+1.3),heading:p.heading});d.applyTruckPose();
 touch('pointerdown');assert.equal(d.model.state.active,true);
 for(let i=0;i<3;i++)app.frame();neutral();
 for(let i=0;i<130;i++)app.frame();assert.equal(d.driving,false);neutral();touch('pointerdown');neutral();
 console.log('PASS actual app reverse press/release, upgrade/biome menus, blur, bridge fall, garage reset; offline mocked renderer.');
}finally{app.dispose();}
