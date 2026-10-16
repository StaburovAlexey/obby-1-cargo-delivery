#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const utilityURL = new URL('../scripts/replace-character-textures.mjs', import.meta.url);
const utility = fs.existsSync(utilityURL) ? await import(utilityURL) : {};
assert.equal(typeof utility.replaceCharacterTextures, 'function', 'Texture replacement API must exist');
const { replaceCharacterTextures } = utility;

// A valid 1x1 PNG, independent of the GLB encoder and replacement implementation.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=', 'base64');
const oldPNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
assert.notDeepEqual(png, oldPNG, 'Replacement fixture differs from the old atlas');
const binary = Buffer.concat([Buffer.from(Array.from({ length: 16 }, (_, i) => i + 1)), oldPNG]);
const original = {
  asset: { version: '2.0' },
  buffers: [{ byteLength: binary.length }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 16 }, { buffer: 0, byteOffset: 16, byteLength: oldPNG.length }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: 'VEC4' }],
  images: [{ name: 'original atlas', bufferView: 1, mimeType: 'image/png' }],
  textures: [{ source: 0, sampler: 0 }], samplers: [{ magFilter: 9728 }],
  materials: [
    { name: 'existing', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, roughnessFactor: 0.7 } },
    { name: 'untextured body', pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0.2 } },
    { name: 'untouched head', pbrMetallicRoughness: { baseColorFactor: [0.4, 0.4, 0.4, 1] } },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 0 }, material: 0 }, { attributes: { POSITION: 0, TEXCOORD_0: 0 }, material: 1 }] }],
  skins: [{ joints: [0], inverseBindMatrices: 0 }],
  nodes: [{ name: 'rig', mesh: 0, skin: 0, translation: [-0, 0, 0] }], scenes: [{ nodes: [0] }], scene: 0,
  animations: [{ name: 'running', channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }], samplers: [{ input: 0, output: 0 }] }],
};
function encode(json, bin = binary) {
  // Literal negative zero occurs in the original character node transforms.
  const text = Buffer.from(JSON.stringify(json).replace('"translation":[0,0,0]', '"translation":[-0,0,0]'));
  const jsonChunk = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const result = Buffer.alloc(28 + jsonChunk.length + binChunk.length);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonChunk.length, 12); result.writeUInt32LE(0x4e4f534a, 16); jsonChunk.copy(result, 20);
  result.writeUInt32LE(binChunk.length, 20 + jsonChunk.length); result.writeUInt32LE(0x004e4942, 24 + jsonChunk.length); binChunk.copy(result, 28 + jsonChunk.length);
  return result;
}
function decode(bytes) {
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.subarray(20, 20 + length).toString()), bin: bytes.subarray(28 + length) };
}
function imageBytes(model, imageIndex) {
  const image = model.json.images[imageIndex], view = model.json.bufferViews[image.bufferView];
  return model.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
}

const input = encode(original), before = decode(input);
const output = replaceCharacterTextures(input, { images: { 0: png } });
const after = decode(output);
assert.deepEqual(after.bin.subarray(0, before.bin.length), before.bin, 'Original BIN bytes, including padding, stay intact');
for (const key of ['accessors', 'meshes', 'skins', 'nodes', 'scenes', 'animations', 'textures', 'samplers', 'materials']) assert.deepEqual(after.json[key], original[key], key);
assert.deepEqual(after.json.bufferViews.slice(0, 2), original.bufferViews, 'Existing buffer offsets stay intact');
assert.equal(after.json.images[0].name, 'original atlas');
assert.equal(after.json.images[0].mimeType, 'image/png');
assert.equal(after.json.images[0].bufferView, 2);
assert.equal(after.json.bufferViews[2].byteOffset, before.bin.length);
assert.deepEqual(imageBytes(after, 0), png, 'Replacement PNG is embedded and referenced');
assert.deepEqual(input, encode(original), 'API does not mutate its input buffer');
console.log('PASS embedded replacement preserves geometry, UVs, rig, animations, offsets and original BIN prefix');

const mapped = decode(replaceCharacterTextures(input, { materials: { 1: { png } } }));
assert.deepEqual(mapped.json.materials[0], original.materials[0]);
assert.deepEqual(mapped.json.materials[2], original.materials[2]);
assert.deepEqual(mapped.json.materials[1].pbrMetallicRoughness, {
  baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.2, baseColorTexture: { index: 1 },
});
assert.deepEqual(imageBytes(mapped, mapped.json.textures[1].source), png);
assert.deepEqual(mapped.json.meshes, original.meshes);
assert.deepEqual(mapped.bin.subarray(0, before.bin.length), before.bin);
const tinted = decode(replaceCharacterTextures(input, { materials: { 1: { png, baseColorFactor: [0.8, 0.9, 1, 1] } } }));
assert.deepEqual(tinted.json.materials[1].pbrMetallicRoughness.baseColorFactor, [0.8, 0.9, 1, 1]);
console.log('PASS explicit untextured material mapping adds PNG and resets dark tint without changing other materials');

for (const [label, options, pattern] of [
  ['missing image', { images: { 9: png } }, /image.*9/i],
  ['missing material', { materials: { 9: { png } } }, /material.*9/i],
  ['already textured material', { materials: { 0: { png } } }, /already.*texture/i],
  ['invalid PNG', { images: { 0: Buffer.from('not an image') } }, /PNG/],
  ['invalid tint', { materials: { 1: { png, baseColorFactor: [2, 1, 1, 1] } } }, /baseColorFactor/],
  ['invalid image index', { images: { '-1': png } }, /index/i],
]) assert.throws(() => replaceCharacterTextures(input, options), pattern, label);
const noUV = structuredClone(original); delete noUV.meshes[0].primitives[1].attributes.TEXCOORD_0;
assert.throws(() => replaceCharacterTextures(encode(noUV), { materials: { 1: { png } } }), /TEXCOORD_0/);
const missingView = structuredClone(original); missingView.images[0].bufferView = 99;
assert.throws(() => replaceCharacterTextures(encode(missingView), { images: { 0: png } }), /bufferView/);
const futureView = structuredClone(original); futureView.images.push({ bufferView: 2, mimeType: 'image/png' });
assert.throws(() => replaceCharacterTextures(encode(futureView), { images: { 0: png, 1: png } }), /bufferView/, 'An appended view cannot make an invalid original reference appear valid');
assert.throws(() => replaceCharacterTextures(Buffer.from('broken'), { images: { 0: png } }), /GLB/);
console.log('PASS invalid PNGs, indices, image references, UVs and already textured mappings are rejected');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'character-texture-replacement-'));
try {
  fs.writeFileSync(path.join(temp, 'input.glb'), input); fs.writeFileSync(path.join(temp, 'atlas.png'), png);
  fs.writeFileSync(path.join(temp, 'manifest.json'), JSON.stringify({ input: 'input.glb', output: 'output.glb', images: { 0: 'atlas.png' }, materials: { 1: { png: 'atlas.png' } } }));
  const cli = spawnSync(process.execPath, [fileURLToPath(utilityURL), path.join(temp, 'manifest.json')], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  const result = decode(fs.readFileSync(path.join(temp, 'output.glb')));
  assert.deepEqual(imageBytes(result, 0), png); assert.deepEqual(imageBytes(result, 1), png);
  assert.deepEqual(fs.readFileSync(path.join(temp, 'input.glb')), input);
  console.log('PASS manifest CLI resolves paths relative to manifest and writes the requested output');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
