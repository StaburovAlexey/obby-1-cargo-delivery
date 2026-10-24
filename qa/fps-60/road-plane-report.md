# Exact mover plane sampling

A browser CPU-stage investigation identified repeated centerline projection in
`roadHazards.update`: every one of 88 movers requested a full road query each
fixed tick, even though its height and gradient already came from indexed
road/ground triangles.

## API and behavior

`sampleRoadSurfacePlane(x, z, history)` is a dedicated narrow API. On an indexed
triangle it returns `height`, `gradient`, `normal`, and `onRoad`, using the same
road-before-ground lookup order, triangle boundary tolerance and barycentric
height arithmetic as `queryRoadSurface`. It intentionally omits route projection
metadata such as progress, offset and branch. Unsupported or invalid points
fall back to the original `queryRoadSurface` result, including its metadata.
The public `queryRoadSurface`, `getSurface` alias and all existing consumers of
the full query remain unchanged.

Only the mover ground-sampling call in `setMoverPoses` switches to this API.
Every mover still advances on every fixed tick. Offset, along-offset, heading,
bypass, height and gradient calculations, object identities and collider update
cadence remain unchanged. Vehicle forces and drift calculations were not edited.

## Evidence and reproduction

```sh
node --test --test-concurrency=1 tests/fps-road-surface-plane.mjs
node qa/fps-60/road-plane-benchmark.mjs
```

`road-plane-red.log` records four failing tests before the sampler existed.
`road-plane-green.log` records four passing tests after implementation:

- 6,760 exact height/gradient/normal/onRoad comparisons across seeded mover
  positions, road and ground triangle vertices, edge midpoints and adjacent
  1e-8 offsets.
- Full-result equality outside indexed surfaces and for invalid coordinates,
  with and without route history.
- Zero `projectRoad` calls for indexed mover samples; original projection still
  executes for unsupported fallback points.
- Every live pose field equals the original full-sampler reference after each
  of 180 fixed ticks for seeds 0 and 42, with pause/reset and identity checks.

The benchmark compares the copied dirty runtime at
`output/fps-60/baseline/dist` with the current runtime. It runs two warmup rounds
and three alternating measured rounds, resetting outside timing. Each round
performs 60 fixed ticks at 1/60 s for all 88 movers (5,280 mover updates), with
all pose fields checked against the baseline. Timings use uninstrumented modules;
separate instrumented imports count actual `projectRoad` calls.

Measured on Node v22.23.3, Linux, Intel i7-13700H, seed 42, with the browser
measurement tab blank:

| Measurement per 60-tick round | Baseline | Current |
| --- | ---: | ---: |
| Route projections | 5,280 | 0 |
| Median `roadHazards.update` CPU, ms | 700.403 | 10.708 |
| Median CPU per mover update, microseconds | 132.652 | 2.028 |

The elapsed median reduction in this CPU workload is 98.47%. Complete samples,
parameters and deterministic counts are in `road-plane-benchmark.json`.
These measurements do not establish browser frame time, GPU time or Android FPS.
