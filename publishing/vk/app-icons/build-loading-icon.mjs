import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const end = 60;
const fixed = k => ({ a: 0, k });
const color = hex => [...hex.matchAll(/[a-f\d]{2}/gi)].map(x => +(parseInt(x[0], 16) / 255).toFixed(3)).concat(1);
const animated = (samples, linear = false) => ({
  a: 1,
  k: samples.map(([t, value], index) => {
    const s = Array.isArray(value) ? value : [value];
    if (index === samples.length - 1) return { t, s };
    const next = samples[index + 1][1];
    return {
      t, s, e: Array.isArray(next) ? next : [next],
      o: { x: [linear ? 0.333 : 0.42], y: [linear ? 0.333 : 0] },
      i: { x: [linear ? 0.667 : 0.58], y: [linear ? 0.667 : 1] },
    };
  }),
});
const transform = (overrides = {}) => ({
  a: fixed([0, 0]), p: fixed([0, 0]), s: fixed([100, 100]), r: fixed(0), o: fixed(100), ...overrides,
});
const group = (items, overrides = {}) => ({ ty: 'gr', it: [...items, { ty: 'tr', ...transform(overrides) }] });
const fill = (hex, opacity = 100) => ({ ty: 'fl', c: fixed(color(hex)), o: fixed(opacity), r: 1 });
const polygon = (points, hex, opacity = 100) => group([
  { ty: 'sh', ks: fixed({ i: points.map(() => [0, 0]), o: points.map(() => [0, 0]), v: points, c: true }) },
  fill(hex, opacity),
]);
const ellipse = (position, size, hex, opacity = 100) => group([
  { ty: 'el', p: fixed(position), s: fixed(size), d: 1 }, fill(hex, opacity),
]);
const rect = (position, size, radius, hex, opacity = 100) => group([
  { ty: 'rc', p: fixed(position), s: fixed(size), r: fixed(radius), d: 1 }, fill(hex, opacity),
]);
let nextIndex = 1;
const layer = (name, shapes, overrides = {}) => ({
  ddd: 0, ind: nextIndex++, ty: 4, nm: name, sr: 1,
  ks: transform({ a: fixed([0, 0, 0]), p: fixed([0, 0, 0]), s: fixed([100, 100, 100]) }),
  ao: 0, ip: 0, op: end, st: 0, bm: 0, shapes: [...shapes].reverse(), ...overrides,
});

