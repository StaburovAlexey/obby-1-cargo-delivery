// Modal shell only: closing the player does not pause its background audio.
export function createMusicMenu(doc,{canOpen=()=>true,onOpenChange=()=>{}}={}){
 const el=id=>doc.getElementById(id),menu=el('music-menu'),panel=el('music-panel'),button=el('music-button'),closeButton=el('music-close');
 let opened=false,disposed=false,background=[];const listeners=[];
 const listen=(node,type,fn)=>{node.addEventListener(type,fn);listeners.push([node,type,fn]);};
 const render=()=>{menu.hidden=!opened;button.setAttribute('aria-expanded',String(opened));};
 function close({restoreFocus=true}={}){
  if(!opened)return;opened=false;
  for(const [node,inert]of background)node.inert=inert;background=[];
  render();onOpenChange(false);if(restoreFocus&&!opened)button.focus?.();
 }
 function open(){
  if(disposed||opened||!canOpen())return false;
  opened=true;render();onOpenChange(true);if(!opened||disposed)return false;
  background=Array.from(doc.body.children).filter(node=>node!==menu).map(node=>[node,node.inert]);
  for(const [node]of background)node.inert=true;
  el('settings-music-toggle').focus?.();return true;
 }
 const controls=()=>[closeButton,el('settings-music-previous'),el('settings-music-toggle'),el('settings-music-next')].filter(node=>!node.hidden&&!node.disabled);
 listen(button,'click',e=>{e.stopPropagation();if(opened)close();else open();});
 listen(closeButton,'click',()=>close());
 listen(menu,'click',e=>{if(e.target===menu)close();});
 for(const type of ['pointerdown','pointerup','pointermove','click','wheel','touchstart','touchmove','touchend'])listen(menu,type,e=>{if(opened)e.stopPropagation();});
 listen(doc,'keydown',e=>{
  if(!opened)return;e.stopPropagation();
  if(e.key==='Escape'){e.preventDefault();close();}
  else if(e.key==='Tab'){
   const nodes=controls(),first=nodes[0],last=nodes.at(-1),current=doc.activeElement;
   if(!nodes.includes(current)||(!e.shiftKey&&current===last)||(e.shiftKey&&current===first)){
    e.preventDefault();(e.shiftKey?last:first).focus?.();
   }
  }
 });
 listen(doc,'keyup',e=>{if(opened)e.stopPropagation();});
 render();
 return {open,close,isOpen:()=>opened,setLanguage(language){const en=language==='en';button.setAttribute('aria-label',en?'Music':'Музыка');button.title=en?'Music':'Музыка';closeButton.setAttribute('aria-label',en?'Close music player':'Закрыть плеер');},dispose(){if(disposed)return;close({restoreFocus:false});disposed=true;for(const [node,type,fn]of listeners)node.removeEventListener(type,fn);}};
}
