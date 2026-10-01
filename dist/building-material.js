/** Flat low-poly building and road surfaces. A metric square-stud base is
 * independent from the window overlay, so floors never interrupt stud spacing. */
import { SQUARE_STUD_STYLE, GRASS_CHECKER_TEXTURE, sampleGrassChecker,
  createPatternTexture, createGrassCheckerTextureData, useGrassCheckerTexture } from './square-stud-texture.js';
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
  width: 1024,
  height: 512,
  tileSize: 256,
  columns: 4,
  originalTileSize: 128,
  originalGutter: 64,
  shopTileStart: 3,
  maxAtlasLod: 4,
  channels: 4,
  facadeTile: 0,
  roofTile: 1,
  plainTile: 2,
  facadeWidth: BRICK_STYLE.windowPitchX,
  facadeHeight: BRICK_STYLE.windowPitchY,
  roofPeriod: GRASS_CHECKER_TEXTURE.tileMeters,
  plainWidth: GRASS_CHECKER_TEXTURE.tileMeters,
  plainHeight: GRASS_CHECKER_TEXTURE.tileMeters,
  alphaPurpose: 'Instance-color tint mask, not opacity',
  baseLayer: 'Shared original grass checker; padded atlas contains windows and commercial ground floors',
  tileMeters: GRASS_CHECKER_TEXTURE.tileMeters,
  panelMeters: GRASS_CHECKER_TEXTURE.panelMeters,
  studPitch: SQUARE_STUD_STYLE.studPitch,
  studSize: SQUARE_STUD_STYLE.studSize,
  flat: true,
});

export const ROAD_TEXTURE = GRASS_CHECKER_TEXTURE;

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
/** Five compact code-native storefronts share one atlas and one draw material.
 * No external bitmap/font, decal, transparency, geometry or per-house texture. */
