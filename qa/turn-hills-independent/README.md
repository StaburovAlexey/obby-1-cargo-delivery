> Historical City35 evidence. Turn assistance was removed by the user-requested City36 handling rollback. This is not the current release result.

# Independent turn-assist and hills audit

Run: `node tests/turn-hills-independent.mjs`

Final result: 13/13 groups passed. All 14 runtime hashes stayed unchanged throughout the run and were verified again afterward. See `report.json` and `final-run.log`.

## Coverage

- 100 original City34 top-speed full-lock baseline scenarios; all exceeded the 30 m corridor. Frozen seven-module closure verified by SHA256.
- 2,400 new full-body U-turn scenarios: 10 cars, stock/max upgrades, 5 biomes, six starting speeds (0/12.5/25/50/75/100% local cap), D/R and both steering signs. Conservative full body: 2.9 m half-width, 3.6 m half-length. Worst lateral extent 12.580345 m from the center; 2.419655 m clearance to the physical wall, including the body. This is a centered, clear straight-road result; no claim of obstacle or edge rescue.
- 1,400 clean weak-steering/coast cases compared bit-exactly with City34 for 336,000 fixed steps, including the ±0.60 assist threshold.
- 2,000 timing cases at 30/60/120 Hz, jitter and clamped render stalls. Position, momentum and yaw are integrated, not snapped.
- 800 throttle-release, weak-input, pause and reset scenarios. Weak input never adds automatic brake, rack override or longitudinal assist. After a prior strong turn, the explicitly exposed yaw/lateral recovery decays monotonically and expires; released throttle clears all assistance immediately.
- 400 strong-turn unwind cases across all profiles and gears. Existing tight residual-yaw/slip limits pass.
- Four explicit contact patches and their individual friction bounds remain intact.
- 46,908 actual rendered Float32 road/terrain triangles; full road-width grade <=7.5%; queried ground height and normals match the uploaded geometry.
- Higher authored field reaches 66 m versus 28 m previously. Checkpoint/preview platforms are level; authored joins are C1.
- 2,034 tire-ground fits, all 1,284 scenic bases, road/terrain seams, and 192 two-way falling-rock terrain sightlines.
- Actual app code under real Three.js math/meshes with mocked DOM/renderer: wheel ±135°, full-turn path fuel/camera totals, zero-delta frames, pointer-release coast, focus/visibility resets, all five biome teleports, garage return and rebuild.

## Bounded geometry detail

Piecewise-linear Float32 facets are not an analytically smooth surface. A sub-mm fork band has a maximum ~0.218° normal difference from the authored field; actual rendering and collision queries agree. Across 23,752 fork triangles, max authored-height error is 0.358 mm. Across 1,422 production ground-fit checks around skinny bands, max second-difference support residual is 0.0213 mm. See `fork-quantization.json`. Exact union topology was preserved.

## Corrected defect

The first scan found a 7.832% inner-edge grade on the final curved descent although the centerline remained within 7.5%. The author flattened that descent; the final scan now reaches exactly 7.5%. See `corrected-finding.json`.

## Limits

Offline numerical/runtime evidence only. No browser was launched. WebGL, GPU output, mobile interaction, Android and human visual readability remain unverified. The parent separately owns the complete route-journey and aggregate regression runs.
