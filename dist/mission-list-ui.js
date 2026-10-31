export function createMissionList(doc,{onClaim,translate=value=>value}){
  const list=doc.getElementById('career-mission-list'),cards=new Map();
  let order='',lastMissions=[];
  const make=(tag,parent,className,id)=>{
    const node=doc.createElement(tag);if(className)node.className=className;if(id)node.setAttribute('id',id);
    parent.appendChild(node);return node;
  };
  const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  const number=value=>String(Math.floor(value)).replace(/\B(?=(\d{3})+(?!\d))/g,'\u202f');
  const icon=(parent,symbol)=>{
    const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','hud-art');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    const use=doc.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href',`#${symbol}`);
    svg.appendChild(use);parent.appendChild(svg);
  };
  const create=mission=>{
    const card=make('article',list,'mission-card',`mission-${mission.id}`);
    card.setAttribute('role','listitem');card.setAttribute('data-mission-id',mission.id);
    const heading=make('div',card,'mission-card-heading');
    const title=make('h3',heading,'',`mission-${mission.id}-name`);
    card.setAttribute('aria-labelledby',title.id);
    const status=make('span',heading,'mission-status');
    const description=make('p',card,'mission-description');
    const count=make('strong',card,'mission-count');
    const progress=make('progress',card);progress.max=mission.target;
    const footer=make('div',card,'mission-card-footer'),reward=make('div',footer,'career-reward');
    icon(reward,'hud-money');const cash=make('strong',reward);
    icon(reward,'hud-xp');const brains=make('strong',reward);
    const button=make('button',footer,'mission-claim',`mission-${mission.id}-claim`);button.type='button';
    const click=()=>{if(!button.hidden&&!button.disabled)onClaim(mission.id);};
    button.addEventListener('click',click);
    const entry={card,title,status,description,count,progress,cash,brains,button,reward,click};
    cards.set(mission.id,entry);return entry;
  };
  const update=(missions,{claimEnabled=true}={})=>{
    lastMissions=missions;
    list.setAttribute('aria-label',translate('Задания'));
    const nextOrder=missions.map(mission=>mission.id).join(',');
    const scrollHost=list.parentNode,scroll=scrollHost?.scrollTop??0;
    let anchor,anchorTop;
    if(order!==nextOrder&&scrollHost){
      const top=scrollHost.getBoundingClientRect().top;
      for(const mission of missions){
        const card=cards.get(mission.id)?.card;
        if(!card||mission.status==='claimed')continue;
        const bounds=card.getBoundingClientRect();
        if(bounds.top+bounds.height>top){anchor=card;anchorTop=bounds.top;break;}
      }
    }
    for(const mission of missions){
      const entry=cards.get(mission.id)||create(mission),ready=mission.status==='ready',claimed=mission.status==='claimed';
      const title=translate(mission.name),count=number(mission.progress)+' / '+number(mission.target);
      text(entry.title,title);text(entry.description,translate(mission.description));
      text(entry.status,translate(claimed?'Получено':ready?'Готово к получению':'В процессе'));
      text(entry.count,count);text(entry.cash,'+'+number(mission.cash));text(entry.brains,'+'+number(mission.brains));
      entry.progress.value=mission.progress;
      entry.progress.setAttribute('aria-label',title+': '+count);
      entry.card.setAttribute('data-state',mission.status);
      entry.reward.setAttribute('aria-label',translate('Награда')+': '+number(mission.cash)+' '+translate('Монеты')+', '+number(mission.brains)+' XP');
      entry.button.hidden=!ready;entry.button.disabled=!ready||!claimEnabled;
      text(entry.button,translate('Получить'));entry.button.setAttribute('aria-label',translate('Получить')+': '+title);
    }
    if(order!==nextOrder){
      list.replaceChildren(...missions.map(mission=>cards.get(mission.id).card));
      if(scrollHost)scrollHost.scrollTop=scroll+(anchor?anchor.getBoundingClientRect().top-anchorTop:0);
      order=nextOrder;
    }
  };
  const claimButtons=()=>lastMissions.filter(mission=>mission.status==='ready').map(mission=>cards.get(mission.id).button).filter(button=>!button.disabled);
  return {update,claimButtons,
    focusNext(fallback){(claimButtons()[0]||fallback)?.focus?.({preventScroll:true});},
    dispose(){for(const entry of cards.values())entry.button.removeEventListener('click',entry.click);cards.clear();list.replaceChildren();},
  };
}
