import { PROGRESSION_CONFIG, SCHOOL_CONFIG, SKIN_CONFIG, schoolConfig, skinConfig } from './progression-config.js';
import { UPGRADE_STATS, getUpgradeOffer } from './vehicle-upgrades.js';
import { vehicleConfig } from './economy-config.js';

// Balances are whole spendable units; fractional earnings stay in gameplay state.
export const brainDisplay = n => {
  const value=Number(n);
  return String(Math.floor(Number.isFinite(value)?Math.max(0,Math.min(PROGRESSION_CONFIG.maxBrains,value)):0));
};
// Rates must retain their decimal precision (for example, the first school is 1.5/s).
export const brainRateDisplay = n => (Math.floor(Math.max(0,Number(n)||0)*10+1e-6)/10).toFixed(1).replace(/\.0$/,'').replace('.',',');
// Fixed viewport-sized artwork; world anchors are never screen-space shifted.
export const WORLD_LABEL_DROP=.4;
export const schoolLabelScale = width => Math.max(.5,Math.min(1,((Number(width)||390)-40)/600));
const decimal=(value,digits=1)=>Number(value).toFixed(digits).replace('.',',');
const compactDecimal=value=>decimal(value).replace(/,0$/,'');
// Use the same per-car values as physics. Percent modifiers obscure both the
// actual steering response and the tank's useful full-fill range increase.
export function upgradeValuePresentation(stat,offer){
  const current=offer.currentPerformance,next=offer.nextPerformance;
  const pair=(a,b,format,unit='')=>(offer.maxed?format(a):`${format(a)} → ${format(b)}`)+(unit?' '+unit:'');
  if(stat==='speed')return {
    value:pair(current.maxSpeed*3.6,next.maxSpeed*3.6,n=>decimal(n),'км/ч'),
    detail:'Разгон: '+pair(current.acceleration,next.acceleration,n=>decimal(n,2),'м/с²'),
  };
  if(stat==='handling')return {
    value:pair(current.steeringResponseSeconds*1000,next.steeringResponseSeconds*1000,n=>String(Math.round(n)),'мс'),
    detail:'Отклик руля: меньше — быстрее. Управление: '+pair(current.handling,next.handling,n=>decimal(n,3)),
  };
  if(stat==='grip')return {
    value:pair(current.grip,next.grip,n=>decimal(n,3)),
    detail:'Коэффициент бокового сцепления и торможения: больше — лучше',
  };
  return {
    value:pair(current.capacity,next.capacity,compactDecimal,'ед.'),
    detail:'Дальность полного бака: '+pair(current.range,next.range,compactDecimal,'м')+
      (offer.maxed?'':` (+${compactDecimal(next.range-current.range)} м)`)+'. Заправка отдельно.',
  };
}
export function updateProgressionHud(doc,{gameplay,playing,driving,upgradeMenuOpen,premium}){
  const s=gameplay.state,el=id=>doc.getElementById(id),brains=brainDisplay(s.brains);
  el('brain-value').textContent=brains;
  el('brain-hud').style.setProperty('--brain-digits',String(brains.length));
  el('brain-hud').setAttribute('aria-label',`Мозги: ${brains}`);
  el('upgrade-button').hidden=!playing||!driving;
  el('upgrade-button').setAttribute('aria-expanded',String(upgradeMenuOpen));
  el('upgrade-menu').hidden=!upgradeMenuOpen;
  doc.body.classList.toggle('upgrade-menu-open',upgradeMenuOpen);
  el('vehicle-funds-button').hidden=!playing||driving||!!s.seatedId||s.vehicleGrantClaimed;
  const canBuy=playing&&!driving&&!s.seatedId&&!s.jump.airborne;
  for(const kind of ['skin','school']){
    const id=s[kind+'PurchaseCandidateId'],spec=kind==='skin'?skinConfig(id):schoolConfig(id),owned=kind==='skin'?gameplay.isSkinOwned(id):gameplay.isSchoolOwned(id);
    const button=el('buy-'+kind);button.hidden=!canBuy||!spec;
    if(spec){const product=spec.premium?premium?.catalog.get(id):null,available=!spec.premium||!!product;
      button.dataset.owned=String(owned);button.dataset.premium=String(!!spec.premium);const label=owned?(kind==='skin'?'Выбрать':`Сесть · +${brainRateDisplay(spec.rate)}/сек`):spec.premium?(product?`Купить ${product.price}`:'Покупки недоступны'):`Купить ${spec.price}`;
      setPortalPrice(doc,el('buy-'+kind+'-label'),label,spec.premium&&!owned?product:null);button.disabled=!!premium?.status.busy||(!owned&&!available);button.dataset.affordable=String(owned||(spec.premium?available:s.money>=spec.price));button.setAttribute('aria-label',spec.premium?label:owned?label:`Купить ${spec.name} за ${spec.price} игровых денег`);
    }
  }
  const school=schoolConfig(s.seatedSchoolId);
  el('study-status').hidden=!playing||!s.seatedId||!school;
  if(school)el('study-status').textContent=`${school.name} · +${brainRateDisplay(school.rate)} мозга/сек`;
  for(const [i,skin]of SKIN_CONFIG.entries()){if(gameplay.isSkinOwned(skin.id))el(`skin-label-${i+1}`).hidden=true;}
  if(!upgradeMenuOpen||!s.selectedId)return;
  el('upgrade-car-name').textContent=vehicleConfig(s.selectedId).name;
  for(const stat of UPGRADE_STATS){
    const offer=getUpgradeOffer(s.selectedId,stat.id,s.upgrades[s.selectedId]),prefix='upgrade-'+stat.id;
    const presentation=upgradeValuePresentation(stat.id,offer);
    el(prefix+'-level').textContent=`${offer.level} / ${offer.maxLevel}`;
    el(prefix+'-value').textContent=presentation.value;
    el(prefix+'-description').textContent=presentation.detail;
    el(prefix+'-price').textContent=offer.maxed?'МАКС':String(offer.price);
    const button=el(prefix+'-buy');button.disabled=offer.maxed||s.brains<offer.price;
    button.setAttribute('aria-label',offer.maxed?`${stat.name}: максимальный уровень`:`${stat.name}: уровень ${offer.nextLevel}, ${offer.price} мозгов. ${presentation.value}. ${presentation.detail}`);
  }
}
export function updateProgressionWorldLabels(doc,{gameplay,garage,playing,project,viewportWidth=390,premium}){
  const visible=playing&&gameplay.state.mode==='walking',projectedSchools=[];
  for(const [i,entry]of garage.classroomEntries.entries()){
    const spec=SCHOOL_CONFIG.find(s=>s.id===entry.id),owned=gameplay.isSchoolOwned(entry.id),a=entry.labelAnchor;
    doc.getElementById(`school-rate-${i+1}`).textContent=brainRateDisplay(spec.rate);
    doc.getElementById(`school-price-${i+1}`).textContent=owned?'':String(spec.price);
    doc.getElementById(`school-lock-${i+1}`).hidden=owned;
    doc.getElementById(`school-dollar-${i+1}`).hidden=owned;
    const access=doc.getElementById(`school-access-${i+1}`);
    access.hidden=owned;
    access.dataset.affordable=String(owned||gameplay.state.money>=spec.price);
    const element=doc.getElementById(`school-label-${i+1}`);
    const depth=project(element,a.x,a.y-WORLD_LABEL_DROP,a.z,visible,65);
    if(!element.hidden)projectedSchools.push({element,depth:Number.isFinite(depth)?depth:0,index:i});
  }
  // Composition remains camera-facing and viewport-sized. Keep the exact
  // projected X/Y even when labels overlap or partially leave the screen.
  // Projection depth is monotone (near -1, far +1); draw farther labels first.
  const scale=schoolLabelScale(viewportWidth);
  projectedSchools.sort((a,b)=>b.depth-a.depth||a.index-b.index);
  for(const [rank,{element}]of projectedSchools.entries()){
    element.style.setProperty('--school-scale',String(scale));
    element.style.zIndex=String(rank+1);
  }
  for(const [i,stand]of garage.stands.entries()){
    const skin=SKIN_CONFIG[i],owned=gameplay.isSkinOwned(skin.id);
    const priceNode=doc.getElementById(`skin-price-${i+1}`),product=skin.premium?premium?.catalog.get(skin.id):null;
    setPortalPrice(doc,priceNode,skin.premium?(product?.price||'—'):String(skin.price),product);
    const label=doc.getElementById(`skin-label-${i+1}`);label.dataset.premium=String(skin.premium);
    project(doc.getElementById(`skin-label-${i+1}`),stand.x,5.0-WORLD_LABEL_DROP,stand.z,visible&&!owned,45);
  }
}

const priceContent=new WeakMap(),currencyImages=new WeakMap();
function setPortalPrice(doc,node,text,product){
  let icon='';
  if(product&&typeof product.getPriceCurrencyImage==='function'){
    if(!currencyImages.has(product)){try{currencyImages.set(product,product.getPriceCurrencyImage('small')||'');}catch{currencyImages.set(product,'');}}
    icon=currencyImages.get(product);
  }
  const previous=priceContent.get(node);
  if(previous?.text===text&&previous?.icon===icon)return;
  node.textContent=text;priceContent.set(node,{text,icon});
  if(!icon||!doc.createElement||!node.appendChild)return;
  const image=doc.createElement('img');image.className='portal-currency-icon';image.alt='';image.src=icon;node.appendChild(image);
}
