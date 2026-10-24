// Asynchronous WebGL2 timer queries. Never wait, flush or read pixels. Unsupported
// contexts stay explicit; CPU render submission is never substituted for GPU time.
export function createGpuTimer(gl,{enabled=false,sampleEvery=4,maxPending=4}={}){
  let lost=!!gl?.isContextLost?.();
  let ext=enabled&&!lost?gl?.getExtension?.('EXT_disjoint_timer_query_webgl2'):null;
  const pending=[],recent=[];let active=null,frame=0,samples=0,total=0,lastMs=null,disposed=false;
  const canvas=gl?.canvas;
  function clearSamples(){recent.length=0;frame=samples=total=0;lastMs=null;}
  function contextLost(){
    // WebGL has already invalidated these handles. Even deleting or ending one
    // after restoration would use an object from the previous context generation.
    lost=true;ext=null;active=null;pending.length=0;clearSamples();
  }
  function contextRestored(){
    if(disposed)return;
    contextLost();lost=!!gl.isContextLost?.();
    if(enabled&&!lost)ext=gl.getExtension?.('EXT_disjoint_timer_query_webgl2');
  }
  const available=()=>{
    // A driver can report loss before dispatching its canvas event.
    if(!lost&&gl?.isContextLost?.())contextLost();
    return !!ext&&!disposed&&!lost;
  };
  if(enabled){canvas?.addEventListener?.('webglcontextlost',contextLost);canvas?.addEventListener?.('webglcontextrestored',contextRestored);}
  function discard(){
    if(available()){
      if(active){gl.endQuery(ext.TIME_ELAPSED_EXT);gl.deleteQuery(active);}
      for(const query of pending)gl.deleteQuery(query);
    }
    active=null;pending.length=0;
  }
  function poll(){
    if(!available()||!pending.length)return;
    if(gl.getParameter(ext.GPU_DISJOINT_EXT)){discard();return;}
    while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){
      const query=pending.shift(),ms=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;
      gl.deleteQuery(query);
      if(Number.isFinite(ms)&&ms>=0){lastMs=ms;samples++;total+=ms;recent.push(ms);if(recent.length>120)recent.shift();}
    }
  }
  return {
    begin(){
      poll();frame++;
      if(!available()||active||frame%Math.max(1,sampleEvery)||pending.length>=Math.max(1,maxPending))return false;
      // Another instrumentation layer may already own the query target.
      if(gl.getQuery?.(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))return false;
      const query=gl.createQuery();if(!query)return false;
      active=query;gl.beginQuery(ext.TIME_ELAPSED_EXT,query);return true;
    },
    end(){if(!active||!available())return;gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(active);active=null;},
    poll,
    get lastMs(){return lastMs;},
    report(){
      const supported=available();
      const sorted=recent.slice().sort((a,b)=>a-b);
      return {available:supported,samples,lastMs,meanMs:samples?total/samples:null,
        p95Ms:sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:null,pending:pending.length};
    },
    reset(){discard();clearSamples();},
    dispose(){
      if(disposed)return;discard();disposed=true;recent.length=0;
      if(enabled){canvas?.removeEventListener?.('webglcontextlost',contextLost);canvas?.removeEventListener?.('webglcontextrestored',contextRestored);}
    },
  };
}
