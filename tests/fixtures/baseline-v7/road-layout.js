/* Shared, renderer-independent road geometry. Logical coordinates: x, distance y,
 * height; Three.js uses x, height, -y. Road, terrain and vehicle fit share this
 * one continuous height field. There are no raised curb/sidewalk colliders. */
export const ROUTE = Object.freeze({
  start: -23, fork: 74, end: 156, halfWidth: 15,
  splitEnd: 156, descentStart: 122, branchSpread: 40,
});
export const ROAD_SURFACE_OFFSET = 0.008;
// Covers steering, sprung body roll, and pitched mirrors on the downhill bend.
export const TRUCK_HALF_WIDTH = 2.9;
export const TRUCK_HALF_LENGTH = 3.6;
export const ROAD_MARGIN = 0.1;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
// Keep these legacy route utilities unchanged. Actual fork geometry uses the
// explicit branch functions below, rather than extending the old main route.
export const routeHeight = (y) => 11 * smooth((y - 13) / 61);
export const routeCenter = (y) =>
  4.2 * Math.sin(Math.PI * smooth((y + 3) / 88));
export const JUNCTION_X = routeCenter(ROUTE.fork);
export function branchCenter(id, y) {
  if (id === 'main' || y <= ROUTE.fork) return routeCenter(y);
  if (id !== 'left' && id !== 'right') throw new Error(`Unknown road branch: ${id}`);
  const spread = ROUTE.branchSpread * smooth((y - ROUTE.fork) / (ROUTE.end - ROUTE.fork));
  return JUNCTION_X + (id === 'left' ? -spread : spread);
}
export function branchHeight(id, y) {
  if (id === 'main' || y <= ROUTE.fork) return routeHeight(y);
  if (id === 'right') return 11;
  if (id !== 'left') throw new Error(`Unknown road branch: ${id}`);
  return 11 * (1 - smooth((y - ROUTE.descentStart) / (ROUTE.end - ROUTE.descentStart)));
}
/** Merged horizontal spans of the actual road union, not nearest-route guesses. */
export function roadIntervals(y, halfWidth = ROUTE.halfWidth) {
  if (y < ROUTE.start || y > ROUTE.end || !Number.isFinite(y)) return [];
  if (y <= ROUTE.fork) return [{ min: routeCenter(y) - halfWidth, max: routeCenter(y) + halfWidth }];
  const left = branchCenter('left', y), right = branchCenter('right', y);
  if (right - left <= 2 * halfWidth)
    return [{ min: left - halfWidth, max: right + halfWidth }];
  return [
    { min: left - halfWidth, max: left + halfWidth },
    { min: right - halfWidth, max: right + halfWidth },
  ];
}
/** Globally continuous terrain, including the space between and outside roads.
 * The fork ribbons overlap only while both are exactly 11 m high. Once separated,
 * the median is a smooth blend between their inner edges, with zero cross-slope
 * at each road edge. Outer terrain follows the adjacent road without a step. */
export function surfaceHeight(x, y) {
  if (y <= ROUTE.fork) return routeHeight(y);
  const left = branchCenter('left', y), right = branchCenter('right', y);
  const leftHeight = branchHeight('left', y), rightHeight = branchHeight('right', y);
  const lo = left + ROUTE.halfWidth, hi = right - ROUTE.halfWidth;
  if (hi <= lo || leftHeight === rightHeight) return leftHeight;
  return leftHeight + (rightHeight - leftHeight) * smooth((x - lo) / (hi - lo));
}
const derivative = (id, y) => (branchCenter(id, y + 0.001) - branchCenter(id, y - 0.001)) / 0.002;
/** Closest centerline metadata for labels/debugging. Never used to choose ground
 * height or to move the truck. An optional prior branch only breaks exact ties. */
