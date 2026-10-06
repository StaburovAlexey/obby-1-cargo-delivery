import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
const child=spawn(process.execPath,['server/room-server.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'0',ALLOWED_ORIGINS:'https://game.example'},stdio:['ignore','pipe','pipe']});
const lines=createInterface({input:child.stdout});let stderr='';child.stderr.on('data',bytes=>{stderr+=bytes;});
const timeout=setTimeout(()=>child.kill('SIGKILL'),10000);
try {
  const [line]=await once(lines,'line');const started=JSON.parse(line);
  assert.equal(started.event,'listening');assert.ok(started.port>0);
  const response=await fetch(`http://127.0.0.1:${started.port}/health`);const health=await response.json();
  assert.equal(response.status,200);assert.equal(health.worldId,'current-seed-42');assert.equal(health.players,0);
  const ended=once(child,'exit');child.kill('SIGTERM');const [code,signal]=await ended;
  assert.equal(code,0,stderr);assert.equal(signal,null);
  console.log('PASS standalone CLI environment, health endpoint and graceful SIGTERM shutdown');
} finally {clearTimeout(timeout);lines.close();if(child.exitCode===null)child.kill('SIGKILL');}
