/** Flat low-poly building and road surfaces. A metric square-stud base is
 * independent from the window overlay, so floors never interrupt stud spacing. */
import { SQUARE_STUD_STYLE, sampleSquareStud, createSquareStudTexture,
  createPatternTexture, bakeSquareStudData } from './square-stud-texture.js';
export { SQUARE_STUD_STYLE, SQUARE_STUD_TEXTURE, createSquareStudTextureData } from './square-stud-texture.js';
export const BRICK_STYLE = Object.freeze({
  ...SQUARE_STUD_STYLE,
  // Legacy dimension names are retained; they now describe a seamless square cell.
  blockWidth: SQUARE_STUD_STYLE.studPitch / 2,
  blockHeight: SQUARE_STUD_STYLE.studPitch / 2,
  jointWidth: 0,
  roughness: 0.42,
  windowWidth: 1.3,
  windowHeight: 1.7,
  windowPitchX: 2.4,
  windowPitchY: 3.1,
  frameWidth: 0.08,
  windowMinHeight: 2.5,
});

export const BUILDING_TEXTURE = Object.freeze({
  width: 384,
  height: 128,
  tileSize: 128,
  channels: 4,
  facadeTile: 0,
  roofTile: 1,
  plainTile: 2,
  facadeWidth: BRICK_STYLE.windowPitchX,
  facadeHeight: BRICK_STYLE.windowPitchY,
  roofPeriod: BRICK_STYLE.studPitch,
  plainWidth: BRICK_STYLE.blockWidth * 2,
  plainHeight: BRICK_STYLE.blockHeight * 2,
  alphaPurpose: 'Instance-color tint mask, not opacity',
  baseLayer: 'Separate metric square-stud map; atlas facade contains window overlay only',
  studPitch: SQUARE_STUD_STYLE.studPitch,
  studSize: SQUARE_STUD_STYLE.studSize,
  flat: true,
});

export const ROAD_TEXTURE = Object.freeze({
  width: 128,
  height: 128,
  channels: 4,
  tileMeters: 2,
  ...SQUARE_STUD_STYLE,
});

const mod = (n, period) => ((n % period) + period) % period;
const clampByte = (n) => Math.max(0, Math.min(255, Math.round(n)));
function facadePixel(x, y) {
  const wall = [255, 255, 255, 255];
  const dx = Math.abs(x - BRICK_STYLE.windowPitchX / 2);
  const centerY = BRICK_STYLE.windowPitchY / 2;
  const dy = Math.abs(y - centerY);
  const halfW = BRICK_STYLE.windowWidth / 2;
  const halfH = BRICK_STYLE.windowHeight / 2;
  // Thin sill and its painted shadow also live entirely in the texture.
  if (dx < halfW + 0.075 && y > centerY - halfH - 0.095 && y < centerY - halfH) {
    return y < centerY - halfH - 0.06 ? [143, 149, 142, 0] : [217, 216, 198, 0];
  }
  if (dx > halfW || dy > halfH) return wall;
  const frame = dx > halfW - BRICK_STYLE.frameWidth || dy > halfH - BRICK_STYLE.frameWidth;
  const mullion = dx < 0.032 || Math.abs(y - centerY - 0.16) < 0.025;
  if (frame || mullion) return [225, 221, 200, 0];
  const light = (y - centerY + halfH) / BRICK_STYLE.windowHeight;
  const reflection = Math.abs(x - BRICK_STYLE.windowPitchX / 2 - (y - centerY) * 0.38 - 0.22) < 0.035 ? 13 : 0;
  return [32 + 15 * light + reflection, 69 + 25 * light + reflection, 88 + 29 * light + reflection, 0];
}
function writePixel(data, offset, pixel) {
  for (let c = 0; c < 4; c++) data[offset + c] = clampByte(pixel[c]);
}

