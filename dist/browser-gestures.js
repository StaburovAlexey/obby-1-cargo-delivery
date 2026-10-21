// Block browser gestures without cancelling touch/pointer events used by the
// steering wheel, pedals, camera, carousels and scrollable menus.
export function installBrowserGestureGuard(doc=globalThis.document){
 if(!doc?.addEventListener)return ()=>{};
 const types=['dblclick','gesturestart','gesturechange','gestureend','selectstart','dragstart','contextmenu'];
 const options={capture:true,passive:false};
 const prevent=event=>{
  const editable=event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  if(editable&&['selectstart','dragstart','contextmenu'].includes(event.type))return;
  if(event.cancelable)event.preventDefault();
 };
 for(const type of types)doc.addEventListener(type,prevent,options);
 return ()=>{for(const type of types)doc.removeEventListener(type,prevent,options);};
}
