import test from 'node:test';
import assert from 'node:assert/strict';
import {createNitroCard} from '../dist/nitro-ui.js';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';

test('improvements card offers purchase, then shows both upgrade gains, then maximum',()=>{
 const {doc,root}=createInputDom();doc.createElement=tag=>{const n=new root.constructor();n.tagName=tag.toUpperCase();return n;};
 const g=createGameplay({developerMode:true,career:{...freshCareer(),money:100000,brains:10000}});
 const card=createNitroCard(doc,root,{id:'nitro-upgrade',getOffer:()=>g.getNitroOffer(),onBuy:level=>g.buyNitro(level)});
 const stats=()=>card.root.all().filter(n=>['nitro-upgrade-charges','nitro-upgrade-recharge'].includes(n.getAttribute('id'))).map(n=>n.textContent).join(' ').replace(/\s/g,' ');
 const caption=()=>card.button.children[0].textContent;
 assert.ok(card.root.all().some(n=>n.src?.endsWith('nitro-purchase.webp')));
 assert.equal(card.root.hidden,false);assert.equal(caption(),'Купить');
 card.button.dispatch('click');assert.equal(g.state.nitroLevel,1);assert.equal(caption(),'Улучшить');
 assert.ok(card.root.all().some(n=>n.src?.endsWith('nitro-charges.webp')));
 assert.ok(card.root.all().some(n=>n.src?.endsWith('nitro-recharge.webp')));
 assert.match(stats(),/1 → 2/);assert.match(stats(),/2 000 → 1 667/);
 for(let level=2;level<=5;level++)card.button.dispatch('click');
 assert.equal(g.state.nitroLevel,5);assert.equal(caption(),'Максимум');assert.equal(card.button.disabled,true);
 assert.match(stats(),/5/);assert.match(stats(),/667/);
});

test('New label follows unlock and ownership, independently of affordability and modal opening',async()=>{
 const {createNitroUi}=await import('../dist/nitro-ui.js');
 const {doc,root}=createInputDom();doc.createElement=tag=>{const n=new root.constructor();n.tagName=tag.toUpperCase();return n;};
 doc.getElementById=id=>root.all().find(n=>n.getAttribute('id')===id);
 for(const id of ['drive-ui','fuel-hud','upgrade-panel','upgrade-button','upgrade-menu']){const n=doc.createElement('div');n.setAttribute('id',id);root.append(n);}
 const g=createGameplay({developerMode:true,career:freshCareer()});let lang='ru';
 const ui=createNitroUi(doc,{getGameplay:()=>g,getModel:()=>null,canUse:()=>false,language:()=>lang});ui.updateCard();
 const badge=doc.getElementById('nitro-new-badge');assert.ok(badge);assert.equal(badge.hidden,false);assert.equal(badge.textContent,'Новое!');
 doc.getElementById('upgrade-menu').hidden=true;ui.updateCard();assert.equal(badge.hidden,false);
 lang='en';ui.updateCard();assert.equal(badge.textContent,'New!');
 g.state.money=20000;g.state.brains=2000;assert.equal(g.buyNitro(1),true);ui.updateCard();assert.equal(badge.hidden,true);
});
