#!/usr/bin/env node
/**
 * Replace embedded PNG atlases without rewriting geometry or animation data.
 *
 * API: replaceCharacterTextures(glb, {
 *   images: { 0: pngBytes },
 *   materials: { 1: { png: pngBytes, baseColorFactor: [1, 1, 1, 1] } },
 * }) returns a new Buffer. Material mappings must target untextured materials.
 * Their tint defaults to white so previously black materials show the PNG.
 *
 * CLI: node scripts/replace-character-textures.mjs manifest.json
 * Manifest: { "input": "original.glb", "output": "new.glb",
 *   "images": { "0": "atlas.png" },
 *   "materials": { "1": { "png": "body.png" } } }
 * All paths resolve relative to the manifest. Existing GLB bytes are retained
 * as the BIN prefix; replaced image bytes remain there as unreferenced data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pad = (length) => (4 - length % 4) % 4;

function parseGLB(input) {
  if (!(input instanceof Uint8Array)) throw new Error('GLB input must be bytes');
  const bytes = Buffer.from(input);
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB 2.0 header or length');
  const jsonLength = bytes.readUInt32LE(12), binHeader = 20 + jsonLength;
  if (jsonLength % 4 || binHeader + 8 > bytes.length || bytes.readUInt32LE(16) !== JSON_CHUNK) throw new Error('Invalid GLB JSON chunk');
  const binLength = bytes.readUInt32LE(binHeader);
  if (binLength % 4 || bytes.readUInt32LE(binHeader + 4) !== BIN_CHUNK || binHeader + 8 + binLength !== bytes.length) throw new Error('GLB must have one JSON chunk and one BIN chunk');
  let json;
  try { json = JSON.parse(bytes.subarray(20, binHeader).toString('utf8')); }
  catch { throw new Error('Invalid GLB JSON'); }
  const bin = bytes.subarray(binHeader + 8);
  if (json.asset?.version !== '2.0' || json.buffers?.length !== 1 || json.buffers[0].uri !== undefined || !Number.isInteger(json.buffers[0].byteLength) || json.buffers[0].byteLength < 0 || json.buffers[0].byteLength > bin.length || bin.length - json.buffers[0].byteLength > 3) throw new Error('GLB requires one embedded buffer');
  for (const [i, view] of (json.bufferViews || []).entries()) {
    const offset = view.byteOffset ?? 0;
    if (view.buffer !== 0 || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(view.byteLength) || view.byteLength < 1 || offset + view.byteLength > json.buffers[0].byteLength) throw new Error(`Invalid GLB bufferView ${i}`);
  }
  return { json, bin };
}

function mappings(value, label) {
  if (value === undefined) return [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} mappings must be an object`);
  return Object.entries(value).map(([key, item]) => {
    if (!/^(0|[1-9]\d*)$/.test(key) || !Number.isSafeInteger(Number(key))) throw new Error(`Invalid ${label} index ${key}`);
    return [Number(key), item];
  });
}

function pngBytes(input) {
  if (!(input instanceof Uint8Array)) throw new Error('PNG must be bytes');
  const bytes = Buffer.from(input);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) < 1 || bytes.readUInt32BE(20) < 1) throw new Error('Invalid PNG signature or IHDR');
  let cursor = 8, imageData = false;
  while (cursor + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(cursor), end = cursor + length + 12;
    if (end > bytes.length) throw new Error('Truncated PNG chunk');
    const type = bytes.toString('ascii', cursor + 4, cursor + 8);
    if (type === 'IDAT') imageData = true;
    if (type === 'IEND') {
      if (length || end !== bytes.length || !imageData) throw new Error('Invalid PNG IEND');
      return bytes;
    }
    cursor = end;
  }
  throw new Error('PNG is missing IEND');
}

export function replaceCharacterTextures(input, { images, materials } = {}) {
  const { json, bin } = parseGLB(input);
  const originalViewCount = json.bufferViews?.length ?? 0;
  const imageMappings = mappings(images, 'image'), materialMappings = mappings(materials, 'material');
  if (!imageMappings.length && !materialMappings.length) throw new Error('No image or material replacements provided');
  const parts = [bin]; let binLength = bin.length;
  const appendPNG = (bytes) => {
    const alignment = pad(binLength);
    if (alignment) { parts.push(Buffer.alloc(alignment)); binLength += alignment; }
    const view = { buffer: 0, byteOffset: binLength, byteLength: bytes.length };
    parts.push(bytes); binLength += bytes.length;
    json.bufferViews ??= [];
    return json.bufferViews.push(view) - 1;
  };
  for (const [index, bytes] of imageMappings) {
    const image = json.images?.[index];
    if (!image) throw new Error(`Unknown image ${index}`);
    if (image.uri !== undefined || !Number.isInteger(image.bufferView) || image.bufferView < 0 || image.bufferView >= originalViewCount) throw new Error(`Image ${index} must reference an embedded bufferView`);
    image.bufferView = appendPNG(pngBytes(bytes)); image.mimeType = 'image/png';
  }
  for (const [index, mapping] of materialMappings) {
    const material = json.materials?.[index];
    if (!material) throw new Error(`Unknown material ${index}`);
    if (material.pbrMetallicRoughness?.baseColorTexture) throw new Error(`Material ${index} already has a base color texture; replace its image instead`);
    const factor = mapping?.baseColorFactor ?? [1, 1, 1, 1];
    if (!Array.isArray(factor) || factor.length !== 4 || !factor.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error(`Material ${index} baseColorFactor must contain four values between 0 and 1`);
    for (const mesh of json.meshes || []) for (const primitive of mesh.primitives || []) {
      if (primitive.material === index && !Number.isInteger(primitive.attributes?.TEXCOORD_0)) throw new Error(`Material ${index} primitive needs TEXCOORD_0`);
    }
    json.images ??= []; json.textures ??= [];
    const image = json.images.push({ bufferView: appendPNG(pngBytes(mapping?.png)), mimeType: 'image/png' }) - 1;
    const texture = json.textures.push({ source: image }) - 1;
    material.pbrMetallicRoughness ??= {};
    material.pbrMetallicRoughness.baseColorTexture = { index: texture };
    material.pbrMetallicRoughness.baseColorFactor = [...factor];
  }
  json.buffers[0].byteLength = binLength;
  // Original rigs contain -0 in transforms; ordinary JSON.stringify loses it.
  const text = Buffer.from(JSON.stringify(json, (_key, value) => Object.is(value, -0) ? JSON.rawJSON('-0') : value));
  const jsonPadding = pad(text.length), binPadding = pad(binLength);
  const output = Buffer.alloc(28 + text.length + jsonPadding + binLength + binPadding);
  output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(text.length + jsonPadding, 12); output.writeUInt32LE(JSON_CHUNK, 16);
  text.copy(output, 20); output.fill(0x20, 20 + text.length, 20 + text.length + jsonPadding);
  const binHeader = 20 + text.length + jsonPadding;
  output.writeUInt32LE(binLength + binPadding, binHeader); output.writeUInt32LE(BIN_CHUNK, binHeader + 4);
  Buffer.concat(parts, binLength).copy(output, binHeader + 8);
  return output;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/replace-character-textures.mjs manifest.json');
    const manifestPath = path.resolve(process.argv[2]), directory = path.dirname(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (typeof manifest.input !== 'string' || typeof manifest.output !== 'string') throw new Error('Manifest requires input and output paths');
    const images = Object.fromEntries(mappings(manifest.images, 'image').map(([index, filename]) => [index, fs.readFileSync(path.resolve(directory, filename))]));
    const materials = Object.fromEntries(mappings(manifest.materials, 'material').map(([index, mapping]) => [index, { ...mapping, png: fs.readFileSync(path.resolve(directory, mapping.png)) }]));
    const output = replaceCharacterTextures(fs.readFileSync(path.resolve(directory, manifest.input)), { images, materials });
    fs.writeFileSync(path.resolve(directory, manifest.output), output);
    console.log(`Wrote ${manifest.output}: ${output.length} bytes`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
