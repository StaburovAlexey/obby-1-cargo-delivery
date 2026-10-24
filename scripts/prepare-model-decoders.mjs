// Vendor the exact decoder versions in package-lock.json for static npm start
// as well as bundled builds. Does not install or fetch anything.
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
const vendor=new URL('../dist/vendor/',import.meta.url);
const three=new URL('../node_modules/three/examples/jsm/',import.meta.url);
for(const relative of ['loaders/KTX2Loader.js','utils/WorkerPool.js','libs/ktx-parse.module.js','libs/zstddec.module.js','math/ColorSpaces.js']){
  let source=await readFile(new URL(relative,three),'utf8');
  source=source.replaceAll("from 'three'","from './three.module.js'")
    .replaceAll('../utils/','./').replaceAll('../libs/','./').replaceAll('../math/','./')
    .replaceAll("'./basis/basis_transcoder.","'../assets/decoders/basis_transcoder.");
  await writeFile(new URL(relative.split('/').at(-1),vendor),source);
}
await copyFile(new URL('../node_modules/meshoptimizer/meshopt_decoder.mjs',import.meta.url),new URL('meshopt_decoder.module.js',vendor));
await copyFile(new URL('../node_modules/meshoptimizer/LICENSE.md',import.meta.url),new URL('MESHOPT-LICENSE.txt',vendor));
const decoders=new URL('../dist/assets/decoders/',import.meta.url);
await mkdir(decoders,{recursive:true});
for(const name of ['basis_transcoder.js','basis_transcoder.wasm'])await copyFile(new URL('libs/basis/'+name,three),new URL(name,decoders));
console.log('Prepared local Three.js r186 Basis and Meshopt decoders.');
