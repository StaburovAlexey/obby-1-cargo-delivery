import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanyonUi} from '../dist/canyon-ui.js';

class Element {
  hidden=false;disabled=false;children=[];attributes={};listeners=new Map();value='';id='';
  set textContent(value){this.value=String(value);this.children=[];}
  get textContent(){return this.value+this.children.map(child=>child.textContent).join('');}
  append(...children){this.children.push(...children);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  addEventListener(name,listener){this.listeners.set(name,listener);}
  removeEventListener(name){this.listeners.delete(name);}
}

function fixture(){
  const names=['canyon-hud','canyon-score','canyon-combo','canyon-overlay','canyon-title','canyon-result-score','canyon-result-note','canyon-retry','canyon-exit','canyon-rankings-button','canyon-login','canyon-rankings','canyon-ranking-rows','canyon-ranking-note','canyon-back'];
  const ids=new Map(names.map(id=>[id,Object.assign(new Element(),{id})]));
  const find=(node,id)=>node.id===id?node:node.children.map(child=>find(child,id)).find(Boolean);
  const doc={getElementById:id=>ids.get(id)??[...ids.values()].map(node=>find(node,id)).find(Boolean),createElement:()=>new Element()};
  let time=0;
  const ui=createCanyonUi(doc,{now:()=>time});
  return {ui,el:id=>doc.getElementById(id),update:(nextTime,multiplier,score=nextTime+1,phase='running')=>{time=nextTime;ui.update({phase,score,multiplier});}};
}

// A missing gain edge or a per-frame restart must change the caption's visible lifetime.
test('each multiplier increase celebrates once for 800 ms while gold stays until x1',()=>{
  const f=fixture(),combo=f.el('canyon-combo'),caption=f.el('canyon-combo-caption');
  assert.ok(caption,'feedback caption is created beside the existing score elements');
  f.update(0,1);
  assert.equal(caption.hidden,true);
  assert.equal(combo.getAttribute('data-boosted'),'false');
  for(const [start,multiplier] of [[10,2],[900,3],[1800,4],[2700,5]]){
    f.update(start,multiplier);
    assert.equal(caption.textContent,`Очки ×${multiplier}!`);
    assert.equal(caption.hidden,false);
    assert.equal(combo.getAttribute('data-boosted'),'true');
    assert.equal(combo.getAttribute('data-celebrating'),'true');
    for(let time=start+50;time<start+800;time+=50)f.update(time,multiplier);
    f.update(start+799,multiplier);
    assert.equal(caption.hidden,false,'the original gain stays legible before 800 ms');
    f.update(start+800,multiplier);
    assert.equal(caption.hidden,true,'ordinary score ticks do not extend the celebration');
    assert.equal(combo.getAttribute('data-celebrating'),'false');
    assert.equal(combo.getAttribute('data-boosted'),'true','active combo keeps its gold highlight');
  }
  f.update(3550,1);
  assert.equal(combo.getAttribute('data-boosted'),'false');
  assert.equal(caption.hidden,true);
  f.ui.dispose();
});

test('a newer gain replaces the caption, while multiplier loss clears the transient feedback',()=>{
  const f=fixture(),combo=f.el('canyon-combo'),caption=f.el('canyon-combo-caption');
  f.update(0,1);f.update(10,2);f.update(200,3);
  assert.ok(caption,'multiplier caption exists');
  assert.equal(caption.textContent,'Очки ×3!');
  f.update(810,3);
  assert.equal(caption.hidden,false,'new gain owns its own 800 ms');
  f.update(1000,3);
  assert.equal(caption.hidden,true);
  f.update(1010,4);f.update(1020,1);
  assert.equal(caption.hidden,true,'losing the combo removes the previous gain immediately');
  assert.equal(combo.getAttribute('data-celebrating'),'false');
  assert.equal(combo.getAttribute('data-boosted'),'false');
  f.ui.dispose();
});

test('lifecycle resets establish a new baseline without replaying a stale multiplier',()=>{
  for(const reset of [f=>f.ui.suspend(),f=>f.ui.hide(),f=>f.update(30,3,31,'celebrating'),f=>f.ui.showResult({score:30}),f=>f.ui.dispose(),f=>f.update(30,3,0)]){
    const f=fixture(),combo=f.el('canyon-combo'),caption=f.el('canyon-combo-caption');
    f.update(0,1);f.update(10,2);
    assert.ok(caption,'multiplier caption exists');
    assert.equal(caption.hidden,false);
    reset(f);
    assert.equal(caption.hidden,true,'reset clears feedback immediately');
    assert.equal(combo.getAttribute('data-celebrating'),'false');
    f.update(50,3,51);
    assert.equal(caption.hidden,true,'the first resumed frame cannot replay an increase');
    assert.equal(combo.getAttribute('data-boosted'),'true');
    f.update(60,4,61);
    assert.equal(caption.hidden,false,'a later real increase can celebrate');
    assert.equal(caption.textContent,'Очки ×4!');
    f.ui.dispose();
  }
});

test('multiplier feedback preserves the score counter hold, fade and suspend behavior',()=>{
  const f=fixture(),hud=f.el('canyon-hud');
  f.update(0,1,0);f.update(10,2,100);
  assert.equal(hud.hidden,false);
  assert.equal(hud.getAttribute('data-scoring'),'true');
  f.update(170,2,100);
  assert.equal(hud.getAttribute('data-scoring'),'false');
  f.update(659,2,100);
  assert.equal(hud.getAttribute('data-visible'),'true');
  f.update(660,2,100);
  assert.equal(hud.hidden,false);
  assert.equal(hud.getAttribute('data-visible'),'false');
  f.update(959,2,100);
  assert.equal(hud.hidden,false);
  f.update(960,2,100);
  assert.equal(hud.hidden,true);
  assert.equal(f.el('canyon-score').textContent,'100');
  f.ui.suspend();f.update(970,2,100);
  assert.equal(hud.hidden,true);
  f.ui.dispose();
});
