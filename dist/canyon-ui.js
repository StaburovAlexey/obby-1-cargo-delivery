import {translateGameText} from './localization.js';
const notes={posted:'Результат отправлен в таблицу Яндекса.', 'not-improved':'Ваш лучший результат уже в таблице Яндекса.', 'auth-required':'Войдите в Яндекс, чтобы попасть в таблицу лидеров.', unavailable:'Личный рекорд сохранён. Рейтинг доступен в Яндекс Играх.', unverified:'Личный рекорд сохранён. Результат не отправлен.', practice:'Тренировочный заезд. Личный рекорд сохранён.', development:'Тренировочный заезд. Результат не сохраняется.', checking:'Проверяем заезд…', 'missing-board':'Таблица лидеров временно недоступна.', error:'Не удалось загрузить рейтинг. Попробуйте позже.', 'account-changed':'Аккаунт изменился. Перезагрузите игру.', cancelled:'Попытка прервана.'};
export function createCanyonUi(doc,{onRetry=()=>{},onExit=()=>{},onRankings=()=>{},onLogin=()=>{},language=()=> 'ru',rankingsEnabled=true}={}){
 const el=id=>doc.getElementById(id),listeners=[];let lastResult=null,lastOptions={};
 const lang=()=>typeof language==='function'?language():language;
 const text=value=>translateGameText(value,lang()),number=value=>new Intl.NumberFormat(lang()==='en'?'en-US':'ru-RU').format(Math.floor(Number(value)||0));
 const set=(id,value)=>{const node=el(id);if(node)node.textContent=value;};
 const listen=(id,callback)=>{const node=el(id);if(!node)return;const fn=event=>{event.stopPropagation?.();callback();};node.addEventListener('click',fn);listeners.push(()=>node.removeEventListener('click',fn));};
 function showResult(result,options={}){
  lastResult=result;lastOptions=options;el('canyon-overlay').hidden=false;el('canyon-hud').hidden=true;el('canyon-rankings').hidden=true;el('canyon-back').hidden=true;
  set('canyon-title',text(result?'Каньон пройден':'Попытка прервана'));el('canyon-result-score').hidden=false;set('canyon-result-score',number(result?.score));
  set('canyon-result-note',text(notes[options.status]||notes.unverified));el('canyon-login').hidden=options.status!=='auth-required';el('canyon-rankings-button').hidden=!rankingsEnabled;
 }
 listen('canyon-retry',onRetry);listen('canyon-exit',onExit);listen('canyon-rankings-button',onRankings);listen('canyon-login',onLogin);listen('canyon-back',()=>showResult(lastResult,lastOptions));
 return {
  update({phase,score=0,multiplier=1,progress=0,length=1850,angle=0,countdown=0}){
   const active=phase==='running'||phase==='countdown';el('canyon-hud').hidden=!active;
   if(active){el('canyon-overlay').hidden=true;set('canyon-phase',text(phase==='countdown'?'Приготовьтесь':'Каньон · дрифт')+(phase==='countdown'?' · '+Math.max(1,Math.ceil(countdown)):''));set('canyon-score',number(score));set('canyon-combo','×'+multiplier);set('canyon-progress',Math.max(0,Math.min(100,Math.floor(progress/length*100)))+'%');set('canyon-angle',text('Угол')+': '+Math.round(Math.abs(angle)*180/Math.PI)+'°');}
  },
  showResult,
  showRankings(board){
   el('canyon-overlay').hidden=false;el('canyon-rankings').hidden=false;el('canyon-back').hidden=false;el('canyon-result-score').hidden=true;set('canyon-title',text('Таблица Яндекса'));set('canyon-result-note','');
   el('canyon-login').hidden=!board.canLogin;
   const rows=(board.entries||[]).map(entry=>{const row=doc.createElement('tr');for(const value of [entry.rank,entry.name||text('Игрок'),number(entry.score)]){const cell=doc.createElement('td');cell.textContent=String(value);cell.setAttribute('data-i18n-skip','');row.append(cell);}if(entry.rank===board.player?.rank)row.setAttribute('data-self','true');return row;});
   el('canyon-ranking-rows').replaceChildren(...rows);set('canyon-ranking-note',text(board.status==='loading'?'Загрузка…':board.status==='ready'?(rows.length?'Ваш лучший заезд попадёт в эту таблицу.':'Пока нет результатов.'):notes[board.status]||notes.error));
  },
  setLoginBusy(value){el('canyon-login').disabled=!!value;},
  hide(){el('canyon-hud').hidden=true;el('canyon-overlay').hidden=true;},
  dispose(){listeners.splice(0).forEach(remove=>remove());el('canyon-hud').hidden=true;el('canyon-overlay').hidden=true;},
 };
}
