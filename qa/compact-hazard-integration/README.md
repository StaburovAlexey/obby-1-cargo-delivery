# Compact hazard production integration

Status: PASS. CPU-only production runtime, actual solver and actual Three.js matrices. Browser, WebGL/GPU, mobile presentation and human difficulty are unverified.

## Frozen runtime

- Production `dist/road-hazards.js`: `be34d3363cb379ebf21f3adfd38f190b176d9f6b1c23ea1b9cdfa59fd80daa89`
- Approved isolated candidate: `00c9f66ee5469692e1dbc2ae24b1a0a12ff978d2585dfb6952f5768650e90948`
- Every descriptor, footprint, location, seed phase and motion constant is semantically identical for 263 seed cases. `equivalence.json` records the proof.
- Removed inactive generators, candidate helper exports, unused imports and global test overrides. Exact 80 static + 10 moving = 90 counts are required; insufficient safe positions throw instead of silently underfilling.
- Runtime pool limits remain 112 hazards and 24 basalt rocks in the scene. The actual layout uses 18 grounded basalt rocks, with no falling-rock timers or warnings.
- No changes to route geometry, bridge support, physics, surface coefficients, economy or saves were made by this integration.
- Static geometry deliberately stays identical to the approved candidate. Terrain-specific types, alternating sides, road curves and shuttles provide variation; no new angle or clustering pass was made after timing verification.

## Verified coverage

`tests/moving-road-hazards.mjs` and `qa/moving-road-hazards/contracts.json`:

- 256 numeric seeds, deterministic immutable descriptors, 90 unique IDs, exact totals by biome 21/21/14/14/20, ten movers and five center-crossers.
- At least 100.226 m footprint exclusion, 120 m mover-neighbor separation, and all static spacing/fork-tip rules.
- 30,240 perimeter/envelope points and 11,844 independently sampled approach points; minimum road-edge margin 1.018 m and projected exclusion 102.421 m.
- 9,000 mover frames with matching live collision and renderer poses. All five center-crossers really obstruct the center lane, and both checked outer bypasses stay driveable.
- Pause, delayed-frame cap, invalid inputs and 101 resets preserve pose pool identities and frozen descriptors.
- Moving bases remain grounded: no daylight; maximum sampled burial 0.00732 m. Eight draw calls, six instanced plus two merged meshes, 6,876 triangles.

`tests/moving-road-hazards-app.mjs` and `qa/moving-road-hazards/app.json`:

- Real application clock/physics/render synchronization, with mocked DOM/renderer/RAF.
- Upgrade menu, biome menu, overview, blur, hidden tab and context-loss freeze motion; resume never fast-forwards.
- All ten vehicles in both gears collide through the actual solver and invalidate both cash and brain clean-run bonuses.
- Garage, biome travel and regeneration reset the same hazard system without deleting grounded basalt or creating rewards.

`tests/compact-static-hazards.mjs` and `static-contracts.json`:

- 35,640 independent polygon-SAT comparisons; 2,802 empty AABB corners correctly rejected.
- 240 full surface profiles and all 80 stock/max dune-and-ice crossings in both gears preserve the base physics outside each patch.
- Six oblique 40 m/s thin-log impacts do not tunnel.
- 25,200 body probes retain the eight-metre static center bypass.
- All 56 static solid render footprints match physics bounds. Bases stay grounded with maximum sampled burial 0.01126 m.
- Unchanged scene capacities reject 113 hazards or 25 rocks.

`tests/static-rocks.mjs`: all ten vehicles in both gears stop at grounded basalt without residual penetration.

## Reproduce

From the project root:

```sh
node qa/compact-hazard-integration/verify-candidate-equivalence.mjs /absolute/path/to/city-eleven-minute-candidate
node tests/moving-road-hazards.mjs
node tests/moving-road-hazards-app.mjs
node tests/compact-static-hazards.mjs
node tests/static-rocks.mjs
```

The focused checks above passed. The older `road-hazards`, `road-hazards-scene`, `road-hazards-app` and `network-hazards` scripts still encode superseded 68-hazard/falling-rock designs and are not claimed as passing regression gates. Full route timing is independently owned and reported separately.
