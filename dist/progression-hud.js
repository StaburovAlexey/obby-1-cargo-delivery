import { PROGRESSION_CONFIG, SCHOOL_CONFIG, SKIN_CONFIG, schoolConfig, skinConfig } from './progression-config.js';
import { UPGRADE_STATS, getUpgradeOffer } from './vehicle-upgrades.js';
import { BIOME_SEQUENCE, vehicleConfig } from './economy-config.js';
import {TYRE_CONFIG} from './economy-balance.js';
import {createUiCache} from './ui-cache.js';


export const brainDisplay = n => {
  const value=Number(n);
  return String(Math.floor(Number.isFinite(value)?Math.max(0,Math.min(PROGRESSION_CONFIG.maxBrains,value)):0));
};

export const brainRateDisplay = n => (Math.floor(Math.max(0,Number(n)||0)*10+1e-6)/10).toFixed(1).replace(/\.0$/,'').replace('.',',');

export const WORLD_LABEL_DROP=.4;
export const schoolLabelScale = () => 1;
const decimal=(value,digits=1)=>Number(value).toFixed(digits).replace('.',',');
const compactDecimal=value=>decimal(value).replace(/,0$/,'');


export function upgradeValuePresentation(stat,offer){
  const current=offer.currentPerformance,next=offer.nextPerformance;
  const pair=(a,b,format,unit='')=>(offer.maxed?format(a):`${format(a)} → ${format(b)}`)+(unit?' '+unit:'');
  if(stat==='speed')return {
    value:pair(current.maxSpeed*3.6,next.maxSpeed*3.6,n=>decimal(n),'км/ч'),
    detail:'Разгон: '+pair(current.acceleration,next.acceleration,n=>decimal(n,2),'м/с²'),
  };
  if(stat==='handling')return {
    value:pair(current.steeringResponseSeconds*1000,next.steeringResponseSeconds*1000,n=>String(Math.round(n)),'мс'),
    detail:'Отклик руля: меньше — быстрее. Контроль заноса и управление: '+pair(current.handling,next.handling,n=>decimal(n,3)),
  };
  if(stat==='grip')return {
    value:pair(current.grip,next.grip,n=>decimal(n,3)),
    detail:'Сцепление: позже срыв в занос, быстрее восстановление и лучше торможение',
  };
  return {
    value:pair(current.range,next.range,compactDecimal,'м'),
    detail:'Объём бака: '+pair(current.capacity,next.capacity,compactDecimal,'ед.')+
      (offer.maxed?'':` (+${compactDecimal(next.range-current.range)} м)`)+'. Заправка отдельно.',
  };
}
export function updateProgressionHud(doc,{gameplay,playing,driving,upgradeMenuOpen,premium,purchaseMenuOpen=false,vehicleFundsAvailable=true,controlsHidden=false}){
  const s=gameplay.state,ui=createUiCache(doc),el=id=>ui.get(id),brains=brainDisplay(s.brains);
  ui.text(el('brain-value'),brains);
  ui.style(el('brain-hud'),'--brain-digits',String(brains.length));
  ui.attribute(el('brain-hud'),'aria-label',`XP: ${brains}`);
  ui.hidden(el('upgrade-button'),controlsHidden||!playing||!driving);
  ui.attribute(el('upgrade-button'),'aria-expanded',String(upgradeMenuOpen));
  ui.hidden(el('upgrade-menu'),!upgradeMenuOpen);
  ui.class(doc.body,'upgrade-menu-open',upgradeMenuOpen);
  ui.hidden(el('vehicle-funds-button'),!vehicleFundsAvailable||!playing||driving||!!s.seatedId||s.vehicleGrantClaimed);
  const canBuy=playing&&!purchaseMenuOpen&&!driving&&!s.seatedId&&!s.jump.airborne;
  for(const kind of ['skin','school']){
    const id=s[kind+'PurchaseCandidateId'],spec=kind==='skin'?skinConfig(id):schoolConfig(id),owned=kind==='skin'?gameplay.isSkinOwned(id):gameplay.isSchoolOwned(id);
    const button=el('buy-'+kind);ui.hidden(button,!canBuy||!spec);
    if(spec){const product=spec.premium?premium?.catalog.get(id):null,schoolAvailability=kind==='school'?gameplay.getSchoolAvailability(id):null;
      const schoolLocked=schoolAvailability?.reason==='previous-school',available=(!spec.premium||!!product)&&!schoolLocked;
      ui.data(button,'owned',String(owned));ui.data(button,'premium',String(!!spec.premium));const label=owned?(kind==='skin'?'Выбрать':`Сесть · +${brainRateDisplay(spec.rate)} XP/сек`):schoolLocked?`Сначала: ${schoolAvailability.previousSchoolName}`:spec.premium?(product?`Купить ${product.price}`:'Покупки недоступны'):`Купить ${spec.price}`;
      setPortalPrice(doc,el('buy-'+kind+'-label'),label,spec.premium&&!owned?product:null);ui.property(button,'disabled',!!premium?.status.busy||(!owned&&!available));ui.data(button,'affordable',String(owned||(spec.premium?available:available&&s.money>=spec.price)));ui.attribute(button,'aria-label',schoolLocked?`Сначала купите ${schoolAvailability.previousSchoolName}.`:spec.premium?label:owned?label:`Купить ${spec.name} за ${spec.price} игровых денег`);
    }
  }
  const school=schoolConfig(s.seatedSchoolId);
  ui.hidden(el('study-status'),!playing||!s.seatedId||!school);
  if(school)ui.text(el('study-status'),`${school.name} · +${brainRateDisplay(school.rate)} XP/сек`);
  for(const [i,skin]of SKIN_CONFIG.entries()){if(gameplay.isSkinOwned(skin.id))ui.hidden(el(`skin-label-${i+1}`),true);}
  if(!upgradeMenuOpen||!s.selectedId)return;
  const selected=vehicleConfig(s.selectedId),ordinary=!selected.rewardOnly;
  ui.text(el('upgrade-car-name'),selected.name);
  ui.text(el('upgrade-description'),ordinary?'Общие улучшения всех обычных машин за XP. Новые машины сохраняют купленные уровни.':'Покупка за XP. Улучшается только эта машина.');
  ui.hidden(el('tyre-shop'),!ordinary);
  if(ordinary){
    const current=TYRE_CONFIG[s.tyreTier]||TYRE_CONFIG[0];
    ui.text(el('tyre-current'),`Текущие шины: ${current.name}`);
    ui.text(el('tyre-current-biomes'),'Без штрафа: '+BIOME_SEQUENCE.slice(0,current.tier+1).map(biome=>biome.name).join(', '));
    for(const tyre of TYRE_CONFIG){
      const offer=gameplay.getTyreOffer(tyre.tier),prefix='tyre-'+tyre.tier;
      const status=offer.owned?'Куплено':offer.reason==='previous-tyres'?'Сначала предыдущие шины':offer.reason==='brains'?'Недостаточно XP':offer.reason==='vehicle-unavailable'||offer.reason==='mode'?'Нужна купленная обычная машина':'Следующий комплект';
      ui.text(el(prefix+'-status'),status);
      ui.text(el(prefix+'-biomes'),'Без штрафа: '+BIOME_SEQUENCE.slice(0,tyre.tier+1).map(biome=>biome.name).join(', '));
      ui.text(el(prefix+'-price'),offer.owned?'Куплено':String(offer.price));
      const button=el(prefix+'-buy');
      ui.property(button,'disabled',!offer.purchasable);
      ui.data(button,'affordable',String(offer.owned||s.brains>=offer.price));
      ui.data(el(prefix+'-card'),'state',offer.owned?'owned':tyre.tier===s.tyreTier+1?'next':'locked');
      ui.attribute(button,'aria-label',`${tyre.name}: ${status}. Цена: ${offer.price} XP.`);
    }
  }
  for(const stat of UPGRADE_STATS){
    const offer=getUpgradeOffer(s.selectedId,stat.id,s.upgrades[s.selectedId]),prefix='upgrade-'+stat.id;
    const presentation=upgradeValuePresentation(stat.id,offer);
    ui.text(el(prefix+'-level'),`${offer.level} / ${offer.maxLevel}`);
    ui.text(el(prefix+'-value'),presentation.value);
    ui.text(el(prefix+'-description'),presentation.detail);
    ui.text(el(prefix+'-price'),offer.maxed?'МАКС':String(offer.price));
    const button=el(prefix+'-buy');ui.property(button,'disabled',offer.maxed||s.brains<offer.price);
    ui.attribute(button,'aria-label',offer.maxed?`${stat.name}: максимальный уровень`:`${stat.name}: уровень ${offer.nextLevel}, ${offer.price} XP. ${presentation.value}. ${presentation.detail}`);
  }
}
const worldLabels=new WeakMap();
function progressionLabelNodes(doc,garage){
  let labels=worldLabels.get(doc);if(labels?.garage===garage)return labels;
  const ui=createUiCache(doc),el=id=>ui.get(id);
  labels={garage,schools:garage.classroomEntries.map((entry,i)=>({entry,spec:schoolConfig(entry.id),
    rate:el(`school-rate-${i+1}`),price:el(`school-price-${i+1}`),lock:el(`school-lock-${i+1}`),dollar:el(`school-dollar-${i+1}`),access:el(`school-access-${i+1}`),element:el(`school-label-${i+1}`)})),
    skins:garage.stands.map((stand,i)=>({stand,skin:SKIN_CONFIG[i],price:el(`skin-price-${i+1}`),element:el(`skin-label-${i+1}`)}))};
  worldLabels.set(doc,labels);return labels;
}
export function updateProgressionWorldLabels(doc,{gameplay,garage,playing,project,viewportWidth=390,premium}){
  const ui=createUiCache(doc),labels=progressionLabelNodes(doc,garage),visible=playing&&gameplay.state.mode==='walking',projectedSchools=[];
  if(!visible){for(const label of [...labels.schools,...labels.skins])ui.hidden(label.element,true);return;}
  for(const [i,label]of labels.schools.entries()){
    const {entry,spec,rate,price,lock,dollar,access,element}=label,owned=gameplay.isSchoolOwned(entry.id),a=entry.labelAnchor;
    ui.text(rate,brainRateDisplay(spec.rate));
    ui.text(price,owned?'':String(spec.price));
    ui.hidden(lock,owned);ui.hidden(dollar,owned);ui.hidden(access,owned);
    const availability=gameplay.getSchoolAvailability(entry.id);
    ui.data(access,'affordable',String(owned||(availability.purchasable&&gameplay.state.money>=spec.price)));
    ui.data(element,'locked',String(availability.reason==='previous-school'));
    const depth=project(element,a.x,a.y-WORLD_LABEL_DROP,a.z,true,65);
    if(!element.hidden)projectedSchools.push({element,depth:Number.isFinite(depth)?depth:0,index:i});
  }
  const scale=schoolLabelScale(viewportWidth);
  projectedSchools.sort((a,b)=>b.depth-a.depth||a.index-b.index);
  for(const [rank,{element}]of projectedSchools.entries()){
    ui.style(element,'--school-scale',String(scale));
    if(element.style.zIndex!==String(rank+1))element.style.zIndex=String(rank+1);
  }
  for(const {stand,skin,price,element}of labels.skins){
    const owned=gameplay.isSkinOwned(skin.id);
    const product=skin.premium?premium?.catalog.get(skin.id):null;
    setPortalPrice(doc,price,skin.premium?(product?.price||'—'):String(skin.price),product);
    ui.data(element,'premium',String(skin.premium));
    project(element,stand.x,(stand.y??.16)+4.84-WORLD_LABEL_DROP,stand.z,!owned,45);
  }
}

const priceContent=new WeakMap(),currencyImages=new WeakMap();
function setPortalPrice(doc,node,text,product){
  if(product?.currencyLabel)text+=' '+product.currencyLabel;
  let icon='';
  if(product&&typeof product.getPriceCurrencyImage==='function'){
    if(!currencyImages.has(product)){try{currencyImages.set(product,product.getPriceCurrencyImage('small')||'');}catch{currencyImages.set(product,'');}}
    icon=currencyImages.get(product);
  }
  const accessibleText=text;
  if(icon&&typeof product.priceValue==='string'&&product.priceValue.trim()&&typeof product.price==='string'&&product.price){
    text=text.replace(product.price,product.priceValue);
  }
  const previous=priceContent.get(node);
  if(previous?.text===text&&previous?.icon===icon&&previous?.accessibleText===accessibleText)return;
  node.textContent=text;node.setAttribute?.('aria-label',accessibleText);priceContent.set(node,{text,icon,accessibleText});
  if(!icon||!doc.createElement||!node.appendChild)return;
  const image=doc.createElement('img');image.className='portal-currency-icon';image.alt='';image.src=icon;node.appendChild(image);
}
