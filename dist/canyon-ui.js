import {translateGameText} from './localization.js';
const notes={posted:'Результат отправлен в таблицу Яндекса.', 'not-improved':'Ваш лучший результат уже в таблице Яндекса.', 'auth-required':'Войдите в Яндекс, чтобы попасть в таблицу лидеров.', unavailable:'Личный рекорд сохранён. Рейтинг доступен в Яндекс Играх.', local:'Личный рекорд сохранён. Результат не отправлен.', practice:'Тренировочный заезд. Личный рекорд сохранён.', development:'Тренировочный заезд. Результат не сохраняется.', checking:'Сохраняем результат…', 'missing-board':'Таблица лидеров временно недоступна.', error:'Не удалось загрузить рейтинг. Попробуйте позже.', 'account-changed':'Аккаунт изменился. Перезагрузите игру.', cancelled:'Попытка прервана.'};
export function createCanyonUi(doc,{onRetry=()=>{},onExit=()=>{},onRankings=()=>{},onLogin=()=>{},language=()=> 'ru',rankingsEnabled=true,now=()=>performance.now()}={}){
 const el=id=>doc.getElementById(id),listeners=[];let lastResult=null,lastOptions={},lastScore=0,lastGain=-Infinity;
 const lang=()=>typeof language==='function'?language():language;
 const text=value=>translateGameText(value,lang()),number=value=>new Intl.NumberFormat(lang()==='en'?'en-US':'ru-RU').format(Math.floor(Number(value)||0));
 const set=(id,value)=>{const node=el(id);if(node)node.textContent=value;};
 const combo=el('canyon-combo'),comboCaption=el('canyon-combo-caption')??doc.createElement('span');
 let lastMultiplier=null,comboGain=-Infinity;
 if(!comboCaption.id){comboCaption.id='canyon-combo-caption';comboCaption.setAttribute('aria-hidden','true');el('canyon-hud').append(comboCaption);}
 comboCaption.hidden=true;
 const clearComboFeedback=()=>{comboGain=-Infinity;comboCaption.hidden=true;combo?.setAttribute('data-celebrating','false');};
 const resetCombo=()=>{lastMultiplier=null;clearComboFeedback();combo?.setAttribute('data-boosted','false');};
 function updateCombo(multiplier,time){
  const value=Math.max(1,Math.floor(Number(multiplier)||1));
  combo?.setAttribute('data-boosted',String(value>1));
  if(value<=1)clearComboFeedback();
  else if(lastMultiplier!==null&&value>lastMultiplier&&value<=5){
   comboGain=time;comboCaption.textContent=text(`Очки ×${value}!`);comboCaption.hidden=false;
   // Only a new multiplier restarts this short animation; score ticks leave it alone.
   combo?.setAttribute('data-celebrating','false');void combo?.offsetWidth;combo?.setAttribute('data-celebrating','true');
  }else if(time-comboGain>=800)clearComboFeedback();
  lastMultiplier=value;
 }
 const checkpoint={hud:el('canyon-checkpoint-hud'),label:el('canyon-checkpoint-label'),distance:el('canyon-checkpoint-distance'),time:el('canyon-checkpoint-time')};
 const setCheckpointText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
 const hideCheckpoint=()=>{if(checkpoint.hud&&!checkpoint.hud.hidden)checkpoint.hud.hidden=true;};
 const listen=(id,callback)=>{const node=el(id);if(!node)return;const fn=event=>{event.stopPropagation?.();callback();};node.addEventListener('click',fn);listeners.push(()=>node.removeEventListener('click',fn));};
 const resetHud=()=>{lastScore=0;lastGain=-Infinity;resetCombo();el('canyon-hud').hidden=true;el('canyon-hud').setAttribute('data-visible','false');el('canyon-hud').setAttribute('data-scoring','false');};
 function showResult(result,options={}){
  resetHud();
  lastResult=result;lastOptions=options;el('canyon-overlay').hidden=false;el('canyon-hud').hidden=true;el('canyon-rankings').hidden=true;el('canyon-back').hidden=true;
  set('canyon-title',text(result?'Каньон пройден':'Попытка прервана'));el('canyon-result-score').hidden=false;set('canyon-result-score',number(result?.score));
  set('canyon-result-note',text(notes[options.status]||notes.local));el('canyon-login').hidden=options.status!=='auth-required';el('canyon-rankings-button').hidden=!rankingsEnabled;
 }
 listen('canyon-retry',onRetry);listen('canyon-exit',onExit);listen('canyon-rankings-button',onRankings);listen('canyon-login',onLogin);listen('canyon-back',()=>showResult(lastResult,lastOptions));
 return {
  updateCheckpoint({active=false,index=0,total=1,remaining=0,distance=0}={}){
   const hud=checkpoint.hud;if(!hud)return;
   if(!active){hideCheckpoint();return;}
   const count=Math.max(1,Math.floor(Number(total)||1));
   const target=Math.min(count,Math.max(1,Math.floor(Number(index)||0)+1));
   const seconds=Number.isFinite(remaining)?Math.max(0,remaining):0;
   const metres=Number.isFinite(distance)?Math.max(0,Math.ceil(distance)):0;
   const decimal=seconds.toFixed(1).replace('.',lang()==='en'?'.':',');
   setCheckpointText(checkpoint.label,`${text('Точка')} ${target}/${count}`);
   setCheckpointText(checkpoint.distance,`${metres} ${text('м')}`);
   setCheckpointText(checkpoint.time,`${decimal} ${text('с')}`);
   const label=text('Контрольная точка и время'),urgent=String(seconds<=5);
   if(hud.getAttribute('aria-label')!==label)hud.setAttribute('aria-label',label);
   if(hud.getAttribute('data-urgent')!==urgent)hud.setAttribute('data-urgent',urgent);
   if(hud.hidden)hud.hidden=false;
  },
  update({phase,score=0,multiplier=1}){
   const hud=el('canyon-hud');
   set('canyon-score',number(score));set('canyon-combo','×'+multiplier);
   if(phase!=='running'){resetHud();return;}
   el('canyon-overlay').hidden=true;
   const time=now(),value=Math.max(0,Math.floor(Number(score)||0));
   if(value<lastScore)resetHud();
   updateCombo(multiplier,time);
   if(value>lastScore)lastGain=time;
   lastScore=value;
   const sinceGain=time-lastGain;
   // Repeated score ticks keep one animation running, rather than restarting
   // it every frame. Hold the last number briefly, then fade it out.
   hud.hidden=sinceGain>=950;
   hud.setAttribute('data-visible',String(sinceGain<650));
   hud.setAttribute('data-scoring',String(sinceGain<160));
  },
  suspend(){lastGain=-Infinity;resetCombo();el('canyon-hud').hidden=true;el('canyon-hud').setAttribute('data-scoring','false');el('canyon-hud').setAttribute('data-visible','false');},
  showResult,
  showRankings(board){
   el('canyon-overlay').hidden=false;el('canyon-rankings').hidden=false;el('canyon-back').hidden=false;el('canyon-result-score').hidden=true;set('canyon-title',text('Таблица Яндекса'));set('canyon-result-note','');
   el('canyon-login').hidden=!board.canLogin;
   const rows=(board.entries||[]).map(entry=>{const row=doc.createElement('tr');for(const value of [entry.rank,entry.name||text('Игрок'),number(entry.score)]){const cell=doc.createElement('td');cell.textContent=String(value);cell.setAttribute('data-i18n-skip','');row.append(cell);}if(entry.rank===board.player?.rank)row.setAttribute('data-self','true');return row;});
   el('canyon-ranking-rows').replaceChildren(...rows);set('canyon-ranking-note',text(board.status==='loading'?'Загрузка…':board.status==='ready'?(rows.length?'Ваш лучший заезд попадёт в эту таблицу.':'Пока нет результатов.'):notes[board.status]||notes.error));
  },
  setLoginBusy(value){el('canyon-login').disabled=!!value;},
  hide(){resetHud();hideCheckpoint();el('canyon-overlay').hidden=true;},
  dispose(){listeners.splice(0).forEach(remove=>remove());resetHud();hideCheckpoint();el('canyon-overlay').hidden=true;},
 };
}
