



const BRAKE_EMISSION = 3;

function isBrakeSwatch(uv, index, model) {
  const u = uv.getX(index), v = uv.getY(index);


  if (model !== 'kamaro') return u >= 0 && u < .05 && v > .38 && v < .51;


  return u > .12 && u < .17 && v > .23 && v < .28;
}




export function attachVehicleBrakeLights(THREE, { scene, normalized, model, resources }) {
  const lamps = [], meshes = [];
  const red = new THREE.Color(0xff0803);
  const toSource = new THREE.Matrix4().copy(normalized.matrixWorld).invert();
  const position = new THREE.Vector3(), transform = new THREE.Matrix4();
  let triangleCount = 0, addedTriangles = 0, disposed = false, amount = 0;

  function adoptLamp(original) {
    const material = original.clone();
    material.userData.vehicleBrakeLamp = true;
    material.userData.vehicleBrakeModel = model;
    resources.materials.add(material);
    lamps.push({ material, color: material.color.clone(), emissive: material.emissive.clone(),
      intensity: material.emissiveIntensity });
    return material;
  }

  const candidates = [];
  scene.traverse(mesh => {
    if (mesh.isMesh && !Array.isArray(mesh.material) &&
        mesh.material.name === (model === 'bmw-g80-m3' ? 'Material.018' : 'light')) candidates.push(mesh);
  });
  for (const mesh of candidates) {
    const source = mesh.geometry, vertices = source.attributes.position, uv = source.attributes.uv;
    const indices = source.index, normal = [], rear = [];
    transform.multiplyMatrices(toSource, mesh.matrixWorld);
    for (let i = 0; i < (indices?.count ?? vertices.count); i += 3) {
      const triangle = [0, 1, 2].map(offset => indices ? indices.getX(i + offset) : i + offset);
      const selected = triangle.every(index => {
        position.fromBufferAttribute(vertices, index).applyMatrix4(transform);
        return position.z < 0 && (model === 'bmw-g80-m3' || (uv && isBrakeSwatch(uv, index, model)));
      });
      (selected ? rear : normal).push(...triangle);
    }
    if (!rear.length) continue;
    const material = adoptLamp(mesh.material);
    if (normal.length) {


      const geometry = source.clone();
      geometry.setIndex([...normal, ...rear]);
      geometry.clearGroups();
      geometry.addGroup(0, normal.length, 0);
      geometry.addGroup(normal.length, rear.length, 1);
      resources.geometries.add(geometry);
      mesh.geometry = geometry;
      mesh.material = [mesh.material, material];
    } else {
      mesh.material = material;
    }
    mesh.userData.vehicleBrakeTriangles = rear.length / 3;
    triangleCount += rear.length / 3;
    meshes.push(mesh);
  }

  if (model === 'lamb') {


    const original = candidates[0]?.material;
    if (!original?.emissiveMap) throw new Error('Lamb requires its audited lamp palette.');
    const material = adoptLamp(original);
    material.color.setHex(0x63100c);
    material.emissiveIntensity = .12;
    const baseline = lamps[lamps.length - 1];
    baseline.color.copy(material.color);
    baseline.intensity = material.emissiveIntensity;
    const ray = new THREE.Raycaster();
    const direction = new THREE.Vector3(0, 0, 1).transformDirection(normalized.matrixWorld);
    for (const side of [-1, 1]) {


      const corners = [[-.125, -.04], [.125, -.04], [.125, .04], [-.125, .04]].map(([dx, dy]) => {
        const point = new THREE.Vector3(side * .60 + dx, .65 + dy, -10);
        ray.set(point.clone().applyMatrix4(normalized.matrixWorld), direction);
        const hit = ray.intersectObject(scene, true).find(hit => hit.object.material?.name === 'metallic');
        if (!hit) throw new Error('Lamb rear brake lens missed its body panel.');
        return hit.point.clone().applyMatrix4(toSource);
      });
      const vertices = [];
      for (const depth of [-.012, .015])
        for (const point of corners) vertices.push(point.x, point.y, point.z + depth);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: 8 }, () => [.02, .42]).flat(), 2));
      geometry.setIndex([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
      geometry.computeVertexNormals();
      resources.geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `Lamb rear ${side < 0 ? 'left' : 'right'} brake lens`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.vehicleBrakeTriangles = 12;
      mesh.userData.vehicleBrakeSupplement = true;
      normalized.add(mesh);
      meshes.push(mesh);
    }
    addedTriangles = 24;
    triangleCount += addedTriangles;
  }
  if (!lamps.length) throw new Error(`No audited rear brake lamps found for ${model}.`);
  const metadata = Object.freeze({ materialCount: lamps.length, meshCount: meshes.length, triangles: triangleCount,
    addedTriangles, emission: BRAKE_EMISSION });
  return {
    metadata,
    get amount() { return amount; },
    set(active) {
      if (disposed) return;
      if (typeof active !== 'boolean' && (typeof active !== 'number' || !Number.isFinite(active)))
        throw new TypeError('Brake light amount must be a boolean or finite number.');
      const next = Math.min(1, Math.max(0, Number(active)));
      if (next === amount) return;
      amount = next;
      for (const lamp of lamps) {
        lamp.material.color.copy(lamp.color).lerp(red, amount);
        lamp.material.emissive.copy(lamp.emissive).lerp(red, amount);
        lamp.material.emissiveIntensity = lamp.intensity + (BRAKE_EMISSION - lamp.intensity) * amount;
      }
    },
    dispose() {
      if (disposed) return;
      this.set(false);
      disposed = true;


    },
  };
}
