import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'obby-journey-shards-'));
try{
 const settled=await Promise.allSettled(Array.from({length:4},(_,index)=>new Promise((resolve,reject)=>{
  const file=path.join(temporary,index+'.json');
  const child=spawn(process.execPath,[new URL('./biome-progression-journeys.mjs',import.meta.url).pathname,`--shard=${index}/4`],{env:{...process.env,BIOME_REPORT_PATH:file},stdio:['ignore','inherit','inherit']});
  child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(fs.readFileSync(file,'utf8'))):reject(Error(`Journey shard ${index} failed (${code})`)));
 })));
 const rejected=settled.filter(r=>r.status==='rejected');assert.equal(rejected.length,0,rejected.map(r=>r.reason?.message).join('\n'));
 const reports=settled.map(r=>r.value);
 const results=reports.flatMap(r=>r.results);assert.equal(results.length,17);assert.equal(new Set(results.map(r=>r.name)).size,17);
 for(const report of reports)assert.deepEqual(report.runtimeHashes,reports[0].runtimeHashes);
 if(process.env.BIOME_REPORT_PATH)fs.writeFileSync(process.env.BIOME_REPORT_PATH,JSON.stringify({...reports[0],generatedAt:new Date().toISOString(),results},null,2)+'\n');
 console.log('PASS all 17 independent production-physics journeys, including full-route reward and tank10 final-car boundary.');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
