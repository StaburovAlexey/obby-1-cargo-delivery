import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {createPauseState} from '../dist/pause-state.js';

let saved,adCalls=0,starts=0,stops=0,settingsWrites=0;
const pause=createPauseState();
const services={pause,development:false,serverUrl:'',initialCareer:freshCareer(),settings:{audioVolume:1,lastAudibleVolume:1,language:'ru'},
  cloud:{store:{load:()=>saved??freshCareer(),save:value=>{saved=value;return true;}},status:{},flush:async()=>true,setSettings(){settingsWrites++;}},
  platform:{ready(){},gameplayStart(){starts++;},gameplayStop(){stops++;},showAd(){adCalls++;return Promise.resolve({wasShown:false});}},
  premium:{ownedIds:new Set(),catalog:new Map(),status:{busy:false}},
};
const f=createAppDom({startDriving:false,services,storage:{getItem(){throw Error('Unexpected browser storage read');},setItem(){throw Error('Unexpected browser storage write');}}});
try{
  const d=f.debug,ad=d.advertising;
  f.frame(1000);f.frame(1017);
  assert(starts>0);
  f.ids.get('settings-button').dispatch('click');
  f.ids.get('settings-volume').value='40';f.ids.get('settings-volume').dispatch('input');
  assert.equal(settingsWrites,1,'settings use the cloud service');
  f.ids.get('settings-close').dispatch('click');
  ad.update(230,{active:true,safe:false});
  const before=ad.getState().activeSeconds;
  f.win.dispatch('blur');f.win.dispatch('focus');f.frame(61000);
  assert.equal(ad.getState().activeSeconds,before,'time spent outside the game must not count toward advertising');
  ad.update(240,{active:true,safe:true});
  assert.equal(ad.getState().phase,'countdown');
  assert(pause.reasons.has('advertising'));
  f.win.dispatch('blur');
  assert.equal(ad.getState().phase,'pending','blur must cancel a warning even while RAF is suspended');
  assert(!pause.reasons.has('advertising'));
  f.win.dispatch('focus');f.frame(121000);
  assert.equal(ad.getState().countdown,2,'returning must show the full 2,1 warning');
  assert.equal(adCalls,0);
  const p={...d.gameplay.state.player},brains=d.gameplay.state.brains;
  f.frame(121500);
  assert.deepEqual(d.gameplay.state.player,p);assert.equal(d.gameplay.state.brains,brains);
  pause.set('platform',true);
  assert.equal(ad.getState().phase,'pending','SDK pause must synchronously cancel the warning');
  f.frame(180000);assert.equal(adCalls,0);assert(stops>0);
  pause.set('platform',false);f.frame(180016);
  assert.equal(ad.getState().countdown,2);
  assert.equal(d.developerMode,false);
  console.log('PASS app integration: active-time ads, synchronous warning suspension, SDK pause, frozen progression, cloud-only settings and production mode.');
}finally{f.dispose();}
