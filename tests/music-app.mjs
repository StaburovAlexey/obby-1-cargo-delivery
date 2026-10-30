import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';

test('settings music shares master volume and follows lifecycle without pausing with the settings dialog',()=>{
 let music,disposed=false;const subscribers=new Set();
 const createMusic=({tracks,volume})=>{
  let state={index:0,track:tracks[0],volume,requested:false,playing:false,suspended:false,loading:false,error:null};
  const emit=()=>{state.playing=state.requested&&!state.suspended;for(const fn of subscribers)fn({...state});};
  music={getState:()=>({...state}),subscribe(fn){subscribers.add(fn);fn({...state});return()=>subscribers.delete(fn)},play(){state.requested=true;emit()},pause(){state.requested=false;emit()},setVolume(v){state.volume=v;emit()},setSuspended(v){state.suspended=v;emit()},select(i){state.index=i;state.track=tracks[i];emit()},next(){this.select((state.index+1)%tracks.length)},previous(){this.select((state.index+tracks.length-1)%tracks.length)},dispose(){disposed=true;subscribers.clear()}};
  return music;
 };
 const f=createAppDom({createMusic,startDriving:false});
 try{
  assert.equal(f.debug.backgroundMusic,music,'app creates the shared background music controller');
  const el=id=>f.ids.get(id),state=()=>music.getState();
  el('music-button').dispatch('click');el('settings-music-toggle').dispatch('click');
  assert(state().playing,'music can start with Settings open');
  el('music-close').dispatch('click');el('settings-button').dispatch('click');
  el('settings-volume').value='24';el('settings-volume').dispatch('input');assert.equal(state().volume,.24);
  el('settings-close').dispatch('click');assert(state().playing,'closing Settings keeps music playing');
  el('audio-toggle').dispatch('click');assert.equal(state().volume,0);
  el('audio-toggle').dispatch('click');assert.equal(state().volume,.24);
  f.win.dispatch('blur');assert(state().suspended);assert(!state().playing);
  f.win.dispatch('focus');assert(state().playing);
  f.debug.pauseState.set('advertising',true);assert(!state().playing);
  f.debug.pauseState.set('platform',true);f.debug.pauseState.set('advertising',false);assert(!state().playing,'overlapping reasons do not resume early');
  f.debug.pauseState.set('platform',false);assert(state().playing);
  f.doc.hidden=true;f.doc.dispatch('visibilitychange');assert(!state().playing);
  f.doc.hidden=false;f.doc.dispatch('visibilitychange');assert(state().playing);
  f.win.dispatch('pagehide',{persisted:true});assert(!state().playing);assert(!disposed);
  f.win.dispatch('pageshow',{persisted:true});assert(state().playing);
  el('settings-button').dispatch('click');el('settings-language').value='en';el('settings-language').dispatch('change');assert.equal(el('settings-music-title').textContent,'Music');
  el('settings-close').dispatch('click');el('music-button').dispatch('click');
  el('settings-music-toggle').dispatch('click');assert(!state().requested);
  f.win.dispatch('blur');f.win.dispatch('focus');assert(!state().playing,'manual pause survives interruption');
  el('settings-music-next').dispatch('click');assert.equal(state().index,1);
  el('settings-music-toggle').dispatch('click');assert(state().playing);
  f.debug.renderer.domElement.dispatch('webglcontextlost');assert(!state().playing);
 }finally{f.dispose();}
 assert(disposed);assert.equal(subscribers.size,0);
});
