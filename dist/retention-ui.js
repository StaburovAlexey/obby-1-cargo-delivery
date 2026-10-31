import {createMissionList} from './mission-list-ui.js';
import { VEHICLE_CONFIG } from './economy-config.js';
import { vehicleUnlockHint } from './biome-progression.js';

const boundedNumber=value=>Math.max(0,Number.isFinite(Number(value))?Number(value):0);
export const careerNumber=value=>String(Math.floor(boundedNumber(value))).replace(/\B(?=(\d{3})+(?!\d))/g,'\u202f');
const rewardParts=['base','clean','hard','first'];
const rewardLabels={base:'Доставка',clean:'Без аварий',hard:'Сложный рейс',first:'Первый визит'};




export function createRetentionUi(doc,{onSelectGoal=()=>{},onClaimMission=()=>{},onOpenChange=()=>{},translate=value=>value}={}){
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
  const missionList=createMissionList(doc,{translate,onClaim:id=>{
    if(openKind!=='mission'||!eligible(lastView))return;
    onClaimMission(id);
    if(lastView)update(lastView);
    missionList.focusNext(el('career-close'));
  }});
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
    if(openKind==='mission')text('career-title',translate('Задания'));
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
      el('receipt-'+key).setAttribute('aria-label',`${rewardLabels[key]}: ${careerNumber(cash)} игровых денег, ${careerNumber(brains)} XP`);
    }
    text('receipt-total-cash','+'+careerNumber(breakdown.totalCash));
    text('receipt-total-brains','+'+careerNumber(breakdown.brains?.total));
    receipt.setAttribute('aria-label',`Груз доставлен: ${careerNumber(breakdown.totalCash)} игровых денег и ${careerNumber(breakdown.brains?.total)} XP`);
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
    const {gameplay}=view,visible=eligible(view),launcherVisible=eligible({...view,menuOpen:false});
    buttons.goal.hidden=true;buttons.goal.disabled=true;
    buttons.mission.hidden=!launcherVisible;
    const missions=gameplay.getCareerMissions?.()||[];
    const ready=missions.filter(mission=>mission.status==='ready').length;
    buttons.mission.classList.toggle('has-claimable-missions',ready>0);
    buttons.mission.setAttribute('aria-label',translate('Задания')+(ready?': '+translate('Доступные награды')+' '+ready:''));
    text('career-mission-summary',translate('Доступные награды')+': '+ready+' · '+translate('Получено')+': '+missions.filter(mission=>mission.status==='claimed').length+' / '+missions.length);
    doc.body.classList.toggle('career-actions-visible',launcherVisible);
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
      const availability=gameplay.getVehicleAvailability?.(goal.id),locked=availability?.purchasable===false;
      if(select.value!==goal.id)select.value=goal.id;
      text('career-goal-amount',careerNumber(goal.money)+' / '+careerNumber(goal.price));
      text('career-goal-remaining',locked?vehicleUnlockHint(availability):goal.remaining>0?'Осталось '+careerNumber(goal.remaining):'Можно купить в ангаре');
      const progress=el('career-goal-progress');progress.max=Math.max(1,boundedNumber(goal.price));progress.value=Math.min(progress.max,boundedNumber(goal.money));
      progress.setAttribute('aria-label',`Накопления на ${goal.name}: ${careerNumber(goal.money)} из ${careerNumber(goal.price)}`);
      el('career-goal-content').dataset.ready=String(!locked&&goal.remaining<=0);
    }
    el('career-mission-empty').hidden=missions.length>0;
    if(openKind==='mission')missionList.update(missions,{claimEnabled:!gameplay.state.developerMode});
  };
  const open=kind=>{
    if(disposed||kind!=='mission'||!eligible(lastView)||openKind==='receipt')return;
    if(openKind===kind){close();return;}
    update(lastView);
    if(openKind==='receipt')return;
    setModal(kind);
    el('career-mission-section').scrollTop=0;
    update(lastView);
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
      const controls=[closeButton(),...(openKind==='mission'?[el('career-mission-section'),...missionList.claimButtons()]:[])];
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
  for(const node of [menu,receiptMenu,receipt,doc])listen(node,'keydown',onKeyDown);
  listen(doc,'focusin',event=>{if(openKind&&!contains(activeMenu(),event.target))closeButton().focus?.();});
  listen(doc,'visibilitychange',()=>{if(lastView)update(lastView);});
  for(const node of [menu,receiptMenu,receipt,...Object.values(buttons)]){
    for(const type of ['keyup','click','pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','wheel'])listen(node,type,event=>event.stopPropagation());
    if(node===buttons.goal||node===buttons.mission)listen(node,'keydown',event=>event.stopPropagation());
  }
  renderOpen();for(const button of Object.values(buttons))button.hidden=true;
  return {update,showDelivery,isOpen:()=>!!openKind,close,dispose(){if(disposed)return;disposed=true;missionList.dispose();buttons.mission.classList.remove('has-claimable-missions');pendingReceipts.length=0;activeReceipt=null;close({restoreFocus:false,showPending:false});for(const [node,type,callback]of listeners)node.removeEventListener(type,callback);menu.hidden=root.hidden=receiptMenu.hidden=receipt.hidden=true;for(const button of Object.values(buttons))button.hidden=true;doc.body.classList.remove('career-actions-visible','career-menu-open','delivery-receipt-open');}};
}
