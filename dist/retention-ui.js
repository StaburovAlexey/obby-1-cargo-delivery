import { VEHICLE_CONFIG } from './economy-config.js';

const boundedNumber=value=>Math.max(0,Number.isFinite(Number(value))?Number(value):0);
export const careerNumber=value=>String(Math.floor(boundedNumber(value))).replace(/\B(?=(\d{3})+(?!\d))/g,'\u202f');
const rewardParts=['base','clean','hard','first','mission'];
const rewardLabels={base:'Доставка',clean:'Без аварий',hard:'Сложный рейс',first:'Первый визит',mission:'Задание'};




export function createRetentionUi(doc,{onSelectGoal=()=>{},onSkipMission=()=>{},onOpenChange=()=>{}}={}){
  const el=id=>doc.getElementById(id),menu=el('career-menu'),root=el('career-panel'),select=el('career-goal-select'),receipt=el('delivery-receipt'),receiptMenu=el('delivery-receipt-menu');
  const buttons={goal:el('career-goal-button'),mission:el('career-mission-button')};
  let openKind=null,lastView=null,disposed=false,returnFocus=null,activeReceipt=null;
  const pendingReceipts=[];
  let background=[];
  const listeners=[];
  const listen=(node,type,callback)=>{node.addEventListener(type,callback);listeners.push([node,type,callback]);};
  const text=(id,value)=>{const node=el(id);if(node.textContent!==value)node.textContent=value;};
  const contains=(parent,node)=>{if(parent.contains)return parent.contains(node);for(let current=node;current;current=current.parentNode||current.parent)if(current===parent)return true;return false;};
  const eligible=view=>!!(view?.playing&&!view.driving&&view.inGarage&&!view.menuOpen&&!doc.hidden&&view.gameplay?.state?.mode==='walking');
  const activeMenu=()=>openKind==='receipt'?receiptMenu:menu;
  const closeButton=()=>el(openKind==='receipt'?'delivery-receipt-close':'career-close');
  const renderOpen=()=>{
    menu.hidden=root.hidden=openKind!=='mission';
    receiptMenu.hidden=receipt.hidden=openKind!=='receipt';
    for(const kind of ['goal','mission']){
      el('career-'+kind+'-section').hidden=openKind!==kind;
      buttons[kind].setAttribute('aria-expanded',String(openKind===kind));
    }
    doc.body.classList.toggle('career-menu-open',!!openKind);
    doc.body.classList.toggle('delivery-receipt-open',openKind==='receipt');
    if(openKind==='mission')text('career-title','Задания');
  };
  const releaseBackground=()=>{for(const [node,inert]of background)node.inert=inert;background=[];};
  const setModal=(kind,{restoreFocus=true}={})=>{
    const wasOpen=!!openKind,focusTarget=returnFocus;
    releaseBackground();openKind=kind;
    if(kind&&!wasOpen)returnFocus=buttons.mission;
    if(!kind)returnFocus=null;
    renderOpen();
    if(kind){
      background=Array.from(doc.body.children||[]).filter(node=>node!==activeMenu()).map(node=>[node,node.inert]);
      for(const [node]of background)node.inert=true;
    }

    if(wasOpen!==!!kind)onOpenChange(!!kind);
    if(kind&&openKind===kind)closeButton().focus?.();
    else if(!openKind&&restoreFocus&&eligible(lastView)&&focusTarget&&!focusTarget.hidden)focusTarget.focus?.();
  };
  const renderReceipt=breakdown=>{
    for(const key of rewardParts){
      const cash=boundedNumber(breakdown[key]),brains=boundedNumber(breakdown.brains?.[key]);
      text('receipt-'+key+'-cash',cash?'+'+careerNumber(cash):'—');
      text('receipt-'+key+'-brains',brains?'+'+careerNumber(brains):'—');
      el('receipt-'+key).setAttribute('aria-label',`${rewardLabels[key]}: ${careerNumber(cash)} игровых денег, ${careerNumber(brains)} мозгов`);
    }
    text('receipt-total-cash','+'+careerNumber(breakdown.totalCash));
    text('receipt-total-brains','+'+careerNumber(breakdown.brains?.total));
    receipt.setAttribute('aria-label',`Груз доставлен: ${careerNumber(breakdown.totalCash)} игровых денег и ${careerNumber(breakdown.brains?.total)} мозгов`);
    const unlock=el('receipt-vehicle-unlock');if(unlock){unlock.hidden=breakdown.unlockedVehicleId!=='bmwreward';unlock.textContent='Открыта золотая BMW! Она ждёт на постаменте в ангаре.';}
    receipt.scrollTop=0;
  };
  const openPendingReceipt=()=>{
    if(disposed||!eligible(lastView)||!pendingReceipts.length)return false;
    activeReceipt=pendingReceipts.shift();renderReceipt(activeReceipt);setModal('receipt');return true;
  };
  const close=({restoreFocus=true,showPending=true}={})=>{
    if(!openKind)return;
    activeReceipt=null;

    if(showPending&&openPendingReceipt())return;
    setModal(null,{restoreFocus});
  };
  const update=view=>{
    if(disposed)return;
    lastView=view;
    const {gameplay}=view,visible=eligible(view);
    buttons.goal.hidden=true;buttons.goal.disabled=true;
    buttons.mission.hidden=!visible;
    doc.body.classList.toggle('career-actions-visible',visible);
    if(!visible){
      if(openKind==='receipt'&&activeReceipt)pendingReceipts.unshift(activeReceipt);
      close({restoreFocus:false,showPending:false});return;
    }
    if(!openKind)openPendingReceipt();
    const goal=gameplay.getVehicleGoal?.()||null;
    const hasUnowned=VEHICLE_CONFIG.some(vehicle=>vehicle.price>0&&!gameplay.isOwned(vehicle.id));
    el('career-goal-content').hidden=!hasUnowned;
    el('career-goal-complete').hidden=hasUnowned;
    for(const vehicle of VEHICLE_CONFIG){
      const option=el('career-goal-option-'+vehicle.id);if(!option)continue;
      const unavailable=gameplay.isOwned(vehicle.id)||vehicle.price<=0;
      option.hidden=unavailable;option.disabled=unavailable;
      const label=vehicle.name+' · '+careerNumber(vehicle.price);if(option.textContent!==label)option.textContent=label;
    }
    select.disabled=!hasUnowned;
    el('career-goal-placeholder').hidden=!!goal;
    el('career-goal-amount').hidden=!goal;
    el('career-goal-progress').hidden=!goal;
    if(!goal){select.value='';text('career-goal-remaining','Выбери следующую машину');el('career-goal-content').dataset.ready='false';}
    if(goal){
      if(select.value!==goal.id)select.value=goal.id;
      text('career-goal-amount',careerNumber(goal.money)+' / '+careerNumber(goal.price));
      text('career-goal-remaining',goal.remaining>0?'Осталось '+careerNumber(goal.remaining):'Можно купить в ангаре');
      const progress=el('career-goal-progress');progress.max=Math.max(1,boundedNumber(goal.price));progress.value=Math.min(progress.max,boundedNumber(goal.money));
      progress.setAttribute('aria-label',`Накопления на ${goal.name}: ${careerNumber(goal.money)} из ${careerNumber(goal.price)}`);
      el('career-goal-content').dataset.ready=String(goal.remaining<=0);
    }
    const mission=gameplay.getCareerMission?.()||null;
    el('career-mission-details').hidden=!mission;el('career-mission-empty').hidden=!!mission;
    if(mission){
      text('career-mission-name',mission.name);
      text('career-mission-description',mission.description);
      const count=careerNumber(Math.min(mission.target,mission.progress))+' / '+careerNumber(mission.target);
      text('career-mission-count',count);
      buttons.mission.setAttribute('aria-label',`Задания: ${mission.name}. Прогресс ${count}`);
      text('career-mission-cash','+'+careerNumber(mission.cash));
      text('career-mission-brains','+'+careerNumber(mission.brains));
      el('career-mission-reward').setAttribute('aria-label',`Награда: ${careerNumber(mission.cash)} игровых денег и ${careerNumber(mission.brains)} мозгов`);
      const progress=el('career-mission-progress');progress.max=Math.max(1,boundedNumber(mission.target));progress.value=Math.min(progress.max,boundedNumber(mission.progress));
      progress.setAttribute('aria-label',`${mission.name}: ${count}`);
    }else buttons.mission.setAttribute('aria-label','Задания');
  };
  const open=kind=>{
    if(disposed||kind!=='mission'||!eligible(lastView)||openKind==='receipt')return;
    if(openKind===kind){close();return;}
    update(lastView);
    if(openKind==='receipt')return;
    setModal(kind);
  };
  const showDelivery=breakdown=>{
    if(disposed||!breakdown||!Number.isFinite(Number(breakdown.totalCash)))return;

    pendingReceipts.push({...breakdown,brains:{...breakdown.brains}});
    if(lastView)update(lastView);
  };
  const onKeyDown=event=>{
    if(!openKind)return;
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key==='Tab'){
      const controls=[closeButton(),...(openKind==='mission'&&!el('career-mission-details').hidden?[el('career-mission-skip')]:[])];
      const index=controls.indexOf(doc.activeElement),last=controls.length-1;
      if(index<0||(!event.shiftKey&&index===last)||(event.shiftKey&&index===0)){
        event.preventDefault();controls[event.shiftKey?last:0].focus?.();
      }
    }
  };
  for(const [kind,button]of Object.entries(buttons))listen(button,'click',()=>open(kind));
  listen(el('career-close'),'click',()=>{if(openKind==='mission')close();});
  listen(el('delivery-receipt-close'),'click',()=>{if(openKind==='receipt')close();});
  for(const overlay of [menu,receiptMenu])listen(overlay,'click',event=>{if(openKind&&overlay===activeMenu()&&event.target===overlay)close();});
  listen(select,'change',()=>{
    if(openKind!=='goal'||!eligible(lastView)||select.disabled)return;
    const option=el('career-goal-option-'+select.value);
    if(!option||option.disabled)return;
    onSelectGoal(select.value);
    if(lastView)update(lastView);
  });
  listen(el('career-mission-skip'),'click',()=>{if(openKind!=='mission'||!eligible(lastView)||el('career-mission-details').hidden)return;onSkipMission();if(lastView)update(lastView);});
  for(const node of [menu,receiptMenu,receipt,doc])listen(node,'keydown',onKeyDown);
  listen(doc,'focusin',event=>{if(openKind&&!contains(activeMenu(),event.target))closeButton().focus?.();});
  listen(doc,'visibilitychange',()=>{if(lastView)update(lastView);});
  for(const node of [menu,receiptMenu,receipt,...Object.values(buttons)]){
    for(const type of ['keyup','click','pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','wheel'])listen(node,type,event=>event.stopPropagation());
    if(node===buttons.goal||node===buttons.mission)listen(node,'keydown',event=>event.stopPropagation());
  }
  renderOpen();for(const button of Object.values(buttons))button.hidden=true;
  return {update,showDelivery,isOpen:()=>!!openKind,close,dispose(){if(disposed)return;disposed=true;pendingReceipts.length=0;activeReceipt=null;close({restoreFocus:false,showPending:false});for(const [node,type,callback]of listeners)node.removeEventListener(type,callback);menu.hidden=root.hidden=receiptMenu.hidden=receipt.hidden=true;for(const button of Object.values(buttons))button.hidden=true;doc.body.classList.remove('career-actions-visible','career-menu-open','delivery-receipt-open');}};
}
