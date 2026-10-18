# Measured network optimization results

Final loopback measurements, 18 October 2026. All 10 matched cases passed protocol/roster/seat/replacement checks and the declared cadence/staleness targets. The transport source hashes stayed unchanged throughout the final matrix.

## Main result

Application downlink payload fell by 92.34% for 200 nearby mixed-motion clients, 97.72% for 200 far-apart clients, and 98.60% for 200 stationary clients. The separate 500-client nearby sanity check reduced downlink payload by 92.34%.

These are bandwidth measurements, not a blanket CPU or memory claim. At 500 nearby clients, measured server CPU was 19.13% before and 18.67% after (100% = one logical core), while server RSS was 155.04 and 164.16 MiB. See the separate instrumented-client results below; browser/mobile performance remains unmeasured.

## Matched application payload

MB/s below means decimal megabytes per second. Both versions ran the same production-client driver, mode mix, 2-second warmup, roughly 8-second measurement, and deliberate reconnect workload.

| Mode | Users | Down before MB/s | Down after MB/s | Down reduction | Up before MB/s | Up after MB/s | Up reduction |
|---|---:|---:|---:|---:|---:|---:|---:|
| near | 20 | 2.175 | 0.171 | 92.15% | 0.098 | 0.008 | 91.51% |
| near | 100 | 10.776 | 0.834 | 92.26% | 0.490 | 0.041 | 91.55% |
| near | 200 | 21.650 | 1.658 | 92.34% | 0.966 | 0.083 | 91.38% |
| far | 20 | 2.162 | 0.052 | 97.57% | 0.097 | 0.008 | 91.44% |
| far | 100 | 10.887 | 0.242 | 97.77% | 0.483 | 0.041 | 91.43% |
| far | 200 | 21.548 | 0.492 | 97.72% | 0.979 | 0.084 | 91.42% |
| stationary | 20 | 1.610 | 0.027 | 98.33% | 0.069 | 0.001 | 98.53% |
| stationary | 100 | 8.072 | 0.116 | 98.57% | 0.353 | 0.006 | 98.39% |
| stationary | 200 | 16.358 | 0.229 | 98.60% | 0.706 | 0.010 | 98.57% |
| near | 500 | 54.094 | 4.141 | 92.34% | 2.434 | 0.208 | 91.45% |

## Server and delivery observations

| Mode/users | Server CPU before → after | Server RSS MiB before → after | Loop p95 ms before → after | Mean tick ms before → after | Max moving-peer gap ms after |
|---|---:|---:|---:|---:|---:|
| near/200 | 10.58% → 9.96% | 133.80 → 154.32 | 22.92 → 20.82 | 6.10 → 3.07 | 191.23 |
| far/200 | 10.21% → 6.74% | 131.42 → 145.44 | 22.18 → 20.46 | 4.31 → 2.06 | 577.07 |
| stationary/200 | 7.35% → 2.16% | 130.85 → 135.52 | 20.66 → 20.56 | 1.97 → 0.82 | 0.00 |
| near/500 | 19.13% → 18.67% | 155.04 → 164.16 | 25.89 → 20.97 | 9.37 → 6.50 | 189.06 |

- No skipped snapshots or backpressure disconnects in any measured case.
- All reconstructed rosters retained 20 distinct players, with 19 remote players per client, valid initialized positions, and unique valid seat ownership. Near/far/stationary cases retained four seats per room after the release phase.
- At 500 users, all 25 rooms and 100 seats remained valid after five deliberate client replacements. All 9,500 remote-player relationships remained present.
- The 200-user moving cases had maximum moving-peer gaps of 191 ms near and 577 ms far. The stationary maximum remote heartbeat gap was 1.01 seconds. Far updates are intentionally slower than near updates.
- The event-loop monitor uses 20 ms resolution, so values around 20 ms reflect its sampling granularity. These are not WAN round-trip latency measurements.
- Client snapshot publication counts include metadata and self-only packets. They must not be presented as a remote-player update frequency.
- Independent semantic cadence probe, 20 clients/380 remote relationships: near 9.999 Hz; far 1.951 Hz; stationary 0.975 Hz. It counts distinct remote sequence advances, not callbacks. All declared bounds passed.

## Client-generator cost

| Mode/users | Generator CPU before → after | Aggregate generator RSS MiB before → after |
|---|---:|---:|
| near/200 | 18.96% → 32.02% | 283.65 → 580.71 |
| far/200 | 18.60% → 17.45% | 294.66 → 419.96 |
| stationary/200 | 17.42% → 5.93% | 276.33 → 306.14 |
| near/500 | 58.10% → 61.31% | 694.28 → 1326.15 |

Generators run the production client plus measurement instrumentation and many clients per Node process. Validation, merge, callback frequency, sampling, JIT/GC and allocation behavior all contribute. These figures do not establish the frame rate or memory footprint of a single browser client. A target-device profile is required before claiming a client CPU/RAM improvement.

## 2,000 users: modeled payload only

The following is arithmetic extrapolation of the measured 200-user aggregate payload rate × 10, keeping 20 players per room. It is not a 2,000-user test, worker-scaling test, or VPS capacity guarantee. No CPU/RAM capacity is extrapolated.

| Mode | Modeled down before Mbit/s | Modeled down after Mbit/s | Modeled up before Mbit/s | Modeled up after Mbit/s |
|---|---:|---:|---:|---:|
| near | 1731.96 | 132.65 | 77.27 | 6.66 |
| far | 1723.82 | 39.35 | 78.33 | 6.72 |
| stationary | 1308.68 | 18.34 | 56.51 | 0.81 |

## Scope, reproducibility and evidence

- [Commands, workload and metric definitions](README.md)
- [Machine-readable comparison](benchmark-summary.json)
- [All baseline cases](baseline-all.jsonl) and [all final optimized cases](optimized-all.jsonl)
- [Final source hashes](optimized-final-source.sha256) and [unchanged-source verification](optimized-final-source-check.txt)
- [Environment](benchmark-environment.txt) and [baseline source hashes](baseline-source.sha256)
- [Semantic peer-cadence probe](peer-cadence.jsonl)

All traffic stayed on 127.0.0.1. Payload accounting includes application control/reconnect frames but excludes WebSocket/TCP/IP/TLS/proxy/link overhead. No public endpoint, live leaderboard submission, publishing or deployment was used. Short runs are not a soak test or statistically repeated capacity benchmark; host contention is recorded per case. TLS, Internet latency, browser/GPU behavior, long-session memory growth and real multiworker/VPS capacity remain release validation tasks.

The original unmodified stress run and intermediate optimized explorations are retained separately and excluded from the matched final comparison.