export const STOREFRONT_STYLE = Object.freeze({
  width: 4.8, height: 3.1, belowGrade: 0.5, gutter: 16, contentSize: 224,
  signBottom: 2.53, signTop: 3.04, doorWidth: 0.96, doorHeight: 2.15,
  variants: Object.freeze([
    Object.freeze({ name: 'CAFE', sign: [20, 91, 88], trim: [230, 224, 200], accent: [240, 177, 73] }),
    Object.freeze({ name: 'MARKET', sign: [55, 107, 59], trim: [218, 225, 192], accent: [221, 147, 69] }),
    Object.freeze({ name: 'BOOKS', sign: [48, 71, 119], trim: [226, 219, 188], accent: [196, 92, 75] }),
    Object.freeze({ name: 'BAKERY', sign: [148, 67, 49], trim: [239, 214, 168], accent: [224, 164, 75] }),
    Object.freeze({ name: 'BLOOMS', sign: [107, 70, 114], trim: [232, 220, 203], accent: [229, 136, 163] }),
  ]),
});
// Deliberately legible 5×7 block lettering. The same analytic glyphs make
// atlas bytes, CPU previews and metric diagnostic samples agree.
const SHOP_FONT = Object.freeze({
 A:['01110','10001','10001','11111','10001','10001','10001'],
 B:['11110','10001','10001','11110','10001','10001','11110'],
 C:['01111','10000','10000','10000','10000','10000','01111'],
 E:['11111','10000','10000','11110','10000','10000','11111'],
 F:['11111','10000','10000','11110','10000','10000','10000'],
 K:['10001','10010','10100','11000','10100','10010','10001'],
 L:['10000','10000','10000','10000','10000','10000','11111'],
 M:['10001','11011','10101','10101','10001','10001','10001'],
 O:['01110','10001','10001','10001','10001','10001','01110'],
 R:['11110','10001','10001','11110','10100','10010','10001'],
 S:['01111','10000','10000','01110','00001','00001','11110'],
 T:['11111','00100','00100','00100','00100','00100','00100'],
 Y:['10001','10001','01010','00100','00100','00100','00100'],
});
function shopTextPixel(text, x, y, centerX, centerY, unit) {
  const width = (text.length * 6 - 1) * unit;
  const px = Math.floor((x - centerX + width / 2) / unit);
  const py = Math.floor((centerY + 3.5 * unit - y) / unit);
  if (px < 0 || py < 0 || py >= 7) return false;
  const index = Math.floor(px / 6), column = px % 6;
  return column < 5 && SHOP_FONT[text[index]]?.[py]?.[column] === '1';
}
function inRect(x, y, left, bottom, right, top) {
  return x >= left && x <= right && y >= bottom && y <= top;
}
export function storefrontVariant(shopId, bay = 0) {
  // Integer arithmetic also stays exact in GLSL highp floats for this city.
  return mod(Math.floor(Math.max(1, shopId)) * 3 + bay, STOREFRONT_STYLE.variants.length);
}
export function sampleStorefront(x, y, variant = 0) {
  const index = mod(Math.floor(variant), STOREFRONT_STYLE.variants.length);
  const style = STOREFRONT_STYLE.variants[index], { trim, sign, accent } = style;
  const rgba = color => [...color, 0];
  // The edges are wall-tint mask, never transparency.
  if (x < .13 || x > 4.67) return [255, 255, 255, 255];
  if (y < .22) return rgba(y < .075 ? [70, 77, 73] : trim.map(n => n * .76));
  if (y > 3.04) return rgba(trim);
  if (y >= 2.53) {
    if (shopTextPixel(style.name, x, y, 2.4, 2.785, .051)) return [255, 242, 211, 0];
    if (y < 2.565 || y > 3.0) return rgba(sign.map(n => n * .7));
    // Small paired pinstripes help the sign read without tiny pictograms.
    if ((x < .72 || x > 4.08) && Math.abs(y - 2.785) < .023) return rgba(accent);
    return rgba(sign);
  }
  if (y > 2.40) {
    // Painted valance, flat in the texture. Four styles get distinct stripes.
    if (index === 0 || index === 3 || index === 4)
      return rgba(Math.floor(x / .3) % 2 ? trim : sign);
    return rgba(trim);
  }
  // Display window and separate full-height entrance, both opaque shaded glass.
  const display = inRect(x, y, .27, .38, 3.37, 2.37);
  const door = inRect(x, y, 3.57, .22, 4.53, 2.37);
  if (!display && !door) return rgba(trim);
  if (door && (x < 3.63 || x > 4.47 || y > 2.31 || y < .28)) return rgba(sign.map(n => n * .65));
  if (display && (x < .34 || x > 3.30 || y < .45 || y > 2.30)) return rgba(sign.map(n => n * .65));
  if (display && Math.abs(x - 1.82) < .026) return rgba(trim.map(n => n * .7));
  const sky = Math.max(0, Math.min(1, (y - .3) / 2.1));
  let glass = [25 + 24 * sky, 52 + 44 * sky, 62 + 52 * sky];
  // A warm recessed interior and low shelves read as a shop rather than a
  // larger apartment window. These silhouettes are specific to each trade.
  if (display && y < 1.52) {
    glass = [48 + 10 * sky, 56 + 14 * sky, 55 + 18 * sky];
    if (Math.abs(y - .68) < .045 || (index !== 0 && Math.abs(y - 1.10) < .035)) glass = trim.map(n => n * .49);
    const cell = mod(x - .42, .34), row = y > 1.1 ? 1 : 0, shelfY = row ? 1.12 : .70;
    if (index === 0 && y > .71 && y < .99 && cell < .18) glass = trim;
    if (index === 1 && y > shelfY && y < shelfY + .20 && cell < .26) glass = Math.floor(x * 3) % 2 ? [166, 187, 79] : [205, 110, 67];
    if (index === 2 && y > shelfY && y < shelfY + .23 + .10 * mod(Math.floor(x * 8), 2) && mod(x, .13) < .095)
      glass = Math.floor(x * 8) % 2 ? accent : [201, 165, 92];
    if (index === 3 && y > shelfY && Math.pow((cell - .12) / .12, 2) + Math.pow((y - shelfY) / .17, 2) < 1) glass = accent;
    if (index === 4 && y > .71 && y < 1.38) {
      if (Math.abs(cell - .16) < .021) glass = [87, 134, 75];
      if (Math.hypot(cell - .16, y - 1.20) < .095) glass = Math.floor(x * 3) % 2 ? accent : [220, 192, 99];
      if (y < .92 && cell > .075 && cell < .25) glass = [159, 120, 90];
    }
  }
  const diagonal = mod(x + y * .54, 2.12);
  if (diagonal < .075 || (diagonal > .17 && diagonal < .205)) glass = glass.map((n, i) => n + [32, 39, 43][i]);
  // The handle is 4cm wide and 32cm tall, independent of house size.
  if (door && inRect(x, y, 4.28, .94, 4.32, 1.26)) return [241, 219, 170, 0];
  // A small frosted stripe helps distinguish the entrance from display glazing.
  if (door && y > 1.64 && y < 1.72) glass = [137, 164, 162];
  return rgba(glass);
}
function writePixel(data, offset, pixel) {
  for (let c = 0; c < 4; c++) data[offset + c] = clampByte(pixel[c]);
}
export function buildingAtlasRegion(tile) {
  const shop = tile >= BUILDING_TEXTURE.shopTileStart;
  const gutter = shop ? STOREFRONT_STYLE.gutter : BUILDING_TEXTURE.originalGutter;
  return {
    x: (tile % BUILDING_TEXTURE.columns) * BUILDING_TEXTURE.tileSize + gutter,
    y: Math.floor(tile / BUILDING_TEXTURE.columns) * BUILDING_TEXTURE.tileSize + gutter,
    width: shop ? STOREFRONT_STYLE.contentSize : BUILDING_TEXTURE.originalTileSize,
    height: shop ? STOREFRONT_STYLE.contentSize : BUILDING_TEXTURE.originalTileSize,
    gutter,
  };
}
/** One bounded 2MiB atlas. Duplicated edge texels in every slot protect its
 * independently baked pixels from adjacent tiles through mip level four. */
