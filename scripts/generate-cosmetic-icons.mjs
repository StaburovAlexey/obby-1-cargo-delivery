/** Rebuild transparent shop thumbnails from the exact runtime models/effects.
 * Usage: node scripts/generate-cosmetic-icons.mjs [--sample] [--effects-only | --tracks-only | --rear-comparison]
 * Requires existing sharp/ws dependencies and a system Chromium browser.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import WebSocket from 'ws';
import sharp from 'sharp';
import {VEHICLE_LIVERY_CATALOG} from '../dist/vehicle-livery-catalog.js';
import {VEHICLE_NEON_CATALOG} from '../dist/vehicle-neon-catalog.js';
import {VEHICLE_SMOKE_STYLES} from '../dist/vehicle-smoke-catalog.js';
import {VEHICLE_TRACK_STYLES} from '../dist/vehicle-track-catalog.js';
const root=path.resolve(new URL('..',import.meta.url).pathname),sample=process.argv.includes('--sample'),tracksOnly=process.argv.includes('--tracks-only'),effectsOnly=process.argv.includes('--effects-only'),comparison=process.argv.includes('--rear-comparison');
const mime={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.webp':'image/webp','.glb':'model/gltf-binary'};
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error('Bad path');res.setHeader('content-type',mime[path.extname(file)]??'application/octet-stream');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'cosmetic-icons-'));
const chrome=spawn(process.env.CHROME_BIN??'/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--enable-unsafe-swiftshader','--use-angle=swiftshader','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let ws;
try{
 let port;
 for(let i=0;i<200;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await new Promise(r=>setTimeout(r,50));}}
 if(!port)throw Error('Headless Chromium did not start');
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WebSocket(targets.find(v=>v.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
 let next=0;const pending=new Map();
 ws.on('message',data=>{const msg=JSON.parse(data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(Error(msg.error.message));else p.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')console.error(JSON.stringify(msg.params.exceptionDetails));});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 await call('Runtime.enable');
 await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/scripts/cosmetic-icon-scene.html`});
 for(let i=0;i<400;i++){const r=await call('Runtime.evaluate',{expression:'window.cosmeticIconReady===true',returnByValue:true});if(r.result.value)break;if(i===399)throw Error('Renderer did not initialize');await new Promise(r=>setTimeout(r,50));}
 const jobs=[];
 const add=(type,id,vehicle,file)=>jobs.push({type,id,vehicle,file});
 if(!tracksOnly&&!effectsOnly&&!comparison)for(const vehicle of VEHICLE_LIVERY_CATALOG)for(const style of vehicle.variants)if(!sample||(vehicle.id==='bmwreward'&&['base','anime'].includes(style.id))||vehicle.id==='pickup'&&style.id==='racing')add('livery',style.id,vehicle.id,`shop-previews/liveries/${vehicle.id}/${style.id}.webp`);
 if(!tracksOnly&&!effectsOnly&&!comparison)for(const style of VEHICLE_NEON_CATALOG)if(!sample||style.id==='purple')add('neon',style.id,'bmwreward',`shop-previews/neon/${style.id}.webp`);
 if(!tracksOnly&&!comparison)for(const style of VEHICLE_SMOKE_STYLES)if(!sample||['standard','hearts'].includes(style.id))add('smoke',style.id,'bmwreward',`shop-previews/smoke/${style.id}.webp`);
 for(const style of VEHICLE_TRACK_STYLES)if((!comparison||style.id==='rainbow')&&(!sample||['standard','rainbow','fire'].includes(style.id)))add('tracks',style.id,'bmwreward',`tracks/${style.id}.webp`);
 const categorySources={liveries:'shop-previews/liveries/bmwreward/anime.webp',neon:'shop-previews/neon/purple.webp',smoke:'shop-previews/smoke/hearts.webp',tracks:'tracks/rainbow.webp'};
 for(const [index,job]of jobs.entries()){
  const r=await call('Runtime.evaluate',{expression:`window.renderCosmetic(${JSON.stringify(job.type)},${JSON.stringify(job.id)},${JSON.stringify(job.vehicle)})`,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
  const png=Buffer.from(r.result.value.split(',')[1],'base64'),destination=comparison?'/tmp/cosmetic-track-rear-comparison.webp':path.join(root,'dist/assets',job.file);
  await fs.mkdir(path.dirname(destination),{recursive:true});await sharp(png).webp({quality:88,alphaQuality:100,effort:6}).toFile(destination);
  console.log(`${index+1}/${jobs.length} ${job.file}`);
 }
 for(const[id,source]of Object.entries(categorySources)){if(comparison||(tracksOnly&&id!=='tracks')||(effectsOnly&&!['smoke','tracks'].includes(id)))continue;const destination=path.join(root,'dist/assets/shop-previews/categories',`${id}.webp`);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(root,'dist/assets',source),destination);}
 const diagnostics=await call('Runtime.evaluate',{expression:'window.cosmeticIconDiagnostics',returnByValue:true});if(diagnostics.result.value)console.log(`Wheel contact transform: ${JSON.stringify(diagnostics.result.value)}`);
 console.log(`Generated ${jobs.length+(comparison?0:tracksOnly?1:effectsOnly?2:4)} transparent WebP icons.`);
}finally{
 ws?.terminate();
 if(chrome.exitCode===null){
  const stopped=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill('SIGTERM');
  await Promise.race([stopped,new Promise(resolve=>setTimeout(resolve,1500))]);
  if(chrome.exitCode===null)chrome.kill('SIGKILL');
 }
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
