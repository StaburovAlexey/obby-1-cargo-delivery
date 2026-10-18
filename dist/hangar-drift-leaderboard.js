import {createCanyonLeaderboard} from './canyon-leaderboard.js';

const copy = {
 ru: {title:'Рейтинг дрифта',close:'Закрыть рейтинг',rank:'Место',player:'Игрок',score:'Очки',loading:'Загрузка рейтинга…',ready:'Лучшие заезды в Яндекс Играх.',empty:'Пока нет результатов.',unavailable:'Рейтинг доступен только в Яндекс Играх.',development:'В тестовой версии онлайн-рейтинг недоступен.',error:'Не удалось загрузить рейтинг. Попробуйте позже.',missing:'Таблица лидеров временно недоступна.',changed:'Аккаунт изменился. Перезагрузите игру.',auth:'Войдите в Яндекс Игры, чтобы увидеть свой результат.',self:'Ваш результат'},
 en: {title:'Drift leaderboard',close:'Close leaderboard',rank:'Rank',player:'Player',score:'Score',loading:'Loading leaderboard…',ready:'Best runs on Yandex Games.',empty:'No results yet.',unavailable:'The leaderboard is available only on Yandex Games.',development:'The online leaderboard is unavailable in this test version.',error:'Could not load the leaderboard. Please try again later.',missing:'The leaderboard is temporarily unavailable.',changed:'Your account changed. Reload the game.',auth:'Sign in to Yandex Games to see your result.',self:'Your result'},
};

export function createHangarDriftLeaderboard(doc,{platform,language=()=> 'ru',canOpen=()=>true,onOpenChange=()=>{}}={}) {
 const el=id=>doc.getElementById(`hangar-drift-${id}`);
 const button=el('button'),menu=el('menu'),panel=el('panel'),closeButton=el('close');
 let opened=false,disposed=false,board=null,adapter=null,epoch=0,returnFocus=null,background=[];
 const listeners=[];
 const listen=(node,type,fn)=>{node.addEventListener(type,fn);listeners.push(()=>node.removeEventListener(type,fn));};
 const contains=(parent,node)=>{if(parent.contains)return parent.contains(node);for(let n=node;n;n=n.parentNode||n.parent)if(n===parent)return true;return false;};
 const lang=()=> (typeof language==='function'?language():language)==='en'?'en':'ru';
 function refresh(){
  const words=copy[lang()],number=value=>new Intl.NumberFormat(lang()==='en'?'en-US':'ru-RU').format(value);
  button.setAttribute('aria-label',words.title);button.setAttribute('title',words.title);
  for(const id of ['title','rank','player','score'])el(id).textContent=words[id];
  closeButton.setAttribute('aria-label',words.close);
  const status=board?.status||'loading',entries=status==='ready'?(board.entries||[]):[];
  el('note').textContent=status==='loading'?words.loading:status==='ready'?(entries.length?words.ready:words.empty):platform?.development?words.development:status==='unavailable'?words.unavailable:status==='missing-board'?words.missing:status==='account-changed'?words.changed:status==='auth-required'?words.auth:words.error;
  const rows=entries.map(entry=>{
   const row=doc.createElement('tr');
   for(const value of [entry.rank,entry.name||words.player,number(entry.score)]){const cell=doc.createElement('td');cell.textContent=String(value);row.append(cell);}
   if(entry.rank===board.player?.rank)row.setAttribute('data-self','true');return row;
  });
  el('rows').replaceChildren(...rows);el('table').hidden=!rows.length;
  el('self').hidden=status!=='ready'||!board?.player;
  el('self').textContent=board?.player?`${words.self}: #${board.player.rank} · ${number(board.player.score)}`:'';
  panel.setAttribute('aria-busy',String(opened&&status==='loading'));
 }
 function close({restoreFocus=true}={}){
  if(!opened)return;
  opened=false;epoch++;adapter?.dispose();adapter=null;menu.hidden=true;button.setAttribute('aria-expanded','false');
  for(const [node,inert] of background)node.inert=inert;background=[];
  onOpenChange(false);
  if(restoreFocus&&!button.hidden)(returnFocus||button).focus?.();
 }
 async function open(){
  if(disposed||opened||!canOpen())return false;
  opened=true;const token=++epoch;returnFocus=doc.activeElement;board={status:'loading'};
  menu.hidden=false;button.setAttribute('aria-expanded','true');onOpenChange(true);
  for(const node of Array.from(doc.body.children||[])){if(node===menu||contains(node,menu))continue;background.push([node,node.inert]);node.inert=true;}
  refresh();closeButton.focus?.();adapter=createCanyonLeaderboard({platform});
  const result=await adapter.load();if(disposed||!opened||token!==epoch)return false;
  board=result;refresh();return true;
 }
 listen(button,'click',event=>{event.stopPropagation();void open();});
 listen(closeButton,'click',()=>close());
 listen(menu,'click',event=>{if(event.target===menu)close();});
 listen(doc,'keydown',event=>{
  if(!opened)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
  else if(event.key==='Tab'){event.preventDefault();event.stopPropagation();closeButton.focus?.();}
 });
 listen(doc,'focusin',event=>{if(opened&&!contains(menu,event.target))closeButton.focus?.();});
 for(const node of [button,menu])for(const type of ['pointerdown','pointerup','pointermove','touchstart','touchmove','touchend','wheel','keyup','click'])listen(node,type,event=>event.stopPropagation());
 refresh();menu.hidden=true;
 return {open,close,refresh,isOpen:()=>opened,dispose(){if(disposed)return;close({restoreFocus:false});disposed=true;listeners.splice(0).forEach(remove=>remove());}};
}
