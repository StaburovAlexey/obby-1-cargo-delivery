const COPY={
 ru:{title:'Музыка',track:'Трек',previous:'Предыдущий трек',next:'Следующий трек',play:'Слушать',pause:'Пауза',idle:'Нажмите «Слушать», чтобы включить музыку.',playing:'Играет',loading:'Загрузка трека…',suspended:'Музыка продолжится после возвращения в игру.',error:'Не удалось включить трек. Нажмите «Слушать» ещё раз.',note:'Музыка продолжает играть после закрытия настроек.'},
 en:{title:'Music',track:'Track',previous:'Previous track',next:'Next track',play:'Play',pause:'Pause',idle:'Press Play to start the music.',playing:'Playing',loading:'Loading track…',suspended:'Music will resume when you return to the game.',error:'Unable to play this track. Press Play to try again.',note:'Music keeps playing when you close settings.'},
};

export function createSettingsMusic(doc,{music,tracks,language='ru',canControl=()=>true}){
 const el=name=>doc.getElementById(`settings-music-${name}`);
 const select=el('track'),toggle=el('toggle'),previous=el('previous'),next=el('next');
 let currentLanguage=language==='en'?'en':'ru',disposed=false,state=music.getState();
 const listeners=[];
 for(const [index,track] of tracks.entries()){
  const option=doc.createElement('option');option.value=String(index);option.textContent=`${index+1}. ${track.title}`;select.append(option);
 }
 function render(value=music.getState()){
  if(disposed)return;
  state=value;const copy=COPY[currentLanguage];
  el('title').textContent=copy.title;el('track-label').textContent=copy.track;
  select.value=String(state.index);
  el('artist').textContent=state.track?`${state.track.artist} · ${state.index+1} / ${tracks.length}`:'';
  const action=state.requested?copy.pause:copy.play;
  el('toggle-icon').textContent=state.requested?'Ⅱ':'▶';el('toggle-label').textContent=action;
  toggle.setAttribute('aria-label',action);toggle.setAttribute('aria-pressed',String(state.requested));
  previous.setAttribute('aria-label',copy.previous);previous.title=copy.previous;
  next.setAttribute('aria-label',copy.next);next.title=copy.next;
  el('status').textContent=state.error?copy.error:state.requested&&state.suspended?copy.suspended:state.loading?copy.loading:state.playing?copy.playing:copy.idle;
  el('note').textContent=copy.note;
 }
 const listen=(node,type,fn)=>{const callback=event=>{event.stopPropagation();if(!disposed&&canControl())fn();};node.addEventListener(type,callback);listeners.push([node,type,callback]);};
 listen(toggle,'click',()=>{if(state.requested)music.pause();else void music.play();});
 listen(previous,'click',()=>music.previous());listen(next,'click',()=>music.next());
 listen(select,'change',()=>{const index=Number(select.value);if(Number.isInteger(index)&&index>=0&&index<tracks.length)music.select(index);});
 const unsubscribe=music.subscribe(render);render();
 return{
  setLanguage(value){currentLanguage=value==='en'?'en':'ru';render();},
  dispose(){if(disposed)return;disposed=true;unsubscribe();for(const [node,type,callback] of listeners)node.removeEventListener(type,callback);},
 };
}
