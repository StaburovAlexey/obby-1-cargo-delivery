# Rejected kinematic target cache experiment

Disposition: rejected and removed from the production runtime. Earlier parking /
gate caching, patch indexing and exact mover plane sampling are retained.

The candidate cached exact commanded translations/heading, skipped identical
WASM setter calls, and kept all movers, collisions and fixed ticks active. A
real-world comparison initially exposed constructor-versus-first-target float32
rotation normalization differences (~1.2e-7 quaternion components), with
associated support velocity changes. A failing route-scale regression caught
this on frame zero. The corrected candidate always sends the first translation
and rotation target, then caches only subsequent identical commands.

The corrected candidate passes three standalone QA tests, including exact
current/next poses, linear/angular/support-point velocities, moving support
contacts, ray hits, mutable headings and move/dwell transitions. The full
workload also passes strict equality for all body transforms/velocities and all
mover fields after warmup and each measured round. No assertions were relaxed.

Performance nevertheless regressed in every matched round. Each round measures
120 fixed ticks with the real city/garage/canyon physics world: 2,102 mesh chunks,
2,466 static colliders, 171,932 static triangles, 88 movers and one active
`desertscout` driving model. The model uses source GLB bounds with default wheel
geometry; there are no visual downloads or road-pit cutouts. Timing begins after
180 warmup plus 60 counter ticks (4 simulation seconds), beyond the 1.2-second
shared mover start pause. Variants differ only by the target cache.

| Per 120 ticks, ms | Baseline rounds | Candidate rounds | Median change |
| --- | --- | --- | --- |
| Total manager/vehicle/world | 284.60, 244.49, 228.75 | 298.76, 291.00, 249.41 | 244.49 → 291.00, 19.0% slower |
| `world.step` only | 187.87, 171.42, 159.83 | 202.43, 202.70, 178.51 | 171.42 → 202.43, 18.1% slower |

A preceding 60-tick count pass reduced translation calls 5,280 → 4,344 and
rotation calls 5,280 → 0. Those reduced counts did not produce a measured CPU
benefit. The slowdown's internal Rapier cause was not isolated; no benefit or
browser FPS claim is made.

Reproduction of the rejected snapshot, intentionally outside active tests:

```sh
node --test --test-concurrency=1 qa/fps-60/kinematic-sync-experiment.mjs
node qa/fps-60/kinematic-sync-benchmark.mjs
```

`kinematic-sync-candidate.js` is the rejected runtime snapshot and is not
imported by the game. Red/green logs, the initial failed real-world comparison
and complete corrected benchmark JSON/log are retained in this folder.

Next bounded measurement: enable Rapier's built-in `profilerEnabled` briefly and
sample `timingUserChanges`, `timingBroadPhase`, `timingNarrowPhase`, `timingSolver`,
`timingCcd`, `timingIslandConstruction` and `timingStep` after each fixed tick.
Those millisecond counters distinguish mutation/broad-phase work from vehicle
CCD and solver work without changing the physical model. Restore the profiler
flag after measurement.

Distance-based disabling/freezing was not implemented: it changes collider
queries and support velocity behavior. Default Rapier collision types already
exclude kinematic-to-fixed and kinematic-to-kinematic collision detection. A
proximity policy therefore needs stronger measured justification and an exact
query/interaction contract before it could replace normal simulation.
