#!/usr/bin/env node
import {parse} from 'acorn';
import {isUtf8} from 'node:buffer';
import {lstat,readdir,readFile,writeFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const extensions=new Set(['.js','.mjs','.cjs','.css','.html','.htm']);
const excluded=new Set(['node_modules','build','build-demo','output','.git']);
const rawElements=new Set(['script','style','textarea','title','xmp','iframe','noembed','noframes']);
const notice=/\b(?:copyright|license|licence|spdx)\b|@(?:license|preserve)\b/i;
const usage='Usage: node scripts/strip-code-comments.mjs [--check] <file-or-directory> [...paths]\nRemoves ordinary JS/CSS/HTML comments; preserves notices, line terminators and inline HTML raw text.\n--check reports remaining ordinary comments without modifying files.\n';

function javascriptRanges(source,extension){
  const modes=extension==='.cjs'?['script']:extension==='.mjs'?['module']:['module','script'];
  let failure;
  for(const sourceType of modes){
    const ranges=[];
    try{
      parse(source,{ecmaVersion:'latest',sourceType,allowHashBang:true,allowReturnOutsideFunction:extension==='.cjs',
        onComment(_block,_value,start,end){ranges.push({start,end});},
      });
      return ranges;
    }catch(error){failure=error;}
  }
  throw failure;
}
function quoteEnd(source,start){
  const quote=source[start];
  for(let i=start+1;i<source.length;i++){
    if(source[i]==='\\'){i++;continue;}
    if(source[i]===quote)return i+1;
  }
  throw new SyntaxError('Unterminated CSS string');
}
function urlEnd(source,start){
  let depth=1;
  for(let i=start;i<source.length;i++){
    if(source[i]==='\\'){i++;continue;}
    if(source[i]==='"'||source[i]==="'"){i=quoteEnd(source,i)-1;continue;}
    if(source[i]==='(')depth++;
    if(source[i]===')'&&--depth===0)return i+1;
  }
  return source.length;
}
function cssRanges(source){
  const ranges=[];
  for(let i=0;i<source.length;){
    if(source[i]==='\\'){i+=2;continue;}
    if(source[i]==='"'||source[i]==="'"){i=quoteEnd(source,i);continue;}
    if(source.startsWith('/*',i)){
      const end=source.indexOf('*/',i+2);
      if(end===-1)throw new SyntaxError('Unterminated CSS comment');
      ranges.push({start:i,end:end+2});i=end+2;continue;
    }
    if((source[i]==='u'||source[i]==='U')&&!/[\w\\-]/.test(source[i-1]??'')){
      const match=/^url\s*\(/i.exec(source.slice(i));
      if(match){i=urlEnd(source,i+match[0].length);continue;}
    }
    i++;
  }
  return ranges;
}
function tagEnd(source,start){
  let quote=null;
  for(let i=start+1;i<source.length;i++){
    if(quote){if(source[i]===quote)quote=null;continue;}
    if(source[i]==='"'||source[i]==="'"){quote=source[i];continue;}
    if(source[i]==='>')return i+1;
  }
  return source.length;
}
function htmlRanges(source){
  const ranges=[];
  for(let i=0;i<source.length;){
    if(source.startsWith('<!--',i)){
      const end=source.indexOf('-->',i+4);
      if(end===-1)throw new SyntaxError('Unterminated HTML comment');
      ranges.push({start:i,end:end+3});i=end+3;continue;
    }
    if(source.startsWith('<![CDATA[',i)){
      const end=source.indexOf(']]>',i+9);i=end===-1?source.length:end+3;continue;
    }
    if(source[i]==='<'&&/[A-Za-z/!?]/.test(source[i+1]??'')){
      const end=tagEnd(source,i),tag=/^<([A-Za-z][\w:-]*)\b/.exec(source.slice(i,end));
      i=end;
      if(tag&&rawElements.has(tag[1].toLowerCase())){
        const closing=new RegExp('</'+tag[1]+'(?=[\\s/>])','ig');closing.lastIndex=i;
        const match=closing.exec(source);i=match?match.index:source.length;
      }
      continue;
    }
    i++;
  }
  return ranges;
}
export function stripCodeComments(source,extension='.js'){
  if(typeof source!=='string')throw new TypeError('Source must be a string');
  extension=extension.toLowerCase();
  if(!extensions.has(extension))throw new RangeError('Unsupported code extension: '+extension);
  const ranges=['.js','.mjs','.cjs'].includes(extension)?javascriptRanges(source,extension):extension==='.css'?cssRanges(source):htmlRanges(source);
  const chunks=[];let cursor=0,removed=0,preserved=0;
  for(const {start,end}of ranges){
    const comment=source.slice(start,end);
    chunks.push(source.slice(cursor,start));
    if(notice.test(comment)||comment.startsWith('/*!')||(start===0&&comment.startsWith('#!'))){chunks.push(comment);preserved++;}
    else{chunks.push(comment.replace(/[^\r\n\u2028\u2029]/g,' '));removed++;}
    cursor=end;
  }
  chunks.push(source.slice(cursor));
  return {code:chunks.join(''),removed,preserved};
}
function isExcluded(path){return path.split(sep).some(part=>excluded.has(part));}
function cleanCommentPadding(source,code){
  let offset=0;
  return code.replace(/[^\r\n\u2028\u2029]*(?:\r\n|[\r\n\u2028\u2029]|$)/g,line=>{
    const start=offset;offset+=line.length;
    const padding=/[ \t]+(?=(?:\r\n|[\r\n\u2028\u2029])?$)/.exec(line);
    if(!padding)return line;
    const from=start+padding.index,to=from+padding[0].length;
    if(source.slice(from,to)===padding[0])return line;
    return line.slice(0,padding.index)+line.slice(padding.index+padding[0].length);
  });
}
async function collect(path,files){
  path=resolve(path);
  if(isExcluded(path))return;
  const info=await lstat(path);
  if(info.isSymbolicLink())return;
  if(info.isDirectory()){
    const entries=await readdir(path);
    for(const name of entries.sort())await collect(resolve(path,name),files);
  }else if(info.isFile()&&extensions.has(extname(path).toLowerCase()))files.add(path);
}
async function main(args){
  let check=false,options=true;const paths=[];
  for(const arg of args){
    if(options&&arg==='--'){options=false;continue;}
    if(options&&arg==='--check'){check=true;continue;}
    if(options&&(arg==='--help'||arg==='-h')){process.stdout.write(usage);return 0;}
    if(options&&arg.startsWith('-'))throw new Error('Unknown option: '+arg);
    paths.push(arg);
  }
  if(paths.length===0)throw new Error('Explicit file or directory paths are required.\n'+usage);
  const files=new Set();
  for(const path of paths)await collect(path,files);
  const results=[];let ordinary=0,preserved=0;
  for(const path of [...files].sort()){
    const data=await readFile(path);
    if(data.includes(0)||!isUtf8(data))continue;
    let result;
    try{result=stripCodeComments(data.toString('utf8'),extname(path));}
    catch(error){throw new Error(path+': '+error.message,{cause:error});}
    result.code=cleanCommentPadding(data.toString('utf8'),result.code);
    results.push({path,...result});ordinary+=result.removed;preserved+=result.preserved;
  }
  const changed=results.filter(result=>result.removed>0);
  if(check){
    for(const result of changed)process.stdout.write(result.path+': '+result.removed+' ordinary comments\n');
    process.stdout.write(ordinary+' ordinary comments; scanned '+results.length+' files; preserved '+preserved+' notices/directives.\n');
    return ordinary>0?1:0;
  }
  for(const result of changed)await writeFile(result.path,result.code,'utf8');
  process.stdout.write('Removed '+ordinary+' ordinary comments from '+changed.length+' files; scanned '+results.length+'; preserved '+preserved+' notices/directives.\n');
  return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{process.exitCode=await main(process.argv.slice(2));}
  catch(error){process.stderr.write(error.message+'\n');process.exitCode=2;}
}