/** Returns independent RGBA bytes and dimensions; safe to call without Three.js. */
export function createBuildingTextureData() {
  const { width, height, tileSize } = BUILDING_TEXTURE;
  const data = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py++) {
    const v = (py + 0.5) / height;
    for (let px = 0; px < width; px++) {
      const tile = Math.floor(px / tileSize);
      const u = ((px % tileSize) + 0.5) / tileSize;
      let pixel;
      if (tile === BUILDING_TEXTURE.facadeTile) {
        pixel = facadePixel(u * BUILDING_TEXTURE.facadeWidth, v * BUILDING_TEXTURE.facadeHeight);
      } else if (tile === BUILDING_TEXTURE.roofTile) {
        pixel = sampleSquareStud(u * BUILDING_TEXTURE.roofPeriod, v * BUILDING_TEXTURE.roofPeriod);
      } else {
        pixel = sampleSquareStud(u * BUILDING_TEXTURE.plainWidth, v * BUILDING_TEXTURE.plainHeight);
      }
      writePixel(data, (py * width + px) * 4, pixel);
    }
  }
  return { data, width, height, metadata: BUILDING_TEXTURE };
}

export function createRoadTextureData() {
  return { ...bakeSquareStudData(ROAD_TEXTURE), metadata: ROAD_TEXTURE };
}

/** CPU equivalent of the metric vertex projection and atlas sampling.
 * Inputs are unit BoxGeometry coordinates/normal and positive instance axis
 * lengths in world metres. Use surfaceUv + tile to render separate repeating
 * tiles; atlasUv is the final coordinate for a single point in the full atlas.
 */
export function projectBuildingSurface(position, normal, scale = [1, 1, 1]) {
  const size = scale.map(Math.abs);
  const meters = position.map((n, i) => (n + 0.5) * size[i]);
  const face = normal.map(Math.abs);
  let tile, surfaceUv, sourceSurfaceUv, studUv, facadeLayout = [0, 0, 0];
  if (face[1] > 0.5) {
    studUv = [meters[0] / BRICK_STYLE.studPitch, meters[2] / BRICK_STYLE.studPitch];
    tile = BUILDING_TEXTURE.roofTile;
    surfaceUv = [meters[0] / BUILDING_TEXTURE.roofPeriod, meters[2] / BUILDING_TEXTURE.roofPeriod];
  } else {
    const side = face[0] > face[2];
    const wall = side ? [meters[2], meters[1]] : [meters[0], meters[1]];
    studUv = wall.map((value) => value / BRICK_STYLE.studPitch);
    if (size[1] < BRICK_STYLE.windowMinHeight) {
      tile = BUILDING_TEXTURE.plainTile;
      surfaceUv = [wall[0] / BUILDING_TEXTURE.plainWidth, wall[1] / BUILDING_TEXTURE.plainHeight];
    } else {
      const columns = Math.floor((side ? size[2] : size[0]) / BUILDING_TEXTURE.facadeWidth);
      const rows = Math.floor(size[1] / BUILDING_TEXTURE.facadeHeight);
      const margin = ((side ? size[2] : size[0]) / BUILDING_TEXTURE.facadeWidth - columns) / 2;
      facadeLayout = [margin, columns, rows];
      sourceSurfaceUv = [wall[0] / BUILDING_TEXTURE.facadeWidth, wall[1] / BUILDING_TEXTURE.facadeHeight];
      surfaceUv = [sourceSurfaceUv[0] - margin, sourceSurfaceUv[1]];
      tile = BUILDING_TEXTURE.facadeTile;
      if (surfaceUv[0] < 0 || surfaceUv[0] > columns || surfaceUv[1] > rows) {
        tile = BUILDING_TEXTURE.plainTile;
        surfaceUv = [wall[0] / BUILDING_TEXTURE.plainWidth, wall[1] / BUILDING_TEXTURE.plainHeight];
      }
    }
  }
  const atlasUv = [
    (tile * BUILDING_TEXTURE.tileSize + 0.5 + mod(surfaceUv[0], 1) * (BUILDING_TEXTURE.tileSize - 1)) / BUILDING_TEXTURE.width,
    (0.5 + mod(surfaceUv[1], 1) * (BUILDING_TEXTURE.height - 1)) / BUILDING_TEXTURE.height,
  ];
  return { tile, surfaceUv, atlasUv, studUv, sourceSurfaceUv: sourceSurfaceUv || surfaceUv.slice(), facadeLayout };
}

