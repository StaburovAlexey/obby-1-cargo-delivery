// Only requested assets enter the queue. Callers own successfully attached values;
// cancelling a world releases queued work and disposes late arrivals instead.
export function createProgressiveAssets({items,load,prepare,onLoad=()=>{},onError=console.warn,concurrency=1}={}){
  const records=new Map(items.map(item=>[item.id,{item,state:'idle',value:null,error:null,promise:null}]));
  const queue=[];
  const limit=Math.max(1,Math.floor(Number(concurrency)||1));
  let disposed=false,active=0;
  const release=value=>{try{value?.dispose?.();}catch(error){console.error('Late asset disposal failed',error);}};
  function pump(){
    while(!disposed&&active<limit&&queue.length){
      const record=queue.shift();
      active++;record.state='loading';
      void (async()=>{
        let value;
        try{
          value=await load(record.item);
          if(disposed){release(value);record.resolve(null);return;}
          const prepared=prepare?await prepare(value,record.item):true;
          if(disposed||prepared===false){release(value);record.state='cancelled';record.resolve(null);return;}
          onLoad(value,record.item);
          record.value=value;record.state='loaded';record.error=null;record.resolve(value);
        }catch(error){
          release(value);
          if(disposed){record.resolve(null);return;}
          record.error=error;record.state='failed';
          try{onError(error,record.item);}catch(reportError){console.error('Asset error reporting failed',reportError);}
          record.reject(error);
        }finally{
          record.promise=null;record.resolve=record.reject=null;active--;pump();
        }
      })();
    }
  }
  function ensure(id,{retry=false,priority=false}={}){
    const record=records.get(id);
    if(disposed)return Promise.resolve(null);
    if(!record)return Promise.reject(new Error(`Unknown asset: ${id}`));
    if(record.state==='loaded')return Promise.resolve(record.value);
    if(record.promise){
      if(priority&&record.state==='queued'){
        const index=queue.indexOf(record);if(index>=0){queue.splice(index,1);queue.unshift(record);}
      }
      return record.promise;
    }
    if(record.state==='failed'&&!retry)return Promise.reject(record.error);
    record.state='queued';
    record.promise=new Promise((resolve,reject)=>{record.resolve=resolve;record.reject=reject;});
    if(priority)queue.unshift(record);else queue.push(record);
    const promise=record.promise;pump();return promise;
  }
  return {
    ensure,
    request(ids){for(const id of ids)void ensure(id).catch(()=>{});},
    status(id){return records.get(id)?.state;},
    get disposed(){return disposed;},
    get loaded(){return [...records.values()].filter(record=>record.state==='loaded').length;},
    get failed(){return [...records.values()].filter(record=>record.state==='failed').length;},
    dispose(){
      if(disposed)return;disposed=true;
      for(const record of queue.splice(0)){
        record.state='cancelled';record.resolve(null);record.promise=null;record.resolve=record.reject=null;
      }
    },
  };
}
