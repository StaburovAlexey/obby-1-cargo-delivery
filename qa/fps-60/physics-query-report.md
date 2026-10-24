# Hazard queries and unchanged parking/gate synchronization

The comparison uses the copied dirty runtime in `output/fps-60/baseline/dist`,
not Git HEAD. Earlier asset, canonical physics geometry and scene changes are
preserved. Controls, Rapier stepping, vehicle forces and drift were not edited.

## Implementation

- Immutable patch outlines populate 64 m world-space cells. Nearby candidates
  retain original patch order, including overlapping outlines. The existing
  signed boundary distance, tolerance, blend weights and returned objects stay
  the narrow phase. Positive/negative margins are supported; enormous finite
  margins fall back to the original patch array without a huge grid traversal.
- Gate and parked proxy enable states are written to Rapier only on changes.
  Local transforms and shared ancestors are checked before updating parking
  world matrices, including rotating pedestals and manual matrix updates.
  Visibility never changes collider enable state.

## Reproduction

```sh
node --test --test-concurrency=1 tests/fps-physics-queries.mjs tests/fps-physics-sync.mjs
node qa/fps-60/physics-query-benchmark.mjs
```

The benchmark requires the original copied runtime at the path above. It writes
`qa/fps-60/physics-query-benchmark.json` and logs to stdout. Each point performs
one `surfaceAt` and one `patchAt(..., .8)` query. Counts use 4,096 points per
scenario (8,192 calls); elapsed rounds use two passes (16,384 calls), two warmup
rounds, and five alternating baseline/current rounds. Instrumented imports count
signed polygon evaluations separately; uninstrumented modules supply timings.
Both runtimes must return equal workload checksums before timing.

Measured on Node v22.23.3, Linux x64, Intel i7-13700H (20 logical CPUs), seed 42,
six patches with 64 boundary edges each:

| Workload | Signed polygon checks before / after | Reduction | Median ms before / after |
| --- | ---: | ---: | ---: |
| Route samples | 49,021 / 297 | 99.394% | 1,721.02 / 23.81 |
| Patch edge samples | 49,152 / 7,972 | 83.781% | 1,531.49 / 282.09 |

Operation counts are deterministic. Elapsed values describe this Node workload
with ordinary desktop/background applications present; no isolated machine or
phone performance claim follows. `ps` showed a pre-existing SwiftShader process
with high cumulative lifetime CPU, which does not establish concurrent activity
during the timing run. These numbers do not measure GPU duration, browser frame
time, or Android FPS.

## Regression evidence

`physics-red.log` records the new tests failing before implementation: absent
query index and 120 redundant parking enable writes over 120 unchanged frames.
`physics-green.log` records four focused tests passing after implementation.
Coverage includes 43,956 margin queries across four seeds, exact blended surface
profiles/base object identity, all outline vertices, adjacent edges/corners,
grid boundaries, overlap order, huge/negative margins and entry/exit ID sequences.
Parking coverage verifies no repeated unchanged-frame writes or world-matrix
refreshes, while moving pedestals, local/ancestor transforms, pivots, selection changes
and hidden parked vehicle collisions keep working.

A final read-only peer review found that the vendored Three.js also supports
`Object3D.pivot`. Pivot tracking was added and the expected-pose oracle was
strengthened to refresh expected world matrices before comparison. The final
strengthened test version is pending the root agent's rerun after browser
measurements; the earlier green log precedes these small additions.