const vehicle = layer('Suspension', [], {
  ty: 3,
  ks: transform({
    a: fixed([48, 65, 0]),
    p: animated([[0, [48, 65, 0]], [12, [48, 63.8, 0]], [30, [48, 65, 0]], [45, [48, 64.2, 0]], [60, [48, 65, 0]]]),
    s: fixed([100, 100, 100]),
    r: animated([[0, 0], [12, -0.7], [30, 0.4], [45, -0.3], [60, 0]]),
  }),
});
delete vehicle.shapes;
const background = layer('Cyan background', [rect([48, 48], [96, 96], 0, '15B4EF')]);
const atmosphere = layer('Block cloud', [
  rect([17, 20], [23, 5], 1, 'D9F7FF', 75),
  rect([15, 16], [9, 8], 1, 'E7FBFF', 90),
]);
const road = layer('Road', [
  polygon([[0, 78], [96, 54], [96, 77], [20, 96], [0, 96]], '218DBD'),
  polygon([[0, 78], [96, 54], [96, 56], [0, 80]], '87DDF5'),
]);
const dashes = layer('Moving road markings', [-32, 0, 32, 64, 96, 128, 160].map(x => {
  const y = 87 - x / 4;
  return polygon([[x, y], [x + 13, y - 3.25], [x + 13, y - 1.25], [x, y + 2]], 'C6F2FF', 65);
}), { ks: transform({ a: fixed([0, 0, 0]), p: animated([[0, [0, 0, 0]], [60, [32, -8, 0]]], true), s: fixed([100, 100, 100]) }) });
const shadow = layer('Soft shadow', [ellipse([51, 78], [77, 12], '0A5482', 28)]);
const body = layer('Yellow delivery coupe', [
  polygon([[10, 59], [29, 50], [37, 35], [59, 33], [74, 39], [82, 49], [88, 51], [87, 63], [58, 77], [42, 80], [9, 72]], 'FFD21A'),
  polygon([[46, 63], [82, 49], [88, 51], [87, 64], [58, 77], [44, 79]], 'E5A315'),
  polygon([[9, 69], [44, 75], [87, 60], [86, 66], [44, 82], [9, 75]], '173047'),
  polygon([[11, 59], [28, 51], [65, 55], [46, 64]], 'FFED55'),
  polygon([[10, 60], [46, 65], [44, 76], [9, 70]], 'FFC910'),
  polygon([[37, 35], [59, 32], [74, 38], [63, 42]], 'FFE766'),
  polygon([[30, 49], [38, 37], [61, 41], [60, 53]], '163E64'),
  polygon([[35, 49], [40, 39], [44, 40], [40, 50]], '3781AD', 75),
  polygon([[64, 42], [73, 39], [81, 49], [64, 55]], '163E64'),
  polygon([[64, 56], [81, 51], [85, 53], [51, 66]], 'FFE95B'),
  polygon([[66, 57], [67, 57], [66, 68], [65, 68]], 'BE850E'),
  polygon([[72, 56], [77, 54.7], [77, 56.5], [72, 58]], '173047'),
  polygon([[12, 62], [24, 64], [23, 67], [12, 65]], 'E8FDFF'),
  polygon([[34, 65], [44, 66], [43, 69], [33, 68]], 'E8FDFF'),
  polygon([[15, 68], [40, 72], [39, 74], [14, 70]], '173047'),
  polygon([[9, 71], [43, 78], [44, 81], [9, 75]], '173047'),
  polygon([[40, 56], [57, 57.5], [47, 61]], 'FFF693', 85),
], { parent: vehicle.ind });
function wheel(name, position, scale, rotation) {
  const spokePaths = [0, 60, 120].map(degrees => {
    const angle = degrees * Math.PI / 180;
    const vertices = [[-0.65, -4.7], [0.65, -4.7], [0.65, 4.7], [-0.65, 4.7]].map(([x, y]) => [
      +(x * Math.cos(angle) - y * Math.sin(angle)).toFixed(3),
      +(x * Math.sin(angle) + y * Math.cos(angle)).toFixed(3),
    ]);
    return { ty: 'sh', ks: fixed({ i: vertices.map(() => [0, 0]), o: vertices.map(() => [0, 0]), v: vertices, c: true }) };
  });
  const spokes = group([...spokePaths, fill('D6E3EA')], {
    p: fixed([0.7, 0]), r: animated([[0, 0], [60, rotation]], true),
  });
  const arch = group([
    {
      ty: 'sh', ks: fixed({
        v: [[-11, 1], [-11, -1], [0, -11.5], [11, -1], [11, 1]],
        i: [[0, 0], [0, 0], [-6.1, 0], [0, -5.8], [0, 0]],
        o: [[0, 0], [0, -5.8], [6.1, 0], [0, 0], [0, 0]],
        c: true,
      }),
    },
    fill('634623'),
  ]);
  return layer(name, [
    arch,
    ellipse([-1.4, -0.5], [19.4, 19.4], '122330'),
    ellipse([0.7, 0], [18, 18], '2D3C47'),
    ellipse([0.7, 0], [12.6, 12.6], 'B4C4CE'),
    ellipse([0.7, 0], [10.3, 10.3], '243B4E'),
    spokes,
    ellipse([0.7, 0], [3, 3], 'D6E3EA'),
  ], {
    parent: vehicle.ind,
    ks: transform({
      a: fixed([0, 0, 0]), p: fixed([...position, 0]), s: fixed([...scale, 100]),
      sk: fixed(-18), sa: fixed(90),
    }),
  });
}
const rearWheel = wheel('Rear rotating wheel', [80.5, 61.7], [61.6, 75], -300);
const frontWheel = wheel('Front rotating wheel', [53, 72], [77, 92], -240);
const cargo = layer('Secured parcel', [
  polygon([[35, 37], [59, 41.5], [71, 37.3], [70, 40], [59, 44], [35, 39.5]], '20384C'),
  polygon([[37, 21], [58, 24], [58, 40], [37, 37]], 'D79445'),
  polygon([[58, 24], [69, 20], [69, 36], [58, 40]], 'B97735'),
  polygon([[37, 21], [47, 16], [69, 20], [58, 24]], 'F4C27D'),
  polygon([[44, 22], [47, 22.5], [47, 38.7], [44, 38.2]], '263749'),
  polygon([[44, 22], [54, 17.3], [57, 17.8], [47, 22.5]], '34465A'),
  polygon([[62, 23], [65, 22], [65, 28], [62, 29]], 'FFE0A0'),
], {
  parent: vehicle.ind,
  ks: transform({
    a: fixed([51, 40, 0]), p: fixed([51, 40, 0]), s: fixed([100, 100, 100]),
    r: animated([[0, 0], [12, -2], [30, 1.2], [45, -1], [60, 0]]),
  }),
});

const animation = {
  v: '5.7.4', fr: 30, ip: 0, op: end, w: 96, h: 96,
  nm: 'Obby Cargo Delivery - Loading', ddd: 0, assets: [],
  layers: [cargo, frontWheel, rearWheel, body, vehicle, shadow, dashes, road, atmosphere, background],
  markers: [],
};
const json = JSON.stringify(animation);
assert.ok(Buffer.byteLength(json) <= 24_000, `Animation exceeds the 24 KB limit: ${Buffer.byteLength(json)}`);
assert.equal(animation.assets.length, 0);
assert.deepEqual([animation.w, animation.h], [96, 96]);
await writeFile(new URL('./loading-icon-96.json', import.meta.url), json + '\n');
console.log(JSON.stringify({ file: 'loading-icon-96.json', bytes: Buffer.byteLength(json) + 1, width: animation.w, height: animation.h, fps: animation.fr, seconds: end / animation.fr, externalAssets: 0 }));
