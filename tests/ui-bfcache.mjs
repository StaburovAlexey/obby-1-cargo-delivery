import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
test('BFCache pagehide preserves viewport listeners and restored pages invalidate cached rectangles',()=>{
  const app=createAppDom({width:1280,height:720,startDriving:false});
  try{
    app.frame(1000);const before=app.win.listeners.get('resize').size;
    app.win.dispatch('pagehide',{persisted:true});
    assert.equal(app.win.listeners.get('resize').size,before,'BFCache must retain viewport invalidation listeners');
    const viewport=app.doc.getElementById('viewport');viewport.bounds={left:0,top:0,width:900,height:500};
    app.win.dispatch('pageshow',{persisted:true});app.win.dispatch('resize');app.frame(2000);
    assert.equal(app.debug.camera.aspect,900/500);
  }finally{app.dispose();}
});
