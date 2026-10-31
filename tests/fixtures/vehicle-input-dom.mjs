


class Target {
 constructor(){this.listeners=new Map();this.parent=null;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 dispatch(type,values={}){const event={type,target:this,cancelable:true,defaultPrevented:false,stopped:false,preventDefault(){if(this.cancelable)this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;this.immediateStopped=true;},...values};let node=this;while(node){event.currentTarget=node;for(const fn of[...(node.listeners.get(type)||[])]){fn(event);if(event.immediateStopped)break;}if(event.stopped)break;node=node.parent;}return event;}
}
class Element extends Target {
 constructor(classes=[],dataset={}){super();this.children=[];this.dataset=dataset;this.attributes={};this.hidden=false;this.clientWidth=100;this.bounds={left:10,top:20,width:100,height:100};this.captures=new Set();this.captureReleases=[];this.computedTransform=undefined;const styles=new Map(),set=new Set(classes);this.style={setProperty:(key,value)=>styles.set(key,value),getPropertyValue:key=>styles.get(key)||''};this.classList={add:(...values)=>values.forEach(v=>set.add(v)),remove:(...values)=>values.forEach(v=>set.delete(v)),contains:value=>set.has(value),toggle:(value,force)=>{const wanted=force??!set.has(value);if(wanted)set.add(value);else set.delete(value);return wanted;}};}
 append(element){this.children.push(element);element.parent=this;element.ownerDocument=this.ownerDocument;return element;}
 appendChild(element){return this.append(element);}
 remove(){if(!this.parent)return;const index=this.parent.children.indexOf(this);if(index!==-1)this.parent.children.splice(index,1);this.parent=null;}
 all(){return this.children.flatMap(child=>[child,...child.all()]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){return this.all().filter(element=>selector.startsWith('.')?element.classList.contains(selector.slice(1)):selector==='[data-gear]'?'gear'in element.dataset:false);}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key]??null;}
 closest(selector){for(let node=this;node?.attributes;node=node.parent){if(selector==='[hidden]'?node.hidden:selector.split(',').some(part=>part.trim().toUpperCase()===node.tagName))return node;}return null;}
 getBoundingClientRect(){return this.bounds;}
 setPointerCapture(id){this.captures.add(id);}
 hasPointerCapture(id){return this.captures.has(id);}
 releasePointerCapture(id){this.captures.delete(id);this.captureReleases.push(id);}
}
export function createInputDom(){
 const win=new Target(),doc=new Target();doc.defaultView=win;doc.hidden=false;
 const root=new Element();root.ownerDocument=doc;
 const wheel=root.append(new Element(['steering-wheel'])),image=wheel.append(new Element(['steering-wheel-image'])),selector=root.append(new Element(['gear-control'])),handle=selector.append(new Element(['gear-handle']));
 const pedal=root.append(new Element(['gas-pedal']));
 const stick=root.append(new Element(['drive-stick'])),thumb=stick.append(new Element(['drive-thumb']));
 const d=selector.append(new Element(['gear-position'],{gear:'D'})),r=selector.append(new Element(['gear-position'],{gear:'R'}));
 win.getComputedStyle=element=>({transform:element.computedTransform??(element===wheel?`rotate(${wheel.style.getPropertyValue('--steering-angle')||'0deg'})`:'none')});
 win.DOMMatrixReadOnly=class{constructor(transform){const rotation=transform.match(/^rotate\(([-.\d]+)deg\)$/);if(rotation){const angle=Number(rotation[1])*Math.PI/180;this.a=Math.cos(angle);this.b=Math.sin(angle);}else{const m=transform.match(/^matrix\(([^)]+)\)$/);if(!m)throw Error(`Unsupported fixture transform ${transform}`);const values=m[1].split(',').map(Number);this.a=values[0];this.b=values[1];}}};
 const pointer=(target,type,angle=0,id=1,extra={})=>{const radians=angle*Math.PI/180,b=wheel.bounds;return target.dispatch(type,{pointerId:id,button:0,isPrimary:id===1,clientX:b.left+b.width/2+Math.cos(radians)*40,clientY:b.top+b.height/2+Math.sin(radians)*40,...extra});};
 return{win,doc,root,wheel,image,selector,handle,d,r,pointer,stick,thumb,pedal};
}
