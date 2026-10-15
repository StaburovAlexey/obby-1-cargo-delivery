
import { SQUARE_STUD_STYLE, bakeSquareStudData, createPatternTexture } from './square-stud-texture.js';
export const GROUND_TEXTURE = Object.freeze({
  grass: Object.freeze({ width: 128, height: 128, channels: 4, tileMeters: 4, panelMeters: 2, ...SQUARE_STUD_STYLE }),
  concrete: Object.freeze({ width: 128, height: 128, channels: 4, tileMeters: 2, panelMeters: 2, ...SQUARE_STUD_STYLE }),
});
export const REFERENCE_GRASS_COLOR = 0x38b51a;
export function createGroundTextureData(kind = 'grass') {
  const metadata = GROUND_TEXTURE[kind] || GROUND_TEXTURE.concrete;
  return { ...bakeSquareStudData(metadata), metadata: { ...metadata, kind } };
}
export function createGroundMaterial(THREE, kind = 'grass', color = 0x789650) {
  const source = createGroundTextureData(kind);
  const map = createPatternTexture(THREE, source, `Square-stud ${kind} with large panel divisions`);
  const material = new THREE.MeshStandardMaterial({
    color: kind === 'grass' ? REFERENCE_GRASS_COLOR : color,
    map,
    roughness: 0.86,
    metalness: 0,
  });
  material.name = `Flat square-stud ${kind}`;
  material.userData.groundTexture = { ...source.metadata, requestedColor: color };
  let disposed = false;
  material.addEventListener('dispose', () => { if (!disposed) { map.dispose(); disposed = true; } });
  return material;
}
