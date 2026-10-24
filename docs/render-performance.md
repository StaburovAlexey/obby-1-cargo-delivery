# Development diagnostics and visible-world rendering

The development server shows the performance panel automatically in developer
sessions (`npm run dev`, `?dev=1`). `?perf=0` hides it, `?dev=0` disables automatic
activation, and `?perf=1` explicitly enables diagnostics on the dev server.
Production Yandex/VK builds ignore diagnostic query parameters.

The compact panel reports rolling FPS over the last second (bounded to 240
samples), a 120-frame graph, session p95/p99 and render calls/triangles.
Details show measured JavaScript time spent in physics, game logic/effects, UI,
network, culling and rendering, plus total measured callback time, Rapier steps,
DPR and allocated geometry/texture counts. Display refresh is limited to 4 Hz.
GPU time/utilization and memory in MB are not inferred from these values.
`renderer.render()` CPU time includes command submission and possible driver
waits; it is not a GPU timer. Pause/background intervals are excluded, while
active long frames remain in session statistics. Reset and JSON export are
available in the panel. JSON `fps` remains the session mean; `current.fps` is the
recent rate. Timing samples begin with the second active frame, like intervals.

## Visibility

- City and canyon static geometry is compacted in 128 m spatial cells, using
  the union of the camera frustum and relevant shadow-camera frusta.
- A cell can be removed beyond complete linear fog. This uses camera depth,
  not radial distance; geometry crossing the fog plane and screen corners stay
  visible. Shadow casters are kept independently of this fog cutoff.
- The hangar shell, individual vehicle roots, character displays and each
  roadside checkpoint have separate conservative zone bounds. Entire invisible
  groups stop being submitted to the renderer. The selected vehicle bounds
  follow its current transform rather than its old parking bay.
- No zone is disabled merely because a different gameplay mode is active:
  adjacent roads, canyon access, reverse views and overview cameras must work.
  In the hangar, only camera/shadow-visible nearby road cells are submitted;
  distant world geometry is retained in memory, not unloaded or regenerated.
- Invisible checkpoint icons and the parked reward vehicle skip decorative
  animation writes. Reappearing icons catch up to absolute animation time.
  Physics, hazard simulation and drift control do not depend on these gates.
- While driving, the frame-driven economy HUD poll runs at 10 Hz. Walking
  availability updates keep next-frame cadence; explicit gameplay/menu
  events retain immediate refreshes. World-label positions keep camera cadence.

These changes reduce rendering/submission and some decorative CPU work. They do
not eliminate all matrix traversal or reduce all retained asset memory.

## Verification and comparison

Run `npm run test:rendering`, `npm run test:camera`, `npm run test:rapier` and
`npm run build:all` as appropriate. The rendering suite includes pure visibility,
profiler, animation and actual-application regression tests. The original
20-player phone procedure remains in `qa/rendering/README.md`.

`measureGeometry({cellSize:256})` and
`measureGeometry({cellSize:128,maxDistance:1600})` in
`qa/rendering/geometry.mjs` provide comparable CPU geometry accounting over
42 camera poses. In the 2026-10-23 run before restricting terrain rock to bridge banks, mean submitted pass-weighted triangles
fell from 58,204.88 to 49,914.05 (14.24% fewer), without any increase in calls.
This comparison is against the previous spatial renderer, not an unoptimized
whole-map baseline, and is not a measured FPS improvement.

The target is 60 FPS (16.67 ms frame interval) on a specified device. Inspect
p95/p99 and stalls during sustained 10–15 minute runs, including weather,
transitions, rapid camera turns and twenty-player rooms. A software-rendered
browser or desktop check cannot certify stable 60 FPS on Android hardware.

### Verification record, 2026-10-23

- Rendering suite: 47 passed, zero failures.
- Rapier suite: 41 passed, one optional handling-matrix case skipped.
- Actual physics application integration: 11/11 internal checks passed,
  including all eleven vehicle configurations. Camera cadence and settings
  regression files also passed (the combined Node run reported 6/6 subtests).
- Both Yandex and VK production builds completed; syntax and diff checks passed.
- Browser smoke checks covered the hangar, a remote forest road, the moving
  selected vehicle outside its original bay, canyon visibility and garage return.
  The browser reported SwiftShader software rendering, so its FPS was excluded
  from performance claims. WebSocket connection errors were expected because
  no room backend was running for that isolated frontend smoke check.
- The older standalone `tests/garage-scene.mjs` has five layout/catalog
  expectation failures. The same five were reproduced against its HEAD
  implementation before this change; its existing animation check and both
  new visibility-animation tests pass. This is not a green full `npm test` claim.
- Sustained hardware-device and twenty-player FPS measurements remain unperformed.

## Bridge-bank rock geometry (2026-10-23)

Layered earth/rock faces now remain only at the 25 bridge banks and boundary
segments intersecting a 10 m route-progress margin around each bank. Whole
segments are retained to keep bank corners joined. Canyon sandstone geometry
is independent and unchanged.

Visible terrain-rock triangles fell from 226,282 to 46,102: 180,180 fewer
(79.63%). The main procedural city now contains 136,467 triangles; this count
excludes garage models and the separate canyon.

The generator retains all original 16,163 cliff-section top-edge pairs in a
compact Float32Array. Rapier builds the same 32,326 simplified wall triangles
from those pairs, independently of visual trimming. An exact comparison against
the previous generator found identical cliff collider vertex/index buffers,
315 chunks and identical bounds. If separate physics-edge data is absent, the
existing index-aware geometry fallback still respects removed branch sections.

Verification includes all 50 bridge-bank ray checks, visual margin boundaries,
full-map triangle counts, and exact collider buffers with transformed meshes
and one/zero visible sections. Removing outer-perimeter rock changes side/below
views of the landscape; the ground top surface is retained.

The terrain/physics focused run passed 17/17, the rendering suite passed 51/51,
and both platform builds succeeded.
The full `npm test` run stopped at
`tests/biome-progression-ui.mjs` (locked garage car purchase availability): the
earlier 100 ms economy HUD poll delayed a walking interaction. Walking HUD
updates now keep next-frame cadence, and that file passes 5/5. The remainder of
the full chained suite was not run after this correction. Browser inspection
covered city and snow bridge-bank faces; the only resource error in the isolated
QA page was its absent favicon.
