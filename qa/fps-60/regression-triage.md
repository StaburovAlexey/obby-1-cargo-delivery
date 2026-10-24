# Focused regression triage, 2026-10-24

Reference is the exact pre-FPS dirty snapshot at `output/fps-60/baseline`,
which already includes model/media and progressive loading optimization.
Runtime sources and the saved snapshot were not changed by this triage.

| Check | Exact snapshot result | Interpretation |
| --- | --- | --- |
| `node --test --test-name-pattern='actual garage, canyon roads' tests/physics-world.mjs` | Fails `88 !== 90` | The snapshot already has 88 moving hazards; the test still hardcodes 90. |
| `node --test tests/brake-lights.mjs tests/rapier-vehicle.mjs` | Brake parser fails reading `bufferView`; Rapier vehicle fixture fails `setKTX2Loader must be called before loading KTX2 textures` | Both are pre-FPS model-test compatibility failures. The brake parser assumes PNG and `texture.source`; optimized files use KTX2 extension sources. The standalone Node loader has no renderer/KTX2 configuration. |
| `node --test --test-name-pattern='real application frames keep' tests/driving-camera-cadence.mjs` | Fails `configureModelLoading is not defined` in the old application fixture | The saved fixture already omitted new application dependencies; it cannot reach camera assertions unchanged. |
| `node --test tests/startup-app.mjs` | Fails the same missing `configureModelLoading` binding | Snapshot fixture compatibility failure. In addition, source inspection finds its eager-all-assets assertions conflict with the snapshot's intentional progressive loading. |
| `node --test tests/startup-hazards.mjs` | Fails `94 !== 90` | The fixture hardcodes 90 total hazards while both snapshot/current generation contain 94. |

Current camera / Rapier-app tests exposed one further missing fixture binding:
`roadPitRampBoost` was imported and used by both saved and current app sources,
but was absent from both application fixtures. The only triage code edit adds
that real function to the current fixture import and its dependency map.
The driving camera assertions are unchanged. Its post-fix output is saved in
`regression-final-camera.log`: **4/4 pass**, 105.93 seconds. The five steady
cadence runs (60/90/120/144/variable-60) report maximum car/camera jumps of
0.00003/0.00002/0.00001/0.00001/0.03569 pixels, all below the unchanged 0.05
pixel assertion. Zero-tick angular motion and fuel/path accounting also pass.

The startup custom loader fake supplies only `vehicleVisuals.ready`; the real
progressive controller now supplies `ensure`, `request`, and per-vehicle visual
attachment. No fake eager completion or weakened startup assertion was added
to make obsolete eager-loader tests pass.
