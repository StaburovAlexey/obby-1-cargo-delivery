// One unlit ground decal per vehicle. Preview and gameplay share its footprint,
// smooth alpha falloff and material settings; no lights or postprocessing.
export const VEHICLE_NEON_GROUND_LIFT = .035;

export function vehicleNeonFootprint(THREE, adapter) {
  const bounds = adapter.metadata?.bounds, box = new THREE.Box3();
  if (bounds?.min?.length === 3 && bounds?.max?.length === 3 &&
      [...bounds.min, ...bounds.max].every(Number.isFinite)) {
    box.min.fromArray(bounds.min); box.max.fromArray(bounds.max);
  } else {
    const group = adapter.group || adapter.body;
    group.updateWorldMatrix(true, true);
    const inverse = group.matrixWorld.clone().invert(), transform = new THREE.Matrix4();
    box.makeEmpty();
    const measure = node => {
      if (node.name === 'vehicle-underglow') return;
      if (node.isMesh && node.geometry) {
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        box.union(node.geometry.boundingBox.clone().applyMatrix4(transform.multiplyMatrices(inverse, node.matrixWorld)));
      }
      for (const child of node.children) measure(child);
    };
    measure(group);
  }
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  return {
    x: center.x, z: center.z,
    y: box.min.y + VEHICLE_NEON_GROUND_LIFT,
    width: size.x * 1.9, length: size.z * 1.45,
  };
}

export function createVehicleNeonGlowResources(THREE) {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot(x / (size - 1) * 2 - 1, y / (size - 1) * 2 - 1);
    const t = Math.min(1, Math.max(0, (radius - .08) / .92));
    const offset = (y * size + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = 255;
    // Zero slope at the core and outside edge; the full border is transparent.
    data[offset + 3] = Math.round(255 * (1 - t * t * (3 - 2 * t)));
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false; texture.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(1, 1), materials = new Set(); let disposed = false;
  return {
    createMaterial(color = 0xffffff) {
      const material = new THREE.MeshBasicMaterial({ color, map: texture, transparent: true, opacity: .78,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
      materials.add(material); return material;
    },
    createGlow(footprint, material, factor = 1, center = { x: 0, y: 0, z: 0 }) {
      const root = new THREE.Group(); root.name = 'vehicle-underglow';
      const halo = new THREE.Mesh(geometry, material); halo.rotation.x = -Math.PI / 2;
      halo.position.set((footprint.x - center.x) * factor, (footprint.y - center.y) * factor, (footprint.z - center.z) * factor);
      halo.scale.set(footprint.width * factor, footprint.length * factor, 1); root.add(halo);
      return root;
    },
    dispose() {
      if (disposed) return; disposed = true;
      geometry.dispose(); texture.dispose();
      for (const material of materials) material.dispose(); materials.clear();
    },
  };
}
