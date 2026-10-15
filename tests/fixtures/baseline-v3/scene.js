


import {
  createBrickPlasticMaterial,
  BRICK_STYLE,
} from "./building-material.js";

export const routeHeight = (y) => 11 * smooth((y - 13) / 61);
export const routeCenter = (y) =>
  4.2 * Math.sin(Math.PI * smooth((y + 3) / 88));
function smooth(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}
export function buildCity(THREE, { seed = 42, studs = true } = {}) {
  let state = seed >>> 0 || 1;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const root = new THREE.Group();
  root.name = "Urban Route • procedural city";
  const materials = {
    ivory: 0xe2dac1,
    concrete: 0x9dafa9,
    curb: 0xd0cebc,
    slate: 0x283c45,
    rubber: 0x161c20,
    glass: 0x244d63,
    glassLight: 0x4c8597,
    metal: 0x536766,
    grass: 0x789650,
    leaf: 0x548e27,
    leafLight: 0x86b63d,
    leafDark: 0x376b30,
    trunk: 0x765237,
    soil: 0x444c34,
    orange: 0xf47a12,
    orangeLight: 0xffa025,
    cream: 0xffe8b2,
    red: 0xe44331,
    teal: 0x34847f,
    coral: 0xda785b,
    mustard: 0xe4bd57,
    mint: 0x8fbb92,
    blue: 0x629fb8,
    carton: 0xb78142,
    cartonLight: 0xdca65f,
    tape: 0xf3d496,
    white: 0xf6f1da,
    yellow: 0xffc438,
    lime: 0x9afc53,
    driver: 0x246ea7,
    skin: 0xad7850,
    skyline: 0x91b3b8,
    road: 0x727a7d,
    stud: 0x899195,
  };
  const groups = {},
    batches = new Map(),
    features = [];
  const geos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
    stud: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.ConeGeometry(1, 1, 8),
  };
  const base = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.73,
  });
  const brickPlastic = createBrickPlasticMaterial(THREE);
  const roofPlastic = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: BRICK_STYLE.roughness,
    clearcoat: BRICK_STYLE.clearcoat,
    clearcoatRoughness: 0.22,
  });
  roofPlastic.name = "Smooth toy-plastic roof studs";
  const bright = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5,
    emissive: 0x94fc44,
    emissiveIntensity: 0.55,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe7a0,
    emissive: 0xffd362,
    emissiveIntensity: 1.3,
  });
  let section = "Terrain";
  const V = (x, y, z) => new THREE.Vector3(x, z, -y);
  const matColor = (name) => materials[name] ?? name;
  function group(name) {
    return (
      groups[name] ??
      (groups[name] = Object.assign(new THREE.Group(), { name }))
    );
  }
  function add(type, name, loc, size, color, rot = null, special = "solid") {
    if (
      type === "box" &&
      special === "solid" &&
      /^(Residence |Roof parapet|Front parapet|Flat rooftop|Rooftop access|Depot rear|Depot side|Depot front header|Portal pier|Mini mart$|Shop roof$|Depot roof$|Distant tower$)/.test(
        name,
      )
    )
      special = "brick";
    const key = section + "|" + type + "|" + special;
    if (!batches.has(key))
      batches.set(key, { section, type, special, items: [] });
    const o = new THREE.Object3D();
    o.position.copy(V(...loc));
    o.scale.set(size[0], size[2], size[1]);
    if (rot) {
      o.rotation.set(rot[0] || 0, rot[2] || 0, rot[1] || 0);
    }
    o.updateMatrix();
    batches.get(key).items.push({
      name,
      matrix: o.matrix.clone(),
      color: new THREE.Color(matColor(color)),
    });
    return o;
  }
  const box = (name, loc, size, color, rot) =>
    add("box", name, loc, size, color, rot);
  function cylinder(name, loc, r, depth, color, axis = "Z", type = "cylinder") {
    const rot =
      axis === "X"
        ? [0, 0, Math.PI / 2]
        : axis === "Y"
          ? [Math.PI / 2, 0, 0]
          : null;

    if (axis === "X")
      return add(type, name, loc, [r, r, depth], color, [0, Math.PI / 2, 0]);
    return add(type, name, loc, [r, r, depth], color, rot);
  }
  function beam(name, a, b, width, color, special = "solid") {
    const key = section + "|box|" + special;
    if (!batches.has(key))
      batches.set(key, { section, type: "box", special, items: [] });
    const av = V(...a),
      bv = V(...b),
      o = new THREE.Object3D();
    o.position.copy(av).add(bv).multiplyScalar(0.5);
    o.scale.set(width, av.distanceTo(bv), width);
    o.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      bv.sub(av).normalize(),
    );
    o.updateMatrix();
    batches.get(key).items.push({
      name,
      matrix: o.matrix.clone(),
      color: new THREE.Color(matColor(color)),
    });
  }
  const path = (y, off = 0, z = 0) => {
    const d = (routeCenter(y + 0.01) - routeCenter(y - 0.01)) / 0.02,
      n = 1 / Math.hypot(1, d);
    return [routeCenter(y) + n * off, y - d * n * off, routeHeight(y) + z];
  };
  const yaw = (y) =>
    -Math.atan2(routeCenter(y + 0.1) - routeCenter(y - 0.1), 0.2);
  const slope = (y) =>
    Math.atan2(routeHeight(y + 0.1) - routeHeight(y - 0.1), 0.2);
  function ribbon(name, lo, hi, height, color, start = -23, end = 87) {
    if (lo > hi) [lo, hi] = [hi, lo];
    const positions = [],
      uv = [],
      idx = [];
    const steps = Math.round((end - start) * 2);
    let length = 0,
      prev = null;
    for (let i = 0; i <= steps; i++) {
      let y = start + ((end - start) * i) / steps,
        p = path(y);
      if (prev) length += V(...p).distanceTo(V(...prev));
      prev = p;
      for (let off of [lo, hi]) {
        let v = V(...path(y, off, height));
        positions.push(v.x, v.y, v.z);
        uv.push(off / 2, length / 2);
      }
      if (i < steps) {
        let a = 2 * i;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        color: matColor(color),
        roughness: 0.91,
        side: THREE.DoubleSide,
      }),
    );
    mesh.name = name;
    mesh.receiveShadow = true;
    group(section).add(mesh);
    return mesh;
  }

  section = "Terrain";
  {
    const p = [],
      ix = [],
      rows = 221;
    for (let i = 0; i < rows; i++) {
      let y = -23 + i * 0.5;
      for (let [x, z] of [
        [-32, routeHeight(y) - 0.28],
        [32, routeHeight(y) - 0.28],
        [-32, -1.8],
        [32, -1.8],
      ]) {
        let v = V(x, y, z);
        p.push(v.x, v.y, v.z);
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      let a = i * 4,
        b = a + 4;
      ix.push(
        a,
        a + 1,
        b,
        a + 1,
        b + 1,
        b,
        a + 2,
        b + 2,
        a + 3,
        a + 3,
        b + 2,
        b + 3,
        a,
        b,
        a + 2,
        a + 2,
        b,
        b + 2,
        a + 1,
        a + 3,
        b + 1,
        a + 3,
        b + 3,
        b + 1,
      );
    }
    ix.push(0, 2, 1, 1, 2, 3);
    let a = (rows - 1) * 4;
    ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    let g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(ix);
    g.computeVertexNormals();
    let mesh = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({ color: materials.grass, roughness: 1 }),
    );
    mesh.name = "Closed continuous terrain foundation";
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group(section).add(mesh);
  }
  box("Front teal edge", [0, -23.04, -0.8], [64, 0.15, 0.22], "teal");
  section = "Street";
  ribbon("Continuous 10m-wide road", -5, 5, 0.025, "road");
  for (let y = -20; y < 85; y += 6)
    box("Center dash", path(y, 0, 0.058), [0.16, 2.5, 0.019], "white", [
      slope(y),
      0,
      yaw(y),
    ]);
  for (let s of [-1, 1])
    ribbon("White road edge", s * 4.71, s * 4.78, 0.053, "white");
  for (let x = -4; x <= 4; x += 1.15)
    box("Zebra crossing", path(14, x, 0.08), [0.62, 2.7, 0.025], "white");
  if (studs)
    for (let y = -22.7; y < 87; y += 0.6)
      for (let x = -4.5; x < 4.7; x += 0.6) {
        if (Math.abs(x) < 0.2 || Math.abs(y - 14) < 1.7) continue;
        add(
          "stud",
          "Raised road stud",
          path(y, x, 0.045),
          [0.095, 0.095, 0.032],
          "stud",
          [slope(y), 0, yaw(y)],
        );
      }
  section = "Sidewalks";
  for (let s of [-1, 1]) {
    ribbon("Continuous raised sidewalk", s * 5.05, s * 8, 0.2, "concrete");
    for (let y = -22; y < 87; y += 1.7)
      box("Curb blocks", path(y, s * 5.14, 0.21), [0.3, 1.61, 0.35], "curb", [
        slope(y),
        0,
        yaw(y),
      ]);
    for (let y = -21; y < 87; y += 3)
      beam(
        "Paving seam",
        path(y, s * 5.4, 0.211),
        path(y, s * 7.85, 0.211),
        0.025,
        "curb",
      );
    if (studs)
      for (let y = -22; y < 87; y += 0.8)
        for (let off = 5.65; off < 7.9; off += 0.8)
          add(
            "stud",
            "Pavement stud",
            path(y, s * off, 0.218),
            [0.075, 0.075, 0.022],
            "curb",
            [slope(y), 0, yaw(y)],
          );
    box(
      "Service forecourt",
      [s * 16, -0.3, -0.018],
      [16.1, 35, 0.35],
      "concrete",
    );
    for (let y = -15; y < 17; y += 4)
      box("Plaza joint", [s * 16, y, 0.169], [15.6, 0.026, 0.015], "curb");
  }
  function window(
    x,
    y,
    z,
    w = 1.3,
    hh = 1.7,
    balcony = false,
    transform = null,
  ) {
    const b = (n, p, d, c) => {
      if (transform) {
        const { px, py, a } = transform;
        const [lx, ly, lz] = p;
        p = [
          px + lx * Math.cos(a) - ly * Math.sin(a),
          py + lx * Math.sin(a) + ly * Math.cos(a),
          lz,
        ];
        return box(n, p, d, c, [0, 0, a]);
      }
      return box(n, p, d, c);
    };
    b("Window glass", [x, y, z], [w, 0.11, hh], "glass");
    for (let dx of [-w / 2 - 0.065, w / 2 + 0.065])
      b("Window jamb", [x + dx, y - 0.07, z], [0.13, 0.18, hh + 0.26], "ivory");
    for (let dz of [-hh / 2 - 0.065, hh / 2 + 0.065])
      b(
        "Window lintel",
        [x, y - 0.07, z + dz],
        [w + 0.26, 0.18, 0.13],
        "ivory",
      );
    b("Window mullion", [x, y - 0.13, z], [0.065, 0.11, hh], "metal");
    b("Window transom", [x, y - 0.13, z - 0.1], [w, 0.11, 0.065], "metal");
    if (balcony) {
      b(
        "Balcony slab",
        [x, y - 0.58, z - hh / 2 - 0.11],
        [w + 0.6, 1.12, 0.17],
        "ivory",
      );
      b(
        "Balcony planter",
        [x + 0.4, y - 0.65, z - hh / 2 + 0.2],
        [0.47, 0.45, 0.4],
        "trunk",
      );
      b(
        "Balcony shrub",
        [x + 0.4, y - 0.65, z - hh / 2 + 0.46],
        [0.56, 0.51, 0.22],
        "leaf",
      );
      b(
        "Balcony rail",
        [x, y - 1.08, z - hh / 2 + 0.76],
        [w + 0.4, 0.05, 0.05],
        "metal",
      );
      for (let dx of [-0.85, -0.42, 0, 0.42, 0.85])
        b(
          "Balcony upright",
          [x + dx, y - 1.08, z - hh / 2 + 0.4],
          [0.045, 0.045, 0.73],
          "metal",
        );
    }
  }
  function roofStuds(x, y, z, width, depth, color, obstacles = []) {
    if (!studs) return;
    const pitch = BRICK_STYLE.studPitch,
      r = BRICK_STYLE.studRadius;

    const startX =
      (Math.ceil((x - width / 2 + 0.4) / pitch - 0.5) + 0.5) * pitch;
    const startY =
      (Math.ceil((y - depth / 2 + 0.4) / pitch - 0.5) + 0.5) * pitch;
    for (let xx = startX; xx <= x + width / 2 - 0.4 + 1e-8; xx += pitch)
      for (let yy = startY; yy <= y + depth / 2 - 0.4 + 1e-8; yy += pitch) {
        if (
          obstacles.some(
            (o) =>
              Math.abs(xx - o.x) < o.w / 2 + r + 0.06 &&
              Math.abs(yy - o.y) < o.d / 2 + r + 0.06,
          )
        )
          continue;
        add(
          "stud",
          "Roof stud",
          [xx, yy, z + BRICK_STYLE.studHeight / 2],
          [r, r, BRICK_STYLE.studHeight],
          color,
          null,
          "plastic",
        );
      }
  }
  function building(side, y, width, depth, floors, color, index) {
    section = side < 0 ? "West residences" : "East residences";
    const x = routeCenter(y) + side * (10.9 + width / 2),
      baseZ = routeHeight(y + depth / 2) + 0.2,
      hh = floors * 3.1 + 0.5;
    const low = routeHeight(y - depth / 2);
    box(
      "Terrace plinth",
      [x, y, (baseZ + low) / 2],
      [width + 0.5, depth + 0.5, baseZ - low + 0.46],
      "slate",
    );
    box(
      "Residence " + index,
      [x, y, baseZ + hh / 2],
      [width, depth, hh],
      color,
    );
    box(
      "Ivory cornice",
      [x, y, baseZ + hh + 0.1],
      [width + 0.48, depth + 0.46, 0.3],
      "ivory",
    );
    box(
      "Flat rooftop",
      [x, y, baseZ + hh + 0.27],
      [width - 0.28, depth - 0.28, 0.11],
      color,
    );
    roofStuds(x, y, baseZ + hh + 0.325, width - 0.3, depth - 0.3, color, [
      { x: x + width * 0.22, y: y + depth * 0.12, w: 2.2, d: 2.8 },
      { x: x - 1.5, y: y + depth * 0.23, w: 1.1, d: 1.2 },
      { x: x, y: y + depth * 0.23, w: 1.1, d: 1.2 },
    ]);
    for (let dx of [-width / 2 + 0.1, width / 2 - 0.1])
      box(
        "Roof parapet",
        [x + dx, y, baseZ + hh + 0.51],
        [0.22, depth, 0.5],
        color,
      );
    box(
      "Front parapet",
      [x, y - depth / 2 + 0.1, baseZ + hh + 0.51],
      [width, 0.2, 0.5],
      color,
    );
    box(
      "Rooftop access",
      [x + width * 0.22, y + depth * 0.12, baseZ + hh + 1.03],
      [2, 2.6, 1.5],
      "concrete",
    );
    box(
      "Access cap",
      [x + width * 0.22, y + depth * 0.12, baseZ + hh + 1.81],
      [2.2, 2.8, 0.14],
      "ivory",
    );
    for (let v of [-1.5, 0])
      box(
        "Roof vent",
        [x + v, y + depth * 0.23, baseZ + hh + 0.65],
        [1.1, 1.2, 0.75],
        "metal",
      );
    const cols = Math.max(2, Math.floor(width / 2.6));
    for (let f = 0; f < floors; f++)
      for (let j = 0; j < cols; j++)
        window(
          x + (j - (cols - 1) / 2) * 2.4,
          y - depth / 2 - 0.07,
          baseZ + 1.85 + f * 3.1,
          1.3,
          1.7,
          f > 0 && (j + f + index) % 3 === 0,
        );
    for (let f = 0; f < floors; f++)
      for (let j = 0; j < 3; j++)
        window(
          (j - 1) * 2.5,
          0,
          baseZ + 1.85 + f * 3.1,
          1.25,
          1.7,
          f > 0 && j === 1,
          { px: x - (side * width) / 2, py: y, a: (-side * Math.PI) / 2 },
        );

    for (let f = 0; f < floors; f++) {
      for (let j = 0; j < cols; j++)
        window(
          (j - (cols - 1) / 2) * 2.4,
          0,
          baseZ + 1.85 + f * 3.1,
          1.3,
          1.7,
          false,
          { px: x, py: y + depth / 2 + 0.05, a: Math.PI },
        );
      for (let j = 0; j < 3; j++)
        window((j - 1) * 2.5, 0, baseZ + 1.85 + f * 3.1, 1.25, 1.7, false, {
          px: x + (side * width) / 2,
          py: y,
          a: (side * Math.PI) / 2,
        });
    }
    box(
      "Shop entrance",
      [x, y - depth / 2 - 0.18, baseZ + 1.2],
      [1.25, 0.16, 2.3],
      "teal",
    );
    box(
      "Door glazing",
      [x, y - depth / 2 - 0.29, baseZ + 1.45],
      [0.88, 0.05, 1.5],
      "glassLight",
    );
    for (let k = 0; k < 6; k++)
      box(
        "Striped awning",
        [x + (k - 2.5) * 0.46, y - depth / 2 - 0.7, baseZ + 2.63],
        [0.46, 1.25, 0.16],
        k % 2 ? "cream" : color,
        [0.15, 0, 0],
      );
    box(
      "Shop fascia",
      [x, y - depth / 2 - 0.19, baseZ + 3.0],
      [3.1, 0.12, 0.48],
      "slate",
    );
    for (let k = 0; k < 4; k++)
      box(
        "Entrance step",
        [x, y - depth / 2 - 1.35 + k * 0.26, baseZ - 0.45 + k * 0.12],
        [3.2, 0.34, 0.16],
        "curb",
      );
    features.push({
      type: "building",
      index,
      side,
      position: [x, y, baseZ],
      color,
      floors,
    });
  }
  const palette = ["coral", "mustard", "mint", "blue"];
  for (let s of [-1, 1])
    for (let i = 0; i < 4; i++)
      building(
        s,
        [27, 44, 62, 79][i],
        7.7 + rand() * 1.0,
        10,
        3 + (rand() > 0.35 ? 1 : 0),
        palette[(i + (s > 0 ? 3 : 0) + Math.floor(rand() * 2)) % 4],
        (s > 0 ? 4 : 0) + i,
      );

  function lettering(text, x, y, z, pixel = 0.1, color = "cream") {
    const font = {
      D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
      E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
      P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
      O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
      T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
      F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
      U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
      L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
      G: ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
      M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
      A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
      R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    };
    const start = x - ((text.length * 6 - 1) * pixel) / 2;
    [...text].forEach((ch, k) =>
      (font[ch] || []).forEach((row, j) =>
        [...row].forEach((v, i) => {
          if (v === "1")
            box(
              "Voxel letter " + ch,
              [start + (k * 6 + i) * pixel, y, z + (3 - j) * pixel],
              [pixel * 0.83, 0.035, pixel * 0.83],
              color,
            );
        }),
      ),
    );
  }
  function carton(x, y, z, w = 1, d = 0.85, hh = 0.85) {
    box(
      "Carton",
      [x, y, z + hh / 2],
      [w, d, hh],
      rand() > 0.35 ? "cartonLight" : "carton",
    );
    box(
      "Carton tape",
      [x, y, z + hh + 0.009],
      [0.16, d + 0.012, 0.015],
      "tape",
    );
    box(
      "Tape folded end",
      [x, y - d / 2 - 0.009, z + hh - 0.17],
      [0.16, 0.014, 0.34],
      "tape",
    );
    box(
      "Parcel label",
      [x + w * 0.24, y - d / 2 - 0.017, z + hh * 0.5],
      [0.22, 0.017, 0.16],
      "cream",
    );
  }
  function pallet(x, y, z) {
    for (let xx of [-0.64, 0, 0.64])
      box("Pallet runner", [x + xx, y, z + 0.13], [0.19, 1.6, 0.22], "trunk");
    for (let yy of [-0.7, -0.35, 0, 0.35, 0.7])
      box("Pallet deck", [x, y + yy, z + 0.29], [1.65, 0.24, 0.1], "carton");
  }
  section = "Delivery depot";
  const dx = -18,
    dy = 5;
  box("Depot rear", [dx, dy + 5, 3.7], [13, 0.35, 7.2], "ivory");
  for (let s of [-1, 1])
    box("Depot side", [dx + s * 6.35, dy, 3.7], [0.4, 10, 7.2], "ivory");
  box("Depot front header", [dx, dy - 5, 6.35], [13, 0.45, 1.85], "ivory");
  for (let s of [-1, 1])
    box("Portal pier", [dx + s * 5.45, dy - 5, 2.7], [1.7, 0.5, 5.4], "ivory");
  box("Depot roof", [dx, dy, 7.42], [13.7, 10.7, 0.34], "concrete");
  box("Teal coping", [dx, dy, 7.68], [13.85, 10.85, 0.17], "teal");
  roofStuds(dx, dy, 7.765, 13.4, 10.4, "teal");
  box("Dock", [dx, dy - 1.3, 0.31], [12.8, 8, 0.44], "concrete");
  box("Portal shade", [dx, dy - 5.2, 5.5], [10.8, 1.25, 0.28], "slate");
  box("Raised shutter", [dx, dy - 4.87, 5.72], [9.15, 0.2, 0.58], "metal");
  for (let i = 0; i < 4; i++)
    box(
      "Shutter slat",
      [dx, dy - 5, 5.47 + i * 0.14],
      [9.1, 0.06, 0.028],
      "concrete",
    );
  box("Depot sign", [dx, dy - 5.27, 6.63], [8.2, 0.14, 1.02], "teal");
  lettering("DEPOT", dx, dy - 5.36, 6.63, 0.105);

  for (let x of [dx - 4.1, dx + 4.1]) {
    box("Dock bumper", [x, dy - 5.3, 1.04], [0.5, 0.3, 1.45], "rubber");
    for (let z of [0.54, 0.95, 1.36, 1.77])
      box(
        "Hazard stripe",
        [x, dy - 5.47, z],
        [0.52, 0.035, 0.16],
        "yellow",
        [0, -0.45, 0],
      );
  }
  add(
    "box",
    "Portal light",
    [dx, dy - 5.85, 5.33],
    [1.7, 0.25, 0.13],
    "cream",
    null,
    "lamp",
  );
  for (let s of [-1, 1]) {
    let x = dx + s * 4.25;
    for (let z of [1, 2.65, 4.3])
      box("Shelf", [x, dy + 2.7, z], [3.4, 1.4, 0.16], "yellow");
    for (let xx of [x - 1.65, x + 1.65])
      box("Shelf upright", [xx, dy + 2.7, 2.35], [0.15, 1.45, 4.5], "slate");
    for (let k = 0; k < 3; k++)
      for (let z of [1.1, 2.75])
        carton(x + (k - 1) * 0.93, dy + 2.7, z, 0.82, 0.82, 1.1);
  }
  for (let [x, y] of [
    [dx - 4, dy - 6.1],
    [dx + 3.3, dy - 3.3],
    [dx - 1.8, dy - 1.2],
  ]) {
    pallet(x, y, 0.17);
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++)
        carton(
          x + (i - 0.5) * 0.75,
          y + (j - 0.5) * 0.68,
          0.54,
          0.7,
          0.63,
          0.75,
        );
    carton(x - 0.17, y, 1.3, 0.95, 0.76, 0.68);
  }
  let fx = dx + 2.5,
    fy = dy + 0.2;
  box("Forklift body", [fx, fy, 0.93], [1.6, 2.5, 1], "yellow");
  box(
    "Forklift counterweight",
    [fx, fy + 0.92, 1.25],
    [1.64, 0.64, 1.2],
    "yellow",
  );
  for (let s of [-1, 1]) {
    for (let yy of [-0.74, 0.8])
      cylinder(
        "Forklift wheel",
        [fx + s * 0.86, fy + yy, 0.53],
        0.43,
        0.26,
        "rubber",
        "X",
      );
    box(
      "Forklift mast",
      [fx + s * 0.55, fy - 1.3, 1.9],
      [0.12, 0.18, 3.25],
      "slate",
    );
    box("Fork", [fx + s * 0.53, fy - 2.02, 0.47], [0.18, 1.4, 0.13], "slate");
    for (let yy of [-0.6, 0.86])
      box(
        "Forklift guard pillar",
        [fx + s * 0.68, fy + yy, 2.18],
        [0.1, 0.1, 2.45],
        "slate",
      );
  }
  box("Forklift roof", [fx, fy + 0.13, 3.44], [1.65, 1.9, 0.14], "yellow");
  box("Operator seat", [fx, fy + 0.3, 1.53], [0.7, 0.62, 0.35], "rubber");
  section = "Fuel station";
  const sx = 16,
    sy = 1;
  box("Fuel island", [sx, sy, 0.31], [7.2, 9.5, 0.28], "ivory");
  for (let x of [sx - 3.3, sx + 3.3])
    for (let y of [sy - 3.8, sy + 3.8])
      box("Canopy column", [x, y, 2.95], [0.35, 0.35, 5.5], "ivory");
  box("Fuel canopy", [sx, sy, 5.83], [10.2, 12.1, 0.5], "ivory");
  box("Fuel red fascia", [sx, sy, 5.86], [10.3, 12.2, 0.27], "red");
  box("Canopy upper lip", [sx, sy, 6.09], [10.42, 12.32, 0.12], "white");
  roofStuds(sx, sy, 6.15, 10.0, 11.9, "white");
  for (let y of [-2, 2])
    add(
      "box",
      "Canopy light",
      [sx, sy + y, 5.54],
      [2.4, 0.72, 0.06],
      "cream",
      null,
      "lamp",
    );
  for (let yy of [-2.6, 2.6]) {
    let y = sy + yy;
    box("Pump red base", [sx, y, 1.1], [1.15, 0.9, 1.4], "red");
    box("Pump white head", [sx, y, 2.23], [1.34, 0.98, 0.92], "white");
    box("Pump display", [sx, y - 0.51, 2.33], [0.85, 0.035, 0.38], "slate");
    for (let digit = 0; digit < 4; digit++) {
      let x = sx - 0.29 + digit * 0.18;
      box("Display digit", [x, y - 0.532, 2.33], [0.1, 0.017, 0.19], "lime");
      box(
        "Display digit inset",
        [x, y - 0.544, 2.33],
        [0.044, 0.009, 0.1],
        "slate",
      );
    }
    box("Pump keypad", [sx + 0.3, y - 0.52, 1.94], [0.2, 0.025, 0.14], "slate");
    const hose = [
      [0.57, -0.02, 2.38],
      [0.95, -0.03, 2.1],
      [1.09, -0.04, 1.2],
      [1.02, -0.17, 0.66],
      [0.79, -0.39, 0.6],
      [0.55, -0.53, 0.95],
      [0.55, -0.52, 1.68],
    ];
    for (let i = 1; i < hose.length; i++)
      beam(
        "Fuel hose",
        [sx + hose[i - 1][0], y + hose[i - 1][1], hose[i - 1][2]],
        [sx + hose[i][0], y + hose[i][1], hose[i][2]],
        0.1,
        "rubber",
      );
    box(
      "Fuel nozzle",
      [sx + 0.58, y - 0.51, 1.89],
      [0.12, 0.15, 0.38],
      "slate",
      [0, -0.3, 0],
    );
    for (let s of [-1, 1])
      cylinder(
        "Safety bollard",
        [sx + s * 1.5, y - 0.12, 0.93],
        0.15,
        1.35,
        "yellow",
      );
  }
  box("Mini mart", [23.6, 7.6, 2.4], [6.3, 7, 4.5], "ivory");
  box("Shop roof", [23.6, 7.6, 4.8], [6.65, 7.36, 0.32], "teal");
  roofStuds(23.6, 7.6, 4.96, 6.3, 7.0, "teal");
  box("Shop glazing", [23.6, 4.05, 2.38], [5.1, 0.08, 3.25], "glassLight");
  for (let x of [21.15, 23.4, 26.05])
    box("Shop glass frame", [x, 3.98, 2.38], [0.1, 0.1, 3.4], "ivory");
  box("Shop fascia", [23.6, 3.85, 4.04], [6.2, 0.1, 0.62], "slate");
  box("Fuel totem", [12.6, -6.4, 3.55], [0.22, 0.24, 6.5], "slate");
  box("Fuel sign", [12.6, -6.4, 6.5], [2.6, 0.44, 2.45], "white");
  box("Fuel can", [12.6, -6.65, 6.6], [0.91, 0.07, 1.12], "red");
  box("Can handle", [12.6, -6.65, 7.25], [0.46, 0.08, 0.18], "red");
  beam(
    "Fuel can diagonal",
    [12.22, -6.7, 6.17],
    [12.98, -6.7, 6.97],
    0.045,
    "coral",
  );
  lettering("FUEL", 12.6, -6.655, 5.64, 0.045, "red");
  lettering("GO MART", 23.6, 3.785, 4.04, 0.06);
  section = "Orange delivery truck";
  const tx = 1.8,
    ty = -9.8;
  const tb = (n, p, d, c, r) => box(n, [tx + p[0], ty + p[1], p[2]], d, c, r);
  tb("Chassis", [0, 0, 0.92], [2.45, 5.15, 0.42], "slate");
  tb("Cargo bed", [0, -1.2, 1.34], [2.75, 2.85, 0.22], "orange");
  for (let s of [-1, 1]) {
    tb("Bed side", [s * 1.3, -1.19, 1.73], [0.18, 2.88, 0.62], "orange");
    tb("Upper rail", [s * 1.32, -1.19, 2.07], [0.24, 2.98, 0.1], "orangeLight");
    for (let y of [-1.95, -0.45])
      tb(
        "Cargo side rib",
        [s * 1.407, y, 1.74],
        [0.03, 0.11, 0.58],
        "orangeLight",
      );
    tb("Cab door", [s * 1.27, 1.11, 1.89], [0.15, 1.5, 0.77], "orange");
    tb(
      "Side window",
      [s * 1.29, 1.14, 2.58],
      [0.055, 1.35, 0.58],
      "glassLight",
    );
    for (let y of [1.84, 0.34])
      tb("Cab pillar", [s * 1.25, y, 2.62], [0.16, 0.16, 0.93], "orangeLight");
    tb("Door handle", [s * 1.36, 0.69, 2.04], [0.04, 0.26, 0.07], "slate");
    tb("Mirror arm", [s * 1.43, 1.81, 2.48], [0.37, 0.07, 0.07], "metal");
    tb("Mirror", [s * 1.62, 1.81, 2.5], [0.15, 0.34, 0.4], "slate");
    tb("Running board", [s * 1.4, 1.06, 1.15], [0.32, 1.67, 0.1], "metal");
    for (let y of [-1.73, 1.63]) {
      cylinder(
        "Truck tire",
        [tx + s * 1.32, ty + y, 0.73],
        0.68,
        0.43,
        "rubber",
        "X",
      );
      cylinder(
        "Wheel hub",
        [tx + s * 1.555, ty + y, 0.73],
        0.33,
        0.036,
        "metal",
        "X",
      );
      cylinder(
        "Hub center",
        [tx + s * 1.58, ty + y, 0.73],
        0.135,
        0.05,
        "orange",
        "X",
      );
      tb("Wheel arch", [s * 1.39, y, 1.33], [0.3, 1.43, 0.16], "orangeLight");
    }
  }
  tb("Tailgate", [0, -2.61, 1.73], [2.77, 0.19, 0.71], "orange");
  tb("Tailgate rail", [0, -2.63, 2.09], [2.84, 0.25, 0.11], "orangeLight");
  tb("Rear bumper", [0, -2.87, 0.84], [2.99, 0.25, 0.28], "slate");
  tb("Plate", [0, -2.83, 1.15], [0.65, 0.045, 0.23], "ivory");
  for (let s of [-1, 1]) {
    tb("Tail light", [s * 1.03, -2.8, 1.16], [0.31, 0.045, 0.26], "red");
    tb("Indicator", [s * 1.32, -2.8, 1.16], [0.18, 0.045, 0.26], "yellow");
  }
  tb("Cab rear panel", [0, 0.26, 2.11], [2.7, 0.17, 1.66], "orange");
  tb("Cab rear window", [0, 0.151, 2.62], [1.7, 0.035, 0.55], "glass");
  tb("Cab roof", [0, 1.13, 3.18], [2.81, 1.99, 0.2], "orangeLight");
  tb("Windshield", [0, 1.93, 2.68], [2.3, 0.055, 0.67], "glassLight");
  tb("Sun visor", [0, 1.99, 3.1], [2.82, 0.33, 0.12], "orange");
  tb("Front hood", [0, 2.15, 1.96], [2.65, 0.67, 0.66], "orange");
  tb("Grille", [0, 2.51, 1.69], [1.65, 0.055, 0.27], "slate");
  for (let s of [-1, 1])
    tb("Headlight", [s * 1.06, 2.513, 1.91], [0.33, 0.055, 0.29], "cream");
  tb("Front bumper", [0, 2.59, 1.33], [2.91, 0.25, 0.23], "slate");
  tb("Driver shirt", [-0.6, 0.92, 2.05], [0.63, 0.47, 0.64], "driver");
  tb("Driver head", [-0.6, 1.03, 2.6], [0.47, 0.44, 0.47], "skin");
  tb("Driver hair", [-0.6, 1, 2.83], [0.5, 0.47, 0.12], "trunk");
  for (let [x, y, z, w, d, h] of [
    [-0.67, -1.76, 1.46, 0.94, 0.86, 0.89],
    [0.44, -1.97, 1.46, 0.94, 0.83, 0.75],
    [-0.6, -0.73, 1.46, 1.02, 0.88, 0.98],
    [0.56, -0.88, 1.46, 0.87, 0.92, 0.78],
    [0.23, -1.1, 2.44, 0.73, 0.71, 0.63],
  ])
    carton(tx + x, ty + y, z, w, d, h);
  features.push({ type: "truck", position: [tx, ty, 0], length: 5.8 });
  function tree(x, y, z, sc = 1) {
    section = "Trees & planting";
    box("Tree planter", [x, y, z + 0.18], [2.25 * sc, 2 * sc, 0.38], "curb");
    box("Soil", [x, y, z + 0.39], [1.96 * sc, 1.72 * sc, 0.06], "soil");
    box(
      "Tree trunk",
      [x, y, z + 2.25 * sc],
      [0.4 * sc, 0.42 * sc, 3.8 * sc],
      "trunk",
    );
    beam(
      "Angled branch",
      [x, y, z + 2.5 * sc],
      [x + 0.75 * sc, y, z + 3.3 * sc],
      0.23 * sc,
      "trunk",
    );
    for (let [xx, yy, zz, d, c] of [
      [-0.55, 0, 4, 2.1, "leaf"],
      [0.65, 0, 4.1, 1.9, "leafLight"],
      [0.05, 0.28, 5.1, 1.95, "leaf"],
      [-0.3, -0.4, 5.65, 1.25, "leafLight"],
      [0.75, 0.43, 5.25, 1.1, "leafDark"],
    ])
      box(
        "Block foliage",
        [x + xx * sc, y + yy * sc, z + zz * sc],
        [d * sc, d * 0.91 * sc, d * 0.89 * sc],
        c,
      );
    for (let [xx, yy] of [
      [-0.8, -0.65],
      [0.6, -0.6],
      [0.6, 0.6],
      [-0.75, 0.55],
    ])
      box(
        "Low planting",
        [x + xx * sc, y + yy * sc, z + 0.64],
        [0.55 * sc, 0.5 * sc, 0.48],
        "leafLight",
      );
  }
  for (let s of [-1, 1])
    for (let y of [-14, 15, 35, 52, 70, 84])
      tree(...path(y, s * 6.98, 0.21), y > 40 ? 0.66 : 0.8);
  for (let [x, y, sc] of [
    [-28, -16, 1.05],
    [28, -15, 1],
    [-28, 15, 1.15],
    [28, 20, 1],
    [-29, 50, 1.05],
    [29, 60, 0.9],
  ])
    tree(x, y, routeHeight(y), sc);
  section = "Trees & planting";
  for (let s of [-1, 1])
    for (let y of [-18, -8, 19, 40, 57, 77]) {
      let p = path(y, s * 7, 0.42);
      box("Low planter", p, [1.65, 1, 0.44], "curb");
      for (let j = 0; j < 4; j++)
        box(
          "Hedge",
          [p[0] + (j - 1.5) * 0.37, p[1], p[2] + 0.35],
          [0.43, 0.77, 0.44],
          j % 2 ? "leafLight" : "leaf",
        );
    }
  section = "Street furniture";
  for (let s of [-1, 1])
    for (let y of [-18, -3, 17, 37, 56, 74, 85]) {
      let [x, yy, z] = path(y, s * 5.92, 0.18);
      box("Lamp base", [x, yy, z + 0.3], [0.59, 0.59, 0.6], "slate");
      box("Lamp mast", [x, yy, z + 2.65], [0.17, 0.19, 5.1], "slate");
      box(
        "Lamp top arm",
        [x - s * 0.43, yy, z + 5.21],
        [1.05, 0.19, 0.16],
        "slate",
      );
      box(
        "Lamp housing",
        [x - s * 0.86, yy, z + 5.13],
        [0.66, 0.52, 0.22],
        "slate",
      );
      add(
        "box",
        "Lamp luminous panel",
        [x - s * 0.86, yy, z + 4.99],
        [0.54, 0.42, 0.05],
        "cream",
        null,
        "lamp",
      );
    }
  for (let [s, y] of [
    [-1, 19],
    [1, 19],
    [-1, 54],
    [1, 72],
  ]) {
    let [x, yy, z] = path(y, s * 7, 0.25);
    for (let dy of [-0.29, 0, 0.29])
      box("Bench slat", [x, yy + dy, z + 0.54], [2, 0.19, 0.12], "trunk");
    for (let dx of [-0.75, 0.75])
      box("Bench foot", [x + dx, yy, z + 0.24], [0.14, 0.72, 0.45], "slate");
    for (let dz of [0.9, 1.2])
      box("Bench back", [x, yy + 0.4, z + dz], [2, 0.13, 0.18], "trunk");
    cylinder("Litter bin", [x + 1.35, yy, z + 0.56], 0.33, 1, "teal");
    cylinder("Bin lid", [x + 1.35, yy, z + 1.09], 0.36, 0.1, "slate");
  }
  for (let s of [-1, 1])
    for (let y of [-17, 9, 33, 58, 80]) {
      let [x, yy, z] = path(y, s * 4.5, 0.053);
      box("Road drain", [x, yy, z], [0.56, 0.83, 0.025], "slate", [
        slope(y),
        0,
        yaw(y),
      ]);
      for (let k = 0; k < 4; k++)
        box(
          "Drain bar",
          [x + (k - 1.5) * 0.11, yy, z + 0.02],
          [0.035, 0.78, 0.028],
          "metal",
          [slope(y), 0, yaw(y)],
        );
    }
  for (let s of [-1, 1]) {
    let [x, y, z] = path(11, s * 5.88, 0.21);
    box("Crossing post", [x, y, z + 1.72], [0.09, 0.1, 3.4], "metal");
    box("Crossing sign", [x, y, z + 3.3], [0.78, 0.12, 0.79], "blue");
    box("Crossing glyph", [x, y - 0.075, z + 3.3], [0.4, 0.03, 0.09], "white");
    box("Crossing glyph", [x, y - 0.075, z + 3.3], [0.09, 0.03, 0.4], "white");
  }
  section = "Checkpoints";
  function ring(name, x, y, z, r, color, special = "solid") {
    for (let i = 0; i < 64; i++) {
      let a = (i * Math.PI) / 32,
        b = ((i + 1) * Math.PI) / 32;
      beam(
        name,
        [x + r * Math.cos(a), y + r * Math.sin(a), z],
        [x + r * Math.cos(b), y + r * Math.sin(b), z],
        0.075,
        color,
        special,
      );
    }
  }
  ring("Delivery halo", -10.2, -4.2, 0.22, 1.65, "lime", "bright");
  ring("Delivery painted ring", -10.2, -4.2, 0.19, 1.92, "yellow");
  for (let xx of [-1, 1])
    for (let yy of [-1, 1])
      beam(
        "Checkpoint pillar",
        [-10.2 + xx, -4.2 + yy, 0.21],
        [-10.2 + xx, -4.2 + yy, 2.7],
        0.035,
        "lime",
        "bright",
      );
  const corners = [];
  for (let x of [-1, 1])
    for (let y of [-1, 1])
      for (let z of [-1, 1])
        corners.push([-10.2 + x * 0.67, -4.2 + y * 0.67, 3 + z * 0.67]);
  for (let i = 0; i < corners.length; i++)
    for (let j = i + 1; j < corners.length; j++)
      if (
        corners[i].filter((n, k) => Math.abs(n - corners[j][k]) > 0.01)
          .length === 1
      )
        beam(
          "Floating parcel outline",
          corners[i],
          corners[j],
          0.07,
          "lime",
          "bright",
        );
  box("Floating parcel", [-10.2, -4.2, 3], [1.08, 1.08, 1.08], "cream");
  ring("Fuel target", 9.7, 1.2, 0.19, 1.22, "yellow");
  section = "Skyline";
  for (let i = 0; i < 7; i++) {
    let x = [-27, -19, -10, 0, 11, 21, 29][i],
      y = 84 + 4 * (i % 2),
      h = [22, 29, 21, 32, 25, 28, 20][i],
      z = routeHeight(y);
    box("Distant tower", [x, y, z + h / 2], [5.4, 5, h], "skyline");
    for (let level = 3; level < h; level += 3)
      box(
        "Tower belt",
        [x, y - 2.53, z + level],
        [5.44, 0.06, 0.15],
        "glassLight",
      );
  }

  let instances = 0,
    triangles = 0;
  for (const [key, b] of batches) {
    const material =
      b.special === "brick"
        ? brickPlastic
        : b.special === "plastic"
          ? roofPlastic
          : b.special === "bright"
            ? bright
            : b.special === "lamp"
              ? lampMat
              : base;
    const mesh = new THREE.InstancedMesh(
      geos[b.type],
      material,
      b.items.length,
    );
    mesh.name =
      b.section +
      " · " +
      b.type +
      (b.special === "solid" ? "" : " · " + b.special);
    b.items.forEach((i, n) => {
      mesh.setMatrixAt(n, i.matrix);
      mesh.setColorAt(n, i.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.userData.partNames = b.items.map((i) => i.name);
    group(b.section).add(mesh);
    instances += b.items.length;
    triangles += (geos[b.type].index.count / 3) * b.items.length;
  }
  for (const g of Object.values(groups)) root.add(g);
  let totalTriangles = 0,
    totalDrawCalls = 0;
  root.traverse((o) => {
    if (o.isMesh) {
      totalTriangles +=
        ((o.geometry.index
          ? o.geometry.index.count
          : o.geometry.attributes.position.count) /
          3) *
        (o.isInstancedMesh ? o.count : 1);
      totalDrawCalls++;
    }
  });
  const stats = {
    seed,
    instances,
    triangles: totalTriangles,
    drawCalls: totalDrawCalls,
    buildings: 8,
    roadWidth: 10,
    rampRise: 11,
    routeLength: 110,
    studs,
    importedModels: 0,
    externalTextures: 0,
    proceduralBuildingMaterial: true,
    roofStuds: [...batches.values()].reduce(
      (n, b) => n + b.items.filter((i) => i.name === "Roof stud").length,
      0,
    ),
  };
  root.userData = { stats, features };
  return {
    group: root,
    stats,
    features,
    dispose() {
      const geometries = new Set(),
        mats = new Set();
      root.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) mats.add(o.material);
      });
      geometries.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
