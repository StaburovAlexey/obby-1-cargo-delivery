#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import { MATERIAL_BASELINE_COMMIT, sceneSnapshot, checkProtectedFiles, checkSquareStudSurfaces } from './square-studs.mjs';

// Renderer-free texture, UV, shader construction and resource-lifetime checks.
// Usage: node tests/materials.mjs [scene.js] [material-report.json]
const scenePath = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../dist/scene.js', import.meta.url));
const materialPath = path.join(path.dirname(scenePath), 'building-material.js');
const reportPath = path.resolve(process.argv[3] || fileURLToPath(new URL('./latest-material-report.json', import.meta.url)));
const report = { generatedAt: new Date().toISOString(), threeRevision: THREE.REVISION, scenePath, checks: [], notes: [] };
let failures = 0;
const owned = [];
function check(name, callback) {
  try { const details = callback(); report.checks.push({ name, status: 'passed', ...(details === undefined ? {} : { details }) }); }
  catch (error) { failures++; report.checks.push({ name, status: 'failed', error: error.stack || String(error) }); }
}
function near(actual, expected, message, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} versus ${expected}`);
}
function hash(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function patchShader(material) {
  const shader = { uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms), vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, undefined);
  return shader;
}
function expandChunks(source, seen = []) {
  return source.replace(/#include\s+<([\w]+)>/g, (_, name) => {
    assert.ok(Object.hasOwn(THREE.ShaderChunk, name), `Unknown Three.js shader chunk: ${name}`);
    assert.ok(!seen.includes(name), `Recursive shader chunk: ${name}`);
    return expandChunks(THREE.ShaderChunk[name], [...seen, name]);
  });
}
function collectParts(group) {
  const parts = [];
  group.updateMatrixWorld(true);
  group.traverse((mesh) => {
    if (!mesh.isInstancedMesh) return;
    assert.equal(mesh.userData.partNames?.length, mesh.count, `${mesh.name}: missing instance names`);
    for (let index = 0; index < mesh.count; index++) {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld);
      const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      matrix.decompose(position, rotation, scale);
      parts.push({ name: mesh.userData.partNames[index], mesh, index, matrix, position, rotation, scale });
    }
  });
  return parts;
}

try {
  const source = fs.readFileSync(materialPath, 'utf8');
  const api = await import(pathToFileURL(materialPath));
  const squareApi = await import(pathToFileURL(path.join(path.dirname(scenePath), 'square-stud-texture.js')));
  const groundApi = await import(pathToFileURL(path.join(path.dirname(scenePath), 'ground-material.js')));
  const { createBrickPlasticMaterial, createRoadMaterial, createBuildingTextureData, createRoadTextureData, projectBuildingSurface, BRICK_STYLE, BUILDING_TEXTURE: B, ROAD_TEXTURE: R } = api;
  const { buildCity } = await import(pathToFileURL(scenePath));
  const { collectObstacles } = await import(pathToFileURL(path.join(path.dirname(scenePath), 'city-driving.js')));
  const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/baseline-v7/manifest.json', import.meta.url), 'utf8'));
  for (const name of ['createBrickPlasticMaterial', 'createRoadMaterial', 'createBuildingTextureData', 'createRoadTextureData', 'projectBuildingSurface']) assert.equal(typeof api[name], 'function', `Missing ${name}`);
  const material = createBrickPlasticMaterial(THREE), roadMaterial = createRoadMaterial(THREE);
  owned.push(material, roadMaterial);
  const shader = patchShader(material), materialKey = material.customProgramCacheKey();
  const usesBuildingMaterial = (part) => part.mesh.material.customProgramCacheKey() === materialKey;
  const city = buildCity(THREE, { seed: 42, studs: true }); owned.push(city);
  const parts = collectParts(city.group), buildingParts = parts.filter(usesBuildingMaterial);
  const building = createBuildingTextureData(), road = createRoadTextureData();
  const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  function tilePixel(tile, u, v) {
    const x = tile * B.tileSize + Math.max(0, Math.min(B.tileSize - 1, Math.floor(u * B.tileSize)));
    const y = Math.max(0, Math.min(B.height - 1, Math.floor(v * B.height)));
    return [...building.data.subarray((y * B.width + x) * 4, (y * B.width + x) * 4 + 4)];
  }

  check('Live controller, rig, input and original artwork stay byte-identical; the restyled HUD retains its exact v7 fixture', () => {
    report.protectedFilesBaseline = MATERIAL_BASELINE_COMMIT;
    return checkProtectedFiles(path.dirname(path.dirname(scenePath)), baseline);
  });

  check('Seed 42 wide-road geometry is reproducible with independent material resource ownership', () => {
    const repeat = buildCity(THREE, { seed: 42, studs: false });
    try {
      const snapshot = sceneSnapshot(THREE, city, collectObstacles);
      assert.deepEqual(sceneSnapshot(THREE, repeat, collectObstacles), snapshot);
      assert.notEqual(repeat.group.getObjectByName('Continuous 30m-wide road').material, city.group.getObjectByName('Continuous 30m-wide road').material);
      return snapshot;
    } finally { repeat.dispose(); }
  });

  check('Lit opaque mapped materials preserve instance colors without geometric relief', () => {
    for (const item of [material, roadMaterial]) {
      assert.ok(item.isMeshStandardMaterial && !item.isMeshPhysicalMaterial, 'Expected lightweight standard lit material');
      assert.equal(item.metalness, 0); assert.equal(item.transparent, false); assert.equal(item.opacity, 1); assert.equal(item.alphaTest, 0);
      assert.ok(item.map?.isDataTexture, 'Expected actual baked local texture resource');
      for (const slot of ['displacementMap', 'normalMap', 'bumpMap']) assert.equal(item[slot], null, `${slot} should not create surface relief`);
    }
    assert.equal(material.color.getHex(), 0xffffff);
    near(material.roughness, BRICK_STYLE.roughness, 'Building roughness');
    assert.ok(shader.vertexShader.includes('#include <color_vertex>'));
    assert.match(shader.fragmentShader, /#include <color_fragment>[\s\S]*diffuseColor\.rgb\s*=\s*mix\(urTexel\.rgb,\s*diffuseColor\.rgb\s*\*\s*urStudColor,\s*urTexel\.a\)/);
    assert.ok(!shader.fragmentShader.includes('#include <map_fragment>'), 'Default map alpha would make opaque window-mask pixels transparent');
    return { buildingMaterial: material.type, roadMaterial: roadMaterial.type, textureAlpha: B.alphaPurpose, displacement: false };
  });

  check('Two-sample metric shader separates square studs from window overlay while retaining lighting and shadows', () => {
    for (const [name, text] of Object.entries({ vertex: shader.vertexShader, fragment: shader.fragmentShader })) {
      assert.ok(!/\b(?:undefined|NaN|Infinity)\b/.test(text), `${name}: invalid GLSL interpolation`);
      assert.equal((text.match(/void\s+main\s*\(/g) || []).length, 1);
      assert.ok(!/#include/.test(expandChunks(text)), `${name}: unresolved chunk`);
      assert.equal((text.match(/{/g) || []).length, (text.match(/}/g) || []).length, `${name}: braces`);
    }
    assert.ok(shader.fragmentShader.includes('#include <lights_physical_fragment>'));
    assert.ok(shader.fragmentShader.includes('#include <shadowmap_pars_fragment>'));
    assert.equal((shader.fragmentShader.match(/textureGrad\s*\(/g) || []).length, 2, 'Independent square base plus facade overlay should cost two samples');
    assert.match(shader.fragmentShader, /urDx\s*=\s*dFdx\(urSurfaceUv\),\s*urDy\s*=\s*dFdy\(urSurfaceUv\)/);
    assert.match(shader.fragmentShader, /textureGrad\(map,\s*urAtlasUv,/);
    assert.match(shader.fragmentShader, /textureGrad\(urSquareStudMap,\s*urStudUv,\s*dFdx\(urStudUv\),\s*dFdy\(urStudUv\)\)/);
    assert.equal(shader.uniforms.urSquareStudMap.value, material.squareStudMap);
    assert.ok(shader.fragmentShader.indexOf('dFdx(urSurfaceUv)') < shader.fragmentShader.indexOf('if (urTile < 0.5)'));
    assert.match(shader.vertexShader, /urFullCells\s*=\s*floor/);
    assert.match(shader.fragmentShader, /urPatternUv\.x\s*-=\s*urFacadeLayout\.x/);
    assert.match(shader.vertexShader, /urObjectMatrix\s*=\s*modelMatrix\s*\*\s*instanceMatrix/);
    assert.match(shader.vertexShader, /urMeters\s*=\s*\(position\s*\+\s*vec3\(0\.5\)\)\s*\*\s*urSize/);
    assert.match(shader.vertexShader, /urFace\s*=\s*abs\(normal\)/);
    assert.match(shader.vertexShader, /urWall\s*=\s*urFace\.x\s*>\s*urFace\.z\s*\?\s*urMeters\.zy\s*:\s*urMeters\.xy/);
    for (const axis of [0, 1, 2]) assert.ok(shader.vertexShader.includes(`length(urObjectMatrix[${axis}].xyz)`));
    const second = createBrickPlasticMaterial(THREE); owned.push(second);
    assert.equal(second.customProgramCacheKey(), materialKey);
    const secondShader = patchShader(second);
    assert.equal(secondShader.vertexShader, shader.vertexShader); assert.equal(secondShader.fragmentShader, shader.fragmentShader);
    assert.deepEqual(secondShader.uniforms.urSquareStudMap.value.image.data, shader.uniforms.urSquareStudMap.value.image.data);
    assert.equal(secondShader.uniforms.urSquareStudMap.value, shader.uniforms.urSquareStudMap.value, 'Independent materials must retain the canonical shared grass checker');
    return { cacheKey: materialKey, explicitTextureSamples: 2, derivativeInput: 'Unwrapped metric UVs before fract; separate continuous square-stud coordinates' };
  });

  check('Code-baked RGBA textures are deterministic, independent and small', () => {
    const outputs = [];
    for (const [name, generate, first, metadata] of [['building', createBuildingTextureData, building, B], ['road', createRoadTextureData, road, R]]) {
      const second = generate();
      assert.ok(first.data instanceof Uint8Array);
      assert.equal(first.width, metadata.width); assert.equal(first.height, metadata.height);
      assert.equal(first.data.length, first.width * first.height * 4);
      assert.deepEqual(first.data, second.data); assert.notEqual(first.data.buffer, second.data.buffer);
      assert.ok(Object.isFrozen(metadata));
      const signature = hash(first.data); second.data[0] ^= 255; assert.equal(hash(first.data), signature, 'Regeneration shares a mutable pixel buffer');
      outputs.push({ texture: name, width: first.width, height: first.height, bytes: first.data.length, sha256: signature });
    }
    assert.ok(building.data.length + road.data.length <= 256 * 1024, 'Baked base texture budget exceeds 256 KiB');
    return { textures: outputs, combinedBaseBytes: building.data.length + road.data.length };
  });

  check('Both texture resources repeat with sRGB filtering and generated mipmaps', () => {
    for (const [item, data] of [[material, building], [roadMaterial, road]]) {
      const map = item.map;
      assert.equal(map.wrapS, THREE.RepeatWrapping); assert.equal(map.wrapT, THREE.RepeatWrapping);
      assert.equal(map.colorSpace, THREE.SRGBColorSpace); assert.equal(map.magFilter, THREE.LinearFilter);
      assert.equal(map.minFilter, THREE.LinearMipmapLinearFilter); assert.equal(map.generateMipmaps, true);
      assert.equal(map.format, THREE.RGBAFormat); assert.equal(map.type, THREE.UnsignedByteType);
      assert.deepEqual(map.repeat.toArray(), [1, 1]); assert.deepEqual(map.offset.toArray(), [0, 0]);
      assert.ok(map.version > 0); assert.equal(map.userData.generatedLocally, true);
      assert.deepEqual(map.image.data, data.data);
    }
    return { repeat: 'S and T', filtering: 'Linear / trilinear mipmaps', colorSpace: 'sRGB' };
  });

  check('Window overlay preserves untinted glazing and frames, roof and road bake flat square-stud shading', () => {
    const wall = tilePixel(B.facadeTile, 0.12 / B.facadeWidth, 1.4 / B.facadeHeight);
    const glass = tilePixel(B.facadeTile, 0.95 / B.facadeWidth, 1.4 / B.facadeHeight);
    const frame = tilePixel(B.facadeTile, 0.58 / B.facadeWidth, 1.4 / B.facadeHeight);
    assert.equal(wall[3], 255, 'Wall must receive building palette tint');
    assert.equal(glass[3], 0, 'Glass should retain blue color independent of building tint');
    assert.ok(glass[2] > glass[1] && glass[1] > glass[0], 'Glass is not blue');
    assert.equal(frame[3], 0); assert.ok(frame[0] > 190 && frame[1] > 190, 'Window trim missing');
    for (const tile of [B.roofTile, B.plainTile]) for (let y = 0; y < B.height; y++) for (let x = 0; x < B.tileSize; x++) {
      assert.equal(building.data[(y * B.width + tile * B.tileSize + x) * 4 + 3], 255, 'Roof/plain atlas should always retain tint');
    }
    const roofTones = new Set();
    for (let y = 0; y < B.height; y++) for (let x = 0; x < B.tileSize; x++) roofTones.add(building.data[(y * B.width + B.roofTile * B.tileSize + x) * 4]);
    assert.ok(Math.max(...roofTones) - Math.min(...roofTones) > 30, 'Roof stud highlight/shadow absent');
    const roadTones = new Set();
    for (let i = 0; i < road.data.length; i += 4) {
      assert.equal(road.data[i], road.data[i + 1]); assert.equal(road.data[i], road.data[i + 2]); assert.equal(road.data[i + 3], 255); roadTones.add(road.data[i]);
    }
    assert.ok(Math.max(...roadTones) - Math.min(...roadTones) > 30, 'Road flat stud shading absent');
    return { sampleWall: wall, sampleGlass: glass, sampleFrame: frame, roofToneCount: roofTones.size, roadToneCount: roadTones.size, decorationGeometry: 0 };
  });

  check('Facade, roof and plain-square UV periods stay constant across unlike dimensions and rotations', () => {
    let checks = 0;
    for (const part of buildingParts) for (const normal of faces) {
      const isRoof = Math.abs(normal[1]) > 0.5;
      const axes = isRoof ? [0, 2] : normal[0] ? [2, 1] : [0, 1];
      // Stud coordinates remain metric even when a narrow nose face changes between plain and window atlas masks.
      const periods = [BRICK_STYLE.studPitch, BRICK_STYLE.studPitch];
      for (const [uvAxis, axis] of axes.entries()) {
        const start = [-0.31, -0.23, -0.17], end = [...start]; end[axis] += periods[uvAxis] / part.scale.getComponent(axis);
        const a = projectBuildingSurface(start, normal, part.scale.toArray()), b = projectBuildingSurface(end, normal, part.scale.toArray());
        near(b.studUv[uvAxis] - a.studUv[uvAxis], 1, `${part.name} metric repeat`);
        near(new THREE.Vector3(...start).applyMatrix4(part.matrix).distanceTo(new THREE.Vector3(...end).applyMatrix4(part.matrix)), periods[uvAxis], `${part.name} physical repeat`);
        checks++;
      }
    }
    // Preserve explicit overlay/roof repeat checks on faces large enough to hold a full tile.
    let atlasPeriodChecks = 0;
    for (const size of [[12, 12, 12], [8, 1, 8]]) for (const normal of faces) {
      const roof = Math.abs(normal[1]) > .5, thin = size[1] < BRICK_STYLE.windowMinHeight;
      const axes = roof ? [0, 2] : normal[0] ? [2, 1] : [0, 1];
      const periods = roof ? [B.roofPeriod, B.roofPeriod] : thin ? [B.plainWidth, B.plainHeight] : [B.facadeWidth, B.facadeHeight];
      for (const [uvAxis, axis] of axes.entries()) {
        const start = [0, -.25, 0], end = [...start]; end[axis] += periods[uvAxis] / size[axis];
        const a = projectBuildingSurface(start, normal, size), b = projectBuildingSurface(end, normal, size);
        assert.equal(a.tile, b.tile, 'Controlled repeat sample changed atlas class');
        near(b.surfaceUv[uvAxis] - a.surfaceUv[uvAxis], 1, 'Facade/roof/plain atlas metric repeat');
        near(a.atlasUv[uvAxis], b.atlasUv[uvAxis], 'Facade/roof/plain repeat wraps'); atlasPeriodChecks++;
      }
    }
    const scale = [8.4, 12.9, 10], transform = new THREE.Matrix4().compose(new THREE.Vector3(100, -7, 43), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 1.13, 0.2)), new THREE.Vector3(...scale));
    for (let axis = 0; axis < 3; axis++) near(new THREE.Vector3().setFromMatrixColumn(transform, axis).length(), scale[axis], 'Rotation/translation changed metric scale');
    assert.ok(new Set(buildingParts.map((p) => p.scale.toArray().join(','))).size >= 6);
    return { metricPeriodChecks: checks, atlasPeriodChecks, bodyInstances: buildingParts.length, facadeMeters: [B.facadeWidth, B.facadeHeight], roofMeters: B.roofPeriod };
  });

  check('All cuboid faces, roofs and corners map into repeating atlas tiles without uncovered faces', () => {
    let vertices = 0, wrappedSamples = 0;
    for (const part of buildingParts) {
      const geometry = part.mesh.geometry, position = geometry.attributes.position, normal = geometry.attributes.normal;
      assert.equal(geometry.index.count / 3, 12); assert.equal(position.count, 24);
      const covered = new Set();
      for (let i = 0; i < position.count; i++) {
        const p = [position.getX(i), position.getY(i), position.getZ(i)], n = [normal.getX(i), normal.getY(i), normal.getZ(i)];
        covered.add(n.join(','));
        for (const shift of [0, -2.35, 3.71]) {
          const projection = projectBuildingSurface(p.map((value) => value + shift), n, part.scale.toArray());
          let expected = n[1] ? B.roofTile : part.scale.y < BRICK_STYLE.windowMinHeight ? B.plainTile : B.facadeTile;
          if (expected === B.facadeTile) {
            const axis = n[0] ? 2 : 0, width = part.scale.getComponent(axis);
            const u = (p[axis] + shift + 0.5) * width / B.facadeWidth;
            const v = (p[1] + shift + 0.5) * part.scale.y / B.facadeHeight;
            const columns = Math.floor(width / B.facadeWidth), rows = Math.floor(part.scale.y / B.facadeHeight);
            const margin = (width / B.facadeWidth - columns) / 2;
            assert.deepEqual(projection.facadeLayout, [margin, columns, rows]);
            if (u - margin < 0 || u - margin > columns || v > rows) expected = B.plainTile;
          }
          assert.equal(projection.tile, expected, `${part.name}: wrong face/roof tile`);
          assert.ok([...projection.surfaceUv, ...projection.atlasUv].every(Number.isFinite));
          const minU = (expected * B.tileSize + 0.5) / B.width, maxU = ((expected + 1) * B.tileSize - 0.5) / B.width;
          assert.ok(projection.atlasUv[0] >= minU - 1e-10 && projection.atlasUv[0] <= maxU + 1e-10, 'Atlas U leaves half-texel inset');
          assert.ok(projection.atlasUv[1] >= 0.5 / B.height - 1e-10 && projection.atlasUv[1] <= 1 - 0.5 / B.height + 1e-10, 'Atlas V leaves half-texel inset');
          if (shift === 0) {
            const x = Math.floor(projection.atlasUv[0] * B.width), y = Math.floor(projection.atlasUv[1] * B.height);
            assert.equal(building.data[(y * B.width + x) * 4 + 3], 255, `${part.name}: corner cuts through a window`);
          }
          wrappedSamples++;
        }
        vertices++;
      }
      assert.equal(covered.size, 6, `${part.name}: incomplete face coverage`);
    }
    for (const tile of [B.facadeTile, B.roofTile, B.plainTile]) assert.ok(shader.vertexShader.includes(`urAtlasTile = ${tile}.0;`));
    assert.match(shader.fragmentShader, /fract\(urPatternUv\)\s*\*\s*urAtlasScale/);
    for (const part of buildingParts.filter((p) => /^Residence \d+$/.test(p.name))) for (const normal of faces.filter((n) => n[1] === 0)) {
      const axis = normal[0] ? 2 : 0, width = part.scale.getComponent(axis), columns = Math.floor(width / B.facadeWidth), rows = Math.floor(part.scale.y / B.facadeHeight);
      const marginMeters = (width - columns * B.facadeWidth) / 2;
      for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
        const centerX = marginMeters + (column + 0.5) * B.facadeWidth, centerY = (row + 0.5) * B.facadeHeight;
        assert.ok(centerX - BRICK_STYLE.windowWidth / 2 > 0 && centerX + BRICK_STYLE.windowWidth / 2 < width, 'Window clips a side edge');
        assert.ok(centerY - BRICK_STYLE.windowHeight / 2 > 0 && centerY + BRICK_STYLE.windowHeight / 2 < part.scale.y, 'Window clips roof/base edge');
        const p = [0, centerY / part.scale.y - 0.5, 0]; p[axis] = centerX / width - 0.5;
        assert.equal(projectBuildingSurface(p, normal, part.scale.toArray()).tile, B.facadeTile, 'Complete window center is not mapped to facade');
      }
    }
    return { faceVerticesChecked: vertices, cornerAndWrappedSamples: wrappedSamples, facesPerCuboid: 6, baseLevelInsetPixels: 0.5 };
  });

  check('All roads have continuous four-metre world UVs with no texture seam or geometry relief', () => {
    const mesh = city.group.getObjectByName('Continuous 30m-wide road');
    assert.ok(mesh && !mesh.isInstancedMesh); assert.ok(mesh.material.map?.isDataTexture);
    assert.deepEqual(mesh.material.map.image.data, road.data);
    const p = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
    assert.equal(uv.count, p.count); assert.ok(p.count >= 1000);
    const identicalPoints = new Map();
    for (let i = 0; i < p.count; i++) {
      near(uv.getX(i), p.getX(i) / R.tileMeters, 'Road world X repeat');
      near(uv.getY(i), -p.getZ(i) / R.tileMeters, 'Road world longitudinal repeat');
      const key = [p.getX(i), p.getY(i), p.getZ(i)].join(','), value = [uv.getX(i), uv.getY(i)];
      if (identicalPoints.has(key)) assert.deepEqual(value, identicalPoints.get(key), 'Fork seam changes UV origin');
      identicalPoints.set(key, value);
    }
    assert.equal(mesh.material.displacementMap, null); assert.equal(mesh.material.bumpMap, null);
    return { triangles: mesh.geometry.index.count / 3, vertices: p.count, repeatMeters: R.tileMeters, uvMapping: 'world X and logical Y', geometryRelief: false };
  });

  check('Visible grass uses small deterministic flat textures and world-metric UVs', () => {
    const meshes = [city.group.getObjectByName('Closed continuous terrain foundation')];
    assert.equal(city.group.getObjectByName('Flush textured shoulders and service ground'), undefined, 'Roadside shoulders should stay removed');
    const output = [];
    for (const mesh of meshes) {
      assert.ok(mesh); const item = mesh.material, map = item.map, period = item.userData.groundTexture.tileMeters;
      assert.ok(item.isMeshStandardMaterial && map.isDataTexture); assert.equal(map.image.width, 128); assert.equal(map.image.height, 128);
      assert.equal(map.wrapS, THREE.RepeatWrapping); assert.equal(map.wrapT, THREE.RepeatWrapping); assert.equal(map.colorSpace, THREE.SRGBColorSpace);
      for (const slot of ['displacementMap', 'normalMap', 'bumpMap']) assert.equal(item[slot], null);
      const p = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < -1) continue; // Diorama base underside is not a drivable top face.
        near(uv.getX(i), p.getX(i) / period, 'Ground world X repeat');
        near(uv.getY(i), -p.getZ(i) / period, 'Ground world Y repeat');
      }
      const colors = new Set(); for (let i = 0; i < map.image.data.length; i += 4) { colors.add(map.image.data[i]); assert.equal(map.image.data[i + 3], 255); }
      assert.ok(colors.size > 5, 'Ground is untextured solid color');
      output.push({ mesh: mesh.name, period, baseBytes: map.image.data.length, tones: colors.size });
    }
    return output;
  });

  check('Continuous residence rows share the atlas without decorative detail geometry', () => {
    const homes = parts.filter((part) => /^Residence \d+$/.test(part.name));
    assert.ok(homes.length >= 60, 'Expected continuous road-edge residence rows');
    const towers = parts.filter((part) => part.name === 'Distant tower');
    assert.equal(towers.length, 0);
    for (const part of [...homes, ...towers]) { assert.ok(usesBuildingMaterial(part), `${part.name}: missing mapped material`); assert.ok(part.mesh.instanceColor); }
    const residences = parts.filter((part) => /residences$/i.test(part.mesh.parent.name));
    assert.deepEqual(residences.filter((part) => !/^Residence \d+$|^Terrace plinth$/.test(part.name)).map((p) => p.name), []);
    assert.equal(parts.filter((part) => /stud/i.test(part.name)).length, 0);
    const exclusions = parts.filter((part) => /truck tire|wheel|chassis|cab door|glazing|window/i.test(part.name));
    assert.ok(exclusions.length >= 16, 'Expected wheels, glass and vehicle parts to retain their own materials');
    for (const pattern of [/truck tire/i, /chassis/i, /window/i]) assert.ok(exclusions.some(part => pattern.test(part.name)), `Missing preserved non-building material class ${pattern}`);
    for (const part of exclusions) assert.ok(!usesBuildingMaterial(part), `${part.name}: building texture leaked to the vehicle`);
    assert.equal(new Set(buildingParts.map((part) => part.mesh.material.map)).size, 1, 'Building parts must share one atlas');
    return { mainBodyInstances: homes.length + towers.length, allBuildingAtlasInstances: buildingParts.length, ordinaryResidences: homes.length, residenceBodyTriangles: homes.length * 12, unaffectedNonBuildingParts: exclusions.length, actualStuds: 0 };
  });

  check('Alternate seeds reproduce wide-road geometry and legacy studs never restore geometry relief', () => {
    const seeds = [0, 1, 17, 2026, 2027, 4294967295], results = [];
    for (const seed of seeds) {
      let reference;
      for (const studs of [false, true]) {
        const alternate = buildCity(THREE, { seed, studs });
        try {
          const all = collectParts(alternate.group), homes = all.filter((part) => /^Residence \d+$/.test(part.name));
          assert.ok(homes.length >= 60); assert.equal(all.filter((part) => /stud/i.test(part.name)).length, 0);
          assert.equal(alternate.stats.roofStuds, 0); assert.equal(alternate.stats.studs, false);
          const snapshot = sceneSnapshot(THREE, alternate, collectObstacles);
          if (reference) assert.deepEqual(snapshot, reference, `Seed ${seed}: legacy studs changes geometry`);
          else reference = snapshot;
          for (const part of homes) { assert.equal(part.mesh.geometry.index.count / 3, 12); assert.equal(hash(part.mesh.material.map.image.data), hash(building.data)); }
          results.push({ seed, legacyStudsArgument: studs, residences: homes.length, ...snapshot });
        } finally { alternate.dispose(); }
      }
    }
    assert.notEqual(results.find(r => r.seed === 17).instancesSha256, results.find(r => r.seed === 2026).instancesSha256, 'Distinct seeds must visibly vary scene instances');
    return results;
  });

  check('Generated textures need no downloads, canvas, imported images or models', () => {
    assert.ok(!/\b(?:TextureLoader|ImageLoader|ImageBitmapLoader|CanvasTexture|fetch|Image)\s*\(/.test(source));
    assert.ok(!/https?:\/\//.test(source)); assert.ok(!/document\s*\.|window\s*\./.test(source));
    assert.equal(city.stats.importedModels, 0); assert.equal(city.stats.externalTextures, 0);
    const maps = new Set(); city.group.traverse((object) => { for (const item of [].concat(object.material || [])) for (const value of Object.values(item)) if (value?.isTexture) maps.add(value); });
    assert.equal(maps.size, 2, 'Expected one shared grass checker plus a window overlay');
    assert.ok([...maps].reduce((n, map) => n + map.image.data.length, 0) <= 400 * 1024, 'Shared pattern and overlay exceed 400 KiB');
    return { localTextureResources: maps.size, externalTextures: 0, importedModels: 0, baseTextureBytes: [...maps].reduce((n, map) => n + map.image.data.length, 0) };
  });

  check('Shared checker survives partial disposal and is released exactly once with its final owner', () => {
    // A new namespace key isolates this explicit lifecycle test from other live cities.
    const localThree = { ...THREE }, fresh = buildCity(localThree, { seed: 1234 }), second = buildCity(localThree, { seed: 9 });
    const resources = new Map(), shared = fresh.group.getObjectByName('Continuous 30m-wide road').material.map;
    fresh.group.traverse(object => { for (const item of [].concat(object.material || [])) {
      resources.set(item, 0); for (const texture of Object.values(item).filter(v => v?.isTexture)) resources.set(texture, 0);
    }});
    assert.equal([...resources.keys()].filter(item => item.isTexture).length, 2);
    assert.equal(second.group.getObjectByName('Continuous 30m-wide road').material.map, shared);
    for (const item of resources.keys()) item.addEventListener('dispose', () => resources.set(item, resources.get(item) + 1));
    fresh.dispose();
    for (const [item, calls] of resources) assert.equal(calls, item === shared ? 0 : 1, `${item.name}: incorrect partial disposal`);
    second.dispose(); assert.equal(resources.get(shared), 1, 'Final live city must release checker once');
    const namespace = { ...THREE };
    const direct = [createBrickPlasticMaterial(namespace), createRoadMaterial(namespace), groundApi.createGroundMaterial(namespace, 'grass'), groundApi.createGroundMaterial(namespace, 'concrete'), api.createEnvironmentMaterial(namespace)];
    const counts = new Map();
    for (const item of direct) for (const texture of Object.values(item).filter(value => value?.isTexture)) if (!counts.has(texture)) {
      counts.set(texture, 0); texture.addEventListener('dispose', () => counts.set(texture, counts.get(texture) + 1));
    }
    assert.equal(counts.size, 2);
    for (const item of direct) { item.dispose(); item.dispose(); }
    for (const [texture, count] of counts) assert.equal(count, 1, `${texture.name}: duplicate/missing final disposal`);
    const renewed = createRoadMaterial(namespace); assert.ok(!counts.has(renewed.map), 'Disposed shared map must not be reused'); renewed.dispose();
    return { textureResources: 2, parallelCities: 2, directMaterialOwners: direct.length, prematureCheckerDisposal: false, repeatedDisposeSafe: true };
  });
  checkSquareStudSurfaces({ check, THREE, api, squareApi, groundApi, city, material, roadMaterial, shader, buildingParts, faces });
  report.stats = city.stats;
} catch (error) {
  failures++; report.checks.push({ name: 'Load material and build scene', status: 'failed', error: error.stack || String(error) });
} finally { for (const item of owned) item.dispose(); }
report.notes.push('Node.js checks inspect actual texture bytes, UV/face coverage, shader construction, generated geometry, and disposal events. No GLSL compilation, WebGL rendering, browser interaction, FPS, or visual-quality claim is made.');
report.notes.push('CPU texture filtering and mip averages are audited numerically; real GPU sampler/compiler behavior and visual quality remain unverified without a browser.');
report.passed = failures === 0; report.failedChecks = failures;
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = failures ? 1 : 0;
