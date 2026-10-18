# Low-end rendering implementation plan

Approved in conversation. Base: main 7f30d49. Branch: codex/low-end-rendering.
Goal: reduce rendering work while keeping current graphics, targeting phones and integrated-GPU PCs. Reference device: iPhone XS, iOS 18, Safari; 30 FPS with 20 players is a measured target, not a desktop-derived guarantee.

## Task 1: Spatial rendering
- TDD: conservative 256m cells, unchanged canonical geometry/attributes, original triangle and instance order, camera/shadow union, transforms/layers, stable buffers and complete disposal.
- Implement createSpatialRenderer(THREE,{roots,cellSize:256}) returning update({camera,shadowCameras}), stats and dispose().
- Keep one render proxy per existing material batch; compact original indices or instance matrices/colors into preallocated buffers only when membership changes.
- Register explicitly immutable city/canyon batches. Preserve canonical scene API and all gameplay, fog, DPR, antialiasing, shadows, effects and models.
- Integrate after camera/light/peer updates; dispose before world teardown. Freeze only explicitly immutable local transforms.
- Verify 42 camera views, at least 75% fewer submitted main-world triangles, no extra draw batches. Commit.

## Task 2: Diagnostics and iPhone QA
- TDD: bounded frame statistics, pause/background/loading exclusion, correct room counts and development-only diagnostic flags.
- Add perf=1 overlay/report and render=baseline comparison using the same build, no production bypass of developer/ownership guards.
- Supply 19 QA peers plus one human, isolated QA room, baseline/optimized LAN links, portrait/landscape scenarios and JSON export.
- Target comparable ten-minute Safari runs after equal warmup; record FPS and frame percentiles. Physical-device result requires the user's phone.
- Commit diagnostics and instructions.

## Task 3: Verification and review
- Build Yandex and VK; run spatial/profiler, canyon, online, classroom, development and relevant app tests.
- Compare npm test against five already-confirmed baseline physics failures; no new failures accepted.
- GPU A/B visual check, shadow and animation edge cases, resize/context restoration, repeated rebuild/disposal.
- Independent whole-branch review under requesting-code-review, fix important findings with regression tests.
- Leave feature branch with logical commits and report. No merge/push requested for this task.
