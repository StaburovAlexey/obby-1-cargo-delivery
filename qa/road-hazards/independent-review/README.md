# Independent road-hazard review

Reviewed 2026-10-13, against frozen file hashes in `final-runtime-sha256.txt`.
Place this whole directory at `site/qa/road-hazards/independent-review/`.
From `site/`, reproduce with:

```sh
node qa/road-hazards/independent-review/audit-hazards.mjs
node qa/road-hazards/independent-review/audit-app-renderer.mjs
node qa/road-hazards/independent-review/audit-warning-layout.mjs
```

All three passed on the reviewed source.

## Coverage

- 1,000 deterministic seeds; 25,000 hazard descriptors; 225,000 safe bypass poses. Minimum full diagonal-bound clearance from protected stations: 105.83 m.
- 27,000 independently computed randomized polygon-projection comparisons against the OBB contact API, including minimum translation resolution.
- 600 solid impact/recovery cases: all 10 cars, stock/max upgrades, every city repair/log/landed rock, D/R. 64,253 actual solver frames, no tunneling, finite states, full road containment, clean retreat. Maximum 50 ms displacement: 1.87655 m.
- 100 car/soft-patch combinations with exact outside baseline identity, continuous edges, no base-profile mutation and correct localized grip/drag changes.
- Both-direction warning/fall timing, inactive pause, overlapping-player deferral, persistent landed contact, and fixed-pool reset for every rock.
- Production app lifecycle: six pause types, 3,606 frames; 50 biome changes preserve fuel/cash/brains and never restore payable cargo; 20 rebuilds dispose 160 owned geometries and 160 materials exactly once and preserve the shared texture while a new world remains live.
- 5,400 real Three.js camera/mesh projection cases: ten seeds, five rocks, distances 140/160/180 m, both travel directions, center and ±8 m lanes, portrait/desktop and four short landscape sizes. Both full aloft geometry and shadow are on screen; ground-shadow sightlines clear the actual road grade. Short landscape warnings avoid relocated controls and test note for 0/21/34 px bottom safe areas.
- 60 final-CSS control rectangle cases cover full rotated steering hit bounds, D/R bounds and asymmetric safe areas. Minimum horizontal wheel clearance is 9.30 px. Icon-only controls retain explicit labels and titles.
- Final offline source-geometry collage was visually inspected for shape readability, ground fit and open lanes.

## Issues found and resolved

1. The initial 18 m aloft rock height clipped the default camera. Final 10 m height passes all tested full-mesh projections. Worst remaining top NDC coordinate is 0.99842, close to the viewport edge in a reverse-direction approach, but inside it.
2. Former short-landscape top-center controls covered both aloft rocks and their ground warnings. Actual 37.5 m/s app approach simulations showed ground warnings hidden for 1.75–2.55 seconds, becoming fully clear only 78.6–106.6 m before impact station. The compact bottom-center control pair and moved test note restore the intended 140–180 m warning visibility without moving the camera.
3. Initial .55–.85 m cosmetic dune relief would substantially bury flat-height tires. Final .12–.18 m shallow dunes match the soft-sand driving effect more cleanly.

## Verification limits

This is Node/offline verification using the real app, physics and Three.js math with a mocked renderer. The warning HUD checks use the final source CSS arithmetic; they are not browser layout measurements. Visual diagnostics use actual source geometry with offline lighting, not live screenshots. A browser launch was explicitly denied, so no browser launch or alternate route was attempted. Live WebGL, shader output, Android devices, touch hardware, GPU performance and z-fighting remain unverified.

The projection matrix uses default views facing the direction of travel. Deliberately looking away with the unrestricted orbit camera cannot guarantee that a road warning remains visible. No camera behavior was changed.
