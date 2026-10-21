import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';

export const PASSENGER_MODELS = Object.freeze({
  pickup:'pickup', citycourier:'compact', rover:'offroad', foresthauler:'wagon', van:'minivan',
  desertscout:'hatchback', snowgrip:'sedan', snowrunner:'suv', lavacrawler:'coupe', ashhauler:'sport',
});
export const PASSENGER_TRIANGLES = Object.freeze({
  compact:7257, coupe:6022, hatchback:6808, minivan:7450, offroad:6502,
  pickup:6918, sedan:7122, sport:6268, suv:7951, wagon:6982,
});
export const PASSENGER_URL = new URL('../../dist/assets/vehicles/passenger/', import.meta.url);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function readPassengerAsset(model) {
  const bytes = fs.readFileSync(new URL(`${model}.glb`, PASSENGER_URL));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonSize = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonSize));
  const binStart = 20 + jsonSize;
  assert.equal(bytes.readUInt32LE(binStart + 4), 0x004e4942);
  const bin = bytes.subarray(binStart + 8, binStart + 8 + bytes.readUInt32LE(binStart));
  assert.equal(json.buffers.length, 1);
  assert.equal(json.buffers[0].uri, undefined, `${model}: geometry embedded`);
  const images = json.images.map(image => {
    assert.equal(image.uri, undefined, `${model}: texture embedded`);
    assert.equal(image.mimeType, 'image/png');
    const view = json.bufferViews[image.bufferView];
    const png = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert(width > 0 && width <= 512 && height > 0 && height <= 512, `${model}: compact PNG texture`);
    return {width, height, hash:sha256(png), png};
  });
  let triangles = 0, primitives = 0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4, `${model}: triangle geometry`);
    const accessor = json.accessors[primitive.indices ?? primitive.attributes.POSITION];
    triangles += accessor.count / 3;
    primitives++;
  }
  assert.equal(triangles, PASSENGER_TRIANGLES[model], `${model}: full source triangle count retained`);
  for (const material of json.materials) {
    assert.match(material.name, /^Passenger (Body|Glass|Optics|Wheel|Wheel Trim)$/, `${model}: source material roles`);
    if (!/^Passenger (Wheel|Wheel Trim|Optics)$/.test(material.name)) continue;
    for (const info of [material.pbrMetallicRoughness?.baseColorTexture, material.pbrMetallicRoughness?.metallicRoughnessTexture, material.emissiveTexture, material.normalTexture, material.occlusionTexture].filter(Boolean)) {
      const image = images[json.textures[info.index].source];
      assert(image.width <= 256 && image.height <= 256, `${model}: wheel/optics PNG budget`);
    }
  }
  assert.deepEqual(json.nodes.filter(node => /^Wheel[1-4]$/.test(node.name)).map(node => node.name).sort(), ['Wheel1','Wheel2','Wheel3','Wheel4']);
  return {bytes, json, images, triangles, primitives};
}

export function passengerInventory() {
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', PASSENGER_URL), 'utf8'));
  assert.equal(manifest.files.length, 10);
  assert.deepEqual(manifest.coordinateSystem, {up:'+Y', forward:'+Z', wheelAxle:'X', ground:0});
  assert.deepEqual(fs.readdirSync(PASSENGER_URL).filter(name => name.endsWith('.glb')).sort(), Object.keys(PASSENGER_TRIANGLES).map(model => `${model}.glb`).sort());
  const assets = new Map();
  for (const entry of manifest.files) {
    const model = entry.file.replace(/\.glb$/, '');
    assert(model in PASSENGER_TRIANGLES, `Audited passenger model: ${model}`);
    assert(!assets.has(model), `Unique manifest entry: ${model}`);
    const asset = readPassengerAsset(model);
    assert.equal(asset.bytes.length, entry.bytes);
    assert.equal(sha256(asset.bytes), entry.sha256);
    assets.set(model, asset);
  }
  return {manifest, assets};
}

export function textureHash(texture) {
  const hash = texture.userData.passengerTextureHash ?? texture.name.replace(/^Passenger texture /, '');
  assert.match(hash, /^[a-f0-9]{64}$/, 'pooled passenger texture has a content hash');
  return hash;
}

export function pngPixels(bytes) {
  assert.equal(bytes[24], 8, '8-bit source PNG');
  const channels = {2:3, 3:1, 6:4}[bytes[25]];
  assert(channels, 'RGB/RGBA/indexed source PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), chunks = [];
  let palette;
  for (let p=8; p<bytes.length;) {
    const size = bytes.readUInt32BE(p);
    if (bytes.toString('ascii', p+4, p+8) === 'IDAT') chunks.push(bytes.subarray(p+8, p+8+size));
    if (bytes.toString('ascii', p+4, p+8) === 'PLTE') palette=bytes.subarray(p+8,p+8+size);
    p += size+12;
  }
  const packed = inflateSync(Buffer.concat(chunks)), stride = width*channels, data = Buffer.alloc(stride*height);
  const paeth = (a,b,c) => {const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for (let y=0; y<height; y++) {
    const filter = packed[y*(stride+1)];
    assert(filter >= 0 && filter <= 4);
    for (let x=0; x<stride; x++) {
      const i=y*stride+x, a=x>=channels?data[i-channels]:0, b=y?data[i-stride]:0, c=y&&x>=channels?data[i-stride-channels]:0;
      data[i] = packed[y*(stride+1)+x+1] + [0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
    }
  }
  return (u,v) => {
    const x=Math.min(width-1,Math.max(0,Math.floor(u*width))), y=Math.min(height-1,Math.max(0,Math.floor(v*height)));
    if(palette){const i=data[y*width+x]*3;return Array.from(palette.subarray(i,i+3));}
    return Array.from(data.subarray((y*width+x)*channels,(y*width+x)*channels+3));
  };
}

export function sourceOpticsPolarity(THREE, scene, asset) {
  const optics = asset.json.materials.find(material => material.name === 'Passenger Optics');
  const image = asset.images[asset.json.textures[optics.pbrMetallicRoughness.baseColorTexture.index].source];
  const pixel = pngPixels(image.png), halves = [{red:0, count:0}, {red:0, count:0}];
  scene.updateWorldMatrix(true, true);
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.material.name !== 'Passenger Optics') return;
    const {position, uv} = mesh.geometry.attributes, index = mesh.geometry.index, length = index?.count ?? position.count;
    for (let i=0; i<length; i+=3) {
      const ids = [0,1,2].map(offset => index ? index.getX(i+offset) : i+offset);
      const z = ids.reduce((sum,id) => sum+new THREE.Vector3().fromBufferAttribute(position,id).applyMatrix4(mesh.matrixWorld).z,0)/3;
      const [r,g,b] = pixel(ids.reduce((sum,id)=>sum+uv.getX(id),0)/3, ids.reduce((sum,id)=>sum+uv.getY(id),0)/3);
      const half = halves[z<0?0:1];
      half.red += r>g*1.5 && r>b*1.5 ? 1 : 0;
      half.count++;
    }
  });
  assert(halves.every(half=>half.count>0), 'source optics span front and rear');
  const [rear,front] = halves.map(half=>half.red/half.count);
  assert(rear>front, `source rear red lenses establish +Z nose (${rear} vs ${front})`);
  return {rear, front};
}
