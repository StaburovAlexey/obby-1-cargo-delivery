// Painted directly on the board's box faces: no floating label or camera scaling.
export function createCanyonSignTexture(THREE,{document:doc=globalThis.document}={}){
 const canvas=doc?.createElement('canvas'),context=canvas?.getContext?.('2d');
 if(!context)return null;
 canvas.width=768;canvas.height=256;
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 let previous='',disposed=false;
 return {texture,update({language='ru',unlocked=false,eligible=unlocked}={}){
  if(disposed)return;
  const key=(language==='en'?'en':'ru')+':'+unlocked+':'+eligible;if(key===previous)return;previous=key;
  const english=language==='en';
  context.fillStyle='#172d3a';context.fillRect(0,0,768,256);
  context.strokeStyle='#f6d16f';context.lineWidth=8;context.strokeRect(12,12,744,232);
  context.textAlign='center';context.textBaseline='middle';
  context.fillStyle='#fff4cf';context.font='900 62px Arial, sans-serif';
  context.fillText(english?'Canyon Drift':'Каньон · дрифт',384,94,700);
  context.fillStyle='#f5d7a2';context.font='700 36px Arial, sans-serif';
  context.fillText(unlocked?(english?'Enter in your BMW':'Въезжайте на BMW'):eligible?(english?'BMW only':'Только на BMW'):(english?'Complete the main route':'Пройдите основной маршрут'),384,177,700);
  texture.needsUpdate=true;
 },dispose(){if(disposed)return;disposed=true;texture.dispose();}};
}
