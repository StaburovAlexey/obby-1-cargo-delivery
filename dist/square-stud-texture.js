

export const SQUARE_STUD_STYLE = Object.freeze({
  shape: 'softened square',
  studPitch: 0.4,
  studSize: 0.2,
  cornerRadius: 0.018,
  bevelWidth: 0.016,
  shadowOffset: Object.freeze([0.014, -0.018]),
  shadowSoftness: 0.009,
  highlightDirection: 'upper left',
  shadowDirection: 'lower right',
  flat: true,
});


export const GRASS_CHECKER_TEXTURE = Object.freeze({
  width: 128,
  height: 128,
  channels: 4,
  tileMeters: 4,
  panelMeters: 2,
  panelVariation: true,
  ...SQUARE_STUD_STYLE,
});

export const SQUARE_STUD_TEXTURE = GRASS_CHECKER_TEXTURE;
export const positiveMod = (value, period) => ((value % period) + period) % period;
const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));
const smoothstep = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};
function squareDistance(x, y) {
  const half = SQUARE_STUD_STYLE.studSize / 2;
  const radius = SQUARE_STUD_STYLE.cornerRadius;
  const qx = Math.abs(x) - half + radius;
  const qy = Math.abs(y) - half + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}
function edgeLight(x, y) {
  const inset = SQUARE_STUD_STYLE.studSize / 2 - SQUARE_STUD_STYLE.cornerRadius;
  const qx = Math.abs(x) - inset, qy = Math.abs(y) - inset;
  let nx, ny;
  if (qx > 0 && qy > 0) {
    const length = Math.hypot(qx, qy);
    nx = Math.sign(x) * qx / length;
    ny = Math.sign(y) * qy / length;
  } else if (qx > qy) { nx = Math.sign(x); ny = 0; }
  else { nx = 0; ny = Math.sign(y); }
  return nx * -0.625 + ny * 0.781;
}


export function sampleSquareStud(x, y, { panelMeters = 0, panelVariation = false } = {}) {
  const { studPitch, bevelWidth, shadowOffset, shadowSoftness } = SQUARE_STUD_STYLE;
  const dx = positiveMod(x, studPitch) - studPitch / 2;
  const dy = positiveMod(y, studPitch) - studPitch / 2;
  const distance = squareDistance(dx, dy);
  const coverage = 1 - smoothstep(-0.0015, 0.0015, distance);
  const shadow = 1 - smoothstep(-shadowSoftness, shadowSoftness,
    squareDistance(dx - shadowOffset[0], dy - shadowOffset[1]));
  const bevel = smoothstep(-bevelWidth, -0.001, distance);
  const top = 240 + 1.4 * (dy - dx) / (SQUARE_STUD_STYLE.studSize / 2) + 17 * bevel * edgeLight(dx, dy);
  let value = (235 - 34 * shadow * (1 - coverage)) * (1 - coverage) + top * coverage;
  if (panelMeters > 0) {
    const px = positiveMod(x, panelMeters), py = positiveMod(y, panelMeters);
    const seamDistance = Math.min(px, panelMeters - px, py, panelMeters - py);
    value -= 13 * (1 - smoothstep(0.004, 0.018, seamDistance));

    if (panelVariation) value += ((Math.floor(x / panelMeters) + Math.floor(y / panelMeters)) % 2 === 0 ? 2 : -2);
  }
  return [value, value, value, 255];
}

export function bakeSquareStudData({ width = 128, height = width, tileMeters = 2, panelMeters = 0, samples = 4 } = {}) {
  const data = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    let value = 0;
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      value += sampleSquareStud((px + (sx + 0.5) / samples) / width * tileMeters,
        (py + (sy + 0.5) / samples) / height * tileMeters, { panelMeters, panelVariation: panelMeters > 0 && Math.round(tileMeters / panelMeters) % 2 === 0 })[0];
    }
    const offset = (py * width + px) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = clampByte(value / (samples * samples));
    data[offset + 3] = 255;
  }
  return { data, width, height };
}
export function createSquareStudTextureData() {
  return { ...bakeSquareStudData(SQUARE_STUD_TEXTURE), metadata: SQUARE_STUD_TEXTURE };
}
export const createGrassCheckerTextureData = createSquareStudTextureData;
export function sampleGrassChecker(x, y) {
  return sampleSquareStud(x, y, GRASS_CHECKER_TEXTURE);
}


export function createPatternTexture(THREE, source, name) {
  const texture = new THREE.DataTexture(source.data, source.width, source.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.userData = { ...source.metadata, generatedLocally: true };
  texture.needsUpdate = true;
  return texture;
}
export function createSquareStudTexture(THREE) {
  return createPatternTexture(THREE, createGrassCheckerTextureData(), 'Original grass checker · 4 metre repeat');
}


const sharedCheckers = new WeakMap();
export function useGrassCheckerTexture(THREE, material) {
  let entry = sharedCheckers.get(THREE);
  if (!entry) {
    entry = { texture: createSquareStudTexture(THREE), users: 0 };
    sharedCheckers.set(THREE, entry);
  }
  entry.users++;
  let released = false;
  material.addEventListener('dispose', () => {
    if (released) return;
    released = true;
    if (--entry.users === 0) {
      entry.texture.dispose();
      if (sharedCheckers.get(THREE) === entry) sharedCheckers.delete(THREE);
    }
  });
  return entry.texture;
}
