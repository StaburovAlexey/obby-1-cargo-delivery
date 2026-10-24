// Opt-in development diagnostics. Fixed session histograms and a fixed recent
// frame ring keep long phone runs bounded; active stalls remain real samples.
const STAGES=['physics','logic','ui','network','culling','render','frame'];
const RECENT_CAPACITY=240,RECENT_MS=1000,GRAPH_BARS=120,UI_INTERVAL_MS=250;
export function createRenderProfiler({enabled=false,document:doc,baseline=false}={}){
 if(!enabled)return null;
 const histogram=new Uint32Array(20002),overflowIndex=20001;
 const stageTotals=new Float64Array(STAGES.length),stageCounts=new Uint32Array(STAGES.length);
 const recentFrames=new Float64Array(RECENT_CAPACITY),recentEnds=new Float64Array(RECENT_CAPACITY);
 const recentStages=new Float64Array(RECENT_CAPACITY*STAGES.length);
 const recentStageTotals=new Float64Array(STAGES.length),recentStageCounts=new Uint32Array(STAGES.length);
 let recentHead=0,recentCount=0,recentTotal=0;
 let samples=0,total=0,maximum=0,cpuTotal=0,previous=null,lastNow=0,shown=-Infinity,disposed=false;
 let physicsTotal=0,physicsCount=0,lastPhysicsSteps=0,pixelRatio=null;
 let lastInfo=null,roomCount=1,loadedPeers=0,spatial=null,active=false;
 let panel,output,details,graph,launcher,panelHidden=false;const bars=[];
 const clean=n=>Math.round(n*100)/100;
 const valid=n=>Number.isFinite(n)&&n>=0;
 const means=(totals,counts)=>Object.fromEntries(STAGES.map((stage,index)=>[stage,counts[index]?clean(totals[index]/counts[index]):0]));
 const percentile=fraction=>{
  if(!samples)return 0;
  const target=Math.ceil(samples*fraction);let count=0;
  for(let i=0;i<histogram.length;i++){count+=histogram[i];if(count>=target)return i===overflowIndex?'>2000':i/10;}
  return clean(maximum);
 };
 function clearCurrent(){recentHead=recentCount=recentTotal=0;recentStageTotals.fill(0);recentStageCounts.fill(0);}
 function dropOldest(){
  recentTotal-=recentFrames[recentHead];
  for(let stage=0;stage<STAGES.length;stage++){
   const value=recentStages[recentHead*STAGES.length+stage];
   if(valid(value)){recentStageTotals[stage]-=value;recentStageCounts[stage]--;}
  }
  recentHead=(recentHead+1)%RECENT_CAPACITY;recentCount--;
 }
 function addRecent(now,delta,timings){
  while(recentCount&&recentEnds[recentHead]<=now-RECENT_MS)dropOldest();
  if(recentCount===RECENT_CAPACITY)dropOldest();
  const index=(recentHead+recentCount)%RECENT_CAPACITY;
  recentFrames[index]=delta;recentEnds[index]=now;recentTotal+=delta;recentCount++;
  for(let stage=0;stage<STAGES.length;stage++){
   const value=timings?.[STAGES[stage]],measured=valid(value);
   recentStages[index*STAGES.length+stage]=measured?value:NaN;
   if(measured){stageTotals[stage]+=value;stageCounts[stage]++;recentStageTotals[stage]+=value;recentStageCounts[stage]++;}
  }
 }
 function report(){
  return{mode:baseline?'baseline':'optimized',samples,elapsedSeconds:clean(total/1000),fps:total?clean(samples*1000/total):0,
   frameMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:clean(maximum),resolution:.1,overflow:{aboveMs:2000,samples:histogram[overflowIndex]}},
   renderCpuMeanMs:samples?clean(cpuTotal/samples):0,roomCount,loadedPeers,
   render:{calls:lastInfo?.render?.calls??0,triangles:lastInfo?.render?.triangles??0},
   memory:{geometries:lastInfo?.memory?.geometries??0,textures:lastInfo?.memory?.textures??0},
   spatial:spatial?{...spatial}:null,userAgent:globalThis.navigator?.userAgent??'',
   current:{fps:recentTotal?clean(recentCount*1000/recentTotal):0,samples:recentCount,elapsedSeconds:clean(recentTotal/1000),
    frameMs:Array.from({length:recentCount},(_,index)=>clean(recentFrames[(recentHead+index)%RECENT_CAPACITY])),
    timingsMeanMs:means(recentStageTotals,recentStageCounts)},
   timingsMeanMs:means(stageTotals,stageCounts),physicsSteps:{last:lastPhysicsSteps,mean:physicsCount?clean(physicsTotal/physicsCount):0},
   pixelRatio,gpu:{available:false}};
 }
 function reset(){
  histogram.fill(0);stageTotals.fill(0);stageCounts.fill(0);clearCurrent();
  samples=total=maximum=cpuTotal=physicsTotal=physicsCount=lastPhysicsSteps=0;previous=null;draw(lastNow,true);
 }
 function suspend(){
  const changed=active||recentCount>0||!Number.isFinite(shown);
  previous=null;active=false;clearCurrent();if(changed)draw(lastNow,true);
 }
 function draw(now,force=false){
  if(disposed||panelHidden||!output||!Number.isFinite(now)||(!force&&now-shown<UI_INTERVAL_MS&&now>=shown))return;
  const r=report(),timing=r.current.timingsMeanMs;shown=now;
  output.textContent=r.mode+' · '+(active?'измерение':'пауза/загрузка')+'\nFPS '+r.current.fps+' · кадр '+(r.current.samples?clean(recentTotal/recentCount):0)+' ms\np95 '+r.frameMs.p95+' · p99 '+r.frameMs.p99+' ms\nCalls '+r.render.calls+' · Triangles '+r.render.triangles;
  details.textContent='CPU этапы, ms (последнее окно)\nPhysics '+timing.physics+' · Logic '+timing.logic+'\nUI '+timing.ui+' · Network '+timing.network+'\nCulling '+timing.culling+' · Render '+timing.render+'\nFrame '+timing.frame+' · Steps '+r.physicsSteps.last+'\nGeometries '+r.memory.geometries+' · Textures '+r.memory.textures+'\nDPR '+(r.pixelRatio??'—')+' · GPU: недоступно\nИгроки '+roomCount+'/20 · Модели '+loadedPeers+'\nКадров '+samples;
  const frames=r.current.frameMs,first=Math.max(0,frames.length-GRAPH_BARS);
  for(let index=0;index<bars.length;index++){
   const ms=frames[first+index],bar=bars[index];bar.hidden=ms===undefined;
   if(ms!==undefined){bar.style.height=Math.max(1,Math.min(32,ms/50*32))+'px';bar.style.background=ms>33.34?'#ff8f79':ms>16.7?'#ffdf82':'#83e6d0';}
  }
  graph.setAttribute('aria-label','Время последних '+Math.min(GRAPH_BARS,frames.length)+' кадров, ms; шкала до 50 ms');
 }
 if(doc){
  panel=doc.createElement('section');panel.id='render-performance';panel.setAttribute('aria-label','Render performance diagnostics');
  panel.style.cssText='position:fixed;z-index:130;right:6px;top:108px;padding:8px;background:#071b2eef;color:white;font:11px/1.35 monospace;max-width:calc(100vw - 28px);width:250px;border-radius:8px;white-space:pre-line;touch-action:none';
  launcher=doc.createElement('button');launcher.id='render-performance-show';launcher.textContent='FPS';
  launcher.style.cssText='position:fixed;z-index:130;right:6px;top:108px;padding:7px;border:1px solid #7593a4;border-radius:8px;background:#071b2eef;color:white;font:11px monospace;touch-action:manipulation';
  launcher.setAttribute('aria-label','Показать блок FPS');launcher.setAttribute('aria-controls',panel.id);
  const hide=doc.createElement('button');hide.id='render-performance-hide';hide.textContent='×';
  hide.setAttribute('aria-label','Скрыть блок FPS');hide.style.cssText='position:absolute;right:4px;top:3px;width:28px;height:28px;padding:0;border:0;border-radius:5px;background:#244258;color:white;font:22px sans-serif';panel.append(hide);
  const setPanelHidden=(value,persist=true)=>{
   panelHidden=value;panel.hidden=value;panel.style.display=value?'none':'block';launcher.hidden=!value;launcher.style.display=value?'block':'none';
   launcher.setAttribute('aria-expanded',String(!value));
   if(persist)try{doc.defaultView.localStorage.setItem('render-performance-hidden',value?'1':'0');}catch{}
   if(!value)draw(lastNow,true);
  };
  hide.addEventListener('click',event=>{event.stopPropagation();setPanelHidden(true);launcher.focus?.();});
  launcher.addEventListener('click',event=>{event.stopPropagation();setPanelHidden(false);hide.focus?.();});
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','keydown','keyup','wheel'])launcher.addEventListener(type,event=>event.stopPropagation());
  output=doc.createElement('output');output.id='render-performance-values';output.style.cssText='display:block;padding-right:28px';panel.append(output);
  graph=doc.createElement('div');graph.id='render-performance-graph';graph.setAttribute('role','img');
  graph.style.cssText='display:flex;align-items:flex-end;gap:1px;height:34px;overflow:hidden;margin-top:5px;border-bottom:1px solid #7593a4';
  for(let index=0;index<GRAPH_BARS;index++){
   const bar=doc.createElement('span');bar.hidden=true;bar.style.cssText='flex:1;min-width:1px;background:#83e6d0';bars.push(bar);graph.append(bar);
  }
  panel.append(graph);
  details=doc.createElement('output');details.id='render-performance-details';details.hidden=true;details.style.display='none';panel.append(details);
  const toggle=doc.createElement('button');toggle.id='render-performance-toggle';toggle.textContent='Подробнее';
  toggle.style.cssText='margin:6px 6px 0 0;padding:5px';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',details.id);
  toggle.addEventListener('click',event=>{event.stopPropagation();details.hidden=!details.hidden;details.style.display=details.hidden?'none':'block';toggle.setAttribute('aria-expanded',String(!details.hidden));toggle.textContent=details.hidden?'Подробнее':'Свернуть';});panel.append(toggle);
  for(const [label,action]of [['Сбросить',reset],['JSON',()=>{
   const url=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}));
   const anchor=doc.createElement('a');anchor.href=url;anchor.download='render-'+(baseline?'baseline':'optimized')+'.json';
   anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }]]){
   const button=doc.createElement('button');button.textContent=label;button.style.cssText='margin:6px 6px 0 0;padding:5px';
   button.addEventListener('click',event=>{event.stopPropagation();action();});panel.append(button);
  }
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','keydown','keyup','wheel'])panel.addEventListener(type,event=>event.stopPropagation());
  doc.body.append(panel);doc.body.append(launcher);
  let savedHidden=false;try{savedHidden=doc.defaultView.localStorage.getItem('render-performance-hidden')==='1';}catch{}
  setPanelHidden(savedHidden,false);
 }
 function record({now,active:running=false,info,roomCount:players=1,loadedPeers:loaded=0,renderCpuMs=0,spatial:geometry,timings,physicsSteps,pixelRatio:ratio,dpr}={}){
  if(disposed)return;
  const wasActive=active;active=running;if(Number.isFinite(now))lastNow=now;
  lastInfo=info??lastInfo;roomCount=players;loadedPeers=loaded;spatial=geometry??null;
  const nextRatio=ratio??dpr;if(Number.isFinite(nextRatio)&&nextRatio>0)pixelRatio=nextRatio;
  if(!Number.isFinite(now)||!running){previous=null;clearCurrent();}
  else{
   if(previous!==null&&now>previous){
    const delta=now-previous;histogram[delta>2000?overflowIndex:Math.ceil(delta*10)]++;samples++;total+=delta;
    maximum=Math.max(maximum,delta);cpuTotal+=valid(renderCpuMs)?renderCpuMs:0;addRecent(now,delta,timings);
    if(Number.isInteger(physicsSteps)&&physicsSteps>=0){lastPhysicsSteps=physicsSteps;physicsTotal+=physicsSteps;physicsCount++;}
   }else if(previous!==null&&now<previous){clearCurrent();}
   previous=now;
  }
  draw(now,wasActive!==active);
 }
 return{record,report,reset,suspend,dispose(){if(disposed)return;disposed=true;previous=null;clearCurrent();panel?.remove?.();launcher?.remove?.();}};
}
