export function createStudyRewardUi({document,getGameplay,platform,language=()=> 'ru',pause,notify,canAct,development=false}){
 const button=document.getElementById('study-reward'),effects=document.getElementById('study-xp-effects'),labelNode=document.getElementById('study-reward-label');
 let busy=false,clock=0,sparks=[],disposed=false;
 const clear=()=>{for(const item of sparks)item.node.remove();sparks=[];clock=0;};
 async function request(){
  const g=getGameplay();
  if(disposed||busy||!g?.state.seatedId||g.studyBoostRemaining>0||!canAct()||(!development&&!platform?.showRewardedAd))return;
  busy=true;pause(true);g.flushProgress();
  try{
   const result=development?{rewarded:true}:await platform.showRewardedAd();
   if(disposed)return;
   if(result?.rewarded===true&&getGameplay()===g){g.activateStudyBoost();notify(language()==='en'?'Study XP ×2 for 1 minute!':'XP за обучение ×2 на 1 минуту!');}
   else notify(language()==='en'?'Watch the full video to receive the bonus':'Для бонуса нужно досмотреть рекламу');
  }catch{if(!disposed)notify(language()==='en'?'Advertisement unavailable. Try later.':'Реклама недоступна. Попробуйте позже.');}
  finally{busy=false;if(!disposed)pause(false);}
 }
 button?.addEventListener('click',request);
 return {
  update(dt,active){
   const g=getGameplay(),seated=!!g?.state.seatedId,remaining=g?.studyBoostRemaining||0,en=language()==='en';
   if(button){button.hidden=!seated||(!busy&&!active);button.disabled=busy||remaining>0||(!development&&!platform?.showRewardedAd);
    const label=busy?(en?'Loading advertisement…':'Загрузка рекламы…'):remaining>0?`XP ×2 · ${Math.ceil(remaining)} ${en?'sec':'сек'}`:en?'XP ×2 · 1 min':'XP ×2 · 1 мин';if(labelNode&&labelNode.textContent!==label)labelNode.textContent=label;
    button.title=development?(en?'Start study bonus':'Включить бонус обучения'):(en?'Watch a video for double study XP':'Смотреть видео за двойной XP обучения');}
   if(!seated||!active||!effects){clear();return;}
   if(!Number.isFinite(dt)||dt<=0||dt>.1)return;
   for(const item of sparks)item.age+=dt;
   sparks=sparks.filter(item=>{if(item.age<1.6)return true;item.node.remove();return false;});
   clock+=dt;if(clock<.65||sparks.length>=3)return;clock=0;
   const node=document.createElement('span');node.className='study-xp-spark';
   node.innerHTML='<svg class="hud-art" aria-hidden="true"><use href="#hud-xp" /></svg><strong>XP'+(remaining>0?' ×2':'')+'</strong>';
   node.style.left=`${25+Math.random()*50}%`;node.style.top=`${28+Math.random()*32}%`;
   effects.appendChild(node);sparks.push({node,age:0});
  },
  dispose(){disposed=true;button?.removeEventListener('click',request);clear();},
 };
}
