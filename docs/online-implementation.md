# Online and Yandex implementation

Current transport and scoring behavior is documented in [network optimization](network-optimization.md). The deliverable list and ledger below describe the original October 15 implementation; its full-snapshot traffic and server-verified drift ranking are superseded by the October 18 update.

Approved conversation specification, 2026-10-15. Work in this directory; GitHub push and logical dated commits were authorized after the feature plan. No deployment or publication requested. Backup: output/online-implementation/before-online.tar.gz.

## Deliverables

1. Fixed current map, automatic rooms of 20, server-exclusive 20 classroom seats, ephemeral WebSocket room server, Docker optional and systemd supported. Protocol rate 10 Hz; remote visual interpolation 150 ms. No peer collision or shared economy/hazards.
2. Yandex SDK adapter, cloud-only career/settings persistence, one-time legacy import, offline changes in memory, newest-save conflict policy, permanent premium skins (last five IDs) at 39 portal units/catalog pricing, preserve prior ownership. SDK lifecycle and language detection (existing RU/EN); all-34 translation was discussed as a possibility, not included in approved implementation.
3. Advertising after 240 active seconds, countdown 3 then 2 then 1, local gameplay/audio paused throughout. Defer near bridge or full swept obstacle area by max(50 m, speed * 5 s), measured from avatar/vehicle bounds. Defer while modal, jumping, falling, teleporting/loading. One pending attempt, reset interval after any completed attempt; preserve desk during ads.
4. Browser integration, focused tests, source/build audit, load steps 100/200/500/1000 clients (50 full rooms at 1000), measured capacity only. Yandex real draft/account/payment/device checks remain manual, no publishing.

## Current shared protocol contract

Server and browser share `dist/online-protocol.js`, protocol version 2. JSON control messages cover joining, full welcome/resynchronization, roster/static changes and exclusive seat reservations. Quantized binary messages carry dynamic movement. The exact packet constants, bounds and version checks live in that shared module; [network optimization](network-optimization.md) describes encoding, near/far cadence and recovery. Version 1 clients must reload the matching new frontend before joining a v2 server.

`number` remains a stable room-assigned display number. `onlineClient.roomSnapshot` includes the complete known roster (including self) for classroom map dots; the `players` getter excludes self for remote avatars. Far and stationary players stay known. Joins, departures and reconnect/reset do not depend on recurring full snapshots.

There is no `driftLeaderboard` in movement traffic and no server drift-verification RPC. The board shows the shared cached global Yandex leaderboard. Client-local completed score submission uses the Yandex adapter, with developer suppression and best-only checks; it is deliberately not server-attested.

State retains seq, walking/driving/studying mode, characterId, vehicleId or null, position, quaternion, heading, speed, steer, wheelSpin, bodyPitch/bodyRoll/bodyBob, braking, airborne, jumpElapsed, paused, teleportId and seatId or null. Only bounded finite values and catalog IDs are accepted. The server alone grants seats. Static IDs and seat ownership travel on change rather than in each movement entry.

## Ownership and progress

- Backend agent: server/**, dist/online-protocol.js, tests/online-server*, scripts/stress-online.mjs, deployment samples. No app/package edits.
- Platform agent: dist/yandex-platform.js, dist/cloud-career.js, dist/premium-skins.js, tests/yandex-platform*, tests/cloud-career*, tests/premium-skins*. No app/package/career-save edits. Agreed interface delivered to coordinator.
- Coordinator: dist/app.js and integration/UI, remote rendering/client, bootstrap, advertising policy/controller, fixtures, package/build/docs, final verification and review.

## Historical ledger (October 15 implementation)

- Setup: backup created. No Git worktree possible because no repository. User authorized execution of the plan.
- Ruling: SDK cloud is the only ongoing durable persistence; legacy reads are migration-only, no local writes. Offline progress can be lost on closing the page, as explicitly chosen.
- Ruling: fixed current map uses existing seed 42 and protocol compatibility, not multi-map matchmaking.

- Git ruling: preserve remote main ancestry; push to git@github.com:StaburovAlexey/obby-1-cargo-delivery.git after review. User requested logical commits with varied October 1–15 timestamps and removal of ordinary code comments; copyright/license notices retained.
- Review: fixed missing bridge safety import, hidden-time accounting, synchronous countdown suspension, interactive payment timeout, cached premium ownership on SDK failure, and premium prompt pricing. Countdown uses 2,1 over two seconds before the SDK call.

- Verification: 79/79 focused checks, production Rsbuild + build audit passed. Browser verified20-player room/20unique desks/19loaded replicas and production SDKmock payment/cloud/ad lifecycle. All five general physics-suite failures reproduced identically on pre-change backup.
- Stress: all100/200/500/1000 steps passed30seconds. At1000:50rooms,9.62snapshots/client/s,172.5MiBRSS,76.96%ofoneCPUcore,847.62Mbit/s outgoing payload. Loopback only; publicWSS/VPS/Yandexdraft/device checks pending.
- Cleanup:7308ordinaryJS/CSS/HTMLcomments and5Pythoncomments removed;94license/directive notices retained; identicalJavaScript/PythonAST confirmed. See qa/online-release/README.md.
