import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
// A failed later server must preserve the earlier measured report and finish as JSON.
const child=spawn(process.execPath,['scripts/stress-online.mjs','--users=20,40','--duration=0.6'],{stdio:['ignore','pipe','pipe']});
const records=[];let stderr='';child.stderr.on('data',bytes=>{stderr+=bytes;});
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{
  const record=JSON.parse(line);records.push(record);
  if(record.event==='step:start'&&record.users===40)process.kill(record.serverPid,'SIGKILL');
});
const timeout=setTimeout(()=>child.kill('SIGKILL'),20000);
try{
  const [code]=await once(child,'exit');assert.equal(code,1,stderr);
  const reports=records.filter(record=>record.event==='step');assert.equal(reports.length,2);
  assert.equal(reports[0].users,20);assert.equal(reports[0].ok,true);
  assert.equal(reports[1].users,40);assert.equal(reports[1].ok,false);assert.ok(reports[1].errors.length>0);
  assert.equal(records.at(-1).event,'complete');assert.equal(records.at(-1).ok,false);
  console.log('PASS failed server child preserves partial JSON reports and emits a failed completion');
}finally{clearTimeout(timeout);lines.close();if(child.exitCode===null)child.kill('SIGKILL');}
