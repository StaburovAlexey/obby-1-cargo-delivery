// Shared element references for persistent HUD nodes. Compare live values before
// writing because modal/localization code can also update these elements.
const documents=new WeakMap();
export function createUiCache(doc){
  let cache=documents.get(doc);if(cache)return cache;
  const elements=new Map();
  cache={
    get(id){let node=elements.get(id);if(!node){node=doc.getElementById(id);if(node)elements.set(id,node);}return node;},
    property(node,key,value){if(node&&node[key]!==value)node[key]=value;},
    text(node,value){if(node&&node.textContent!==value)node.textContent=value;},
    hidden(node,value){if(node&&node.hidden!==value)node.hidden=value;},
    attribute(node,key,value){if(node&&node.getAttribute(key)!==value)node.setAttribute(key,value);},
    data(node,key,value){if(node&&node.dataset[key]!==value)node.dataset[key]=value;},
    style(node,key,value){if(node&&node.style.getPropertyValue(key)!==value)node.style.setProperty(key,value);},
    class(node,key,value){if(node&&node.classList.contains(key)!==value)node.classList.toggle(key,value);},
  };
  documents.set(doc,cache);return cache;
}
