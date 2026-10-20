import assert from 'node:assert/strict';
import {test} from 'node:test';
import {updateProgressionHud,updateProgressionWorldLabels} from '../dist/progression-hud.js';
import {SKIN_CONFIG} from '../dist/progression-config.js';

function fixture(product){
  let imageCreates=0;
  const nodes=new Map();
  const doc={body:{classList:{toggle(){}}},getElementById(id){
    if(!nodes.has(id))nodes.set(id,{dataset:{},style:{setProperty(){}},attributes:{},
      set textContent(value){this.text=value;this.children=[];},get textContent(){return this.text;},
      setAttribute(name,value){this.attributes[name]=value;},appendChild(value){this.children.push(value);}});
    return nodes.get(id);
  },createElement(){imageCreates++;return {};}};
  const premium={catalog:new Map(SKIN_CONFIG.filter(s=>s.premium).map(s=>[s.id,product])),status:{busy:false}};
  const garage={classroomEntries:[],stands:SKIN_CONFIG.map(()=>({x:0,z:0}))};
  const gameplay={state:{mode:'walking',brains:0,money:0,jump:{airborne:false},skinPurchaseCandidateId:'jandel'},isSkinOwned:()=>false,isSchoolOwned:()=>false};
  return {doc,premium,gameplay,get imageCreates(){return imageCreates;},
    world(){updateProgressionWorldLabels(doc,{gameplay,garage,playing:true,premium,project(){}});},
    hud(){updateProgressionHud(doc,{gameplay,playing:true,driving:false,upgradeMenuOpen:false,premium});}};
}

test('SDK numeric price and currency icon replace the duplicated currency code in world labels and the buy button',()=>{
  let iconCalls=0;
  const f=fixture({price:'39 TST',priceValue:'39',priceCurrencyCode:'TST',getPriceCurrencyImage(){iconCalls++;return '/currency.svg';}});
  for(let i=0;i<60;i++)f.world();
  assert.equal(f.imageCreates,6,'stable prices must retain their icon nodes across frames');
  assert.equal(iconCalls,1,'currency metadata is cached per product');
  for(const id of ['skin-price-17','skin-price-12']){
    const node=f.doc.getElementById(id);
    assert.equal(node.textContent,'39');
    assert.equal(node.children.length,1);
    assert.equal(node.children[0].src,'/currency.svg');
    assert.equal(node.attributes['aria-label'],'39 TST');
  }
  f.hud();
  assert.equal(f.doc.getElementById('buy-skin-label').textContent,'Купить 39');
  assert.equal(f.doc.getElementById('buy-skin-label').children[0].src,'/currency.svg');
  assert.equal(f.doc.getElementById('buy-skin').attributes['aria-label'],'Купить 39 TST');
  f.premium.catalog.clear();f.world();
  for(const id of ['skin-price-17','skin-price-12']){
    assert.equal(f.doc.getElementById(id).textContent,'—');
    assert.equal(f.doc.getElementById(id).children.length,0);
  }
});

test('portal prices retain the SDK currency text when numeric price or currency icon is unavailable',()=>{
  for(const product of [
    {price:'39 TST',priceValue:'39'},
    {price:'39 TST',priceValue:'39',getPriceCurrencyImage:()=>''},
    {price:'39 TST',priceValue:'39',getPriceCurrencyImage(){throw Error('Icon unavailable');}},
    {price:'39 TST',getPriceCurrencyImage:()=>'/currency.svg'},
  ]){
    const f=fixture(product);f.world();f.hud();
    assert.equal(f.doc.getElementById('skin-price-17').textContent,'39 TST');
    assert.equal(f.doc.getElementById('buy-skin-label').textContent,'Купить 39 TST');
  }
});

test('a refreshed catalogue updates the numeric price and accessible currency even when the icon URL is unchanged',()=>{
  const f=fixture({price:'39 TST',priceValue:'39',getPriceCurrencyImage:()=>'/currency.svg'});f.world();
  const index=SKIN_CONFIG.findIndex(s=>s.id==='jandel')+1,node=f.doc.getElementById('skin-price-'+index);
  f.premium.catalog.set('jandel',{price:'39 XYZ',priceValue:'39',getPriceCurrencyImage:()=>'/currency.svg'});
  f.world();
  assert.equal(node.textContent,'39');
  assert.equal(node.attributes['aria-label'],'39 XYZ');
  f.premium.catalog.set('jandel',{price:'123,45 XYZ',priceValue:'123,45',getPriceCurrencyImage:()=>'/currency.svg'});
  f.world();f.hud();
  assert.equal(node.textContent,'123,45');
  assert.equal(node.attributes['aria-label'],'123,45 XYZ');
  assert.equal(f.doc.getElementById('buy-skin-label').textContent,'Купить 123,45');
});
