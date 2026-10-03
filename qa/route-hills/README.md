# Smooth higher route hills

Offline geometry and production sampler evidence for the City34 elevation update. No browser, WebGL, GPU/mobile gameplay or camera-readability validation is claimed.

## Final result

- Elevation range: **0–28 m → 0–66 m**.
- Accumulated ascent/descent: **105/97 m → 157/125 m**.
- Exact maximum grade on the complete 30 m Float32 road surface: **7.5%**. The analytic backbone maximum is also **7.5%**. The curved final descent ends at 32 m, preventing its inside edge from exceeding the grade limit.
- Actual 3D route arc: **10,829.072000 m → 10,830.787650 m** (+1.715649 m). Both arms of each fork retain equal length.
- All 11 checkpoint progresses, IDs, and rounded payouts are unchanged. Prices and save code are unchanged.
- All service shelves are authored at ±22 m, leaving an exactly horizontal ±20 m driving mesh region. All five preview shelves and the hangar/start remain level.
- Forest fork: 34 → 44 → 36 m. Desert fork: 40 → 60 → 42 m. Snow fork: 16 → 38 m. Volcanic fork: level at 66 m to retain all falling-rock approach sightlines.
- The full x/z road and terrain mesh, indices, width, graph and fork identifiers are byte-for-byte identical to the baseline plan hashes.

## Smoothness and Float32 limits

The authored height field uses the existing quintic interpolation with C2 joins. Every road/fork/terrain height comes from the same field; forks are sampled in shared transverse backbone rows, and their analytic gradients now follow that same height field. The render/collision surface remains piecewise-linear triangles, so it is not mathematically C1 at every tessellation row.

The original union topology contains a few sub-millimetre rows. Quantized Float32 height creates a bounded analytic-versus-mesh normal difference of 0.003806 (about 0.218°) in the worst forest row. This is not an invisible collision step: the mesh and query normal match exactly, the worst fork height-versus-analytic difference is 0.330 mm, and the 16,510 road/terrain seams have maximum opposite-side height difference 0.0139 mm.

5,346 actual production four-wheel fits pass. Tiny-row probes spaced 1 cm have maximum chassis normal change 0.000002017. Across the broader 4 m samples, the support-height residual changes by at most 0.436 mm; tire clearances stay 12.00–12.97 mm. The plan triangulation was deliberately left intact rather than risking a fork-union topology change.

The outer non-drivable terrain shoulders reach 12.326% because an unchanged 110 m shoulder compresses around the inside of a plan curve. The complete drivable road remains at or below 7.5%.

## Checks and artifacts

- `report.json`: 9/9 new hill regression groups, including 46,908 road/terrain triangles, 16,510 seam probes, 10,878 transverse fork samples, 87,312 scenic foundation samples, all 66 horizontal service rings, and 256 hazard seeds / 4,096 safe rocks.
- `../route-hills-diagnostics/route-network.log`: 8/8 existing graph regression groups.
- `baseline.json`: original City34 profile, geometry plan hashes, arc distances, payouts and source hashes.
- `elevation-profile.csv`: before/after actual height samples every 2 m.
- `elevation-profile-and-route.svg` and `.png`: readable comparison plot and actual road footprint colored by elevation. The profile uses an independently scaled vertical axis.
- `desert-hill-offline.png`: CPU Blender render of the actual final Three.js desert road/terrain/barrier vertices, showing the rise to 60 m and the following descent. It is a geometry diagnostic, not a game screenshot.
- `source-signature.json`: compact final render provenance and camera settings. `export-offline.mjs` and `render-offline.py` reproduce the image; bulk `geometry.json`, checker texture, and diagnostic logs live outside this checkout in `../route-hills-diagnostics/`. The render reuses source procedural material colors and checker textures, without running WebGL shaders.

Run `node tests/route-hills.mjs` and `node tests/route-network.mjs` from the site directory. Regenerate the desert image with `node qa/route-hills/export-offline.mjs` then `blender -b -t 4 -P qa/route-hills/render-offline.py`. The exporter writes bulk data to `../route-hills-diagnostics/`; the renderer reads it there and writes the final PNG back to `qa/route-hills/`. Redirect export/render logs to that sibling diagnostics directory. No browser is launched.

## Isolated catalog drivability matrix

`node tests/route-hills-driving.mjs` covers 160 forward segments: all ten vehicles, stock/max upgrades, both arms, all four forks. It also covers 40 reverse passes over the forest crest, including its 7.5% slope. `driving.json` records the completed checks, failures, runtime/controller hashes, actual distance and fuel demand, minimum uphill speed, contacts, branch identity, and production chassis-fit continuity. The final matrix passes **200/200** with zero failures, zero stalls, zero road/hazard contacts and unchanged runtime/controller hashes. A partial run is explicitly marked `complete: false`.

Each vehicle is initialized once 25 m before the selected fork (25 m beyond its end in reverse). From then on, only steering/throttle and the selected gear reach the production model; pose and velocity are never reset. Actual hazard state, biome traction, grade, full road-boundary contacts and four-wheel support all remain active. A bounded 2,000 simulated-second budget allows weak early vehicles to cross unsupported late biomes at their intentionally low nominal speed; a separate four-second no-progress gate detects a real stall.

These are isolated drivability tests, not full-fuel economy runs. They record actual consumed-distance demand and whether that segment fits the normal tank. They do not inject or refill fuel, and do not claim that a stock pickup's 520 m tank covers a 1,050 m fork. Rows with `segmentFitsOneTank: false` are not complete playable deliveries: normal gameplay would cut off the engine when fuel runs out. The real gameplay cutoff/refill and delivery behavior are independently verified by the 70 passing economic journeys in `../network-journeys/all.json`; those runs use actual fuel depletion and checkpoint refills.