/** Continuous CPU counterpart for offline previews. RGB is the neutral surface
 * color and alpha is the same instance-tint mask used by the runtime shader.
 * Convert RGB to linear before applying the instance's linear RGB tint. */
export function sampleBuildingSurface(position, normal, scale = [1, 1, 1]) {
  const projected = projectBuildingSurface(position, normal, scale);
  const base = sampleSquareStud(projected.studUv[0] * BRICK_STYLE.studPitch,
    projected.studUv[1] * BRICK_STYLE.studPitch);
  if (projected.tile !== BUILDING_TEXTURE.facadeTile) return base;
  const overlay = facadePixel(mod(projected.surfaceUv[0], 1) * BUILDING_TEXTURE.facadeWidth,
    mod(projected.surfaceUv[1], 1) * BUILDING_TEXTURE.facadeHeight);
  return overlay[3] === 255 ? base : overlay;
}

export function createBuildingTexture(THREE) {
  return createPatternTexture(THREE, createBuildingTextureData(), 'Window overlay and square-stud preview atlas');
}
export function createRoadTexture(THREE) {
  return createPatternTexture(THREE, createRoadTextureData(), 'Neutral gray square-stud road · two metre repeat');
}
function ownTexture(material, texture) {
  // Three.js does not automatically dispose material maps. The scene already
  // disposes each unique material, so this also releases the texture on rebuild.
  let disposed = false;
  material.addEventListener('dispose', () => {
    if (!disposed) { texture.dispose(); disposed = true; }
  });
}

