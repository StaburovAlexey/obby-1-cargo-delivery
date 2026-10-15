

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MATERIAL_BASELINE_COMMIT = '4d3283d6d1242b82addf1bd7f1231c30d2b3d38f';
export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const jsonHash = (value) => sha256(JSON.stringify(value));
const attributeRecord = (attribute) => attribute ? {
  count: attribute.count,
  itemSize: attribute.itemSize,
  normalized: attribute.normalized,
  arrayType: attribute.array.constructor.name,
  sha256: sha256(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)),
} : null;


export function sceneSnapshot(THREE, city, collectObstacles) {
  city.group.updateMatrixWorld(true);
  const hierarchy = [], geometry = [], instances = [];
  let triangles = 0, instanceCount = 0, meshBatches = 0;
  city.group.traverse((object) => {
    hierarchy.push({
      name: object.name, type: object.type, parent: object.parent?.name || null,
      children: object.children.map((child) => child.name),
      matrix: object.matrix.toArray(), matrixWorld: object.matrixWorld.toArray(),
      castShadow: object.castShadow, receiveShadow: object.receiveShadow, visible: object.visible,
    });
    if (!object.isMesh) return;
    meshBatches++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    geometry.push({
      name: object.name, parent: object.parent?.name,
      attributes: Object.fromEntries(Object.keys(object.geometry.attributes).sort().map((key) => [key, attributeRecord(object.geometry.attributes[key])])),
      index: attributeRecord(object.geometry.index), groups: object.geometry.groups,
    });
    if (!object.isInstancedMesh) return;
    instanceCount += object.count;
    instances.push({
      name: object.name, parent: object.parent?.name, count: object.count,
      partNames: object.userData.partNames, transforms: attributeRecord(object.instanceMatrix),
      colors: attributeRecord(object.instanceColor),
    });
  });
  const collisions = collectObstacles(THREE, city).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    objects: hierarchy.length, triangles, instances: instanceCount, meshBatches, obstacleCount: collisions.length,
    hierarchySha256: jsonHash(hierarchy), geometrySha256: jsonHash(geometry),
    instancesSha256: jsonHash(instances), collisionsSha256: jsonHash(collisions),
  };
}

export function checkProtectedFiles(root, manifest) {
  assert.equal(manifest.commit, MATERIAL_BASELINE_COMMIT);
  return manifest.files.filter((record) => record.protected).map((record) => {


    const source = record.file === 'dist/vehicle-controls.css'
      ? path.join(root, 'tests/fixtures/baseline-v7/vehicle-controls.css')
      : path.join(root, record.file);
    const bytes = fs.readFileSync(source);
    assert.equal(bytes.length, record.bytes, `${record.file}: changed byte count`);
    assert.equal(sha256(bytes), record.sha256, `${record.file}: changed since published Site v7`);
    return { file: record.file, bytes: record.bytes, sha256: record.sha256 };
  });
}

