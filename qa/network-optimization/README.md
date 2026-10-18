# Network benchmark evidence

This directory contains local-only evidence for the multiplayer optimization. The stress runner binds its server to `127.0.0.1`, rejects non-loopback client URLs, does not contact a production endpoint, and never submits drift leaderboard records.

## Reproduce a matched comparison

Use the same Node version and host, and avoid concurrent builds or load tests. Keep the baseline checkout unchanged.

```sh
node scripts/stress-online.mjs --source-root=../handling-grip \
  --users=20,100,200 --workloads=near,far,stationary \
  --duration=8 --warmup=2 > qa/network-optimization/baseline-matched.jsonl
node scripts/stress-online.mjs --source-root=. \
  --users=20,100,200 --workloads=near,far,stationary \
  --duration=8 --warmup=2 > qa/network-optimization/optimized-matched.jsonl
# Optional single-worker 500-user near-field sanity check:
node scripts/stress-online.mjs --source-root=../handling-grip \
  --users=500 --workloads=near --duration=8 --warmup=2 \
  > qa/network-optimization/baseline-500-near.jsonl
node scripts/stress-online.mjs --source-root=. \
  --users=500 --workloads=near --duration=8 --warmup=2 \
  > qa/network-optimization/optimized-500-near.jsonl
cat qa/network-optimization/baseline-matched.jsonl qa/network-optimization/baseline-500-near.jsonl > qa/network-optimization/baseline-all.jsonl
cat qa/network-optimization/optimized-matched.jsonl qa/network-optimization/optimized-500-near.jsonl > qa/network-optimization/optimized-all.jsonl
node qa/network-optimization/summarize-benchmark.mjs \
  qa/network-optimization/baseline-all.jsonl \
  qa/network-optimization/optimized-all.jsonl
node qa/network-optimization/probe-peer-cadence.mjs > qa/network-optimization/peer-cadence.jsonl
node qa/network-optimization/write-results.mjs
```

The common harness imports the actual production `createOnlineClient`, protocol initializer, catalogs, and server from each `--source-root`. It does not reimplement the binary codec or client-side upload suppression. Every case starts fresh server/client processes, fills rooms to 20 players, claims all seats, releases four out of five, warms up, measures, deliberately replaces 1% of clients (at least one), and checks the final room state.

Workloads are deterministic and bounded:

- **near:** players move within a 20m-wide area; 20% retain a stationary school seat, 20% walk, 60% drive.
- **far:** the same movement and seat mix, with unique grid offsets at least 580m apart. Lower-rate map updates are expected; every player stays in the known roster.
- **stationary:** fixed positions and visual state for every player, with the same mode and seat mix. Production heartbeat behavior determines the upload rate.

The clients call `update(0.1)` every 100ms in both versions. Measurements count the resulting wire sends, not only attempted calls. The common driver timestamps every received frame and every observed change in each remote player's sequence. No score/leaderboard request is issued.

## Meaning of the metrics

- `ok`: no protocol/client errors, no invalid accepted-state messages, full 20-player room rosters, unique player IDs, valid exclusive seats, expected global room/player/seat counts, initialized remote poses, and successful replacements.
- `targetMet`: in addition to `ok`, at least 95% of scheduled 10Hz simulation calls were processed, state uploads reached at least 85% of the expected production rate (v1 10Hz; v2 all-stationary 1Hz or mixed 8.2Hz), final remote silence is at most 2.2s, and moving-peer update gaps/silence are at most 600ms near or 1.2s far. The tolerances are explicit health checks, not proof of Internet delivery guarantees.
- `receivedSnapshots`: production `onSnapshot` publications, including reconstructed deltas and metadata. This is deliberately **not** interpreted as a fixed 10Hz full-room snapshot contract.
- `receivedMessages`, `receivedBinaryMessages`, `receivedJsonMessages`: actual WebSocket application frames; metadata and reconnect frames count.
- Throughput is application payload bytes. It excludes WebSocket framing, TCP/IP, TLS, proxy, and link overhead. Server-sent and client-received bytes are reported independently.
- CPU is a process interval delta; 100% means one logical CPU. Generator processes are separate and measured independently. RSS is process resident memory. Event-loop histograms reset after warmup. Server maximum tick duration is a process-lifetime diagnostic; mean tick duration is the measured interval delta.
- Client `minClientTicks` includes deliberately replaced clients, so its minimum naturally covers less than the full measurement interval.
- `host` records available RAM, swap, system CPU, load average, and busy processes so contamination can be identified.

The unmodified original stress output is retained as background only; it uses a different raw JSON workload and must not be compared directly with the revised driver.

## Interpretation limits

20, 100, and 200 users in all three modes, plus 500 users in near mode, are measured, not claims about a 2,000-user deployment. Any 2,000-user number in `benchmark-summary.json` is a clearly labeled arithmetic application-payload projection from the 200-user case. CPU/RAM are not extrapolated into a capacity promise. This short loopback run does not validate TLS, a reverse proxy, WAN latency, multiworker scale-out, long-session memory growth, packet loss recovery under load, or the target VPS. The separate integration tests cover lifecycle/recovery semantics.

`optimized-exploratory.jsonl` is an intermediate development investigation, partly overlapping other tests and code edits. It is retained for auditability and excluded from the final comparison. `optimized-final-source.sha256` and its check file verify that the transport source stayed unchanged across the final run. `benchmark-environment.txt` records the Node/kernel environment.

## Final source provenance

During the last development matrix, a defensive guard rejecting JSON messages that claim to be binary deltas was saved at 2026-10-18 18:51:12.030841357 UTC. Valid production traffic uses binary delta frames. For strict source consistency, the three near cases and the 20-user far case that loaded clients before that save were rerun on the final source and replaced. The 100/200 far cases, stationary cases, 500-user case and semantic cadence probe all loaded the already-guarded source.

`optimized-matched.jsonl` includes a provenance record and exactly nine selected cases. `optimized-before-json-guard-matrix.jsonl` preserves the original development matrix; `optimized-json-guard-rerun.jsonl` preserves the four replacement runs. `optimized-all.jsonl` adds the 500-user case. All reported optimized rows correspond to `optimized-final-source.sha256`, checked again after the replacement runs. Earlier `optimized-cache-pass*` files and `benchmark-cache-pass-summary.json` are intermediate comparisons and are excluded from the final report.
