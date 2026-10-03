# Independent school-anchor review

Baseline: published Site32, commit `28b8ff4445f392f47a515fe62d115d1f84b9f689`.

## Verdict

10/10 independent groups pass. The old horizontal fan-out is removed. Each school label stays at its own exact projected entrance anchor, including side views and screen edges. Nearer school labels receive higher stacking ranks than farther labels. Turning to the opposite side reverses the nearest school correctly. Scale, composition, rates, purchases and the shared 20 seats remain intact.

The published old logic was replayed as a regression witness. For five coincident side-on anchors in a 390 px viewport, it moved a label as much as 148 px and spread the group across 296 px. The fixed implementation preserves the common X of 195 px, with only floating-point noise.

## Evidence

- 3,072 real app projection frames: eight viewports from 320 to 1440 px, 24 yaw angles spanning a full turn, four pitches and four distances. 11,892 visible labels matched an independent homogeneous clip-space oracle. Maximum coordinate disagreement: `2.2737367544323206e-13` px. 10,574 overlapping label pairs were exercised with camera-depth stacking checked.
- Exact front, side, back and opposite-side cases. Front/back projected order reverses naturally. Side-on common anchors are retained, with school 5 nearest on one side and school 1 nearest on the other. Turning the camera away hides the labels; returning restores the correct positions and ranks.
- 224 edge/near-camera cases, including 192 visible anchors outside the viewport center bounds but inside the existing 1.08 NDC margin. No clamp or spacing override is applied. Near-plane, frustum and 65 m distance culling remain intact.
- 864 additional ready-character frames exercise the actual follow camera during 24 complete turns, with 1,992 visible label checks.
- Purchase states, all five owned access rows, reload, insufficient-funds rejection, purchase-then-seat separation, exact study rates and selection of desk 20 when the first 19 shared seats are occupied.
- Sixteen car/skin camera poses preserve their unchanged projection and visibility behavior. 47 visible car labels and 61 visible skin labels match the independent oracle; no school stacking is assigned to those labels.
- All 63 other tracked runtime/assets are byte-identical to the baseline. App code differs only by returning the existing projected depth. CSS differs only by removing the old positional transition and its now-unused reduced-motion override. Other progression HUD logic and the skin-label loop match the baseline.

## Reproduce

Run from the site directory:

```sh
node tests/school-anchor-review.mjs
node qa/school-anchors/render-diagnostic.mjs
```

`independent-results.json` records detailed counts, source hashes and failures. `baseline-contract.json` and `baseline-progression-hud.js.txt` make baseline checks reproducible without Git history. `projection-specimens.json` records the exact sample coordinates. `anchor-diagnostic.svg` is a compact geometric illustration generated from those samples; colored boxes show label bounds, not final transparent artwork.

## Limits

This audit executes actual application code and Three.js with the existing mock DOM/renderer. Controlled-camera tests keep a character asset pending to prevent the follow camera from replacing test poses; ready-character tests separately cover the live follow path and real purchase buttons. No runtime or fixture source was modified by this review.

The browser route was not attempted because it was explicitly denied. This is not browser CSS-layout, WebGL, Android, physical-touch or subjective visual validation. Depth ordering applies between HTML school labels; it does not establish occlusion by world geometry. The retained inner bob moves the whole composition by up to four authored pixels while the outer anchor remains exact.
