import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsMusic} from '../dist/settings-music.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';

function fixture() {
 const dom=createInputDom(),Element=dom.root.constructor,ids=new Map();
 for(const name of ['title','track-label','track','artist','status','previous','toggle','toggle-icon','toggle-label','next','note'])ids.set(`settings-music-${name}`,new Element());
 dom.doc.getElementById=id=>ids.get(id);
 dom.doc.createElement=()=>new Element();
 const tracks=[{id:'a',title:'Track A',artist:'Artist A'},{id:'b',title:'Track B',artist:'Artist B'}];
 let opened=true,state={index:0,track:tracks[0],requested:false,playing:false,suspended:false,loading:false,error:null},sub;
 const calls=[];
 const music={getState:()=>state,subscribe(fn){sub=fn;return()=>{sub=null}},play:()=>calls.push('play'),pause:()=>calls.push('pause'),previous:()=>calls.push('previous'),next:()=>calls.push('next'),select:i=>calls.push(['select',i])};
 const ui=createSettingsMusic(dom.doc,{music,tracks,canControl:()=>opened});
 return {ui,calls,el:name=>ids.get(`settings-music-${name}`),setOpened:v=>{opened=v},update:values=>{state={...state,...values};sub?.(state)},hasSubscriber:()=>!!sub};
}

test('settings player lists tracks and routes controls without starting audio at construction',()=>{
 const f=fixture();
 assert.equal(f.el('track').textContent,'Track A');
 assert.equal(f.el('track').children.length,0);
 assert.equal(f.el('artist').textContent,'Artist A · 1 / 2');
 assert.deepEqual(f.calls,[]);
 f.el('toggle').dispatch('click');f.el('previous').dispatch('click');f.el('next').dispatch('click');
 f.el('track').value='1';f.el('track').dispatch('change');
 assert.deepEqual(f.calls,['play','previous','next']);
 f.update({requested:true,playing:true,index:1,track:{id:'b',title:'Track B',artist:'Artist B'}});
 assert.equal(f.el('track').textContent,'Track B');assert.equal(f.el('toggle-label').textContent,'Пауза');
 assert.equal(f.el('toggle').getAttribute('aria-pressed'),'true');
 f.el('toggle').dispatch('click');assert.equal(f.calls.at(-1),'pause');
 f.ui.dispose();assert(!f.hasSubscriber());
 const before=f.calls.length;f.el('next').dispatch('click');assert.equal(f.calls.length,before);
});

test('settings player handles language, interruptions, errors and hidden controls',()=>{
 const f=fixture();f.ui.setLanguage('en');
 assert.equal(f.el('title').textContent,'Music');
 assert.equal(f.el('previous').getAttribute('aria-label'),'Previous track');
 f.update({requested:true,suspended:true});assert.match(f.el('status').textContent,/return/i);
 f.update({requested:false,suspended:false,error:'blocked'});assert.match(f.el('status').textContent,/try again/i);
 assert.equal(f.el('toggle-label').textContent,'Play');
 f.setOpened(false);f.el('toggle').dispatch('click');f.el('next').dispatch('click');f.el('track').dispatch('change');assert.deepEqual(f.calls,[]);
 f.setOpened(true);f.el('track').value='NaN';f.el('track').dispatch('change');assert.deepEqual(f.calls,[]);
 f.ui.setLanguage('ru');assert.match(f.el('status').textContent,/ещё раз/);
 f.ui.dispose();
});
