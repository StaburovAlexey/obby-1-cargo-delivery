import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createTestServices} from './fixtures/yandex-services.mjs';
const storage=new Map(),store={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
let volume=1,muted=false,stops=0;
const audio={get muted(){return muted},get volume(){return volume},setVolume(v){volume=v},setMuted(v){muted=v},stop(){stops++},unlock(){},update(){}};
let services=await createTestServices();
let f=createAppDom({services,storage:store,createAudio:()=>audio});
try{
 const d=f.debug,el=id=>f.ids.get(id);f.frame();const money=d.gameplay.state.money,brains=d.gameplay.state.brains;
 el('settings-button').dispatch('click');assert(d.settingsMenuOpen);assert(d.settingsUi.isOpen());assert.equal(el('settings-menu').hidden,false);const p={x:d.model.state.x,z:d.model.state.z,t:d.roadHazards.elapsed};
 d.model.setInput({active:true,steering:1});for(let i=0;i<20;i++)f.frame();assert.equal(d.model.state.x,p.x);assert.equal(d.model.state.z,p.z);assert.equal(d.roadHazards.elapsed,p.t);assert(!d.setUpgradeMenu(true));assert(!d.setBiomeMenu(true));assert(stops>0);
 el('settings-volume').value='35';el('settings-volume').dispatch('input');assert.equal(volume,.35);assert(!muted);assert.equal((await services.cloud.initialize()).settings.audioVolume,.35);assert.equal(storage.size,0);
 el('settings-volume').value='0';el('settings-volume').dispatch('input');assert(muted);assert.equal(volume,0);
 el('settings-language').value='en';el('settings-language').dispatch('change');assert.equal(d.localization.language,'en');assert.equal((await services.cloud.initialize()).settings.language,'en');assert.equal(storage.size,0);
 el('settings-close').dispatch('click');assert(!d.settingsMenuOpen);assert.equal(el('settings-menu').hidden,true);
 el('audio-toggle').dispatch('click');assert(!muted);assert.equal(volume,.35);assert.equal(el('settings-volume').value,'35');
 assert.equal(d.gameplay.state.money,money);assert.equal(d.gameplay.state.brains,brains);assert(el('mode-toggle').hidden);assert(el('biome-button').hidden);
 f.dispose();await services.cloud.flush();const platform=services.platform;services.cloud.destroy();services=await createTestServices({platform});f=createAppDom({services,storage:store,createAudio:()=>audio,startDriving:false});assert.equal(volume,.35);assert.equal(f.debug.localization.language,'en');
 f.ids.get('settings-button').dispatch('click');assert(f.debug.settingsMenuOpen);f.doc.dispatch('keydown',{key:'Escape'});assert(!f.debug.settingsMenuOpen);
 console.log('PASS settings real app: paused car/hazards/input/audio, exclusive modals, volume0/mute restore, RU/EN preference reload, career unaffected, production dev controls hidden.');
}finally{f.dispose();services.cloud.destroy();services.platform.destroy();}
