# Controlled-skid route design

## Purpose

Make steering choices readable: broad sustained turns, linked changes of direction, a small number of technical corners, and clear space to correct the car. The route does not require a skid to be completed. Actual tire response and speed-dependent recovery belong to the vehicle-dynamics changes and their separate tests.

## Geometry and pacing

- The main route remains **15,868.841887310184 m** of measured travel, ending at progress 15,850. Heading changes do not increase its arc-length stations.
- There are **27 smooth bends**. Thirteen last at least 400 m and account for two thirds of the total curved distance. Heading and curvature join continuously; no inserted right-angle corners.
- City introduces two technical bends: progress 1,040–1,100 changes heading by −40°; progress 1,190–1,240 changes it by +30°. Their minimum radii are **45.84 m** and **50.93 m**. The 90 m straight between them includes the existing flat delivery/refuel shelf at 1,140. Both corners are separated from bridge approaches and moving hazards.
- The desert gains an open 52° sweep. The volcanic finish sequence combines 46°, −68°, and 46° turns before a recovery straight and a gentle finish approach. These are long road arcs, rather than additional encounters.
- The five biome boundaries, four side forks, 16 checkpoints, preview stations, elevation profile, finish, all 25 bridge identities/positions/widths, and progression data are preserved. The original garage and continuous BMW canyon departure also remain unchanged.
- The previous final-car twelve-minute goal is **not revalidated by geometry alone**. This patch preserves distance; the physical journey test and playtest must assess the effects of slowing for corners and handling changes.

## Technical-corner mesh safety

The ordinary mesh step remains 6 m. Only short technical turns use 2 m centerline, road, terrain, and collision-boundary samples. This keeps the actual centerline derivative within 0.000001 of the exported tangent without tripling the entire route mesh.

A 110 m terrain shoulder would fold over itself inside the compact city S even though the 30 m asphalt remains safe. The terrain now tapers smoothly to approximately **35.75 m from the centerline** through that pair. The neighboring short turns share the taper so terrain does not widen and overlap between them. The road stays 30 m wide and city homes remain fully outside the driving surface. The taper rejoins the normal shoulder before/after the technical section. The original 0.35 m house setback is preserved before the first city bridge so the two fitted canyon-entrance residences remain unchanged; the later technical turns use their larger safe setback only after that existing gap in the house row.

## Encounters and recovery space

There are **28 moving hazards**, down from 30. Their existing eight-second crossings, 1.4-second dwells, sizes, speeds, and collision behavior remain unchanged. No new obstacle type or additional encounter was added.

| Biome | Previous | Current | Change |
|---|---:|---:|---|
| City | 6 | 6 | Repack on gentle approaches |
| Forest | 6 | 5 | Remove the fork log encounter; keep one moving log on the wide main road |
| Desert | 5 | 5 | Reserve the broad bridge-sequence exit for the long dune patch |
| Snow | 5 | 4 | Move the ice off the curved fork and retain three moving barriers |
| Volcanic | 8 | 8 | Relocate encounters out of the sustained S turns |

All seven types remain: two repair blocks, one log, one dune, one ice patch, four rocks, seven barriers, and twelve boulders. All side-fork branches are now obstacle-free.

Five explicit bend/recovery sections exclude entire hazard footprints, including 60–80 m buffers. In particular, the demanding volcanic sequence has a long unobstructed section, instead of placing moving rocks inside its turns. Every hazard now gets a sampled 100 m approach on either side with curvature at most 0.0025 (minimum local radius 400 m). The former 0.0045 allowance for biome-specific moving obstacles was removed. Existing bridge, service, biome-join, and spawn exclusions remain. Adjacent hazards stay at least 180 m apart. At every lateral sweep phase, the larger side offers at least 11.2 m of clear width.

Packing remains deterministic for the seed. The dune needs a dedicated wide placement window: its long footprint cannot fit safely into the small gaps between the closely spaced desert bridges. That window is reserved before packing the shorter boulders, avoiding a seed-dependent generation failure.

## Reproducible checks

Run:

```sh
node tests/controlled-skid-routes.mjs
node tests/varied-route-turns.mjs
node tests/all-hazard-motion.mjs
node tests/all-hazard-visuals.mjs
node tests/all-hazard-app.mjs
node tests/startup-hazards.mjs
node --test tests/canyon-track.mjs tests/canyon-fork.mjs tests/canyon-roadside-seams.mjs tests/canyon-frontage-infill.mjs
```

The deterministic route report is written to `qa/controlled-skid/routes.json`. It records source hashes and verifies:

- 79,407 full-body recovery poses, including ±8 m lateral displacement and ±20° yaw, across both fork branches
- 7,225 bridge-approach samples, maximum curvature 0.00128334 and maximum grade 0.047873; all 25 existing bridge support contracts remain valid
- 32 seeds with exactly 28 moving encounters and preserved type/biome counts
- 72,576 hazard approach samples, 24,192 moving footprint points, and full-size-body bypass clearance
- Road self-intersections, terrain/asphalt overlaps, the complete short-turn terrain taper, all city house pairs, and all roadside building/barrier footprints
- Flat service shelves, unchanged route length/stations, finite consistent centerline derivatives, and open fork recovery sections

Current route-specific checks pass. The canyon suite also passes all 18 tests, including physical BMW entry/return and seamless approach crossing at multiple frame rates. These are offline/CPU tests; they do not establish browser appearance, mobile frame rate, human difficulty, or full-career travel time.

Historical `compact-route-contracts.mjs` currently asserts older final checkpoint payouts and fails against the unmodified baseline economy. That pre-existing expectation is separate from this route change; it was not silently rewritten as part of route QA.
