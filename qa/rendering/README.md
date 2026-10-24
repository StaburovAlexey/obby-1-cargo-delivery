# Rendering QA

Reference: iPhone XS, iOS 18, Safari. Keep the current DPR, antialiasing,
2048 shadow map, fog, textures, effects and models. Desktop figures do not prove
phone FPS. The target is p95 frame intervals at most 33.4ms with twenty players.

## Dedicated twenty-player room

From the repository root:

    node qa/rendering/room.mjs --port=8092
    PORT=8092 npm run dev -- --port 8093

The nineteen QA peers use the heaviest catalog character and follow one human;
while the human drives, they use BMWs. Only one human browser may be open:
another browser creates another room. Close desktop QA before joining on iPhone.
The room server binds loopback; the frontend proxies its WebSocket.

Open on the same Wi-Fi (replace HOST with the development machine's LAN IP):

    http://HOST:8093/?dev=1&perf=1&render=baseline
    http://HOST:8093/?dev=1&perf=1

The baseline disables both spatial compaction and frozen display transforms.
Both flags only work on the development server, never enable premium ownership
by themselves, and are ignored in production platform builds. Developer gameplay
is the existing isolated practice session; career saves are not overwritten.

Wait for 20/20 players and nineteen loaded peer models, then use the diagnostic
Reset button. Compare ten-minute runs after equal warmup, screen brightness and
orientation, without screen recording. Include classroom/garage, each road biome,
the canyon, looking backward, rapid camera turns and portrait/landscape rotation.
The existing developer biome selector and garage vehicle selection provide the
route/canyon access. Repeat with nineteen characters around the classroom.
Loading, menus, ads, backgrounding and application pause interrupt sampling;
active long frames are retained. FPS is the aggregate active-frame rate; numeric
p50, p95 and p99 are rounded up with 0.1ms histogram resolution through 2000ms.
A percentile beyond this range is the string `">2000"`, not the session maximum;
`frameMs.overflow` reports this bound and the number of longer intervals. The
maximum and aggregate FPS retain all intervals. JSON exports also include render
calls/triangles (shadow pass included), allocated geometry/texture counts and
room/model counts. There is no GPU timer or pixel readback in this profiler.

## Automated geometry and GPU comparison

    npm run test:rendering
    node qa/rendering/geometry.mjs > output/low-end-rendering/geometry.json

The 42 CPU views cover seven route distances, three directions, and iPhone
portrait/landscape aspects. They include the shadow-camera union and require
at least 75% fewer submitted world triangles with no additional batches.

For the GPU pixel check, serve the repository on loopback:

    python3 -m http.server 8766 --bind 127.0.0.1

Open /qa/rendering/index.html and click Compare. This separate QA page compares
eight camera views of actual city, garage and canyon modules with 2048 shadows.
Pixel readback occurs only here and its timings are not FPS measurements.
Its procedural parked rigs and absent live peers do not substitute for the
full game's real GLBs, animations, network or physical-phone test.

Rebuild the scene repeatedly; retained original geometries must be disposed once,
proxy index/instance buffers must not accumulate, and shared materials/textures
must survive proxy teardown. Check WebGL context loss/restoration and bfcache.
Existing five failures in tests/physics-app-integration.mjs must be compared
against main 7f30d49; they are not a green full npm test result.

## Current development panel and zones (2026-10-23)

The panel now activates automatically in developer sessions; use `?perf=0` to
hide it. Rolling FPS, frame graph, measured CPU stages and visibility zones are
described in [docs/render-performance.md](../../docs/render-performance.md).
The new 60 FPS objective is stricter than this document's original 30 FPS phone
baseline. It still requires a sustained measurement on the actual target phone.
