/** Dedicated button/key edges. Camera owns only canvas pointers, never this UI. */
export function createJumpInput({button,onJump=()=>{}}={}){
 if(!button)throw Error('Jump button required');const doc=button.ownerDocument,win=doc.defaultView,remove=[];
 let enabled=true,held=false,destroyed=false;
 const listen=(el,t,fn,opt)=>{el.addEventListener(t,fn,opt);remove.push(()=>el.removeEventListener(t,fn,opt));};
 const editable=e=>e.target?.closest?.('input,textarea,select,[contenteditable]');
 const trigger=()=>{if(enabled&&!destroyed)onJump();};
 listen(button,'pointerdown',e=>{e.stopPropagation();e.preventDefault();if(e.button===0)trigger();});
 for(const type of ['pointermove','pointerup','pointercancel','dblclick'])listen(button,type,e=>e.stopPropagation());
 listen(button,'click',e=>{e.stopPropagation();if(e.detail===0)trigger();});
 listen(win,'keydown',e=>{if(e.code!=='Space'||!enabled||editable(e)||e.ctrlKey||e.metaKey||e.altKey)return;e.preventDefault();e.stopImmediatePropagation();if(!held&&!e.repeat){held=true;trigger();}},true);
 listen(win,'keyup',e=>{if(e.code==='Space')held=false;},true);
 const reset=()=>{held=false;};
 for(const t of ['blur','pagehide','resize'])listen(win,t,reset);
 listen(doc,'visibilitychange',()=>{if(doc.hidden)reset();});
 return {reset,setEnabled(value){enabled=!!value;if(!enabled)reset();},destroy(){if(destroyed)return;destroyed=true;reset();remove.splice(0).forEach(fn=>fn());}};
}
