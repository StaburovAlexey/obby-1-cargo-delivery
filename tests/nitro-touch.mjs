import test from 'node:test';
import assert from 'node:assert/strict';
import {createNitroUi} from '../dist/nitro-ui.js';
import {createNitro} from '../dist/vehicle-nitro.js';
import {createVehicleInput} from '../dist/vehicle-input.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';

function fixture(){
 const f=createInputDom(),{doc,root}=f;
 root.setAttribute('id','drive-ui');
 doc.createElement=tag=>{const el=new root.constructor();el.tagName=tag.toUpperCase();el.remove=()=>{if(el.parent)el.parent.children=el.parent.children.filter(child=>child!==el);};return el;};
 doc.getElementById=id=>[root,...root.all()].find(el=>el.getAttribute('id')===id);
 for(const id of ['fuel-hud','upgrade-panel','upgrade-button','upgrade-menu']){const el=doc.createElement('div');el.setAttribute('id',id);root.append(el);}
 const nitro=createNitro();nitro.start(3);
 const pose={grounded:true,upY:1,heading:0,velocityX:0,velocityZ:-20,gear:'D',active:false,brake:0,handbrake:0};
 const input=createVehicleInput({root,onInput:s=>Object.assign(pose,s),onGear:g=>pose.gear=g,getTelemetry:()=>pose});input.setDriftEnabled(true);
 let usable=true,attempts=0;
 const g={state:{selectedId:'bmwreward',fuels:{bmwreward:100}},getDrivingNitro:()=>nitro,getNitroOffer:()=>({unlocked:true,level:3,nextLevel:4,maxed:false,purchasable:false}),activateNitro:s=>{attempts++;return nitro.activate(s);}};
 const ui=createNitroUi(doc,{getGameplay:()=>g,getModel:()=>({state:pose}),canUse:()=>usable});ui.update();
 return {...f,nitro,pose,input,ui,button:doc.getElementById('nitro-button'),get attempts(){return attempts;},setUsable(v){usable=v;ui.update();},dispose(){ui.dispose();input.destroy();}};
}

test('secondary touch starts nitro immediately while wheel and gas remain held',()=>{
 const f=fixture();try{
  f.pointer(f.wheel,'pointerdown',20,1,{pointerType:'touch',isPrimary:true});
  f.pointer(f.pedal,'pointerdown',0,2,{pointerType:'touch',isPrimary:false});
  const event=f.pointer(f.button,'pointerdown',0,3,{pointerType:'touch',isPrimary:false});
  assert.equal(f.nitro.state.remaining,2);assert.equal(f.nitro.state.charges,2);
  assert.equal(event.defaultPrevented,true);
  assert.equal(f.input.state.wheelPointerId,1);assert.equal(f.input.state.pedalPointerId,2);
  f.pointer(f.button,'pointerup',0,3,{pointerType:'touch',isPrimary:false});
  assert.equal(f.pose.active,true);assert.equal(f.attempts,1);
 }finally{f.dispose();}
});

test('release click never queues another charge even after a long press outlasts nitro',()=>{
 const f=fixture();try{
  f.pointer(f.button,'pointerdown',0,3,{pointerType:'touch',isPrimary:true});
  assert.equal(f.nitro.state.charges,2);
  for(let i=0;i<21;i++)f.nitro.step(.1,f.pose);
  f.ui.update();assert.equal(f.nitro.state.remaining,0);
  f.pointer(f.button,'pointerup',0,3,{pointerType:'touch'});f.button.dispatch('click',{detail:1,pointerType:'touch'});
  assert.equal(f.nitro.state.charges,2);assert.equal(f.attempts,1);
 }finally{f.dispose();}
});

test('keyboard activation is retained and unavailable or non-primary mouse buttons do not spend charges',()=>{
 const f=fixture();try{
  f.pointer(f.button,'pointerdown',0,4,{pointerType:'mouse',button:2});assert.equal(f.attempts,0);
  f.setUsable(false);f.pointer(f.button,'pointerdown',0,5,{pointerType:'touch'});assert.equal(f.attempts,0);
  f.setUsable(true);f.button.dispatch('click',{detail:0});assert.equal(f.nitro.state.charges,2);
  f.nitro.cancel();f.ui.update();f.win.dispatch('keydown',{code:'KeyN'});assert.equal(f.nitro.state.charges,1);
 }finally{f.dispose();}
});
