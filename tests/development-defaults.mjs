import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../rsbuild.config.mjs';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {ECONOMY_CONFIG} from '../dist/economy-config.js';

const platform={ready(){},gameplayStart(){},gameplayStop(){},showAd:async()=>({wasShown:false})};
function fromConfig(env,options={}){
 const value=config({env}).source.define.__URBAN_DEV_SERVER__;
 return createAppDom({startDriving:false,devServer:value===undefined?false:JSON.parse(value),...options});
}

test('npm dev exposes developer tools and all cars on the normal URL without changing saved progress',()=>{
 const raw=JSON.stringify({...freshCareer(),money:1234,brains:567});let writes=0;
 const storage={getItem:key=>key===ECONOMY_CONFIG.saveKey?raw:null,setItem(){writes++;}};
 const f=fromConfig('development',{storage,services:{development:true,platform}});
 try{
  const d=f.debug;
  assert.equal(d.developerMode,true,'the development server enables tools without a URL parameter');
  assert.equal(f.ids.get('mode-toggle').hidden,false);
  for(const vehicle of d.garage.vehicles)assert.ok(d.gameplay.isOwned(vehicle.id),`${vehicle.id} is available for local testing`);
  d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('bmwreward'),true);
  assert.equal(f.ids.get('biome-button').hidden,false);assert.equal(d.gameplay.state.testMode,true);
  d.gameplay.state.money+=100;d.gameplay.flushProgress();d.returnToGarage();
 }finally{f.dispose();}
 assert.equal(writes,0,'automatic developer sessions cannot overwrite regular progress');
});

test('dev=0 on the development server provides the ordinary locked gameplay',()=>{
 const f=fromConfig('development',{search:'?dev=0',services:{development:true,platform}});
 try{
  const d=f.debug;assert.equal(d.developerMode,false);
  assert.equal(f.ids.get('mode-toggle').hidden,true);assert.equal(d.gameplay.isOwned('bmwreward'),false);
  assert.equal(d.enterVehicle('bmwreward'),false);assert.equal(d.setBiomeMenu(true),false);
 }finally{f.dispose();}
});

test('production demo builds still require explicit dev=1 and live platforms ignore developer access',()=>{
 const original=process.env.PUBLIC_GAME_DEVELOPMENT;process.env.PUBLIC_GAME_DEVELOPMENT='1';
 try{
  const normal=fromConfig('production',{services:{development:true,platform}});
  try{assert.equal(normal.debug.developerMode,false);assert.equal(normal.debug.gameplay.isOwned('bmwreward'),false);}finally{normal.dispose();}
  const explicit=fromConfig('production',{search:'?dev=1',services:{development:true,platform}});
  try{assert.equal(explicit.debug.developerMode,true);assert.equal(explicit.debug.gameplay.isOwned('bmwreward'),true);}finally{explicit.dispose();}
  const live=fromConfig('development',{search:'?dev=1',services:{development:false,platform}});
  try{assert.equal(live.debug.developerMode,false);assert.equal(live.debug.gameplay.isOwned('bmwreward'),false);}finally{live.dispose();}
 }finally{if(original===undefined)delete process.env.PUBLIC_GAME_DEVELOPMENT;else process.env.PUBLIC_GAME_DEVELOPMENT=original;}
});