export function createBrickPlasticMaterial(THREE) {
  const texture = createBuildingTexture(THREE);
  const squareStudMap = createSquareStudTexture(THREE);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texture,
    roughness: BRICK_STYLE.roughness,
    metalness: 0,
  });
  material.name = 'Square-stud buildings with independent window overlay · metric UV';
  material.squareStudMap = squareStudMap;
  material.userData.squareStudStyle = { ...SQUARE_STUD_STYLE };
  material.userData.brickStyle = { ...BRICK_STYLE };
  material.userData.textureStyle = { ...BUILDING_TEXTURE };
  material.customProgramCacheKey = () => 'urban-route-square-stud-window-overlay-v3';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.urSquareStudMap = { value: squareStudMap };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      varying vec2 urStudUv;
      varying vec2 urSurfaceUv;
      varying float urAtlasTile;
      varying vec3 urFacadeLayout;`).replace('#include <begin_vertex>', `#include <begin_vertex>
      // Unit-cuboid coordinates are scaled in metres before projection. Instance
      // translation never shifts floors, and rotation never stretches windows.
      mat4 urObjectMatrix = modelMatrix;
      #ifdef USE_INSTANCING
        urObjectMatrix = modelMatrix * instanceMatrix;
      #endif
      vec3 urSize = vec3(length(urObjectMatrix[0].xyz), length(urObjectMatrix[1].xyz), length(urObjectMatrix[2].xyz));
      vec3 urMeters = (position + vec3(0.5)) * urSize;
      vec3 urFace = abs(normal);
      urFacadeLayout = vec3(0.0);
      if (urFace.y > 0.5) {
        urStudUv = urMeters.xz / ${BRICK_STYLE.studPitch};
        urAtlasTile = ${BUILDING_TEXTURE.roofTile}.0;
        urSurfaceUv = urMeters.xz / ${BUILDING_TEXTURE.roofPeriod};
      } else {
        vec2 urWall = urFace.x > urFace.z ? urMeters.zy : urMeters.xy;
        urStudUv = urWall / ${BRICK_STYLE.studPitch};
        if (urSize.y < ${BRICK_STYLE.windowMinHeight}) {
          urAtlasTile = ${BUILDING_TEXTURE.plainTile}.0;
          urSurfaceUv = urWall / vec2(${BUILDING_TEXTURE.plainWidth}, ${BUILDING_TEXTURE.plainHeight});
        } else {
          urAtlasTile = ${BUILDING_TEXTURE.facadeTile}.0;
          urSurfaceUv = urWall / vec2(${BUILDING_TEXTURE.facadeWidth}, ${BUILDING_TEXTURE.facadeHeight});
          float urWallWidth = urFace.x > urFace.z ? urSize.z : urSize.x;
          vec2 urFullCells = floor(vec2(urWallWidth, urSize.y) / vec2(${BUILDING_TEXTURE.facadeWidth}, ${BUILDING_TEXTURE.facadeHeight}));
          urFacadeLayout = vec3((urWallWidth / ${BUILDING_TEXTURE.facadeWidth} - urFullCells.x) * 0.5, urFullCells);
        }
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D urSquareStudMap;
      varying vec2 urStudUv;
      varying vec2 urSurfaceUv;
      varying float urAtlasTile;
      varying vec3 urFacadeLayout;`)
      // Atlas alpha is a tint mask. Never multiply it into surface opacity.
      .replace('#include <map_fragment>', '')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Compute gradients before any repeating or atlas-region selection.
        vec2 urDx = dFdx(urSurfaceUv), urDy = dFdy(urSurfaceUv);
        vec2 urPatternUv = urSurfaceUv;
        vec2 urGradientScale = vec2(1.0);
        float urTile = urAtlasTile;
        if (urTile < 0.5) {
          urPatternUv.x -= urFacadeLayout.x;
          if (urPatternUv.x < 0.0 || urPatternUv.x > urFacadeLayout.y || urPatternUv.y > urFacadeLayout.z) {
            // Whole cells are centered, leaving window-free side/top margins.
            urTile = ${BUILDING_TEXTURE.plainTile}.0;
            urGradientScale = vec2(${(BUILDING_TEXTURE.facadeWidth / BUILDING_TEXTURE.plainWidth).toFixed(8)}, ${(BUILDING_TEXTURE.facadeHeight / BUILDING_TEXTURE.plainHeight).toFixed(8)});
            urPatternUv = urSurfaceUv * urGradientScale;
          }
        }
        vec2 urAtlasScale = vec2(${(BUILDING_TEXTURE.tileSize - 1) / BUILDING_TEXTURE.width}, ${(BUILDING_TEXTURE.height - 1) / BUILDING_TEXTURE.height});
        vec2 urAtlasUv = (vec2(urTile * ${BUILDING_TEXTURE.tileSize}.0, 0.0) + vec2(0.5)) / vec2(${BUILDING_TEXTURE.width}.0, ${BUILDING_TEXTURE.height}.0) + fract(urPatternUv) * urAtlasScale;
        vec4 urTexel = textureGrad(map, urAtlasUv, urDx * urGradientScale * urAtlasScale, urDy * urGradientScale * urAtlasScale);
        // Coarser atlas mip levels can mix neighboring preview tiles. Those
        // pixels never decorate roofs or plain margins; only the facade uses
        // the window overlay. Its mask is reset before the final composite.
        if (urTile > 0.5) urTexel = vec4(1.0);
        // The base uses uninterrupted metric coordinates, never window cell UVs.
        vec3 urStudColor = textureGrad(urSquareStudMap, urStudUv, dFdx(urStudUv), dFdy(urStudUv)).rgb;
        diffuseColor.rgb = mix(urTexel.rgb, diffuseColor.rgb * urStudColor, urTexel.a);`);
  };
  ownTexture(material, texture);
  ownTexture(material, squareStudMap);
  return material;
}

/** Existing road UVs store world X/2 and logical forward Y/2 across the fork. */
export function createRoadMaterial(THREE, color = 0x727a7d) {
  const texture = createRoadTexture(THREE);
  const material = new THREE.MeshStandardMaterial({
    color,
    map: texture,
    roughness: 0.86,
    metalness: 0,
  });
  material.name = 'Flat square-stud road · two metre repeat';
  material.userData.textureStyle = { ...ROAD_TEXTURE };
  ownTexture(material, texture);
  return material;
}
