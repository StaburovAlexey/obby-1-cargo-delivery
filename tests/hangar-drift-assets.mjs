import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for(const directory of ['build','build-vk']){
 test(`${directory}: delivered stylesheets include the trophy dialog instead of a broken CSS URL`,()=>{
  const index=new URL(`../${directory}/index.html`,import.meta.url);
  assert.ok(fs.existsSync(index),'Run npm run build:all before this artifact check');
  const html=fs.readFileSync(index,'utf8');
  const styles=[...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["']/g)].map(match=>match[1]);
  assert.ok(styles.length,'The delivered page loads its styles');
  const css=styles.map(href=>{
   const asset=new URL(href,index);
   assert.equal(asset.protocol,'file:','Release styles must be packaged with the game');
   assert.ok(fs.existsSync(asset),`Missing delivered stylesheet: ${href}`);
   return fs.readFileSync(asset,'utf8');
  }).join('\n');
  for(const id of ['hangar-drift-menu','hangar-drift-panel','hangar-drift-close']){
   assert.ok(css.includes(`#${id}`),`The loaded CSS must style #${id}`);
  }
 });
}
