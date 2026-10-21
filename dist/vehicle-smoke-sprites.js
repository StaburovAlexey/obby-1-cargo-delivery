// A small, deterministic RGBA atlas: no font, canvas, DOM, or image requests.
export const SMOKE_SPRITE_INDEX=Object.freeze({flowers:0,hearts:1,skulls:2,coins:3,smileys:4});
const TILE_SIZE=64,TILE_COUNT=5;
const ink=[48,38,52],goldRim=[181,103,20],gold=[247,182,35],yellow=[255,219,71];
const circle=(x,y,cx,cy,r)=>(x-cx)**2+(y-cy)**2<r*r;
function inStar(x,y,radius){
 let inside=false;
 for(let i=0,j=9;i<10;j=i++){
  const ai=Math.PI/2+i*Math.PI/5,aj=Math.PI/2+j*Math.PI/5;
  const ri=i%2?radius*.45:radius,rj=j%2?radius*.45:radius;
  const xi=Math.cos(ai)*ri,yi=Math.sin(ai)*ri,xj=Math.cos(aj)*rj,yj=Math.sin(aj)*rj;
  if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}
function flower(x,y){
 if(circle(x,y,0,0,.19))return [255,227,92];
 if(circle(x,y,0,0,.25))return [228,160,51];
 let petal=-1,border=false;
 for(let i=0;i<6;i++){
  const angle=i*Math.PI/3,cx=Math.cos(angle)*.44,cy=Math.sin(angle)*.44;
  if(circle(x,y,cx,cy,.30))border=true;
  if(circle(x,y,cx,cy,.255))petal=i;
 }
 if(petal>=0)return petal%2?[194,157,246]:[249,137,201];
 return border?[139,76,151]:null;
}
function heartShape(x,y){
 return circle(x,y,-.28,.26,.33)||circle(x,y,.28,.26,.33)||
  (y<=.28&&y>=-.66&&Math.abs(x)<(.66+y)*.67);
}
function heart(x,y){
 if(!heartShape(x,y))return null;
 if(!heartShape(x*1.1,y*1.1))return [166,44,86];
 if(circle(x,y,-.29,.33,.095))return [255,196,218];
 return y>.02?[250,110,166]:[231,63,105];
}
function skullShape(x,y,shrink=0){
 return (x/(.58-shrink))**2+((y-.15)/(.57-shrink))**2<1||
  (Math.abs(x)<.36-shrink&&y>-.57+shrink&&y<-.15);
}
function skull(x,y){
 if(!skullShape(x,y))return null;
 if(!skullShape(x,y,.045))return [118,111,139];
 if(circle(x,y,-.22,.15,.14)||circle(x,y,.22,.15,.14))return ink;
 if(y<-.08&&y>-.23&&Math.abs(x)<(-.08-y)*.65)return ink;
 if(y<-.33&&y>-.48&&(Math.abs(x-.12)<.018||Math.abs(x+.12)<.018))return [91,81,101];
 if(y<-.29&&y>-.33&&Math.abs(x)<.24)return [91,81,101];
 return [248,245,255];
}
function coin(x,y){
 const radius=Math.hypot(x,y);
 if(radius>.70)return null;
 if(radius>.635)return goldRim;
 if(radius>.56)return [255,226,113];
 if(radius>.51)return [215,137,29];
 if(inStar(x,y,.38))return [255,241,161];
 if(inStar(x,y,.43))return [193,116,23];
 return gold;
}
function smiley(x,y){
 const radius=Math.hypot(x,y);
 if(radius>.69)return null;
 if(radius>.64)return goldRim;
 if(circle(x,y,-.23,.2,.087)||circle(x,y,.23,.2,.087))return ink;
 if(y<-.12&&Math.abs(Math.hypot(x,y-.02)-.35)<.055)return ink;
 if(((Math.abs(x)-.4)/.09)**2+((y+.08)/.055)**2<1)return [249,151,103];
 if(circle(x,y,-.31,.4,.07))return [255,243,178];
 return yellow;
}
const motifs=[flower,heart,skull,coin,smiley];
export function createSmokeSpriteAtlas(THREE){
 const width=TILE_SIZE*TILE_COUNT,pixels=new Uint8Array(width*TILE_SIZE*4);
 for(let tile=0;tile<TILE_COUNT;tile++)for(let y=0;y<TILE_SIZE;y++)for(let x=0;x<TILE_SIZE;x++){
  let red=0,green=0,blue=0,samples=0;
  // Four coverage samples keep the silhouettes soft without blurry facial details.
  for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){
   const color=motifs[tile]((x+(sx+.5)/2)/TILE_SIZE*2-1,(y+(sy+.5)/2)/TILE_SIZE*2-1);
   if(color){red+=color[0];green+=color[1];blue+=color[2];samples++;}
  }
  if(samples){const i=(y*width+tile*TILE_SIZE+x)*4;pixels[i]=Math.round(red/samples);pixels[i+1]=Math.round(green/samples);pixels[i+2]=Math.round(blue/samples);pixels[i+3]=samples/4*255;}
 }
 const texture=new THREE.DataTexture(pixels,width,TILE_SIZE);
 texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 return texture;
}
