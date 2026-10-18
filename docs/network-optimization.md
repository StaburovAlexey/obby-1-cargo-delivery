# Room transport and client-scored drift (2026-10-18)

Base: `codex/handling-grip-rebalance` at `af974bcc75536154fd7779df2b463e2bd247083f`. This change retains the rendering and handling/grip work on that branch. It does not deploy a server or publish a game build.

## Scope and trust

Movement remains room-server relayed, with 20 players and server-exclusive seats per room. Economy, hazards and vehicle physics remain local as before. Drift calculation now runs only on the local client. A valid completed non-development attempt may submit a new personal best directly through the Yandex SDK. Local route/time/pose checks catch ordinary invalid attempts; they are not anti-cheat. Yandex storage does not attest that a submitted client score is honest. Results do not acquire a synthetic server-verified flag. The old `server/drift-verifier.mjs` remains only as an isolated historical physics-QA helper; it is neither imported by the room runtime nor packaged in the multiplayer container.

The classroom board keeps its canvas surface. Map dots use the complete known room roster, including distant/stationary players, with no additional position fetch. Its ranking is the global Yandex ranking from the shared leaderboard cache, rather than a ranking of the current room. Trophy dialog and classroom board share that cache. No live leaderboard writes are part of automated verification.

## Protocol v2

Client and server must be released together. Protocol v1 is rejected rather than silently interpreted as v2. Join and resynchronization deliver a full roster; normal traffic sends changes. Static character/vehicle/seat metadata is not repeated in every movement entry. A connection's displayed number is distinct from its reusable compact room slot.

Movement uses fixed little-endian binary records. Each movement payload is 47 bytes; the client state envelope is 51 bytes. A downstream movement batch has a 16-byte header and 49 bytes per included player. Positions are rounded to 1 cm, normalized quaternion components to 1/32767, heading to pi/32767 radians, speed to 1/64 m/s, steering/pitch/roll to 0.0001 radians, body bob to 1 mm, and jump elapsed to 1 ms. Wheel rotation remains float32 to preserve multiple-turn interpolation. Its absolute precision decreases at extreme accumulated rotations. Original finite-value/catalog/world bounds remain enforced, along with binary type/version/length/count/slot validation.

Nearby moving players receive a 10 Hz target; distant moving players receive a 2 Hz target. Hysteresis enters the near band at 80 m and exits at 100 m. Lower update frequency does not remove players from the roster. The rendering interpolation buffer adapts to the cadence. Teleports and discrete state changes bypass the far-rate delay. Unchanged movement is suppressed, with a one-second state heartbeat. WebSocket ping/pong separately detects dead connections. App pause, visibility, focus and mode transitions flush immediately even when requestAnimationFrame is suspended.

Transport sequencing, resynchronization and backpressure behavior are exercised with simulated dropped frames and slow receivers. WebSockets normally deliver frames reliably and in order; explicit recovery also prevents locally discarded or skipped deltas from leaving stale state indefinitely.

## Hosting and measurement

See [deployment guide](yandex-online.md) for the process launcher, per-worker limits, reconnect semantics and reverse proxy. Configuring four workers with 500 connections each is an admission ceiling, not evidence that a particular VPS can sustain 2,000 players.

Benchmark results and exact commands are under `qa/network-optimization/`. The older 1,000-client, approximately 848 Mbit/s report used full JSON room broadcasts and predates the current drift code. It is historical context rather than a directly comparable measurement. New comparisons run only on localhost and report host contention, process CPU/RAM, event-loop delay, payload and delivered state freshness. They do not measure TLS, internet latency, mobile frame rate, or real VPS capacity.

Browser/GPU visual playtesting and live Yandex leaderboard writes are separate release checks. The existing general test suite has five inherited `physics-app-integration.mjs` failures, independently reproduced on the untouched base; focused results must be read separately from that aggregate failure.

## Verification index

See [validation summary](../qa/network-optimization/VALIDATION.md) for test commands, inherited failures and release checks, and [measured results](../qa/network-optimization/RESULTS.md) for the final matched benchmark.
