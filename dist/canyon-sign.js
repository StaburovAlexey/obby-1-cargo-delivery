// Painted directly on the board's box faces: no floating label or camera scaling.
export function createCanyonSignTexture(THREE,{document:doc=globalThis.document}={}){
 const canvas=doc?.createElement('canvas'),context=canvas?.getContext?.('2d');
 if(!context)return null;
 canvas.width=1024;canvas.height=256;
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 let previous='',disposed=false;
 return {texture,update({language='ru',unlocked=false}={}){
  if(disposed)return;
  const key=(language==='en'?'en':'ru')+':'+unlocked;if(key===previous)return;previous=key;
  const english=language==='en';
  context.fillStyle='#172d3a';context.fillRect(0,0,1024,256);
  context.strokeStyle='#f6d16f';context.lineWidth=8;context.strokeRect(12,12,1000,232);
  context.textAlign='center';context.textBaseline='middle';
  context.fillStyle='#fff4cf';context.font='900 70px Arial, sans-serif';
  context.fillText(english?'Canyon Drift':'Каньон · дрифт',512,94,940);
  context.fillStyle='#f5d7a2';context.font='700 43px Arial, sans-serif';
  context.fillText(unlocked?(english?'Enter in your BMW':'Въезжайте на BMW'):(english?'Complete the main route':'Пройдите основной маршрут'),512,177,940);
  texture.needsUpdate=true;
 },dispose(){if(disposed)return;disposed=true;texture.dispose();}};
}
