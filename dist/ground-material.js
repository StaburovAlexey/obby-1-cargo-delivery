/** Flat terrain carrying the same small square-stud pattern as the buildings. */
import { GRASS_CHECKER_TEXTURE, createGrassCheckerTextureData, useGrassCheckerTexture } from './square-stud-texture.js';
export const GROUND_TEXTURE = Object.freeze({
  grass: GRASS_CHECKER_TEXTURE,
  concrete: GRASS_CHECKER_TEXTURE,
});
export const REFERENCE_GRASS_COLOR = 0x22e500;
export function createGroundTextureData(kind = 'grass') {
  return { ...createGrassCheckerTextureData(), metadata: { ...GRASS_CHECKER_TEXTURE, kind } };
}
export function createGroundMaterial(THREE, kind = 'grass', color = kind === 'grass' ? REFERENCE_GRASS_COLOR : 0x7d7568) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0,
  });
  material.map = useGrassCheckerTexture(THREE, material);
  material.name = `Original grass checker · ${kind}`;
  material.userData.groundTexture = { ...GRASS_CHECKER_TEXTURE, kind, requestedColor: color };
  return material;
}
