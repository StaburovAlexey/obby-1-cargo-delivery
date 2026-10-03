# Hazard-spacing QA

Final seed-42 layout: **26 unique obstacles**, comprising 16 static obstacles and 10 movers. Biome totals: city 6, forest 6, desert 4, snow 4, volcanic 6.

## Verified results

- Traversable 180 m window: maximum **10 → 1** unique obstacles. Traversable 320 m window: **10 → 2**. Windows are half-open and follow one compatible fork choice.
- Static-to-static configured separation is at least 150 m; static-to-mover separation is at least 180 m. Across seven audited seeds, the smallest observed same-edge separation was 180 m.
- Static lateral positions vary within each biome. Some intentionally cross the center corridor; every audited static footprint retains an 8 m or wider side opening and a collision-free vehicle bypass.
- Seven seeded layouts preserve deterministic generation, unique IDs, protected bridge/service approaches, and road-contained footprints. Minimum tested road-edge margin: 2.233 m.
- Actual Three.js geometry and live collision poses agree over 901 frames and 19,822 position checks. Maximum position error: 0.000488 m. No mesh/material/instance-buffer growth.
- Hazard scene: 26 descriptors, 1,824 triangles and 8 draw calls. Log bodies have two extra endcap instances; these are parts of one obstacle, not extra obstacles.
- All 25 saved bridge IDs survive save sanitation; clean-bridge mission remains two distinct clean crossings for 120 cash and 30 brains. Eleven protected route, economy, gameplay, mission, physics and scene modules match their pre-change hashes.

## Completed full-route checks

Production physics, collisions, active movers, road surfaces, fuel accounting, bridge support, real service circles and route telemetry were exercised with ordinary steering and held/released pedal input. Test-owned vehicles/upgrades were initial setup.

- Max-upgrade ashhauler, primary: final delivery in 13,349 frames / 667.45 simulated seconds, all 25 bridges and all 15 prior refills; no collision or fall.
- Max-upgrade ashhauler, alternate: final delivery in 13,548 frames / 677.40 simulated seconds, all 25 bridges and all 15 prior refills; no collision or fall.
- Runtime hashes remained unchanged throughout both drives. The test driver's near-center clearance threshold was increased from 2.1 m to 3.1 m to include body yaw and return-to-lane margin. Production vehicle/collision behavior was not changed. These are conservative automated routes, not human or fastest-route timings. Tank-only and broader vehicle-route matrices were not rerun for this focused correction.

## Camera and plot limitations

The CPU camera proxy uses actual hazard mesh bounds, production 53-degree perspective, default and minimum 15-degree pitch, desktop and portrait aspects, both route choices, and a 320 world-metre range. Maximum intersecting unique obstacles fell from **7 to 1 at default pitch** and **11 to 2 at shallow pitch**. This proxy does not render pixels, model depth occlusion, or prove visual readability.

`layout.png` is a visually inspected, unwrapped descriptor plot using exact route progress and lateral offsets. Fork arms can overlap in its coordinate system. It is explicitly **not a rendered-game screenshot**.

No browser, WebGL, GPU, mobile-device or human-playtest validation was performed.

## Evidence and reproduction

- `independent.json`: placement, geometry, camera proxy and mission checks; reproduce with `node tests/hazard-spacing-independent.mjs`.
- `journeys-breakdown.json`: reproduce with `node tests/expanded-bridge-journeys.mjs --set=breakdown --output-dir=qa/hazard-spacing`.
- `journeys-final-alternate.json`: reproduce with `node tests/expanded-bridge-journeys.mjs --set=final-alternate --output-dir=qa/hazard-spacing`.
- `before.json` / `after.json`: authoritative seed-42 descriptors.
- `plot-layout.py` / `layout.png`: offline before/after placement plot.

Verified road-hazards.js SHA-256: `3fbac6c50a055d07709fe289c70b2099a70d87515e8d5f2ad0ae6e8605b7a4c2`.
