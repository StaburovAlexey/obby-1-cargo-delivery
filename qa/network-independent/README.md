# Independent curved-route audit

Run: `node tests/network-independent.mjs`

The suite uses actual Three.js Float32 geometry, a separate triangle spatial index and polygon clipping implementation, and the real application code under mock DOM/renderer/OrbitControls objects. It does not launch a browser and does not establish WebGL shader compilation, GPU performance, touchscreen behaviour, Android compatibility or a browser screenshot.

## Coverage

- Road/terrain height and normal agreement against uploaded triangles; every interior boundary probed from both sides
- Full-body containment at all eight concave fork tips, including cases where all four corners are inside the road
- Forward/reverse four-wheel ground fitting on every edge, with side offsets
- Closed outward scenic solid meshes, zero positive-volume asphalt intrusion, and no cross-feature coplanar horizontal surfaces
- All 22 delivery/refuelling circles, including triangle interiors across grades
- Every car and every biome preview: alternate-arm stale history, context reset, saved economy preservation, camera snap, garage return and rebuild
- Full-route overview framing at six phone/desktop aspect ratios, far/fog limits, OrbitControls distance allowance and mode restoration
- Preview reward suppression at all 11 delivery gates and exactly-once ordinary delivery settlement

The report records runtime hashes before/after the test and fails if the checked sources change during the run.

## Defects found and corrected during review

1. Duplicate fork scenery: 106 cross-edge base footprints overlapped. Actual Float32 volcanic basalt-footing roof parts 837 and 921 shared y=17 with 215.837 m² overlap; desert sandstone bases 348 and 432 shared y=16 with 215.843 m² overlap. The scene author corrected fork-side ownership and median-width eligibility. The strict uploaded-face audit now detects any recurrence; nested tiers of the same feature are intentionally exempt.
2. Portrait overview clipping: the original fixed overview zoom produced |NDC x|=1.077675 at 390×844. The first aspect-aware fit exceeded the fixed 18 km far/fog limits and the 16 km OrbitControls maximum distance. The application author made fit, far/fog and maximum orbit distance consistent. The regression requires complete XYZ visibility and restores the playing camera limits afterwards.

## Additional unchanged-feature checks

- Existing `tests/twenty-desks.mjs`: 10 groups, 555 entrance/occupancy combinations and 1,700 avatar/seat cycles passed.
- Existing `tests/character-row.mjs`: all 17 actual GLB characters, marker positions and 68 lateral approaches passed.
- Seated pose/calibration, character IDs, vehicle/walk/jump inputs, follow-camera, vehicle upgrades, progression configuration and career save modules have no changes versus the tracked baseline (`preserved-inputs.diff` is empty).

See `report.json` for final numeric results and verified source hashes. `barrier-coplanar-overlaps.json` is the full overlap list, empty on success.
