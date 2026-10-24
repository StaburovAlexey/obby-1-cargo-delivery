// Frame-budget policy only. It never changes simulation cadence or game rules.
const LEVELS=Object.freeze([
  Object.freeze({level:'high',maxDPR:2,shadowSize:2048,weatherScale:1,hazeScale:1,displayShadowDistance:80,materialDistance:55}),
  Object.freeze({level:'balanced',maxDPR:1.25,shadowSize:1024,weatherScale:.65,hazeScale:.72,displayShadowDistance:32,materialDistance:34}),
  Object.freeze({level:'low',maxDPR:1,shadowSize:1024,weatherScale:.4,hazeScale:.55,displayShadowDistance:22,materialDistance:25}),
  Object.freeze({level:'minimal',maxDPR:.75,shadowSize:512,weatherScale:.25,hazeScale:.4,displayShadowDistance:14,materialDistance:18}),
]);
export function isMobileRenderer({userAgent='',userAgentData,maxTouchPoints=0,coarsePointer=false}={}){
  return userAgentData?.mobile===true||/Android|iPhone|iPad|iPod/i.test(userAgent)||
    (maxTouchPoints>0&&(coarsePointer||/Macintosh/.test(userAgent)));
}
export function createRenderQuality({mobile=false,devicePixelRatio=1,mode='auto'}={}){
  const forced=LEVELS.findIndex(level=>level.level===mode),adaptive=forced<0;
  const nativeDPR=Number.isFinite(devicePixelRatio)&&devicePixelRatio>0?devicePixelRatio:1;
  let index=adaptive?(mobile?1:0):forced,average=null,slow=0,fast=0,lastTime=null,lastChange=null,changes=0;
  const profile=()=>({...LEVELS[index],pixelRatio:Math.min(nativeDPR,LEVELS[index].maxDPR),adaptive,mobile});
  return {
    get profile(){return profile();},
    get stats(){return {level:LEVELS[index].level,changes,frameMeanMs:average};},
    observe({now,frameMs,workMs,gpuMs,active=true}={}){
      if(!adaptive)return null;
      if(!active||!Number.isFinite(now)||!Number.isFinite(frameMs)||frameMs<=0||frameMs>250||
        (lastTime!==null&&now<lastTime)){
        average=null;slow=fast=0;lastTime=Number.isFinite(now)?now:null;return null;
      }
      if(lastChange===null)lastChange=now;
      lastTime=now;average=average===null?frameMs:average+(frameMs-average)*.08;
      const validGPU=Number.isFinite(gpuMs)&&gpuMs>=0;
      const overloaded=average>18.5||(validGPU&&gpuMs>15.5);
      const headroom=average<17.2&&(validGPU?gpuMs<10.5:Number.isFinite(workMs)&&workMs<9);
      slow=overloaded?slow+Math.min(frameMs,100):0;
      fast=!overloaded&&headroom?fast+Math.min(frameMs,100):0;
      const canChange=now-lastChange>=3000;
      let next=index;
      if(canChange&&slow>=1200&&index<LEVELS.length-1)next++;
      else if(canChange&&fast>=10000&&index>0)next--;
      if(next===index)return null;
      index=next;lastChange=now;slow=fast=0;changes++;return profile();
    },
    reset(){average=null;slow=fast=0;lastTime=lastChange=null;},
  };
}
