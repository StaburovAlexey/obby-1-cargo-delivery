// Opt-in development diagnostics. A fixed histogram keeps long phone runs
// bounded; active stalls remain samples instead of being silently discarded.
export function createRenderProfiler({enabled=false,document:doc,baseline=false}={}){
 if(!enabled)return null;
 const histogram=new Uint32Array(20001);
 let samples=0,total=0,maximum=0,cpuTotal=0,previous=null,shown=-Infinity,disposed=false;
 let lastInfo=null,roomCount=1,loadedPeers=0,spatial=null,active=false;
 let panel,output;
 const clean=n=>Math.round(n*100)/100;
 const percentile=fraction=>{
  if(!samples)return 0;
  const target=Math.ceil(samples*fraction);let count=0;
  for(let i=0;i<histogram.length;i++){count+=histogram[i];if(count>=target)return i===histogram.length-1?clean(maximum):i/10;}
  return clean(maximum);
 };
 function report(){
  return{mode:baseline?'baseline':'optimized',samples,elapsedSeconds:clean(total/1000),fps:total?clean(samples*1000/total):0,
   frameMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:clean(maximum),resolution:.1},
   renderCpuMeanMs:samples?clean(cpuTotal/samples):0,roomCount,loadedPeers,
   render:{calls:lastInfo?.render?.calls??0,triangles:lastInfo?.render?.triangles??0},
   memory:{geometries:lastInfo?.memory?.geometries??0,textures:lastInfo?.memory?.textures??0},
   spatial:spatial?{...spatial}:null,userAgent:globalThis.navigator?.userAgent??''};
 }
 function reset(){histogram.fill(0);samples=total=maximum=cpuTotal=0;previous=null;shown=-Infinity;}
 function suspend(){previous=null;}
 if(doc){
  panel=doc.createElement('section');panel.id='render-performance';panel.setAttribute('aria-label','Render performance diagnostics');
  panel.style.cssText='position:fixed;z-index:130;right:6px;top:108px;padding:8px;background:#071b2eef;color:white;font:12px monospace;max-width:280px;border-radius:8px;white-space:pre-line';
  output=doc.createElement('output');output.id='render-performance-values';panel.append(output);
  for(const [label,action]of [['Сбросить',reset],['JSON',()=>{
   const url=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}));
   const anchor=doc.createElement('a');anchor.href=url;anchor.download='render-'+(baseline?'baseline':'optimized')+'.json';
   anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }]]){
   const button=doc.createElement('button');button.textContent=label;button.style.cssText='margin:6px 6px 0 0;padding:5px';
   button.addEventListener('click',event=>{event.stopPropagation();action();});panel.append(button);
  }
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','keydown','keyup','wheel'])panel.addEventListener(type,event=>event.stopPropagation());
  doc.body.append(panel);
 }
 function record({now,active:running=false,info,roomCount:players=1,loadedPeers:loaded=0,renderCpuMs=0,spatial:geometry}={}){
  if(disposed)return;
  active=running;lastInfo=info??lastInfo;roomCount=players;loadedPeers=loaded;spatial=geometry??null;
  if(!Number.isFinite(now)||!running){previous=null;}
  else{
   if(previous!==null&&now>previous){
    const delta=now-previous;histogram[Math.min(20000,Math.ceil(delta*10))]++;samples++;total+=delta;
    maximum=Math.max(maximum,delta);cpuTotal+=Number.isFinite(renderCpuMs)?renderCpuMs:0;
   }
   previous=now;
  }
  if(output&&(now-shown>=1000||now<shown)){
   const r=report();shown=now;
   output.textContent=r.mode+' · '+(active?'измерение':'пауза/загрузка')+'\nFPS '+r.fps+' · p95 '+r.frameMs.p95+' ms\nCalls '+r.render.calls+' · Triangles '+r.render.triangles+'\nИгроки '+roomCount+'/20 · Модели '+loadedPeers+'\nКадров '+samples;
  }
 }
 return{record,report,reset,suspend,dispose(){if(disposed)return;disposed=true;previous=null;panel?.remove?.();}};
}
