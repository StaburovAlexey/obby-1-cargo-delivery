async function verifyProductionHud(){
 const base=new URL('/build/',location.href),html=await (await fetch(new URL('index.html',base))).text();
 const parsed=new DOMParser().parseFromString(html,'text/html');
 parsed.querySelectorAll('script').forEach(node=>node.remove());
 const baseNode=parsed.createElement('base');baseNode.href=base.href;parsed.head.prepend(baseNode);
 parsed.body.className='is-driving';
 for(const id of ['loading','error','walk-ui'])parsed.getElementById(id).hidden=true;
 for(const id of ['drive-ui','audio-toggle','music-button'])parsed.getElementById(id).hidden=false;
 const nitro=parsed.createElement('button');nitro.id='nitro-button';nitro.className='nitro-button';nitro.textContent='N';parsed.getElementById('drive-ui').append(nitro);
 const results=[];
 for(const [width,height] of [[320,480],[390,500],[320,568],[390,600],[390,844],[430,932],[600,800],[768,1024],[568,320],[667,375],[844,390],[1200,700]]){
  const frame=document.createElement('iframe');frame.style.cssText=`position:fixed;inset:0;border:0;width:${width}px;height:${height}px;z-index:9999;background:#193044`;frame.srcdoc=parsed.documentElement.outerHTML;
  const loaded=new Promise(resolve=>frame.onload=resolve);document.body.append(frame);await loaded;await new Promise(resolve=>requestAnimationFrame(resolve));
  const doc=frame.contentDocument,rect=id=>{const r=doc.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const gas=rect('gas-pedal'),brake=rect('reverse-pedal'),boost=rect('nitro-button'),audio=rect('audio-toggle'),music=rect('music-button');
  const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
  const errors=[];
  for(const [id,r] of [['gas',gas],['brake',brake],['nitro',boost]]){
   if(width-r.right>Math.min(music.width+24,width*.17)+1||r.x+r.width/2<width*.75)errors.push(`${id} too far from right edge (${width-r.right}px)`);
   if(r.x<0||r.y<0||r.right>width+.5||r.bottom>height+.5)errors.push(`${id} outside viewport`);
   if(overlap(r,audio)||overlap(r,music))errors.push(`${id} overlaps right navigation`);
  }
  if(Math.abs(gas.right-brake.right)>.5||Math.abs(gas.right-boost.right)>.5)errors.push('pedal/nitro column is misaligned');
  if(overlap(gas,brake)||overlap(gas,boost)||overlap(brake,boost))errors.push('pedal stack overlaps');
  results.push({width,height,gas,brake,boost,audio,music,errors});frame.remove();
 }
 return {pass:results.every(r=>r.errors.length===0),results};
}
