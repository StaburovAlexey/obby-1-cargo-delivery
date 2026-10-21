import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowserGestureGuard} from '../dist/browser-gestures.js';

function fixture(){
 const listeners=new Map(),doc={addEventListener(type,fn,options){listeners.set(type,{fn,options});},removeEventListener(type){listeners.delete(type);}};
 const dispose=installBrowserGestureGuard(doc);
 return {listeners,dispose,dispatch(type,{editable=false,cancelable=true}={}){
  const event={type,cancelable,target:{closest:()=>editable?{}:null},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
  listeners.get(type)?.fn(event);return event;
 }};
}
test('browser zoom, selection and long-press actions are blocked throughout the game',()=>{
 const f=fixture();
 for(const type of ['dblclick','gesturestart','gesturechange','gestureend','selectstart','dragstart','contextmenu']){
  assert.equal(f.dispatch(type).defaultPrevented,true,type);
  assert.deepEqual(f.listeners.get(type).options,{capture:true,passive:false});
  assert.equal(f.dispatch(type,{cancelable:false}).defaultPrevented,false,type);
 }
 f.dispose();assert.equal(f.listeners.size,0);
});
test('ordinary taps, multitouch controls and menu scrolling remain untouched',()=>{
 const f=fixture();
 for(const type of ['click','pointerdown','pointermove','pointerup','touchstart','touchmove','touchend','wheel']){
  assert.equal(f.listeners.has(type),false,type);
  assert.equal(f.dispatch(type).defaultPrevented,false,type);
 }
 for(const type of ['selectstart','dragstart','contextmenu'])assert.equal(f.dispatch(type,{editable:true}).defaultPrevented,false,type);
 assert.equal(f.dispatch('gesturestart',{editable:true}).defaultPrevented,true);
 f.dispose();
});
