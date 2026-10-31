import {NITRO_LEVELS} from './vehicle-nitro.js';
const iconUrl=new URL('./assets/ui-icons/nitro-purchase.webp',import.meta.url).href;
const metricIcons={charges:new URL('./assets/ui-icons/nitro-charges.webp',import.meta.url).href,recharge:new URL('./assets/ui-icons/nitro-recharge.webp',import.meta.url).href};
function make(doc,tag,parent,id,className){const n=doc.createElement(tag);if(id)n.setAttribute('id',id);if(className)n.className=className;parent.append(n);return n;}
export function createNitroScreenEffect(doc){
 const root=make(doc,'div',doc.body,'nitro-screen-effect','nitro-screen-effect');
 root.setAttribute('aria-hidden','true');root.hidden=true;
 for(let i=0;i<8;i++){
  const streak=make(doc,'i',root,null,'nitro-speed-streak');
  streak.style.setProperty('--streak-row',String(i%4));
  streak.style.setProperty('--streak-delay',`${-(i%4)*.17}s`);
  if(i>=4)streak.classList.add('nitro-speed-streak-right');
 }
 let active=false,disposed=false;
 return {setActive(value){if(disposed)return;const next=!!value;if(next===active)return;active=next;root.hidden=!next;},
  dispose(){if(disposed)return;disposed=true;root.remove();}};
}
export function createNitroCard(doc,parent,{id,getOffer,language=()=> 'ru',onBuy}){
 const root=make(doc,'article',parent,`${id}-card`,'nitro-card');root.setAttribute('data-i18n-skip','');
 const icon=make(doc,'img',root,null,'nitro-card-icon');icon.src=iconUrl;icon.alt='';
 const title=make(doc,'h3',root);
 const metric=(name)=>{const row=make(doc,'div',root,null,'nitro-stat'),art=make(doc,'img',row,null,'nitro-stat-icon');art.src=metricIcons[name];art.alt='';return make(doc,'span',row,`${id}-${name}`);};
 const charges=metric('charges'),recharge=metric('recharge');
 const button=make(doc,'button',root,`${id}-buy`,'game-modal-button nitro-buy');button.type='button';
 const caption=make(doc,'span',button),money=make(doc,'span',button),coin=make(doc,'img',button),plus=make(doc,'span',button),xp=make(doc,'span',button),brain=make(doc,'img',button);
 coin.src=new URL('./assets/ui-icons/money.webp',import.meta.url).href;coin.alt='';brain.src=new URL('./assets/ui-icons/xp.webp',import.meta.url).href;brain.alt='XP';plus.textContent='+';
 let expectedLevel=0;
 function update(){const o=getOffer(),en=language()==='en';
  root.hidden=!o?.unlocked;if(!o)return;
  expectedLevel=o.nextLevel;const done=o.maxed;
  title.textContent=en?`Nitro · ${o.level}/5`:`Нитро · ${o.level}/5`;
  const current=o.level?NITRO_LEVELS[o.level-1]:null,next=NITRO_LEVELS[o.nextLevel-1];
  const number=n=>n.toLocaleString(en?'en-US':'ru-RU');
  icon.hidden=!!o.level;
  charges.textContent=`${en?'Uses':'Количество использований'}\n${current&&!done?current.charges+' → ':''}${next.charges} · 2 ${en?'s each':'с каждый'}`;
  recharge.textContent=`${en?'Drift points per charge':'Очков дрифта на заряд'}\n${current&&!done?number(current.points)+' → ':''}${number(next.points)}`;
  caption.textContent=done?(en?'Maximum':'Максимум'):o.level?(en?'Upgrade':'Улучшить'):(en?'Buy':'Купить');
  for(const n of [money,coin,plus,xp,brain])n.hidden=done;
  money.textContent='20 000';xp.textContent='2 000';button.disabled=done||!o.purchasable;
  button.setAttribute('aria-label',`${caption.textContent}${done?'':en?' for 20,000 coins and 2,000 XP':' за 20 000 денег и 2 000 XP'}`);
 }
 const buy=e=>{e.stopPropagation();if(button.disabled)return;onBuy(expectedLevel);update();};button.addEventListener('click',buy);update();
 return {root,button,update,dispose(){button.removeEventListener('click',buy);root.remove();}};
}
export function createNitroUi(doc,{getGameplay,getModel,canUse,language=()=> 'ru',onPurchase=()=>{}}){
 const root=doc.getElementById('drive-ui'),fuel=doc.getElementById('fuel-hud');
 const badge=make(doc,'span',doc.getElementById('upgrade-button'),'nitro-new-badge','nitro-new-badge');badge.hidden=true;badge.setAttribute('data-i18n-skip','');
 const button=make(doc,'button',root,'nitro-button','nitro-button');button.type='button';button.hidden=true;button.setAttribute('aria-keyshortcuts','N');button.setAttribute('data-i18n-skip','');
 const icon=make(doc,'img',button);icon.src=iconUrl;icon.alt='';const count=make(doc,'span',button);
 const meter=make(doc,'div',fuel,'nitro-meter','nitro-meter');meter.hidden=true;meter.setAttribute('role','progressbar');meter.setAttribute('aria-valuemin','0');
 const cells=Array.from({length:5},()=>{const cell=make(doc,'span',meter,null,'nitro-cell');return {cell,fill:make(doc,'i',cell)};});
 const card=createNitroCard(doc,doc.getElementById('upgrade-panel'),{id:'nitro-upgrade',language,getOffer:()=>getGameplay()?.getNitroOffer(),onBuy:level=>{if(!doc.getElementById('upgrade-menu').hidden){getGameplay()?.buyNitro(level);onPurchase();}}});
 function activate(e){e.preventDefault();e.stopPropagation();if(canUse()&&!button.disabled)getGameplay()?.activateNitro(getModel()?.state);update();}
 const key=e=>{if(e.code!=='KeyN'||e.repeat||e.ctrlKey||e.altKey||e.metaKey||e.target?.closest?.('input,textarea,select,[contenteditable]')||!canUse()||button.hidden)return;activate(e);};
 // Secondary touches do not reliably produce a click while the wheel or gas
 // is held. Start on contact; reserve click for keyboard/assistive activation.
 const press=e=>{if(e.button===0)activate(e);};
 const click=e=>{e.preventDefault();e.stopPropagation();if(!e.detail)activate(e);};
 button.addEventListener('click',click);const stop=e=>e.stopPropagation();button.addEventListener('pointerdown',press);button.addEventListener('pointerup',stop);
 doc.defaultView.addEventListener('keydown',key);
 function update(){const g=getGameplay(),n=g?.getDrivingNitro(g.state.selectedId),s=n?.state,en=language()==='en';button.hidden=meter.hidden=!s?.level;
  if(s?.level){count.textContent=String(s.charges);button.disabled=!canUse()||!(g.state.fuels[g.state.selectedId]>0)||!n.canActivate(getModel()?.state);
   button.classList.toggle('is-active',s.remaining>0);button.setAttribute('aria-label',`${en?'Nitro':'Нитро'}: ${s.charges}/${s.level}`);
   meter.setAttribute('aria-label',en?'Nitro charges':'Заряды нитро');meter.setAttribute('aria-valuemax',String(s.level));meter.setAttribute('aria-valuenow',String(s.charges+s.progress));
   cells.forEach(({cell,fill},i)=>{cell.hidden=i>=s.level;fill.style.width=`${100*(i<s.charges?1:i===s.charges?s.progress:0)}%`;});
  }
 }
 function updateCard(){card.update();const offer=getGameplay()?.getNitroOffer();badge.hidden=!offer?.unlocked||offer.level>0;badge.textContent=language()==='en'?'New!':'Новое!';}
 updateCard();
 return {update,updateCard,dispose(){badge.remove();card.dispose();button.removeEventListener('click',click);button.removeEventListener('pointerdown',press);button.removeEventListener('pointerup',stop);doc.defaultView.removeEventListener('keydown',key);button.remove();meter.remove();}};
}
