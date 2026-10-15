import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {stripCodeComments as strip} from '../scripts/strip-code-comments.mjs';
const cli=fileURLToPath(new URL('../scripts/strip-code-comments.mjs',import.meta.url));
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
async function fixture(t){const directory=await mkdtemp(join(tmpdir(),'obby-comments-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}

test('ordinary JavaScript comments become whitespace while line terminators remain',()=>{
  const result=strip('const a=1; // ordinary\nconst b=2;');
  assert.equal(result?.removed,1);
  assert.equal(result?.code,'const a=1;            \nconst b=2;');
});

test('AST comment ranges protect strings, regular expressions and template interpolation',()=>{
  const source=String.raw`
const url='https://example.test/a/*literal*/';
const pattern=/\/\*literal\*\//;
const template=\`before /*literal*/ \${1 /* ordinary */ + 2} after //literal\`;
function choose(){return /https?:\/\//.test(url);}
// ordinary line
JSON.stringify([url,pattern.test('/*literal*/'),template,choose()]);
`.replaceAll('\\`','`').replaceAll('\\${','${');
  const result=strip(source);
  assert.equal(result?.removed,2);
  assert.equal(runInNewContext(result.code),'["https://example.test/a/*literal*/",true,"before /*literal*/ 3 after //literal",true]');
  assert.equal(result.code.length,source.length);
});

test('removal preserves return ASI, all ECMAScript line terminators and token separation',()=>{
  const source='function value(){return/* ordinary\r\nsecond\u2028third\u2029last\r*/42;}\nconst/**/number=1/**/+/**/+2;\nJSON.stringify([value(),number]);';
  const result=strip(source);
  assert.equal(result?.removed,4);
  assert.equal(runInNewContext(result.code),'[null,3]');
  assert.deepEqual(result.code.match(/\r\n|[\r\n\u2028\u2029]/g),source.match(/\r\n|[\r\n\u2028\u2029]/g));
});

test('copyright, SPDX, license, preserve notices and executable hashbangs remain exact',()=>{
  const notices=['#!/usr/bin/env node','/*! MIT */','// Copyright 2026 Example','/* SPDX-License-Identifier: MIT */','/** @license Example license */','/* @preserve supplied notice */'];
  const source=notices.join('\n')+'\n// ordinary\nexport const value=1;';
  const result=strip(source,'.mjs');
  assert.equal(result?.removed,1);
  assert.equal(result.preserved,6);
  for(const notice of notices)assert(result.code.includes(notice),notice);
  assert.equal(strip(result.code,'.mjs').removed,0);
});

test('CommonJS and regular script comments use a valid parse mode',()=>{
  const result=strip('module.exports=1; /* ordinary */','.cjs');
  assert.equal(result?.removed,1);
  const context={module:{exports:null}};
  runInNewContext(result.code,context);
  assert.equal(context.module.exports,1);
  assert.throws(()=>strip('const broken = ; /* ordinary */','.js'),/Unexpected token/);
});

test('CSS stripping protects escaped strings and quoted or unquoted URL tokens',()=>{
  const source=String.raw`/* ordinary */
a/**/b {
  content: "escaped\"/*literal*/";
  background: url(https://example.test/a/*literal*/b.svg);
  mask: URL("data:image/svg+xml;/*literal*/");
  cursor: url(https://example.test/a\)/*literal*/b);
  --text: 'https://example.test/*literal*/';
  /* Copyright Example */
}`;
  const result=strip(source,'.css');
  assert.equal(result?.removed,2);
  assert.equal(result.preserved,1);
  for(const literal of ['"escaped\\"/*literal*/"','url(https://example.test/a/*literal*/b.svg)','URL("data:image/svg+xml;/*literal*/")','url(https://example.test/a\\)/*literal*/b)'])assert(result.code.includes(literal),literal);
  assert(result.code.includes('a    b'));
  assert.equal(strip(result.code,'.css').removed,0);
});

test('HTML stripping changes markup comments while preserving attributes and raw text blocks',()=>{
  const source=`<!doctype html>
<div data-note="<!-- attribute literal -->"><!-- ordinary --></div>
<script>const text="<!-- script literal -->"; /* inline JS remains untouched */</script>
<script type="application/json">{"text":"<!-- JSON literal -->"}</script>
<style>.a:before{content:'<!-- CSS literal -->';}</style>
<textarea><!-- text literal --></textarea>
<!-- Copyright Example -->
<!-- ordinary second -->`;
  const result=strip(source,'.html');
  assert.equal(result?.removed,2);
  assert.equal(result.preserved,1);
  for(const literal of ['<!-- attribute literal -->','<!-- script literal -->','/* inline JS remains untouched */','<!-- JSON literal -->','<!-- CSS literal -->','<!-- text literal -->','<!-- Copyright Example -->'])assert(result.code.includes(literal),literal);
  assert.equal(strip(result.code,'.html').removed,0);
});

test('CLI check reports ordinary comments without changing files, then stripping is idempotent',async t=>{
  const directory=await fixture(t),file=join(directory,'main.mjs'),source='export const value=1; // ordinary\n';
  await writeFile(file,source);
  const check=run('--check',file);
  assert.equal(check.status,1,check.stderr);
  assert.match(check.stdout,/1 ordinary comments/);
  assert.equal(await readFile(file,'utf8'),source);
  const apply=run(file);
  assert.equal(apply.status,0,apply.stderr);
  assert.notEqual(await readFile(file,'utf8'),source);
  const final=run('--check',file);
  assert.equal(final.status,0,final.stderr);
  assert.match(final.stdout,/0 ordinary comments/);
});

test('CLI traverses author/vendor code but excludes generated trees, assets, binaries and symlinks',async t=>{
  const directory=await fixture(t);
  const files={
    'main.js':'const x=1; // ordinary\n',
    'nested/a.cjs':'module.exports=1; /* ordinary */',
    'nested/b.mjs':'export const x=1; /* ordinary */',
    'dist/vendor/library.js':'/*! MIT */\nconst x=1; // ordinary\n',
    'dist/style.css':'a{/* ordinary */color:red}',
    'dist/index.html':'<div><!-- ordinary --></div>',
    'assets/README.md':'<!-- ordinary markup example -->',
    'assets/image.png':'/* image bytes */',
    'node_modules/skip.js':'// keep dependency\n',
    'build/skip.js':'// keep build\n',
    'build-demo/skip.js':'// keep demo\n',
    'output/skip.js':'// keep output\n',
    '.git/skip.js':'// keep git\n',
  };
  for(const [name,source]of Object.entries(files)){const file=join(directory,name);await mkdir(join(file,'..'),{recursive:true});await writeFile(file,source);}
  const binary=Buffer.from([0,47,42,32,255,32,42,47]);
  await writeFile(join(directory,'binary.js'),binary);
  await symlink(join(directory,'node_modules/skip.js'),join(directory,'linked.js'));
  const result=run(directory);
  assert.equal(result.status,0,result.stderr);
  for(const name of ['main.js','nested/a.cjs','nested/b.mjs','dist/vendor/library.js','dist/style.css','dist/index.html'])assert.notEqual(await readFile(join(directory,name),'utf8'),files[name],name);
  assert((await readFile(join(directory,'dist/vendor/library.js'),'utf8')).includes('/*! MIT */'));
  for(const name of Object.keys(files).filter(name=>/^(?:assets|node_modules|build|build-demo|output|\.git)\//.test(name)))assert.equal(await readFile(join(directory,name),'utf8'),files[name],name);
  assert.deepEqual(await readFile(join(directory,'binary.js')),binary);
  assert.equal(run('--check',directory).status,0);
});

test('CLI parse failure preflights the entire batch before any file mutation',async t=>{
  const directory=await fixture(t),first=join(directory,'a.js'),broken=join(directory,'z.js'),source='const x=1; // ordinary\n';
  await writeFile(first,source);await writeFile(broken,'const broken = ; // ordinary\n');
  const result=run(directory);
  assert.equal(result.status,2);
  assert.match(result.stderr,/Unexpected token/);
  assert.equal(await readFile(first,'utf8'),source);
});

test('CLI removes trailing comment padding while preserving literal whitespace',async t=>{
  const directory=await fixture(t),file=join(directory,'main.mjs');
  const source='const literal=`keep   \n   \nend`; // ordinary\n/* ordinary\n * ordinary\n */\nconst number=1/* ordinary */+2;\n';
  await writeFile(file,source);
  const result=run(file);assert.equal(result.status,0,result.stderr);
  const clean=await readFile(file,'utf8');
  assert(clean.includes('`keep   \n   \nend`;\n'));
  assert(!clean.includes('end`;  '));
  assert(clean.includes('\n\n\n\nconst number='));
  assert(clean.includes('1              +2'));
});

test('CLI requires explicit paths and rejects unknown options',()=>{
  assert.equal(run().status,2);
  assert.equal(run('--unknown').status,2);
  const help=run('--help');
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/--check/);
});