export function projectRoad(x, z, history) {
  const yy = -z;
  const previous = typeof history === 'string' ? history : history?.branch;
  const ids = yy <= ROUTE.fork ? ['main'] : ['left', 'right'];
  let best;
  for (const branch of ids) {
    const lo = branch === 'main' ? ROUTE.start : ROUTE.fork;
    const hi = branch === 'main' ? ROUTE.fork : ROUTE.end;
    let y = clamp(yy, lo, hi);
    for (let i = 0; i < 12; i++) {
      const d = derivative(branch, y);
      const dd = (derivative(branch, y + 0.01) - derivative(branch, y - 0.01)) / 0.02;
      const f = (branchCenter(branch, y) - x) * d + y - yy;
      const df = d * d + (branchCenter(branch, y) - x) * dd + 1;
      if (Math.abs(df) < 0.1) break;
      const next = clamp(y - clamp(f / df, -8, 8), lo, hi);
      if (Math.abs(next - y) < 1e-10) { y = next; break; }
      y = next;
    }
    const center = branchCenter(branch, y), d = derivative(branch, y), n = 1 / Math.hypot(1, d);
    const distanceSquared = (x - center) ** 2 + (yy - y) ** 2;
    const candidate = { branch, y, offset: (x - center) * n - (yy - y) * d * n,
      height: branchHeight(branch, y), heading: -Math.atan(d), distanceSquared };
    if (!best || distanceSquared < best.distanceSquared - 1e-9 ||
        (Math.abs(distanceSquared - best.distanceSquared) <= 1e-9 && branch === previous)) best = candidate;
  }
  return best;
}
/** Ordered footprint corners in logical x/y space. */
export function truckFootprint(x, z, heading) {
  const c = Math.cos(heading), s = Math.sin(heading), y = -z;
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => ({
    x: x + a * TRUCK_HALF_WIDTH * c - b * TRUCK_HALF_LENGTH * s,
    y: y + a * TRUCK_HALF_WIDTH * s + b * TRUCK_HALF_LENGTH * c,
  }));
}
function footprintSpan(points, y) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 4; i++) {
    const a = points[i], b = points[(i + 1) % 4];
    if (y < Math.min(a.y,b.y) - 1e-9 || y > Math.max(a.y,b.y) + 1e-9) continue;
    if (Math.abs(b.y - a.y) < 1e-10) { lo = Math.min(lo,a.x,b.x); hi = Math.max(hi,a.x,b.x); }
    else { const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y); lo = Math.min(lo,x); hi = Math.max(hi,x); }
  }
  return { min: lo, max: hi };
}
function outerEdge(y, side) {
  y = clamp(y, ROUTE.start, ROUTE.end);
  const id = y <= ROUTE.fork ? 'main' : side < 0 ? 'left' : 'right';
  return branchCenter(id, y) + side * ROUTE.halfWidth;
}
function outerDerivative(y, side) {
  return (outerEdge(y + 0.001, side) - outerEdge(y - 0.001, side)) / 0.002;
}
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function convexHull(points) {
  points.sort((a,b) => a.x-b.x || a.y-b.y);
  const lower = [], upper = [];
  for (const p of points) { while (lower.length>1 && cross(lower.at(-2),lower.at(-1),p)<=0) lower.pop(); lower.push(p); }
  for (let i=points.length-1;i>=0;i--) { const p=points[i]; while (upper.length>1 && cross(upper.at(-2),upper.at(-1),p)<=0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop(); return lower.concat(upper);
}
// First location where the two actual road ribbons stop overlapping.
let splitLo = ROUTE.fork, splitHi = ROUTE.end;
for (let i=0;i<50;i++) {
  const y = (splitLo+splitHi)/2;
  if (branchCenter('right',y)-branchCenter('left',y) < 2*ROUTE.halfWidth) splitLo=y;
  else splitHi=y;
}
export const ROAD_SPLIT_Y = (splitLo+splitHi)/2;
function medianContact(points, minY, maxY) {
  if (maxY + ROAD_MARGIN < ROAD_SPLIT_Y) return undefined;
  const from = Math.max(ROAD_SPLIT_Y, minY - 0.5), to = maxY + 0.5;
  if (to <= from) return undefined;
  const median = [], steps = Math.max(1,Math.ceil((to-from)/0.2));
  for (let i=0;i<=steps;i++) {
    const y = from+(to-from)*i/steps;
    median.push({x:branchCenter('left',y)+ROUTE.halfWidth,y},
                {x:branchCenter('right',y)-ROUTE.halfWidth,y});
  }
  const hull = convexHull(median);
  let depth = Infinity, nx = 0, ny = 0;
  for (const polygon of [points,hull]) for (let i=0;i<polygon.length;i++) {
    const a=polygon[i],b=polygon[(i+1)%polygon.length],length=Math.hypot(b.x-a.x,b.y-a.y);
    if (length < 1e-10) continue;
    const ax=-(b.y-a.y)/length,ay=(b.x-a.x)/length;
    let alo=Infinity,ahi=-Infinity,blo=Infinity,bhi=-Infinity;
    for (const p of points) { const v=p.x*ax+p.y*ay;alo=Math.min(alo,v);ahi=Math.max(ahi,v); }
    for (const p of hull) { const v=p.x*ax+p.y*ay;blo=Math.min(blo,v);bhi=Math.max(bhi,v); }
    const negative=ahi-blo+ROAD_MARGIN,positive=bhi-alo+ROAD_MARGIN;
    if (negative<=0 || positive<=0) return undefined;
    if (negative<depth) { depth=negative;nx=-ax;ny=-ay; }
    if (positive<depth) { depth=positive;nx=ax;ny=ay; }
  }
  return Number.isFinite(depth) ? {normalX:nx,normalZ:-ny,depth,name:'Fork median'} : undefined;
}
/** Contact for the complete OBB against the road UNION. Outer sides are checked
 * across every footprint slice (plus every corner), and the fork gap uses SAT.
 * A straight-on approach contacts the median nose, rather than choosing a branch.
 * The tiny conservative hull of the nearby curved median keeps the entire body
 * clear; source substepping resolves contact/sliding without position snapping. */
export function corridorContact(x, z, heading) {
  if (![x,z,heading].every(Number.isFinite)) return undefined;
  const points=truckFootprint(x,z,heading);
  const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
  let deepest;
  const keep=c=>{ if(c && c.depth>0 && (!deepest || c.depth>deepest.depth)) deepest=c; };
  keep({normalX:0,normalZ:-1,depth:ROUTE.start+ROAD_MARGIN-minY,name:'Road start'});
  keep({normalX:0,normalZ:1,depth:maxY-ROUTE.end+ROAD_MARGIN,name:'Road end'});
  const ys=points.map(p=>p.y),steps=Math.max(1,Math.ceil((maxY-minY)/0.15));
  for(let i=0;i<=steps;i++) ys.push(minY+(maxY-minY)*i/steps);
  if(minY<ROUTE.fork && maxY>ROUTE.fork) ys.push(ROUTE.fork);
  // 0.0002 m conservatively covers between-sample curvature error.
  const margin=ROAD_MARGIN+0.0002;
  for(const y of ys) {
    const span=footprintSpan(points,y);
    for(const side of [-1,1]) {
      const edge=outerEdge(y,side);
      const violation=side<0 ? edge+margin-span.min : span.max-edge+margin;
      if(violation<=0) continue;
      const d=outerDerivative(y,side),n=1/Math.hypot(1,d);
      keep({normalX:-side*n,normalZ:-side*d*n,depth:violation*n,name:side<0?'Left road edge':'Right road edge'});
    }
  }
  keep(medianContact(points,minY,maxY));
  return deepest;
}
export function truckInRoad(x,z,heading) {
  return [x,z,heading].every(Number.isFinite) && !corridorContact(x,z,heading);
}
/** Conservative footprint overlap used only to keep decorative prop colliders
 * off the drivable union. Renderer geometry is checked separately in tests. */
export function obstacleIntersectsRoad(o, padding = 0.15) {
  const from=Math.max(ROUTE.start,-o.maxZ-padding),to=Math.min(ROUTE.end,-o.minZ+padding);
  if(to<from) return false;
  const steps=Math.max(1,Math.ceil((to-from)/0.25));
  for(let i=0;i<=steps;i++) {
    const y=from+(to-from)*i/steps;
    if(roadIntervals(y,ROUTE.halfWidth+padding).some(r=>o.maxX>=r.min && o.minX<=r.max)) return true;
  }
  return false;
}
