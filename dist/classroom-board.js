import {NETWORK_EDGES} from './route-network.js';
import {CANYON_APPROACH_SAMPLES} from './canyon-approach.js';
import {CANYON_TRACK,canyonPointAt} from './canyon-track.js';
import {createRemoteMotion} from './remote-motion.js';

const WIDTH=2048,HEIGHT=640,PAINT_INTERVAL=1000/15,NEAR_DISTANCE=55;
const SELF='#ffd36b',PEER='#5fe0dc',CHALK='#fff1d4',MUTED='#c7c9ab';
const INK='#203a39',SURFACE='#285956',MAP='#204b49',GOLD='#efbc55',BLUE='#168cc7';
const mainPaths=NETWORK_EDGES.map(edge=>edge.samples);
const canyonPaths=[CANYON_APPROACH_SAMPLES,Array.from({length:Math.ceil(CANYON_TRACK.length/8)+1},(_,i)=>canyonPointAt(Math.min(CANYON_TRACK.length,i*8)))];
const words={
 ru:{title:'Игроки нашей комнаты',main:'Основная трасса',canyon:'Дрифт-каньон',school:'Класс',you:'Вы',player:'Игрок',peers:'Другие игроки',ranking:'ДРИФТ',score:'Очки',offline:'Нет подключения к комнате',connect:'Подключитесь, чтобы увидеть игроков.',empty:'Пока нет завершённых заездов',best:'Лучшие заезды',loading:'Загрузка рейтинга…',unavailable:'Рейтинг недоступен',error:'Не удалось обновить рейтинг',changed:'Аккаунт изменился. Перезагрузите игру.'},
 en:{title:'Players in this room',main:'Main route',canyon:'Drift canyon',school:'Classroom',you:'You',player:'Player',peers:'Other players',ranking:'DRIFT',score:'Score',offline:'No room connection',connect:'Connect to see players.',empty:'No completed runs yet',best:'Best runs',loading:'Loading leaderboard…',unavailable:'Rankings unavailable',error:'Could not refresh the leaderboard',changed:'Account changed. Reload the game.'},
};

export function createBoardProjection(points,rect,padding=16){
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
 const minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
 const northAcross=maxZ-minZ>=maxX-minX;
 const coordinates=p=>northAcross?{u:-p.z,v:p.x}:{u:p.x,v:p.z};
 const a=coordinates({x:minX,z:maxZ}),b=coordinates({x:maxX,z:minZ});
 const minU=Math.min(a.u,b.u),maxU=Math.max(a.u,b.u),minV=Math.min(a.v,b.v),maxV=Math.max(a.v,b.v);
 const scale=Math.min((rect.width-2*padding)/Math.max(1,maxU-minU),(rect.height-2*padding)/Math.max(1,maxV-minV));
 const ox=rect.x+(rect.width-(maxU-minU)*scale)/2,oy=rect.y+(rect.height-(maxV-minV)*scale)/2;
 return p=>{const {u,v}=coordinates(p);return {x:ox+(u-minU)*scale,y:oy+(v-minV)*scale};};
}

