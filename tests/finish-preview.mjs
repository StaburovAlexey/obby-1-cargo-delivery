import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {BIOME_DESTINATIONS,safeBiomeDestination} from '../dist/biome-travel.js';
import {FINISH_LINE_SPEC} from '../dist/finish-line.js';
import {BRIDGES} from '../dist/road-bridges.js';
const p=BIOME_DESTINATIONS.find(p=>p.id==='finish');assert(p&&FINISH_LINE_SPEC.progress-p.progress===55);assert(safeBiomeDestination('finish'));assert(!safeBiomeDestination('finish',()=>({depth:1})));assert(!BRIDGES.some(b=>p.progress>b.from-20&&p.progress<b.to+20));
for(const search of ['?dev=1']){const f=createAppDom({search});try{const d=f.debug,money=d.gameplay.state.money,brains=d.gameplay.state.brains;assert(d.setBiomeMenu(true));f.ids.get('biome-go-finish').dispatch('click');assert(!d.biomeMenuOpen);assert.equal(d.model.state.x,p.x);assert.equal(d.model.state.z,p.z);assert.equal(d.model.state.heading,p.heading);assert(d.gameplay.state.testMode);assert.equal(d.gameplay.state.run,null);const final=d.garage.deliveries.at(-1);d.gameplay.drive(0,final.x,final.z);assert.equal(d.gameplay.state.routeCompletion,null);assert.equal(d.gameplay.state.money,money);assert.equal(d.gameplay.state.brains,brains);assert.equal(d.gameplay.isOwned('bmwreward'),!!search);assert(Number.isFinite(d.camera.position.x+d.camera.position.y+d.camera.position.z));}finally{f.dispose()}}
console.log('PASS before-finish preview: 55m before checker line, safe aligned road spawn, working menu button/camera, no cargo/cash/BMW proof in dev mode.');
