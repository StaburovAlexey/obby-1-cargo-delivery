# Procedural geometry accounting, 2026-10-24

This records the geometry stage before the later FPS verification pass. See
[`fps-optimization-report.md`](fps-optimization-report.md) for final tests,
browser measurements and their limits.

Seed 42, with the application's 15 road pits and their hazard reservations.
`procedural-geometry-before.json` was recorded before these geometry edits;
`procedural-geometry-after.json` records the resulting constructors. Reproduce
the current snapshot from the repository root:

```sh
node docs/procedural-geometry-measure.mjs
```

This only constructs Three.js objects and counts their complete geometry. It
does not create a renderer, run a test suite, launch a browser, simulate physics,
or measure device FPS. Instance counts are included in triangle totals. Parked
GLBs and character models are excluded because this script does not load assets.

| Geometry | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Complete city | 165,507 | 98,387 | 40.55% |
| Biome barriers | 71,784 | 41,052 | 42.81% |
| Bridge-bank cliffs | 46,102 | 19,758 | 57.14% |
| Pit walls | 13,392 | 3,348 | 75.00% |
| Complete canyon | 45,596 | 37,572 | 17.60% |
| Canyon steel rails | 16,652 | 8,628 | 48.19% |
| Procedural garage | 22,200 | 18,840 | 15.14% |
| Pedestal cylinders | 3,840 | 1,440 | 62.50% |
| Garage rings, all instances | 1,920 | 960 | 50.00% |
| Complete road-hazard rendering | 19,092 | 8,954 | 53.10% |
| Sand patches | 6,864 | 1,914 | 72.12% |
| Ice patches | 6,816 | 1,628 | 76.12% |
| All four procedural roots | 252,395 | 163,753 | 35.12% |

Rows for individual meshes are subsets of their corresponding root totals.

## Rendering changes

- Biome walls keep every tier and original run endpoint. Adaptive sampling
  allows at most 4 cm deviation in either horizontal edge and either height
  limit, with a linear-color tolerance of .015 per channel. Buried bottom faces
  and undersides fully enclosed by another tier are omitted. Enclosed-face
  detection requires 10 cm horizontal and vertical margins. Exposed far walls,
  caps, ledges, treetops, buttes, spires and crests remain.
- Bridge banks keep their soil lip and 48 m extent, with three visual depth
  strata in place of seven. Their exposed top-edge collision source is unchanged.
- Pit wall segments become single coplanar quads. A material hook paints the
  original palette boundaries at .65 m and 8 m depth; the former 3 m subdivision
  separated identical colors. Ordered chipped/concave pit outlines, floors,
  ramps and warning strips keep their construction inputs.
- Canyon rails keep both edges within 3.5 cm horizontally and 2.5 cm vertically
  of the original sweep. The exact approach/canyon join and terminal miter remain
  anchors. Posts, sandstone and road surfaces retain their geometry.
- Sand/ice retain every original concave outline vertex and the 1.6 m edge
  spacing limit. Interior edge limits rise smoothly to 2.4 m for dunes and
  3.2 m for ice. Each sampled point uses the original ground sampler and dune
  height formula; the coarser interior changes their visual interpolation.
- Marker rings use 24 segments instead of 48. Pedestal displays use 24 instead
  of 64, with the original 64-segment physical support retained separately.

## Collision-source preservation

The snapshots hash float32 positions plus normalized uint32 indices. The full
canonical source hashes match before/after for biome barriers, pit walls,
canyon rails and pedestal cylinders. Their complete original triangles remain
in `userData.physicsGeometry`; `createPhysicsWorld.addMesh` consumes this source
before consulting display geometry. Instance transforms still pass through the
existing `eachInstance` path.

Cliffs use their pre-existing `physicsCliffEdges` source rather than display
indices. Its 16,138 endpoint pairs have the same before/after hash when pits are
present. The constructor without pits retains its separate endpoint count.
The snapshot's generic `canonicalHash` for cliffs hashes visual geometry; its
`cliffEdgeHash` is the relevant collision-source comparison.

Source inspection confirms the application constructs physics before spatial
render proxies. Spatial compaction leaves source geometry and source userData
intact, copies all visual attributes into its separate proxy, and modifies only
the proxy's index/draw range. Pit strata have no vertex displacement; ordinary
shadow rendering uses the same planar silhouette.

Neither nonblocking marker rings nor sand/ice display meshes feed triangle
colliders. Their gameplay descriptors, outlines, surface-effect calculations and
motion code are untouched. Existing fixed-step driving, handling and drift
calculations are unchanged. Lazy parked displays additionally use the supplied
`vehicle.physicsBounds` before visual metadata arrives, including pedestal tilt
clearance.

## Deliberately unexecuted validation and known fixture changes

No tests or browser checks were run, as requested. The pit material's browser
shader compilation, visible cliff strata, distant rail quality and sand/ice
interior appearance therefore remain unverified. These counts establish reduced
submitted source geometry, not measured FPS, GPU time or Android performance.
Canonical collision arrays retain CPU memory even when visual triangles shrink.

Existing tests were left unchanged. Source inspection identifies assumptions
that require review when test execution is authorized:

- `tests/terrain-cliffs.mjs:43` expects the former 46,102 visual triangles.
- `tests/canyon-roadside-seams.mjs:61` requires more than 10,000 visual rail
  triangles. The optimized rails contain 8,628.
- `tests/canyon-roadside-seams.mjs:73` requires each visual biome strip to be
  closed and to have four longitudinal faces. Fully hidden undersides are now
  absent from the visual strip; the canonical physical source remains closed.

These are source-level observations, not reported test results.
