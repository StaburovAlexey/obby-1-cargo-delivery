import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMusicMenu} from '../dist/music-menu.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
function fixture(){
 const {doc,root}=createInputDom(),Element=root.constructor;doc.body=root;const nodes=new Map(),changes=[];
 for(const id of ['music-menu','music-panel','music-button','music-close','settings-music-toggle','settings-music-previous','settings-music-next']){
  const e=new Element();e.focus=()=>{doc.activeElement=e;};nodes.set(id,e);
 }
 const el=id=>nodes.get(id);root.append(el('music-menu'));root.append(el('music-button'));
 el('music-menu').append(el('music-panel'));
 for(const id of ['music-close','settings-music-toggle','settings-music-previous','settings-music-next'])el('music-panel').append(el(id));
 doc.getElementById=el;const ui=createMusicMenu(doc,{onOpenChange:open=>changes.push(open)});return {ui,doc,root,el,changes};
}
test('music window opens, isolates input, traps focus and restores it on Escape',()=>{
 const f=fixture();try{
  f.el('music-button').dispatch('click');assert.equal(f.ui.isOpen(),true);assert.equal(f.el('music-menu').hidden,false);
  assert.equal(f.el('music-button').inert,true);assert.equal(f.doc.activeElement,f.el('settings-music-toggle'));
  f.el('settings-music-next').focus();f.doc.dispatch('keydown',{key:'Tab'});assert.equal(f.doc.activeElement,f.el('music-close'));
  f.doc.dispatch('keydown',{key:'Escape'});assert.equal(f.ui.isOpen(),false);
  assert.equal(f.el('music-button').inert,undefined);assert.equal(f.doc.activeElement,f.el('music-button'));
  f.ui.open();f.el('music-menu').dispatch('click');assert.equal(f.ui.isOpen(),false);
 }finally{f.ui.dispose();}
});
test('music layout has full metadata above the playback button and no track selector',()=>{
 const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.match(html,/id="music-button"[^>]*aria-controls="music-panel"/);
 assert.doesNotMatch(html,/<select[^>]*id="settings-music-track"/);
 const music=html.slice(html.indexOf('<div id="music-menu"'),html.indexOf('<button id="vehicle-funds-button"'));
 assert.ok(music.indexOf('id="settings-music-track"')<music.indexOf('id="settings-music-toggle"'));
 assert.ok(music.indexOf('id="settings-music-artist"')<music.indexOf('id="settings-music-toggle"'));
});
