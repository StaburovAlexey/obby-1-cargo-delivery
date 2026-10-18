import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,readdir,copyFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import WebSocket from 'ws';
import {PROTOCOL_VERSION} from '../dist/online-protocol.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFile(join(root,path),'utf8');

test('all deployment paths use one dispatcher endpoint with explicit four-worker limits',async()=>{
  const [docker,compose,service,nginx,env,packageJson]=await Promise.all([
    read('deployment/Dockerfile.online'),read('deployment/compose.online.yaml'),read('deployment/obby-online.service'),
    read('deployment/nginx-online.conf'),read('deployment/obby-online.env.example'),read('package.json')]);
  assert.match(docker,/CMD \["node", "server\/room-cluster\.mjs"\]/);
  assert.match(docker,/COPY dist\/\*\.js \.\/dist\//);
  assert.match(docker,/COPY server\/room-server\.mjs server\/room-cluster\.mjs \.\/server\//);
  assert.match(docker,/await import\('\.\/server\/room-server\.mjs'\)/);
  assert.match(docker,/WORKERS=4 MAX_CONNECTIONS_PER_WORKER=500 MAX_ROOMS_PER_WORKER=25/);
  assert.match(service,/ExecStart=\/usr\/bin\/node server\/room-cluster\.mjs/);
  assert.match(service,/KillMode=mixed/);assert.match(service,/TimeoutStopSec=15/);
  assert.match(compose,/127\.0\.0\.1:8081:8081/);assert.match(compose,/stop_grace_period: 15s/);
  assert.match(nginx,/server 127\.0\.0\.1:8081;/);assert.match(nginx,/location = \/ws/);
  assert.match(env,/^WORKERS=4$/m);assert.match(env,/^MAX_CONNECTIONS_PER_WORKER=500$/m);assert.match(env,/^MAX_ROOMS_PER_WORKER=25$/m);
  assert.doesNotMatch(env,/^MAX_(?:CONNECTIONS|ROOMS)=/m);
  assert.equal(JSON.parse(packageJson).scripts.server,'node server/room-cluster.mjs');
  assert.equal(JSON.parse(packageJson).scripts['server:single'],'node server/room-server.mjs');
});

test('isolated Docker-equivalent module tree boots workers, serves health, upgrades WebSocket and exits cleanly',{timeout:20000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'online-runtime-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  await mkdir(join(directory,'dist'));await mkdir(join(directory,'server'));
  await copyFile(join(root,'package.json'),join(directory,'package.json'));
  for(const name of await readdir(join(root,'dist')))if(name.endsWith('.js'))await copyFile(join(root,'dist',name),join(directory,'dist',name));
  for(const name of ['room-server.mjs','room-cluster.mjs'])await copyFile(join(root,'server',name),join(directory,'server',name));
  await symlink(join(root,'node_modules'),join(directory,'node_modules'),'dir');
  const child=spawn(process.execPath,['server/room-cluster.mjs'],{cwd:directory,
    env:{...process.env,HOST:'127.0.0.1',PORT:'0',WORKERS:'2',MAX_CONNECTIONS_PER_WORKER:'20',MAX_ROOMS_PER_WORKER:'1',ALLOWED_ORIGINS:'https://game.example'},
    stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',bytes=>{stderr+=bytes;});
  const lines=createInterface({input:child.stdout});
  const timeout=setTimeout(()=>child.kill('SIGKILL'),15000);
  t.after(()=>{clearTimeout(timeout);lines.close();if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');});
  const started=await Promise.race([
    once(lines,'line').then(([line])=>JSON.parse(line)),
    once(child,'exit').then(([code,signal])=>{throw new Error(`Runtime exited before listening: ${code??signal}\n${stderr}`);}),
  ]);
  assert.equal(started.event,'listening');assert.equal(started.workers,2);assert.equal(started.address,'127.0.0.1');assert.ok(started.port>0);
  const response=await fetch(`http://127.0.0.1:${started.port}/health`),health=await response.json();
  assert.equal(response.status,200);assert.equal(health.readyWorkers,2);assert.equal(health.players,0);assert.equal(health.capacity,20);
  const socket=new WebSocket(`ws://127.0.0.1:${started.port}/ws`,{origin:'https://game.example'});
  t.after(()=>socket.terminate());
  await once(socket,'open');const received=once(socket,'message');socket.send(JSON.stringify({type:'join',version:PROTOCOL_VERSION}));
  const [bytes,isBinary]=await received;assert.equal(isBinary,false);assert.equal(JSON.parse(bytes).type,'welcome');
  const closed=once(socket,'close'),exited=once(child,'exit');child.kill('SIGTERM');await closed;
  const [code,signal]=await exited;assert.equal(code,0,stderr);assert.equal(signal,null,stderr);assert.equal(stderr,'');
});
