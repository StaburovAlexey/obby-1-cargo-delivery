import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

for(const directory of ['build','build-vk'])test(`${directory}: CSS image paths resolve from the stylesheet at a nested deployment URL`,async()=>{
 const root=fileURLToPath(new URL(`../${directory}/`,import.meta.url)),cssDir=path.join(root,'static/css');
 let checked=0;const missing=[];
 for(const name of await readdir(cssDir)){
  if(!name.endsWith('.css'))continue;
  const cssPath=path.join(cssDir,name),css=await readFile(cssPath,'utf8');
  for(const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)){
   const ref=match[1];if(/^(?:data:|https?:|#)/.test(ref))continue;
   checked++;
   const deployed=new URL(ref,`https://example.test/nested/game/static/css/${name}`);
   if(!deployed.pathname.startsWith('/nested/game/')){missing.push(ref);continue;}
   const local=path.join(root,decodeURIComponent(deployed.pathname.slice('/nested/game/'.length)));
   try{await access(local);}catch{missing.push(ref);}
  }
 }
 assert.ok(checked>=3,'exercise the actual extracted background artwork');
 assert.deepEqual(missing,[],'CSS assets must resolve relative to their stylesheet, not index.html');
});
