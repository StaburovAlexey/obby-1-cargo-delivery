

export function projectLabelPixel(ndc,canvasRect,layerRect={left:0,top:0}){
 return {x:canvasRect.left+(ndc.x*.5+.5)*canvasRect.width-layerRect.left,
  y:canvasRect.top+(-ndc.y*.5+.5)*canvasRect.height-layerRect.top};
}
export function usableViewportRect(element,fallback){
 const r=element?.getBoundingClientRect?.();
 return r&&[r.left,r.top,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0?r:fallback;
}

// DOM rectangles can require synchronous layout. Reuse them for camera-only
// frames; viewport/layer geometry is refreshed when layout can actually change.
export function createViewportRectCache({viewport,canvas,layer,window:win,document:doc,fallback}){
 let value=null,dirty=true;
 const invalidate=()=>{dirty=true;};
 const listeners=[];
 const listen=(target,type,options)=>{target?.addEventListener?.(type,invalidate,options);listeners.push([target,type,options]);};
 listen(win,'resize');listen(win,'scroll',true);listen(win.visualViewport,'resize');listen(win.visualViewport,'scroll');
 listen(doc,'fullscreenchange');listen(doc,'transitionend',true);
 const Observer=win.ResizeObserver;
 const observer=Observer?new Observer(invalidate):null;
 for(const element of [viewport,canvas,layer])if(element)observer?.observe(element);
 return {
  invalidate,
  read(){
   if(!dirty)return value;
   const base=fallback(),rect=usableViewportRect(viewport,base);
   value={viewport:rect,canvas:usableViewportRect(canvas,rect),layer:usableViewportRect(layer,base)};
   dirty=false;return value;
  },
  dispose(){observer?.disconnect();for(const [target,type,options]of listeners)target?.removeEventListener?.(type,invalidate,options);},
 };
}
