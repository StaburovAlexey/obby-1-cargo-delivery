// Project into the actual canvas rectangle, then into the common label layer.
// Mobile browser toolbars/embedded viewports can differ from window.innerHeight.
export function projectLabelPixel(ndc,canvasRect,layerRect={left:0,top:0}){
 return {x:canvasRect.left+(ndc.x*.5+.5)*canvasRect.width-layerRect.left,
  y:canvasRect.top+(-ndc.y*.5+.5)*canvasRect.height-layerRect.top};
}
export function usableViewportRect(element,fallback){
 const r=element?.getBoundingClientRect?.();
 return r&&[r.left,r.top,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0?r:fallback;
}
