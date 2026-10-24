# 60 FPS comparison record

Date: <!-- UTC and local timezone -->
Baseline: dirty checkout snapshot `output/fps-60/baseline`, HEAD <!-- hash -->
Final: <!-- path, HEAD, patch hash and uncommitted state -->
Browser/version: <!-- exact -->
OS/CPU/RAM: <!-- exact -->
GPU/WebGL renderer: <!-- exact; hardware or software -->
Power/thermal conditions: <!-- recorded or unmeasured -->
Other active workloads/pages: <!-- exact -->
Server URLs: <!-- baseline/final, served source versus build -->
Diagnostic injection: exact `qa/fps-60/init.js` on both navigations
Repetitions per scenario: <!-- exact -->
Warmup/stable sample duration: <!-- exact -->
Motion, fleet preloading, quality mode: <!-- exact and matched -->

| Profile | Scene / motion | Baseline stable FPS | Final stable FPS | Baseline p95 / p99 ms | Final p95 / p99 ms | Baseline / final calls | Baseline / final GPU mean ms | Validity / evidence |
|---|---|---:|---:|---|---|---|---|---|
| Desktop 1280×720 DPR 1 | Hangar | | | | | | | |
| Desktop 1280×720 DPR 1 | City drive | | | | | | | |
| Desktop 1280×720 DPR 1 | Desert drive + weather | | | | | | | |
| Desktop 1280×720 DPR 1 | Snow drive + weather | | | | | | | |
| Desktop 1280×720 DPR 1 | Canyon BMW drift | | | | | | | |
| Emulated 844×390 DPR 2 | Hangar | | | | | | | |
| Emulated 844×390 DPR 2 | City drive | | | | | | | |
| Emulated 844×390 DPR 2 | Desert drive + weather | | | | | | | |
| Emulated 844×390 DPR 2 | Snow drive + weather | | | | | | | |
| Emulated 844×390 DPR 2 | Canyon BMW drift | | | | | | | |

For each accepted row, link JSON plus screenshot, and include separate warmup
numbers, CPU stage means, triangles, texture/geometry/program counts, invalid
flags, GPU sample/disjoint counts, browser errors and failed network requests.
If repeats differ, report each run and the spread. Do not silently discard a
slow valid run. A route recovery, mismatched viewport/assets, inactive weather
or canyon without actual drift is not a matched sample of the intended scene.

## Changes and evidence

<!-- Measured bottleneck -> narrow change -> before/after effect and visual tradeoff. -->

## Regression checks

| Check | Snapshot command + result | Final command + result | Baseline failure or introduced regression |
|---|---|---|---|
| Rendering | | | |
| Startup | | | |
| World labels / input | | | |
| Camera | | | |
| Rapier / drift / contact | | | |
| Physics app integration | | | |
| Yandex build | | | |
| VK build | | | |
| Production browser smoke | | | |
| Models, settings, garage, driving, canyon | | | |

## Limits and remaining work

<!-- Distinguish observed hardware results, emulation, unavailable measurements and unfinished verification. -->

Desktop and emulated phone viewport results apply to the measured machine.
Android CPU/GPU, memory pressure, thermal throttling and sustained phone FPS
remain unmeasured until an actual target-device run. CPU command submission is
not GPU duration. Shader compilation is not measured separately. No commit,
push, deployment or publishing is implied by local verification.