export function createBuildingTextureData() {
  const { width, height, tileSize } = BUILDING_TEXTURE;
  const data = new Uint8Array(width * height * 4);
  const checker = createGrassCheckerTextureData();
  for (let tile = 0; tile < 8; tile++) {
    const region = buildingAtlasRegion(tile);
    for (let py = 0; py < tileSize; py++) for (let px = 0; px < tileSize; px++) {
      const ix = Math.max(0, Math.min(region.width - 1, px - region.gutter));
      const iy = Math.max(0, Math.min(region.height - 1, py - region.gutter));
      const u = (ix + .5) / region.width, v = (iy + .5) / region.height;
      let pixel;
      if (tile === BUILDING_TEXTURE.facadeTile) pixel = facadePixel(u * BUILDING_TEXTURE.facadeWidth, v * BUILDING_TEXTURE.facadeHeight);
      else if (tile < BUILDING_TEXTURE.shopTileStart) pixel = checker.data.subarray((iy * checker.width + ix) * 4, (iy * checker.width + ix) * 4 + 4);
      else pixel = sampleStorefront(u * STOREFRONT_STYLE.width, v * STOREFRONT_STYLE.height, tile - BUILDING_TEXTURE.shopTileStart);
      const x = (tile % BUILDING_TEXTURE.columns) * tileSize + px;
      const y = Math.floor(tile / BUILDING_TEXTURE.columns) * tileSize + py;
      writePixel(data, (y * width + x) * 4, pixel);
    }
  }
  return { data, width, height, metadata: BUILDING_TEXTURE };
}

export function createRoadTextureData() {
  return createGrassCheckerTextureData();
}

/** CPU equivalent of the metric vertex projection and atlas sampling.
 * Inputs are unit BoxGeometry coordinates/normal and positive instance axis
 * lengths in world metres. Use surfaceUv + tile to render separate repeating
 * tiles; atlasUv is the final coordinate for a single point in the full atlas.
 */
export function projectBuildingSurface(position, normal, scale = [1, 1, 1], { shopBase = 0, shopId = 0 } = {}) {
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
  let shopVariant = -1, shopBay = -1;
  if (face[1] < .5 && shopId > 0 && size[1] >= BRICK_STYLE.windowMinHeight) {
    const side = face[0] > face[2], wallWidth = side ? size[2] : size[0];
    let x = side ? meters[2] : meters[0];
    if ((side && normal[0] > 0) || (!side && normal[2] < 0)) x = wallWidth - x;
    const y = meters[1] - shopBase;
    if (y < STOREFRONT_STYLE.height) {
      tile = BUILDING_TEXTURE.plainTile;
      surfaceUv = [x / BUILDING_TEXTURE.plainWidth, meters[1] / BUILDING_TEXTURE.plainHeight];
      const bays = Math.floor(wallWidth / STOREFRONT_STYLE.width);
      const localX = x - (wallWidth - bays * STOREFRONT_STYLE.width) / 2;
      if (y >= -STOREFRONT_STYLE.belowGrade && localX >= 0 && localX < bays * STOREFRONT_STYLE.width) {
        shopBay = Math.floor(localX / STOREFRONT_STYLE.width);
        shopVariant = storefrontVariant(shopId, shopBay);
        tile = BUILDING_TEXTURE.shopTileStart + shopVariant;
        surfaceUv = [mod(localX, STOREFRONT_STYLE.width) / STOREFRONT_STYLE.width,
          Math.max(0, Math.min(1, y / STOREFRONT_STYLE.height))];
      }
    }
  }
  const region = buildingAtlasRegion(tile);
  const atlasUv = [
    (region.x + .5 + mod(surfaceUv[0], 1) * (region.width - 1)) / BUILDING_TEXTURE.width,
    (region.y + .5 + (shopVariant >= 0 ? surfaceUv[1] : mod(surfaceUv[1], 1)) * (region.height - 1)) / BUILDING_TEXTURE.height,
  ];
  const patternUv = studUv.map(value => value * BRICK_STYLE.studPitch / GRASS_CHECKER_TEXTURE.tileMeters);
  return { tile, surfaceUv, atlasUv, studUv, patternUv, sourceSurfaceUv: sourceSurfaceUv || surfaceUv.slice(), facadeLayout, shopVariant, shopBay };
}

