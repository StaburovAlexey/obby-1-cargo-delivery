import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {ECONOMY_CONFIG} from '../dist/economy-config.js';
const career={...freshCareer(),money:1234,brains:567},raw=JSON.stringify(career);let writes=0;
const storage={getItem:key=>key===ECONOMY_CONFIG.saveKey?raw:null,setItem(){writes++}};
const f=createAppDom({startDriving:false,search:'?dev=1',storage});
try{const d=f.debug;assert(d.developerMode);assert(d.gameplay.isOwned('bmwreward'));d.gameplay.state.cooldown=0;assert(d.enterVehicle('bmwreward'));assert(d.gameplay.state.testMode);assert.equal(d.gameplay.state.run,null);assert.equal(d.gameplay.state.routeCompletion,null);d.gameplay.state.money+=100;d.gameplay.flushProgress();d.returnToGarage();assert(d.gameplay.isOwned('bmwreward'));f.ids.get('regenerate').dispatch('click');assert(d.gameplay.isOwned('bmwreward'));assert.equal(writes,0);}finally{f.dispose()}
assert.equal(writes,0);
const normal=createAppDom({startDriving:false,storage});try{assert(!normal.debug.developerMode);assert(!normal.debug.gameplay.isOwned('bmwreward'));assert.equal(normal.debug.gameplay.state.money,1234);assert.equal(normal.debug.gameplay.state.brains,567);assert.equal(normal.debug.enterVehicle('bmwreward'),false);}finally{normal.dispose()}
console.log('PASS explicit ?dev=1 preview: immediate BMW, no payable cargo, no save writes including rebuild/pagehide, normal URL keeps original saved career and reward lock.');