export function createClassroomBoard(THREE,{document:doc=globalThis.document,parent,
 position={x:-41,y:6.75,z:26.32},garageBounds={minX:-57,maxX:31,minZ:26,maxZ:90}}={}){
 const canvas=doc?.createElement('canvas'),context=canvas?.getContext?.('2d');
 if(!context)return null;
 canvas.width=WIDTH;canvas.height=HEIGHT;
 const background=doc.createElement('canvas');background.width=WIDTH;background.height=HEIGHT;
 const base=background.getContext('2d');
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.anisotropy=4;
 const geometry=new THREE.PlaneGeometry(26.8,8.375),material=new THREE.MeshStandardMaterial({map:texture,roughness:.86,metalness:0});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Classroom room map and drift leaderboard';
 mesh.position.set(position.x,position.y,position.z);mesh.receiveShadow=true;parent?.add(mesh);
 const school={x:-41,z:47};
 const garageCorners=[{x:garageBounds.minX,z:garageBounds.minZ},{x:garageBounds.maxX,z:garageBounds.minZ},
  {x:garageBounds.maxX,z:garageBounds.maxZ},{x:garageBounds.minX,z:garageBounds.maxZ}];
 const maps=[{paths:[...mainPaths,...canyonPaths],rect:{x:36,y:144,width:1232,height:428}}];
 for(const map of maps)map.project=createBoardProjection([...map.paths.flat(),...garageCorners],map.rect,20);
 const motion=createRemoteMotion({delayMs:200});
 let disposed=false,near=false,lastRoom=null,lastSnapshot=null,lastPaint=-Infinity,lastNow=-Infinity,paintKey='',baseLanguage='';
 let players=[];

 function text(ctx,value,x,y,size=28,color=CHALK,align='left'){
  ctx.font=`800 ${size}px Arial, sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(value,x,y);
 }
 function shortName(ctx,name,width){
  if(ctx.measureText(name).width<=width)return name;
  while(name.length&&ctx.measureText(name+'…').width>width)name=name.slice(0,-1);
  return name+'…';
 }
 function drawBase(language){
  const w=words[language];baseLanguage=language;
  base.fillStyle=SURFACE;base.fillRect(0,0,WIDTH,HEIGHT);
  base.fillStyle='#2b5c58';
  for(let y=0;y<HEIGHT;y+=64)for(let x=(y/64%2)*64;x<WIDTH;x+=128)base.fillRect(x,y,64,64);
  base.strokeStyle=INK;base.lineWidth=10;base.strokeRect(5,5,WIDTH-10,HEIGHT-10);
  base.strokeStyle='#789580';base.lineWidth=2;base.strokeRect(14,14,WIDTH-28,HEIGHT-28);
  for(const [x,width,color]of [[28,1248,BLUE],[1340,675,GOLD]]){
   base.fillStyle=INK;base.fillRect(x,26,width,68);
   base.fillStyle=color;base.fillRect(x,20,width,68);
   base.strokeStyle=INK;base.lineWidth=5;base.strokeRect(x,20,width,68);
   base.fillStyle=color===BLUE?'#52c7e8':'#ffe1a0';base.fillRect(x+4,24,width-8,4);
  }
  text(base,w.title,46,55,40);text(base,w.ranking,1360,55,34,INK);
  base.fillStyle=GOLD;base.fillRect(1305,26,6,580);
  text(base,w.main,40,117,29);text(base,w.canyon,850,117,29,'#ffb65b');
  text(base,w.player,1415,116,24,MUTED);text(base,w.score,2005,116,24,MUTED,'right');
  for(const map of maps){
   const r=map.rect;base.fillStyle=MAP;base.fillRect(r.x,r.y,r.width,r.height);
   base.strokeStyle=INK;base.lineWidth=6;base.strokeRect(r.x,r.y,r.width,r.height);
   base.strokeStyle='#759481';base.lineWidth=2;base.strokeRect(r.x+4,r.y+4,r.width-8,r.height-8);
   base.save();base.beginPath();base.rect(r.x,r.y,r.width,r.height);base.clip();
   base.lineCap='round';base.lineJoin='round';
   for(const path of map.paths){
    base.beginPath();path.forEach((p,i)=>{const q=map.project(p);if(i)base.lineTo(q.x,q.y);else base.moveTo(q.x,q.y);});
    base.lineWidth=11;base.strokeStyle=INK;base.stroke();
    base.lineWidth=5;base.strokeStyle=canyonPaths.includes(path)?'#ffb65b':CHALK;base.stroke();
   }
   const p=map.project(school);base.fillStyle=CHALK;base.fillRect(p.x-5,p.y-5,10,10);
   text(base,w.school,Math.max(r.x+10,Math.min(r.x+r.width-100,p.x+16)),Math.min(r.y+r.height-16,p.y+20),22,MUTED);
   base.restore();
  }
  text(base,'●',50,609,30,PEER);text(base,w.peers,80,609,26);
  text(base,w.best,1350,608,21,MUTED);
 }
 function drawPlayers(samples,w){
  for(const map of maps){
   const r=map.rect;
   const dots=samples.map(p=>({...p,point:map.project({x:p.state.position[0],z:p.state.position[2]})}))
    .filter(p=>p.point.x>=r.x+8&&p.point.x<=r.x+r.width-8&&p.point.y>=r.y+8&&p.point.y<=r.y+r.height-8);
   context.save();context.beginPath();context.rect(r.x,r.y,r.width,r.height);context.clip();
   for(const p of dots){
    context.beginPath();context.arc(p.point.x,p.point.y,7,0,Math.PI*2);
    context.fillStyle=PEER;context.fill();context.strokeStyle=INK;context.lineWidth=4;context.stroke();
   }
   const labels=[];
   for(const p of dots){
    const name=`${w.player} ${p.number}`;
    context.font='800 23px Arial, sans-serif';const width=context.measureText(name).width+12;
    const x=Math.max(r.x+4,Math.min(r.x+r.width-width-4,p.point.x+13)),y=Math.max(r.y+15,Math.min(r.y+r.height-15,p.point.y-15));
    const box={left:x-4,right:x+width,top:y-14,bottom:y+14};
    if(labels.some(b=>box.left<b.right&&box.right>b.left&&box.top<b.bottom&&box.bottom>b.top))continue;
    labels.push(box);context.fillStyle=MAP;context.fillRect(box.left,box.top,width+4,28);
    text(context,name,x,y,23,PEER);
   }
   context.restore();
  }
 }
 function rankingRows(board){
  if(board?.status!=='ready')return [];
  const valid=entry=>Number.isSafeInteger(entry?.rank)&&entry.rank>0&&Number.isSafeInteger(entry.score)&&entry.score>=0&&entry.score<=100000000;
  const seen=new Set(),entries=(Array.isArray(board.entries)?board.entries:[]).filter(entry=>{if(!valid(entry)||seen.has(entry.rank))return false;seen.add(entry.rank);return true;}).sort((a,b)=>a.rank-b.rank);
  const rows=entries.slice(0,10);
  if(valid(board.player)&&!rows.some(row=>row.rank===board.player.rank)){
   if(rows.length===10)rows[9]=board.player;else rows.push(board.player);
  }
  return rows;
 }
 function drawStandings(board,w,language){
  if(board?.status!=='ready'){
   const status=board?.status||'idle',message=status==='idle'||status==='loading'?w.loading:status==='unavailable'?w.unavailable:status==='account-changed'?w.changed:w.error;
   text(context,message,1350,188,25,MUTED);return;
  }
  const rows=rankingRows(board);
  if(!rows.length){text(context,w.empty,1350,188,28,MUTED);return;}
  for(const [i,row]of rows.entries()){
   const self=row.rank===board.player?.rank,y=173+i*43;
   context.fillStyle=self?'#53623c':i%2?'#285552':'#234c49';context.fillRect(1340,y-18,675,38);
   if(self){context.fillStyle=GOLD;context.fillRect(1340,y-18,5,38);}
   const color=self?SELF:CHALK;
   text(context,String(row.rank),1350,y,26,color);
   context.font='800 28px Arial, sans-serif';
   const name=self?w.you:typeof row.name==='string'&&row.name?row.name:w.player;
   text(context,shortName(context,name,350),1415,y,28,color);
   text(context,row.score.toLocaleString(language==='en'?'en-US':'ru-RU'),2005,y,28,color,'right');
  }
 }
 function receive(snapshot,now){
  players=(Array.isArray(snapshot?.players)?snapshot.players:[]).slice(0,20).filter(p=>
   typeof p?.id==='string'&&Array.isArray(p.state?.position)&&p.state.position.length===3&&p.state.position.every(Number.isFinite)&&
   Array.isArray(p.state.quaternion)&&p.state.quaternion.length===4&&p.state.quaternion.every(Number.isFinite))
   .map((p,i)=>({...p,number:Number.isSafeInteger(p.number)&&p.number>0?p.number:i+1}));
  motion.receive(players.filter(p=>p.id!==snapshot?.selfId),now);lastSnapshot=snapshot;
 }
 function update({now=performance.now(),anchor,snapshot=null,leaderboard=null,language='ru',active=true}={}){
  if(disposed||!Number.isFinite(now))return;
  const close=active&&Number.isFinite(anchor?.x)&&Number.isFinite(anchor?.z)&&Math.hypot(anchor.x-school.x,anchor.z-school.z)<=NEAR_DISTANCE;
  if(!close){near=false;return;}
  const roomKey=snapshot?`${snapshot.roomId}:${snapshot.selfId}`:null;
  if(!near||roomKey!==lastRoom||now<lastNow){motion.clear();lastSnapshot=null;lastPaint=-Infinity;paintKey='';}
  near=true;lastRoom=roomKey;lastNow=now;
  if(snapshot!==lastSnapshot)receive(snapshot,now);
  language=language==='en'?'en':'ru';
  if(now-lastPaint+1e-6<PAINT_INTERVAL)return;
  lastPaint=now;
  const samples=players.filter(p=>p.id!==snapshot?.selfId).map(p=>({...p,state:motion.sample(p.id,now)})).filter(p=>p.state);
  const key=JSON.stringify([roomKey,language,players.length,samples.map(p=>[p.id,p.number,Math.round(p.state.position[0]*10),Math.round(p.state.position[2]*10)]),leaderboard?.status,leaderboard?.player?.rank,rankingRows(leaderboard).map(p=>[p.rank,p.name,p.score])]);
  if(key===paintKey)return;
  if(baseLanguage!==language)drawBase(language);
  context.drawImage(background,0,0);drawPlayers(samples,words[language]);drawStandings(leaderboard,words[language],language);
  if(snapshot)text(context,`${players.length}/20`,1256,55,28,CHALK,'right');
  else text(context,words[language].offline,1256,609,24,MUTED,'right');
  texture.needsUpdate=true;paintKey=key;
 }
 update({now:0,anchor:school});
 return {mesh,update,dispose(){
  if(disposed)return;disposed=true;motion.clear();mesh.removeFromParent();texture.dispose();material.dispose();geometry.dispose();
 }};
}
