// Rebuild runtime copies from untouched source GLBs. No source asset is overwritten.
// Requires KTX-Software 4.4.2: TOKTX=/path/to/toktx npm run optimize:models
import {readFile, writeFile, readdir, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO, PropertyType} from '@gltf-transform/core';
import {ALL_EXTENSIONS, EXTMeshoptCompression, KHRTextureBasisu} from '@gltf-transform/extensions';
import {dedup, prune, weldPrimitive, simplifyPrimitive, reorder, listTextureSlots} from '@gltf-transform/functions';
import {MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from '../dist/vendor/three.module.js';
import {createShowcaseVehicleAdapter} from '../dist/showcase-vehicles.js';
import {SHOWCASE_VEHICLES} from '../dist/showcase-vehicle-catalog.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = path.join(root, 'dist/assets');
const outputRoot = path.join(sourceRoot, 'optimized');
const run = promisify(execFile);
const toktx = process.env.TOKTX || 'toktx';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const cache = path.join(tmpdir(), 'urban-route-ktx-4.4.2-v1');
await mkdir(cache, {recursive: true});
await run(toktx, ['--version']);

function triangles(doc) {
  return doc.getRoot().listMeshes().reduce((n, mesh) => n + mesh.listPrimitives().reduce((m, p) =>
    m + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
}

// Build a CPU-only view of a source document to use the game's exact wheel and
// brake grouping during preparation. Textures are placeholders, never decoded.
function carAdapter(doc, spec) {
  const materials = new Map(doc.getRoot().listMaterials().map(source => {
    const material = new THREE.MeshStandardMaterial();
    material.name = source.getName();
    if (source.getBaseColorTexture()) material.map = new THREE.Texture();
    return [source, material];
  }));
  function node(source) {
    const primitives = source.getMesh()?.listPrimitives() ?? [];
    function mesh(p) {
      const geometry = new THREE.BufferGeometry();
      for (const semantic of p.listSemantics()) {
        const attribute = p.getAttribute(semantic);
        const name = {POSITION:'position', NORMAL:'normal', TEXCOORD_0:'uv', TEXCOORD_1:'uv1', COLOR_0:'color', TANGENT:'tangent'}[semantic];
        if (name) geometry.setAttribute(name, new THREE.BufferAttribute(attribute.getArray(), attribute.getElementSize(), attribute.getNormalized()));
      }
      if (p.getIndices()) geometry.setIndex(new THREE.BufferAttribute(p.getIndices().getArray(), 1));
      const object = new THREE.Mesh(geometry, materials.get(p.getMaterial()));
      object.name = source.getName();
      return object;
    }
    const object = primitives.length === 1 ? mesh(primitives[0]) : new THREE.Group();
    if (primitives.length > 1) for (const p of primitives) object.add(mesh(p));
    object.name = source.getName();
    object.matrix.fromArray(source.getMatrix());
    object.matrixAutoUpdate = false;
    for (const child of source.listChildren()) object.add(node(child));
    return object;
  }
  const scene = new THREE.Group();
  for (const child of doc.getRoot().listScenes()[0].listChildren()) scene.add(node(child));
  return createShowcaseVehicleAdapter(THREE, spec, {scene}).setLocked(false);
}

function simplifyCar(doc, spec) {
  const before = carAdapter(doc, spec);
  const wheelMaterials = new Set();
  for (const wheel of before.wheels) wheel.spin.traverse(mesh => {
    for (const material of [].concat(mesh.material ?? [])) wheelMaterials.add(material.name);
  });
  const contacts = before.metadata.wheelContacts;
  before.dispose();
  // These are completely enclosed by the now opaque Phoenix windows. Keep
  // underbody, suspension, wheels, glass and every lamp node.
  const removed = [];
  if (spec.id === 'phoenixinterceptor') for (const node of doc.getRoot().listNodes()) {
    if (/Phoenix445_(Interior_|Steering_Wheel_)/.test(node.getName())) {
      removed.push(node.getName());
      const mesh = node.getMesh();
      node.dispose();
      if (mesh && !mesh.listParents().some(p => p.propertyType === PropertyType.NODE)) mesh.dispose();
    }
  }
  const protectedName = /Glass|Brakelights|Headlights|Reverse|Blinkers|Coplights|lambert16SG/i;
  const limits = primitive => {
    const values = primitive.getAttribute('POSITION').getArray();
    const bounds = [Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    for (let i=0;i<values.length;i++) {
      const axis=i%3; bounds[axis]=Math.min(bounds[axis],values[i]);
      bounds[axis+3]=Math.max(bounds[axis+3],values[i]);
    }
    return bounds;
  };
  for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const name = primitive.getMaterial()?.getName() ?? '';
    if (wheelMaterials.has(name) || protectedName.test(name) || protectedName.test(mesh.getName())) continue;
    if ((primitive.getIndices()?.getCount() ?? 0) < 900) continue;
    // weld/simplify dispose unshared source accessors. Keep independent clones
    // for fallback rather than reattaching disposed graph properties.
    const oldIndices=primitive.getIndices()?.clone(), oldAttributes=primitive.listSemantics().map(s=>[s,primitive.getAttribute(s).clone()]);
    const oldBounds=limits(primitive);
    weldPrimitive(primitive);
    simplifyPrimitive(primitive, {simplifier: MeshoptSimplifier, ratio: .65, error: .0003, lockBorder: true});
    // Adapters derive normalization from geometry bounds. Keep those extrema
    // byte-exact instead of allowing even a tiny change to wheel calibration.
    if (limits(primitive).some((value,i)=>value!==oldBounds[i])) {
      primitive.setIndices(oldIndices);
      for (const [semantic,accessor] of oldAttributes) primitive.setAttribute(semantic,accessor);
    }
  }
  const after = carAdapter(doc, spec);
  // Stop preparation if wheel extraction or vehicle normalization has changed.
  for (const wheel of after.metadata.wheelContacts) {
    const original = contacts.find(v => v.name === wheel.name);
    if (!original || Math.abs(original.radius-wheel.radius) > .001 ||
      wheel.center.some((v, i) => Math.abs(v-original.center[i]) > .001)) {
      throw new Error(`Optimization moved a wheel: ${spec.id}/${wheel.name}`);
    }
  }
  after.dispose();
  return {removed, wheelMaterials: [...wheelMaterials]};
}

async function compressTextures(doc) {
  const details = [];
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const slots = listTextureSlots(texture);
    const srgb = slots.some(slot => /baseColor|emissive/i.test(slot));
    // Normals, material data, small decals and lamp masks favor fidelity.
    const highQuality = !srgb || /lamp|light|glass/i.test(texture.getName()) || texture.listParents().some(p =>
      p.propertyType === PropertyType.MATERIAL && /Glass|Light|lambert16SG/i.test(p.getName()));
    const mode = highQuality ? 'uastc' : 'etc1s';
    const key = digest(Buffer.concat([Buffer.from(`${mode}/${srgb}/1024/mips/q255/v1/`), image]));
    const target = path.join(cache, key + '.ktx2');
    let bytes;
    try { bytes = await readFile(target); } catch {
      const temp = await mkdtemp(path.join(tmpdir(), 'obby-texture-'));
      try {
        const input = path.join(temp, 'texture.png');
        await sharp(image).resize({width:1024, height:1024, fit:'inside', withoutEnlargement:true}).png().toFile(input);
        const args = ['--t2', '--encode', mode, '--genmipmap', '--threads', '2',
          '--assign_oetf', srgb ? 'srgb' : 'linear', '--assign_primaries', srgb ? 'bt709' : 'none'];
        if (highQuality) args.push('--uastc_quality', '2', '--zcmp', '18');
        else args.push('--qlevel', '255', '--clevel', '2');
        args.push(target, input);
        await run(toktx, args, {maxBuffer: 2 * 1024 * 1024});
        bytes = await readFile(target);
      } finally { await rm(temp, {recursive:true, force:true}); }
    }
    if (bytes.readUInt32LE(12) !== 0 || ![1,2].includes(bytes.readUInt32LE(44))) {
      throw new Error(`Expected Basis-compressed KTX2: ${texture.getName()}`);
    }
    texture.setImage(bytes).setMimeType('image/ktx2');
    details.push({name:texture.getName(), slots, mode, sourceBytes:image.byteLength,
      bytes:bytes.byteLength, width:bytes.readUInt32LE(20), height:bytes.readUInt32LE(24)});
  }
  if (details.length) doc.createExtension(KHRTextureBasisu).setRequired(true);
  return details;
}

const models = ['bacon.glb'];
for (const name of await readdir(path.join(sourceRoot, 'characters'))) {
  if (name.endsWith('.glb') && name !== 'Obby_Jeff_The_Killer.glb') models.push(`characters/${name}`);
}
for (const category of ['passenger', 'bmw', 'showcase']) {
  for (const name of await readdir(path.join(sourceRoot, 'vehicles', category))) {
    if (name.endsWith('.glb')) models.push(`vehicles/${category}/${name}`);
  }
}
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
const report = [];
for (const relative of models.filter(name => !only || name.includes(only))) {
  const source = await readFile(path.join(sourceRoot, relative));
  const doc = await io.readBinary(source);
  const before = triangles(doc);
  await doc.transform(dedup({propertyTypes:[PropertyType.TEXTURE, PropertyType.ACCESSOR]}));
  // NodeIO rewrites referenced buffers, dropping the old orphaned embedded PNGs.
  const repackedBytes = (await io.writeBinary(doc)).byteLength;
  const spec = relative.startsWith('vehicles/showcase/') ? SHOWCASE_VEHICLES.find(v =>
    v.model === path.basename(relative, '.glb')) : null;
  const simplified = spec ? simplifyCar(doc, spec) : null;
  // Removing enclosed geometry can leave an otherwise unused material/atlas.
  // Prune only these resource types; nodes, skins and animations stay intact.
  await doc.transform(prune({propertyTypes:[PropertyType.MATERIAL,PropertyType.TEXTURE]}));
  const textures = await compressTextures(doc);
  // Keep positions, normals, UVs, skin weights and animation values lossless.
  // Reorder changes only storage order; this protects wheel connectivity and
  // the existing sampled character support/animation calibrations.
  await doc.transform(reorder({encoder:MeshoptEncoder, target:'size'}));
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  for (const accessor of doc.getRoot().listAccessors()) if (!accessor.getBuffer()) accessor.setBuffer(buffer);
  doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
  const output = await io.writeBinary(doc);
  const decoded = await io.readBinary(output);
  if (triangles(decoded)!==triangles(doc)) throw new Error(`Geometry round-trip changed triangle count: ${relative}`);
  if (spec) carAdapter(decoded,spec).dispose();
  const destination = path.join(outputRoot, relative);
  await mkdir(path.dirname(destination), {recursive:true});
  await writeFile(destination, output);
  const row = {source:relative, output:`optimized/${relative}`, sourceSHA256:digest(source), sha256:digest(output),
    sourceBytes:source.byteLength, repackedBytes, bytes:output.byteLength,
    trianglesBefore:before, trianglesAfter:triangles(doc), simplified, textures};
  report.push(row);
  console.log(`${relative}: ${source.byteLength} -> ${output.byteLength} bytes; ${before} -> ${row.trianglesAfter} triangles`);
}
await mkdir(path.join(root, 'art/optimized-models'), {recursive:true});
const reportPath = path.join(root, 'art/optimized-models', only ? `manifest-${only.replaceAll('/','-')}.json` : 'manifest.json');
await writeFile(reportPath, JSON.stringify({format:1, encoder:'KTX-Software 4.4.2',
  meshopt:'lossless geometry and animation buffers', models:report}, null, 2) + '\n');

// Keep runtime metadata and literal emitted URLs in sync with the derived files.
const catalogPath=path.join(root,'dist/character-catalog.js');
let catalog=await readFile(catalogPath,'utf8');
for(const row of report.filter(r=>r.source==='bacon.glb'||r.source.startsWith('characters/'))){
  catalog=catalog.split('\n').map(line=>{
    if(!line.includes(`assets/${row.source}`)&&!line.includes(`assets/optimized/${row.source}`))return line;
    return line.replace(/"sha256": "[a-f0-9]+"/,`"sha256": "${row.sha256}"`)
      .replace(/"bytes": \d+/,`"bytes": ${row.bytes}`)
      .replace(`./assets/${row.source}`,`./assets/${row.output}`);
  }).join('\n');
}
await writeFile(catalogPath,catalog);
for(const name of ['character.js','cosmo-vehicles.js','bmw-vehicle.js','showcase-vehicle-catalog.js']){
  const filename=path.join(root,'dist',name);
  let contents=await readFile(filename,'utf8');
  for(const row of report)contents=contents.replaceAll(`'./assets/${row.source}'`,`'./assets/${row.output}'`);
  await writeFile(filename,contents);
}
