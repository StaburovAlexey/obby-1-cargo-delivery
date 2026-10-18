# Final validation — 2026-10-18

Base source: GitHub `StaburovAlexey/obby-1-cargo-delivery`, branch `codex/handling-grip-rebalance`, commit `af974bcc75536154fd7779df2b463e2bd247083f`. The separate local branch is `codex/network-client-drift`; its baseline was initialized from the downloaded source, so publication must preserve the real GitHub ancestry rather than push the synthetic local history.

## Passed

- `npm run build:all`: Yandex and VK production builds, using final app and transport source. Log: `build-all.txt`.
- `npm run test:online`: **113/113**, including binary validation/fuzz, client reconnect/resync, slow receivers, exclusive seats, 20+1 rooms, multiprocess routing/crash/startup/shutdown, image-equivalent packaging, actual app pause events without RAF, and existing platform lifecycle cases. Log: `final-online.txt`.
- `npm run test:platforms`: **59/59**. Log: `final-platforms.txt`.
- Canyon/classroom/trophy/Yandex/localization aggregate: **142/142**. Log: `client-regression.txt`. After the final app pause flush, the targeted canyon transitions, physical BMW journeys, classroom/trophy app and no-RAF pause suite was rerun: **17/17**, `final-app-integration.txt`.
- Final account/cache regression: **15/15**, `client-cache-account-regression.txt`.
- Independent review verified the hard-backpressure seat-claim crash fix, malformed JSON-delta rejection and reconnect idempotence. An independent 12,032 single-byte mutation check found every accepted decoded movement also satisfied the complete state validator and unit-quaternion invariant.
- Final matched localhost benchmark: **10/10 cases**, 20/100/200 users in near/far/stationary workloads plus 500 near. Three separate cadence probes pass. See `RESULTS.md`, `benchmark-summary.json`, raw JSONL, source hashes and provenance. No production endpoint or live leaderboard was touched.
- `git diff --check` passed.

## Inherited aggregate failures

`npm test` still stops at the same five `physics-app-integration.mjs` failures reproduced on the untouched baseline. Names match exactly; no failures were hidden or disabled:

1. Held wheel plus a second-pointer gear change brakes before rolling in reverse.
2. Blur, resize and hidden-tab safety resets clear every planar momentum channel.
3. Overview pause, garage return and re-entry clear stale forces, spin and teleport distance.
4. Empty fuel with sideways/angular momentum returns safely and cannot pay a coincident delivery.
5. All ten vehicle configurations retain finite dynamics and their own fuel accounting.

See `baseline-npm-test.txt` and `final-npm-test.txt`. The baseline focused online/canyon/classroom suite separately passed 143/143 in `baseline-focused.txt`.

## Limits and release checks

- No GitHub push, Sites publication, VPS deployment, firewall/port changes, or paid services.
- No live Yandex score writes; SDK writes are mocked. Client-only scoring intentionally provides weaker anti-cheat and carries no server attestation.
- No browser/GPU, mobile FPS or real-network/VPS capacity validation. Source/DOM/simulation tests are not visual playtesting.
- Docker and nginx executables were unavailable. A fresh isolated filesystem containing the image's runtime files booted and served real WebSockets successfully. systemd verification was blocked by read-only `/run/systemd`; actual daemon/container/proxy validation remains a deployment check.
- Short localhost tests are measurements, not a 2,000-player capacity guarantee. Memory did not improve; instrumented load-generator RSS increased. Arithmetic bandwidth projections are labeled separately from measured results.
- Protocol v2 requires a coordinated frontend/server release. Reconnects receive a fresh identity and available room; worker-local room membership is not durable.
