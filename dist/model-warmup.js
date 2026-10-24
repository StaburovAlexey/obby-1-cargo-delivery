// Prepare detached models before their owner makes them visible. Texture uploads
// share one per-frame budget across every model queued through this renderer.
export function createModelWarmup({renderer,scene,camera,schedule=requestAnimationFrame}) {
  const uploaded=new WeakSet(),prepared=new WeakMap(),pending=new Set(),queue=[];
  let scheduled=false,disposed=false;

  function texturesFor(object) {
    const textures=new Set(),visited=new WeakSet();
    function collect(value) {
      if(!value||typeof value!=='object'||visited.has(value))return;
      visited.add(value);
      if(value.isTexture){textures.add(value);return;}
      if(Array.isArray(value)){for(const item of value)collect(item);return;}
      const prototype=Object.getPrototypeOf(value);
      if(prototype===Object.prototype||prototype===null)for(const item of Object.values(value))collect(item);
    }
    object.traverse(node=>{
      if(!node.material)return;
      const materials=Array.isArray(node.material)?node.material:[node.material];
      for(const material of materials)if(material)for(const value of Object.values(material))collect(value);
    });
    return [...textures];
  }

  function settle(entry,value,error) {
    if(!pending.delete(entry))return;
    if(error)entry.reject(error);else entry.resolve(value);
  }
  function requestFrame() {
    if(disposed||scheduled||!queue.length)return;
    scheduled=true;
    try{schedule(advance);}catch(error){scheduled=false;for(const entry of queue.splice(0))settle(entry,false,error);}
  }
  function advance() {
    scheduled=false;
    if(disposed)return;
    let budget=2;
    while(queue.length) {
      const entry=queue[0];
      try {
        while(entry.cursor<entry.textures.length) {
          const texture=entry.textures[entry.cursor];
          if(uploaded.has(texture)){entry.cursor++;continue;}
          if(!budget){requestFrame();return;}
          renderer.initTexture(texture);uploaded.add(texture);entry.cursor++;budget--;
        }
        queue.shift();
        // targetScene supplies the current lighting/environment without attaching
        // the model or changing its owner's visibility/lifecycle decisions.
        Promise.resolve(renderer.compileAsync(entry.object,camera,scene)).then(
          ()=>settle(entry,!disposed),error=>settle(entry,false,error),
        );
      }catch(error){
        if(queue[0]===entry)queue.shift();
        settle(entry,false,error);
      }
    }
  }
  function prepare(object) {
    if(disposed)return Promise.resolve(false);
    if(prepared.has(object))return prepared.get(object);
    let resolve,reject;
    const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    prepared.set(object,promise);
    try {
      const entry={object,textures:texturesFor(object),cursor:0,resolve,reject};
      pending.add(entry);queue.push(entry);requestFrame();
    }catch(error){reject(error);}
    return promise;
  }
  function dispose() {
    if(disposed)return;
    disposed=true;queue.length=0;
    // compileAsync itself cannot be cancelled, but owners must not wait for it
    // after teardown and late completion must never attach a cancelled model.
    for(const entry of pending)settle(entry,false);
  }
  return {prepare,dispose};
}
