import test from 'node:test';
import assert from 'node:assert/strict';
import {updateProgressionWorldLabels} from '../dist/progression-hud.js';
import {translateGameText} from '../dist/localization.js';
import {SKIN_CONFIG} from '../dist/progression-config.js';

test('VK world labels include votes instead of showing an ambiguous bare price',()=>{
  const nodes=new Map();const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,{dataset:{},style:{},textContent:''});return nodes.get(id);}};
  const premium={catalog:new Map([['jandel',{price:'6',currencyLabel:'гол.'}]])};
  updateProgressionWorldLabels(doc,{gameplay:{state:{mode:'walking'},isSkinOwned:()=>false},garage:{classroomEntries:[],stands:SKIN_CONFIG.map(()=>({x:0,z:0}))},playing:true,project(){},premium});
  assert.equal(doc.getElementById('skin-price-'+(SKIN_CONFIG.findIndex(s=>s.id==='jandel')+1)).textContent,'6 гол.');
});
test('VK purchase notification and votes are localized independently of Yandex',()=>{
  assert.equal(translateGameText('Jandel. Покупка через ВКонтакте.','en'),'Jandel. Purchase through VK.');
  assert.equal(translateGameText('Купить 6 гол.','en'),'Buy 6 votes');
});
