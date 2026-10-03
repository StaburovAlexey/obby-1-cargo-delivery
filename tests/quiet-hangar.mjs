import assert from 'node:assert/strict';import fs from 'node:fs';
import {GROUND_MESH} from '../dist/route-network.js';
import {createRoadFootprintIndex} from '../dist/network-scene.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/route-network.js';
const index=createRoadFootprintIndex(GROUND_MESH),rect=(x0,x1,z0,z1)=>[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}];
assert.equal(index.intersects(rect(-58,32,25,91)),false,'No grass triangles overlap hangar floor');
assert.equal(index.intersects(rect(-8,8,23,25)),false,'No grass triangles overlap entrance apron');
assert.equal(index.intersects(rect(50,55,24,26)),true,'Outside grass retained');
const css=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');assert.match(css,/\.session-hud,\.walk-tip,#biome-test-note,#drive-status,#study-status\{display:none!important\}/);
assert.match(css,/\.drive-tip\{display:none!important\}/);
const app=createAppDom({career:{...freshCareer(),money:10000,brains:100}});try{
const d=app.debug;assert.equal(app.doc.getElementById('session-note').textContent??'','');
d.enterVehicle('pickup');for(let n=0;n<3;n++)app.frame();assert.equal(app.doc.getElementById('session-note').textContent??'','');
const b=BRIDGES[0],p=routePointAtProgress((b.from+b.to)/2);d.model.pause();Object.assign(d.model.state,{x:p.x+p.right.x*(b.offset+1.3),z:p.z+p.right.z*(b.offset+1.3),heading:p.heading});
for(let n=0;n<130;n++)app.frame();assert.equal(d.gameplay.state.mode,'walking');assert.equal(app.doc.getElementById('session-note').textContent??'','');
assert.equal(app.doc.getElementById('wallet-value').textContent,'10000');assert.ok(app.doc.getElementById('brain-value').textContent.length);assert.equal(app.doc.getElementById('biome-test-note').hidden,true);
d.gameplay.state.saveFailed=true;app.frame();assert.equal(app.doc.getElementById('save-notice').hidden,false,'Save failure remains visible UI');
}finally{app.dispose();}
console.log('PASS disjoint hangar grass/floor/entry geometry; quiet playfield, working counters, fall and save-warning UI. CPU/mock only.');