/** Continuous CPU counterpart for offline previews. RGB is the neutral surface
 * color and alpha is the same instance-tint mask used by the runtime shader.
 * Convert RGB to linear before applying the instance's linear RGB tint. */
export function sampleBuildingSurface(position, normal, scale = [1, 1, 1], shop = {}) {
  const projected = projectBuildingSurface(position, normal, scale, shop);
  const base = sampleGrassChecker(projected.studUv[0] * BRICK_STYLE.studPitch,
    projected.studUv[1] * BRICK_STYLE.studPitch);
  if (projected.shopVariant >= 0) {
    const overlay = sampleStorefront(projected.surfaceUv[0] * STOREFRONT_STYLE.width, projected.surfaceUv[1] * STOREFRONT_STYLE.height, projected.shopVariant);
    return overlay[3] === 255 ? base : overlay;
  }
  if (projected.tile !== BUILDING_TEXTURE.facadeTile) return base;
  const overlay = facadePixel(mod(projected.surfaceUv[0], 1) * BUILDING_TEXTURE.facadeWidth,
    mod(projected.surfaceUv[1], 1) * BUILDING_TEXTURE.facadeHeight);
  return overlay[3] === 255 ? base : overlay;
}

export function createBuildingTexture(THREE) {
  const texture = createPatternTexture(THREE, createBuildingTextureData(), 'Padded windows + five commercial storefronts · one shared atlas');
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 1; // Explicit derivative cap and gutters protect every sample footprint.
  return texture;
}
export function createRoadTexture(THREE) {
  return createPatternTexture(THREE, createRoadTextureData(), 'Original grass checker road · four metre repeat');
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
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texture,
    roughness: BRICK_STYLE.roughness,
    metalness: 0,
  });
  const squareStudMap = useGrassCheckerTexture(THREE, material);
  material.name = 'Grass checker buildings + five grade-anchored textured storefronts · metric UV';
  material.defaultAttributeValues = { urShopData: [0, 0] };
  material.squareStudMap = squareStudMap;
  material.userData.squareStudStyle = { ...SQUARE_STUD_STYLE };
  material.userData.brickStyle = { ...BRICK_STYLE };
  material.userData.textureStyle = { ...BUILDING_TEXTURE };
  material.userData.storefrontStyle = { ...STOREFRONT_STYLE };
  material.userData.environmentTexture = { ...GRASS_CHECKER_TEXTURE, projection: 'cuboid metric', windows: true };
  material.customProgramCacheKey = () => 'urban-route-grass-checker-storefront-atlas-v6-shear';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.urSquareStudMap = { value: squareStudMap };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      varying vec2 urStudUv;
      varying vec2 urSurfaceUv;
      varying float urAtlasTile;
      varying vec3 urFacadeLayout;
      attribute vec2 urShopData;
      varying vec4 urShopPosition;`).replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
      #ifdef USE_INSTANCING
        // The default Three instanced normal shortcut assumes orthogonal
        // columns. Houses follow the road with a small horizontal shear, so
        // use the exact inverse transpose (cofactors; normalization removes
        // the common positive determinant) instead.
        mat3 urBasis = mat3(instanceMatrix);
        mat3 urNormalCofactors = mat3(cross(urBasis[1], urBasis[2]),
          cross(urBasis[2], urBasis[0]), cross(urBasis[0], urBasis[1]));
        transformedNormal = normalMatrix * (urNormalCofactors * objectNormal);
        #ifdef FLIP_SIDED
          transformedNormal = -transformedNormal;
        #endif
      #endif`).replace('#include <begin_vertex>', `#include <begin_vertex>
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
      urShopPosition = vec4(0.0);
      if (urFace.y > 0.5) {
        urStudUv = urMeters.xz / ${GRASS_CHECKER_TEXTURE.tileMeters}.0;
        urAtlasTile = ${BUILDING_TEXTURE.roofTile}.0;
        urSurfaceUv = urMeters.xz / ${BUILDING_TEXTURE.roofPeriod.toFixed(1)};
      } else {
        vec2 urWall = urFace.x > urFace.z ? urMeters.zy : urMeters.xy;
        urStudUv = urWall / ${GRASS_CHECKER_TEXTURE.tileMeters}.0;
        float urShopWallWidth = urFace.x > urFace.z ? urSize.z : urSize.x;
        bool urReverseShop = (urFace.x > urFace.z && normal.x > 0.0) || (urFace.x <= urFace.z && normal.z < 0.0);
        urShopPosition = vec4(urReverseShop ? urShopWallWidth - urWall.x : urWall.x,
          urWall.y - urShopData.x, urShopWallWidth,
          urSize.y >= ${BRICK_STYLE.windowMinHeight} ? urShopData.y : 0.0);
        if (urSize.y < ${BRICK_STYLE.windowMinHeight}) {
          urAtlasTile = ${BUILDING_TEXTURE.plainTile}.0;
          urSurfaceUv = urWall / vec2(${BUILDING_TEXTURE.plainWidth.toFixed(1)}, ${BUILDING_TEXTURE.plainHeight.toFixed(1)});
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
      varying vec3 urFacadeLayout;
      varying vec4 urShopPosition;`)
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
        // Derivatives are evaluated outside control flow, before tile changes.
        vec2 urShopDx = dFdx(urShopPosition.xy) / vec2(${STOREFRONT_STYLE.width}, ${STOREFRONT_STYLE.height});
        vec2 urShopDy = dFdy(urShopPosition.xy) / vec2(${STOREFRONT_STYLE.width}, ${STOREFRONT_STYLE.height});
        bool urIsShop = false;
        if (urShopPosition.w > 0.0 && urShopPosition.y < ${STOREFRONT_STYLE.height}) {
          // Entire groundfloor is commercial: no cropped apartment windows in
          // side margins or the portion of a cuboid buried below the street.
          urTile = ${BUILDING_TEXTURE.plainTile}.0;
          float urBays = floor(urShopPosition.z / ${STOREFRONT_STYLE.width});
          float urLocalX = urShopPosition.x - (urShopPosition.z - urBays * ${STOREFRONT_STYLE.width}) * 0.5;
          if (urShopPosition.y >= -${STOREFRONT_STYLE.belowGrade} && urLocalX >= 0.0 && urLocalX < urBays * ${STOREFRONT_STYLE.width}) {
            float urBay = floor(urLocalX / ${STOREFRONT_STYLE.width});
            urTile = ${BUILDING_TEXTURE.shopTileStart}.0 + mod(floor(max(1.0, urShopPosition.w)) * 3.0 + urBay, ${STOREFRONT_STYLE.variants.length}.0);
            urPatternUv = vec2(fract(urLocalX / ${STOREFRONT_STYLE.width}), clamp(urShopPosition.y / ${STOREFRONT_STYLE.height}, 0.0, 1.0));
            urDx = urShopDx; urDy = urShopDy;
            urGradientScale = vec2(1.0);
            urIsShop = true;
          }
        }
        float urInset = urIsShop ? ${STOREFRONT_STYLE.gutter}.0 : ${BUILDING_TEXTURE.originalGutter}.0;
        float urPixels = urIsShop ? ${STOREFRONT_STYLE.contentSize - 1}.0 : ${BUILDING_TEXTURE.originalTileSize - 1}.0;
        vec2 urAtlasScale = vec2(urPixels) / vec2(${BUILDING_TEXTURE.width}.0, ${BUILDING_TEXTURE.height}.0);
        vec2 urOrigin = vec2(mod(urTile, ${BUILDING_TEXTURE.columns}.0), floor(urTile / ${BUILDING_TEXTURE.columns}.0)) * ${BUILDING_TEXTURE.tileSize}.0 + vec2(urInset + 0.5);
        vec2 urLocalUv = urIsShop ? urPatternUv : fract(urPatternUv);
        vec2 urAtlasUv = urOrigin / vec2(${BUILDING_TEXTURE.width}.0, ${BUILDING_TEXTURE.height}.0) + urLocalUv * urAtlasScale;
        float urFootprint = max(length(urDx * urGradientScale), length(urDy * urGradientScale)) * urPixels;
        // Slot gutters stay uncontaminated through LOD4. Cap derivatives there;
        // fade unreadably small detail rather than sampling mixed whole-atlas mips.
        float urSafeGradient = min(1.0, 16.0 / max(urFootprint, 0.0001));
        vec4 urTexel = textureGrad(map, urAtlasUv, urDx * urGradientScale * urAtlasScale * urSafeGradient,
          urDy * urGradientScale * urAtlasScale * urSafeGradient);
        if (!urIsShop && urTile > 0.5) urTexel = vec4(1.0);
        urTexel.a = mix(urTexel.a, 1.0, smoothstep(16.0, 32.0, urFootprint));
        // The base uses uninterrupted metric coordinates, never window cell UVs.
        vec3 urStudColor = textureGrad(urSquareStudMap, urStudUv, dFdx(urStudUv), dFdy(urStudUv)).rgb;
        diffuseColor.rgb = mix(urTexel.rgb, diffuseColor.rgb * urStudColor, urTexel.a);`);
  };
  ownTexture(material, texture);
  return material;
}

/** Road and terrain UVs both store world X/4 and logical forward Y/4. */
export function createRoadMaterial(THREE, color = 0x72747a) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0,
  });
  material.map = useGrassCheckerTexture(THREE, material);
  material.name = 'Original grass checker road · four metre repeat';
  material.userData.textureStyle = { ...ROAD_TEXTURE };
  return material;
}

/** Window-free counterpart for biome barrier cuboids. Instance color supplies
 * each biome's tint; all face sizes use the same metre scale and zero phase. */
export function projectEnvironmentSurface(position, normal, scale = [1, 1, 1]) {
  const meters = position.map((value, axis) => (value + 0.5) * Math.abs(scale[axis]));
  const face = normal.map(Math.abs);
  const surfaceMeters = face[1] > 0.5 ? [meters[0], meters[2]]
    : face[0] > face[2] ? [meters[2], meters[1]] : [meters[0], meters[1]];
  const patternUv = surfaceMeters.map(value => value / GRASS_CHECKER_TEXTURE.tileMeters);
  return { surfaceMeters, patternUv, surfaceUv: patternUv, studUv: surfaceMeters.map(value => value / BRICK_STYLE.studPitch) };
}
export function sampleEnvironmentSurface(position, normal, scale = [1, 1, 1]) {
  const { surfaceMeters } = projectEnvironmentSurface(position, normal, scale);
  return sampleGrassChecker(...surfaceMeters);
}
export function createEnvironmentMaterial(THREE, color = 0xffffff) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0 });
  material.map = useGrassCheckerTexture(THREE, material);
  material.name = 'Original grass checker environment cuboids · metric UV';
  material.userData.environmentPattern = true;
  material.userData.environmentTexture = { ...GRASS_CHECKER_TEXTURE, projection: 'cuboid metric', windows: false };
  material.customProgramCacheKey = () => 'urban-route-grass-checker-environment-v1';
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      varying vec2 urEnvironmentUv;`).replace('#include <begin_vertex>', `#include <begin_vertex>
      mat4 urObjectMatrix = modelMatrix;
      #ifdef USE_INSTANCING
        urObjectMatrix = modelMatrix * instanceMatrix;
      #endif
      vec3 urSize = vec3(length(urObjectMatrix[0].xyz), length(urObjectMatrix[1].xyz), length(urObjectMatrix[2].xyz));
      vec3 urMeters = (position + vec3(0.5)) * urSize;
      vec3 urFace = abs(normal);
      vec2 urMetricFace = urFace.y > 0.5 ? urMeters.xz : (urFace.x > urFace.z ? urMeters.zy : urMeters.xy);
      urEnvironmentUv = urMetricFace / ${GRASS_CHECKER_TEXTURE.tileMeters}.0;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 urEnvironmentUv;`).replace('#include <map_fragment>', `
      vec4 urEnvironmentTexel = textureGrad(map, urEnvironmentUv, dFdx(urEnvironmentUv), dFdy(urEnvironmentUv));
      diffuseColor *= urEnvironmentTexel;`);
  };
  return material;
}
