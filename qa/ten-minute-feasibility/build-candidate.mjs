

import fs from 'node:fs';
const root=new URL('../../',import.meta.url).pathname,dir='/workspace/scratch/e6939d35b3a6/city-ten-minute-candidate/';
fs.mkdirSync(dir,{recursive:true});fs.cpSync(root+'dist',dir+'dist',{recursive:true});
const gaps=[180,260,340,360,400,440,500,560,630,710,800,900,1020,1150,1300,4000];let sum=0;const stops=gaps.map(g=>sum+=g);
const ids=['city','forest','desert','snow','volcanic'],bounds=[-17,3000,5800,8500,11000,13570],biomes=ids.map((id,i)=>({id,name:id,from:bounds[i],to:bounds[i+1],color:[0x22e500,0x159b2e,0xf2b941,0xe6f8ff,0x553442][i]}));
const forks=[[4500,5000],[7280,7780],[9800,10300],[11850,12350]].map(([from,to],i)=>({id:ids[i+1]+'-fork',biome:ids[i+1],from,to,offset:25,ridge:4.4,valley:-3.4,skew:[.18,.24,-.2,-.24][i]}));
const turns=[[800,3000,0,Math.PI/2],[3000,4400,Math.PI/2,Math.PI/4],[5800,7150,Math.PI/4,0],[8500,9670,0,-Math.PI/4],[11000,11750,-Math.PI/4,-Math.PI/8],[12400,13570,-Math.PI/8,Math.PI/8]];


const anchors=[[-17,0],[0,0],[780,0],[3000,20],[4500,32],[5000,32],[5800,20],[7280,38],[7780,38],[8500,28],[9800,16],[10300,16],[11000,32],[11850,45],[12350,45],[13570,20]];
const ease=t=>t*t*t*(10+t*(-15+6*t));
function h(q){let j=0;while(j<anchors.length-2&&anchors[j+1][0]<=q)j++;const [a,x]=anchors[j],[b,y]=anchors[j+1];return x+(y-x)*ease(Math.max(0,Math.min(1,(q-a)/(b-a))));}
const shelves=[...stops,...biomes.map(b=>b.id==='city'?80:b.from+140)];
const elevations=[...anchors,...shelves.flatMap(q=>[[q-28,h(q)],[Math.min(q+28,13570),h(q)]])].filter(([q])=>!shelves.some(s=>q>s-28&&q<s+28&&!anchors.some(a=>a[0]===q&&forks.some(f=>q===f.from||q===f.to)))).sort((a,b)=>a[0]-b[0]);
const profile=[...new Map(elevations.map(a=>[a[0],a])).values()];
let cfg=`/** ISOLATED FEASIBILITY CANDIDATE. Not the released runtime. */\nexport const NETWORK_CONFIG=Object.freeze({start:-17,end:13570,spawn:0,halfWidth:15,shoulderWidth:110,meshStep:6,roadSurfaceOffset:.008,truckHalfWidth:2.9,truckHalfLength:3.6,roadMargin:.1});\n`;
for(const [k,v] of Object.entries({BIOME_DEFINITIONS:biomes,FORK_DEFINITIONS:forks,TURN_DEFINITIONS:turns,ELEVATION_PROFILE:profile,CHECKPOINT_PROGRESS:stops}))cfg+=`export const ${k}=Object.freeze(${JSON.stringify(v)}${k==='CHECKPOINT_PROGRESS'?'':'.map(Object.freeze)'});\n`;
cfg+=`export const PREVIEW_PROGRESS=Object.freeze(BIOME_DEFINITIONS.map(b=>Object.freeze({id:b.id,progress:b.id==='city'?80:b.from+140})));\n`;
fs.writeFileSync(dir+'dist/route-network-config.js',cfg);
const centers=[[960,1320,1720,2160,2660],[3320,3850,4070,5360,5580],[6260,6480,6700,6920,7950],[8820,9040,9260,10470,10690],[11320,11540,12520,12740,13180]];
let bridge=fs.readFileSync(root+'dist/road-bridges.js','utf8'),tail=bridge.slice(bridge.indexOf('export const bridgeAtProgress'));
bridge=`/** ISOLATED 25-bridge candidate. */\nimport {projectRoad,routePointAtProgress,routeDistanceAt} from './route-network.js';\nconst centers=${JSON.stringify(centers)};\nexport function buildBridges(seed=42){let state=seed>>>0||1;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;return state/4294967296;};return Object.freeze(centers.flatMap((xs,i)=>xs.map((q,j)=>Object.freeze({id:${JSON.stringify(ids)}[i]+'-bridge-'+(j+1),biome:${JSON.stringify(ids)}[i],from:q-12,to:q+12,halfWidth:2.5,offset:[-1,0,1,-1,1][j]*Math.round((3.5+random()*3.5)*10)/10}))));}\nexport const BRIDGES=buildBridges(42);\n`+tail;
fs.writeFileSync(dir+'dist/road-bridges.js',bridge);
let economy=fs.readFileSync(root+'dist/economy-config.js','utf8');const ranges=[290,380,496,646,841,1095,1425,1855,2413,3140];let i=0;economy=economy.replace(/range:\d+/g,()=>`range:${ranges[i++]}`);fs.writeFileSync(dir+'dist/economy-config.js',economy);
let hazards=fs.readFileSync(root+'dist/road-hazards.js','utf8');hazards=hazards.replace("const preferred=biome==='city'&&anchor<700?anchor:anchor*3;",`const oldBounds={city:[0,2000],forest:[2000,4000],desert:[4000,6200],snow:[6200,8400],volcanic:[8400,10800]}[biome];const targetArea=BIOME_DEFINITIONS.find(b=>b.id===biome);const targetFork=FORKS.find(f=>f.biome===biome);const preferred=routeChoice==='both'?targetFork.from+(targetFork.to-targetFork.from)/2:biome==='city'&&anchor<700?anchor:targetArea.from+(anchor-oldBounds[0])/(oldBounds[1]-oldBounds[0])*(targetArea.to-targetArea.from);`);
fs.writeFileSync(dir+'dist/road-hazards.js',hazards);
fs.writeFileSync(dir+'package.json',JSON.stringify({type:'module'}));fs.mkdirSync(dir+'qa',{recursive:true});
console.log(JSON.stringify({dir,stops,biomes,forks,centers,ranges},null,2));
