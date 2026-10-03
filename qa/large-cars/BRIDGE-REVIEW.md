# Enlarged vehicle bridge review

All ten real Cosmo GLBs retain safe centered crossings at the new 1.5× road
scale. The 25 existing bridges remain 5m wide; no bridge runtime changes were
needed for this review.

## Measured clearance

The rover/jeep is the limiting vehicle. Its unsteered outer tire width is
4.42901m, leaving **0.28549m per side** when centered. The other nine vehicles
have at least 0.60538m of straight centered tire clearance per side.

For the combined small-correction test envelope of ±0.04rad body yaw (2.29°),
±0.08rad wheel steering (4.58°), and ±0.02m center offset:

- Every vehicle remains supported on every bridge in both directions.
- Sampled real tire meshes retain at least 0.04574m lateral clearance.
- Conservative tire rectangles, enclosing every real tire vertex through all
  wheel spin phases, retain at least **0.02564m** against the actual bridge
  entry/midpoint/exit geometry, including curved approaches.

At full steering lock (0.48rad), the rover's sampled complete tire silhouette
is 5.17078m wide, about 0.08539m beyond a 5m deck on either side. This does not
mean the bottom contact patches have lost support: the support logic correctly
uses the tire contact lines rather than the upper circular silhouette. It does
mean that full-lock whole-tire clearance must not be advertised.

**Approach recommendation:** align before entering, stay centered, and use
small corrections on the deck. Keep the requested bridge width unchanged.

## Durable checks

Run from the repository root:

```sh
node tests/large-bridge-clearance.mjs
node tests/cosmo-bridge-support.mjs
```

`bridge-clearance.json` records the enlarged adapter, bridge, and camera source
hashes, every vehicle's measured margins, and default-view projection results:

- 500 complete crossing pose sweeps: 10 vehicles × 25 bridges × 2 directions
- 18,500 centered positions, sampled each metre from 6m before entry to 6m after exit
- 9,000 combined modest yaw/steer/offset support checks
- 256,000 conservative whole-tire envelope checks at seven longitudinal positions
- 40 default-camera views using actual mesh vertices at 1920×1080, 390×844,
  320×568, and 320×844, with the production portrait camera scale

`bridge-support.json` records the existing independent real-GLB support/fall
suite after updating its police-car legacy-width comparison to derive the
offset from the enlarged model's measured wheel track:

- 10,500 centered approach/crossing cases, including ±0.08rad yaw
- 2,000 measured side-boundary cases and 1,000 wide-approach cases
- 320 exact axle entry/exit thresholds and 3,000 diagonal cases
- 240 fall sequences, including front/rear approach hinges and reverse heading
- 965,496 supported tire-vertex/deck checks; minimum clearance 0.003m
- No starting position snap or tip/release discontinuity

These are CPU geometry, pose-sampling, production support, and camera-projection
checks. They do not establish browser rendering, GPU behavior, touchscreen
handling, or an automated driver completing every crossing dynamically.