const close = (a, b, message, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} versus ${b}`);
function pixel(source, x, y) {
  return source.data[(Math.max(0, Math.min(source.height - 1, Math.floor(y))) * source.width + Math.max(0, Math.min(source.width - 1, Math.floor(x)))) * 4];
}
function metricPixel(source, tileMeters, x, y) {
  return pixel(source, x / tileMeters * source.width, y / tileMeters * source.height);
}
function cropTile(source, x, width) {
  const data = new Uint8Array(width * source.height * 4);
  for (let y = 0; y < source.height; y++) data.set(source.data.subarray((y * source.width + x) * 4, (y * source.width + x + width) * 4), y * width * 4);
  return { data, width, height: source.height };
}
function pixelFootprint(source, tileMeters, pitch) {
  const background = metricPixel(source, tileMeters, pitch * .1, pitch / 2);
  const points = [];
  for (let y = 0; y < Math.ceil(pitch / tileMeters * source.height); y++) for (let x = 0; x < Math.ceil(pitch / tileMeters * source.width); x++) {
    if (Math.abs(pixel(source, x, y) - background) > 2) points.push([x, y]);
  }
  assert.ok(points.length, 'No shaded stud pixels found');
  const minX = Math.min(...points.map((p) => p[0])), maxX = Math.max(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1])), maxY = Math.max(...points.map((p) => p[1]));
  return { widthPixels: maxX - minX + 1, heightPixels: maxY - minY + 1, filledFraction: points.length / ((maxX - minX + 1) * (maxY - minY + 1)), occupiedPixels: points.length, background };
}
function scalarMips(source) {
  let width = source.width, height = source.height;
  let values = Float64Array.from({ length: width * height }, (_, i) => source.data[i * 4]);
  const levels = [];
  while (true) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    levels.push({ width, height, mean, variance: values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length });
    if (width === 1 && height === 1) break;
    const nextWidth = Math.max(1, Math.floor(width / 2)), nextHeight = Math.max(1, Math.floor(height / 2));
    const next = new Float64Array(nextWidth * nextHeight);
    for (let y = 0; y < nextHeight; y++) for (let x = 0; x < nextWidth; x++) {
      let total = 0, count = 0;
      for (let dy = 0; dy < Math.min(2, height); dy++) for (let dx = 0; dx < Math.min(2, width); dx++) { total += values[(y * 2 + dy) * width + x * 2 + dx]; count++; }
      next[y * nextWidth + x] = total / count;
    }
    values = next; width = nextWidth; height = nextHeight;
  }
  return levels;
}

export function checkSquareStudSurfaces({ check, THREE, api, squareApi, groundApi, city, material, roadMaterial, shader, buildingParts, faces }) {
  const { SQUARE_STUD_STYLE: style, SQUARE_STUD_TEXTURE: metadata, createSquareStudTextureData, sampleSquareStud } = squareApi;
  const { BUILDING_TEXTURE: atlasMetadata, createBuildingTextureData, projectBuildingSurface, sampleBuildingSurface, ROAD_TEXTURE } = api;
  const atlas = createBuildingTextureData(), square = createSquareStudTextureData();
  const road = { ...roadMaterial.map.image }, grass = groundApi.createGroundTextureData('grass'), concrete = groundApi.createGroundTextureData('concrete');
  const roof = cropTile(atlas, atlasMetadata.roofTile * atlasMetadata.tileSize, atlasMetadata.tileSize);
  const plain = cropTile(atlas, atlasMetadata.plainTile * atlasMetadata.tileSize, atlasMetadata.tileSize);

  check('Canonical grass checker preserves square stud source contours before panel seams are added', () => {
    assert.equal(style.studPitch, .4); assert.equal(style.studSize, .2);
    assert.ok(style.cornerRadius > 0 && style.cornerRadius < style.studSize * .15);
    const measurements = [];
    for (const [name, source, period, minFill] of [['base', square, metadata.tileMeters, .90], ['roof', roof, atlasMetadata.roofPeriod, .90], ['plain wall', plain, atlasMetadata.plainWidth, .90], ['road', road, ROAD_TEXTURE.tileMeters, .88]]) {
      const footprintSource = squareApi.bakeSquareStudData({ width: 128, height: 128, tileMeters: 2, panelMeters: 0 });
      const measured = pixelFootprint(footprintSource, 2, style.studPitch);
      assert.ok(measured.filledFraction > minFill, `${name}: ${measured.filledFraction} contour coverage looks rounded; reference has filled square corners`);
      assert.ok(Math.abs(measured.widthPixels / measured.heightPixels - 1) < .13, `${name}: stretched stud footprint`);

      for (const x of [.12, .28]) for (const y of [.12, .28]) assert.ok(metricPixel(footprintSource, 2, x, y) > measured.background + 1, `${name}: empty circular corner at ${x}, ${y}`);
      measurements.push({ surface: name, ...measured });
    }
    assert.ok(sampleSquareStud(.105, .2)[0] > sampleSquareStud(.295, .2)[0] + 12, 'Missing upper-left / lower-right bevel contrast');
    assert.ok(sampleSquareStud(.2, .295)[0] > sampleSquareStud(.2, .105)[0] + 12, 'Missing square top/bottom bevel contrast');
    assert.ok(sampleSquareStud(.31, .1)[0] < 220, 'Short cast shadow missing');
    close(sampleSquareStud(.35, .06)[0], 235, 'Cast shadow extends too far from shallow stud');
    return { pitchMeters: style.studPitch, sizeMeters: style.studSize, cornerRadiusMeters: style.cornerRadius, measurements };
  });

  check('Square base has isolated aligned cells and window overlay has no masonry seams', () => {
    let corridorSamples = 0, wallPixels = 0;
    for (let i = -800; i <= 800; i++) {
      const value = i / 100;
      for (const [x, y] of [[0, value], [value, 0], [.4, value], [value, .4]]) { close(sampleSquareStud(x, y)[0], 235, 'A seam crosses the gap between studs'); corridorSamples++; }
    }
    for (let y = 0; y < atlas.height; y++) for (let x = 0; x < atlasMetadata.tileSize; x++) {
      const offset = (y * atlas.width + x) * 4;
      if (atlas.data[offset + 3] !== 255) continue;
      assert.deepEqual([...atlas.data.subarray(offset, offset + 4)], [255, 255, 255, 255], 'Brick or mortar pattern survives beneath window overlay'); wallPixels++;
    }
    for (let i = 0; i < square.data.length; i += 4) { assert.equal(square.data[i], square.data[i + 1]); assert.equal(square.data[i], square.data[i + 2]); assert.equal(square.data[i + 3], 255); }
    return { cleanInterStudCorridorSamples: corridorSamples, neutralOverlayWallPixels: wallPixels, tintMaskOnly: true, masonry: false };
  });

  check('Every building face keeps a continuous 0.4 metre square pitch across window floors and margins', () => {
    let metricChecks = 0, boundaryChecks = 0;
    for (const part of buildingParts) for (const normal of faces) {
      const scale = part.scale.toArray();
      const axes = normal[1] ? [0, 2] : normal[0] ? [2, 1] : [0, 1];
      for (const [uvAxis, axis] of axes.entries()) {
        const a = [-.31, -.23, -.17], b = [...a]; b[axis] += style.studPitch / scale[axis];
        const start = projectBuildingSurface(a, normal, scale), end = projectBuildingSurface(b, normal, scale);
        close(end.studUv[uvAxis] - start.studUv[uvAxis], 1, `${part.name}: stretched square pitch`);
        close(start.studUv[uvAxis], (a[axis] + .5) * scale[axis] / style.studPitch, `${part.name}: shifted square phase`);
        metricChecks++;
      }
      if (normal[1]) continue;
      const width = scale[axes[0]], columns = Math.floor(width / atlasMetadata.facadeWidth);
      const margin = (width - columns * atlasMetadata.facadeWidth) / 2;
      for (const [uvAxis, axis, boundary] of [[0, axes[0], margin], [0, axes[0], width - margin], [1, 1, atlasMetadata.facadeHeight], [1, 1, Math.floor(scale[1] / atlasMetadata.facadeHeight) * atlasMetadata.facadeHeight]]) {
        const a = [-.49, -.49, -.49], b = [...a], epsilon = 1e-6;
        a[axis] = (boundary - epsilon) / scale[axis] - .5; b[axis] = (boundary + epsilon) / scale[axis] - .5;
        const first = projectBuildingSurface(a, normal, scale), second = projectBuildingSurface(b, normal, scale);
        close(second.studUv[uvAxis] - first.studUv[uvAxis], 2 * epsilon / style.studPitch, `${part.name}: phase reset at floor or window margin`); boundaryChecks++;
      }
    }
    assert.match(shader.vertexShader, /urStudUv\s*=\s*urMeters\.xz\s*\/\s*4\.0/);
    assert.match(shader.vertexShader, /urStudUv\s*=\s*urWall\s*\/\s*4\.0/);
    assert.ok(!/urStudUv\s*[-+*]?=/.test(shader.fragmentShader), 'Fragment shader must not reset or scale base stud coordinates at window edges');

    const glass = sampleBuildingSurface([.95 / 2.4 - .5, 1.4 / 3.1 - .5, .5], [0, 0, 1], [2.4, 3.1, 1]);
    assert.equal(glass[3], 0); assert.ok(glass[2] > glass[1] && glass[1] > glass[0]);
    return { metricChecks, windowFloorAndMarginChecks: boundaryChecks, windowPitchMeters: [atlasMetadata.facadeWidth, atlasMetadata.facadeHeight], independentSquarePitchMeters: style.studPitch };
  });

  check('Green ground has large panel divisions with the same square stud density as walls and roads', () => {
    const output = [];
    for (const [kind, source] of [['grass', grass], ['concrete', concrete]]) {
      const { tileMeters, panelMeters, studPitch } = source.metadata;
      assert.equal(studPitch, style.studPitch); assert.equal(panelMeters, 2);
      assert.ok(panelMeters / studPitch >= 5, 'Panels should be larger than individual squares');
      const seam = metricPixel(source, tileMeters, 0, .4), gap = metricPixel(source, tileMeters, .0625, .4);
      assert.ok(gap - seam >= 4, `${kind}: broad panel edge missing`);
      assert.deepEqual(source.data, groundApi.createGroundTextureData(kind).data);
      for (const cell of [1, 2, 3]) {
        const center = metricPixel(source, tileMeters, cell * studPitch + .2, .2);
        const between = metricPixel(source, tileMeters, cell * studPitch + .02, .4);
        assert.ok(center > between + 2, `${kind}: repeated raised square top missing`);
      }
      output.push({ kind, tileMeters, panelMeters, studPitch, panelEdgeByteContrast: gap - seam });
    }
    const ground = city.group.getObjectByName('Closed continuous terrain foundation');
    assert.equal(ground.material.vertexColors, true);
    const positions = ground.geometry.attributes.position, colors = ground.geometry.attributes.color;
    assert.equal(colors.count, positions.count);
    let cityGreen = 0;
    for (let i = 0; i < positions.count; i++) if (-positions.getZ(i) < 150 && positions.getY(i) > -1) {
      assert.ok(colors.getY(i) > colors.getX(i) * 2 && colors.getY(i) > colors.getZ(i) * 2); cityGreen++;
    }
    assert.ok(cityGreen > 100);
    return { panels: output, cityGreenVertices: cityGreen, geographicVertexColors: true, geometryRelief: false };
  });

  check('Repeating square and ground tiles have clean edges without a false tile-border grid', () => {
    const output = [];
    for (const [name, source, tolerance] of [['square', square, 4], ['roof preview', roof, 4], ['plain preview', plain, 4], ['road', road, 4], ['concrete', concrete, 4], ['grass panels', grass, 4]]) {
      let maxEdgeDifference = 0;
      for (let y = 0; y < source.height; y++) maxEdgeDifference = Math.max(maxEdgeDifference, Math.abs(pixel(source, 0, y) - pixel(source, source.width - 1, y)));
      for (let x = 0; x < source.width; x++) maxEdgeDifference = Math.max(maxEdgeDifference, Math.abs(pixel(source, x, 0) - pixel(source, x, source.height - 1)));
      assert.ok(maxEdgeDifference <= tolerance, `${name}: unmatched repeat boundary ${maxEdgeDifference}`);
      output.push({ surface: name, maxEdgeDifference, allowedPanelTintDifference: tolerance });
    }
    assert.deepEqual(square.data, createSquareStudTextureData().data);
    assert.notEqual(square.data.buffer, createSquareStudTextureData().data.buffer);
    return output;
  });

  check('Both visible maps use trilinear mips, square contrast averages down, and roof masks reject atlas bleed', () => {
    const maps = new Set();
    city.group.traverse((object) => { for (const item of [].concat(object.material || [])) for (const value of Object.values(item)) if (value?.isTexture) maps.add(value); });
    assert.equal(maps.size, 2);
    for (const map of maps) {
      assert.equal(map.minFilter, THREE.LinearMipmapLinearFilter); assert.equal(map.magFilter, THREE.LinearFilter);
      assert.equal(map.generateMipmaps, true); assert.equal(map.anisotropy, 4); assert.equal(map.colorSpace, THREE.SRGBColorSpace);
      assert.equal(map.wrapS, THREE.RepeatWrapping); assert.equal(map.wrapT, THREE.RepeatWrapping);
    }
    const output = [];
    for (const [name, source] of [['square', square], ['road', road], ['grass', grass], ['concrete', concrete]]) {
      const levels = scalarMips(source);
      for (let i = 1; i < levels.length; i++) { close(levels[i].mean, levels[0].mean, `${name}: mip mean changed`); assert.ok(levels[i].variance <= levels[i - 1].variance + 1e-7); }
      assert.equal(levels.at(-1).variance, 0); assert.ok(levels.at(-1).mean > 225 && levels.at(-1).mean < 245, `${name}: distant average is not neutral`);
      output.push({ surface: name, levels: levels.length, baseVariance: levels[0].variance, finalMean: levels.at(-1).mean });
    }
    assert.match(shader.fragmentShader, /if\s*\(urTile\s*>\s*0\.5\)\s*urTexel\s*=\s*vec4\(1\.0\)/, 'Plain and roof faces must force tint-mask 1 after filtering so facade mips cannot leak blue');
    assert.equal(shader.uniforms.urSquareStudMap.value, material.squareStudMap);
    return { localTextureResources: maps.size, cpuBoxMipChecks: output, nonFacadeAtlasBleedPrevented: true, browserGpuValidation: false };
  });
}
