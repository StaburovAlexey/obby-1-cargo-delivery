# Measured network optimization results

Final loopback measurements, 18 October 2026. All 10 matched cases passed protocol/roster/seat/replacement checks and the declared cadence/staleness targets. The transport source hashes stayed unchanged throughout the final matrix.

## Main result

Application downlink payload fell by 92.34% for 200 nearby mixed-motion clients, 97.72% for 200 far-apart clients, and 98.70% for 200 stationary clients. The separate 500-client nearby sanity check reduced downlink payload by 92.33%.

These are bandwidth measurements, not a blanket CPU or memory claim. At 500 nearby clients, measured server CPU was 19.13% before and 20.96% after (100% = one logical core), while server RSS was 155.04 and 163.39 MiB. See the separate instrumented-client results below; browser/mobile performance remains unmeasured.

## Matched application payload

MB/s below means decimal megabytes per second. Both versions ran the same production-client driver, mode mix, 2-second warmup, roughly 8-second measurement, and deliberate reconnect workload.

| Mode | Users | Down before MB/s | Down after MB/s | Down reduction | Up before MB/s | Up after MB/s | Up reduction |
|---|---:|---:|---:|---:|---:|---:|---:|
| near | 20 | 2.175 | 0.168 | 92.25% | 0.098 | 0.008 | 91.50% |
| near | 100 | 10.776 | 0.836 | 92.24% | 0.490 | 0.041 | 91.53% |
| near | 200 | 21.650 | 1.657 | 92.34% | 0.966 | 0.084 | 91.32% |
| far | 20 | 2.162 | 0.053 | 97.55% | 0.097 | 0.008 | 91.30% |
| far | 100 | 10.887 | 0.248 | 97.72% | 0.483 | 0.042 | 91.28% |
| far | 200 | 21.548 | 0.492 | 97.72% | 0.979 | 0.084 | 91.42% |
| stationary | 20 | 1.610 | 0.027 | 98.33% | 0.069 | 0.001 | 98.53% |
| stationary | 100 | 8.072 | 0.108 | 98.66% | 0.353 | 0.006 | 98.39% |
| stationary | 200 | 16.358 | 0.213 | 98.70% | 0.706 | 0.011 | 98.38% |
| near | 500 | 54.094 | 4.150 | 92.33% | 2.434 | 0.209 | 91.42% |

## Server and delivery observations

| Mode/users | Server CPU before → after | Server RSS MiB before → after | Loop p95 ms before → after | Mean tick ms before → after | Max moving-peer gap ms after |
|---|---:|---:|---:|---:|---:|
| near/200 | 10.58% → 9.18% | 133.80 → 156.57 | 22.92 → 20.77 | 6.10 → 2.88 | 204.12 |
| far/200 | 10.21% → 7.06% | 131.42 → 142.05 | 22.18 → 20.63 | 4.31 → 2.21 | 564.34 |
| stationary/200 | 7.35% → 3.16% | 130.85 → 138.25 | 20.66 → 20.66 | 1.97 → 0.77 | 0.00 |
| near/500 | 19.13% → 20.96% | 155.04 → 163.39 | 25.89 → 21.05 | 9.37 → 7.00 | 188.58 |

- No skipped snapshots or backpressure disconnects in any measured case.
- All reconstructed rosters retained 20 distinct players, with 19 remote players per client, valid initialized positions, and unique valid seat ownership. Near/far/stationary cases retained four seats per room after the release phase.
- At 500 users, all 25 rooms and 100 seats remained valid after five deliberate client replacements. All 9,500 remote-player relationships remained present.
- The 200-user moving cases had maximum moving-peer gaps of 204 ms near and 564 ms far. The stationary maximum remote heartbeat gap was 1.10 seconds. Far updates are intentionally slower than near updates.
- The event-loop monitor uses 20 ms resolution, so values around 20 ms reflect its sampling granularity. These are not WAN round-trip latency measurements.
- Client snapshot publication counts include metadata and self-only packets. They must not be presented as a remote-player update frequency.
- Independent semantic cadence probe, 20 clients/380 remote relationships: near 9.997 Hz; far 1.951 Hz; stationary 0.976 Hz. It counts distinct remote sequence advances, not callbacks. All declared bounds passed.

## Client-generator cost

| Mode/users | Generator CPU before → after | Aggregate generator RSS MiB before → after |
|---|---:|---:|
| near/200 | 18.96% → 30.54% | 283.65 → 545.75 |
| far/200 | 18.60% → 20.33% | 294.66 → 415.49 |
| stationary/200 | 17.42% → 6.32% | 276.33 → 300.75 |
| near/500 | 58.10% → 88.81% | 694.28 → 1277.01 |

Generators run the production client plus measurement instrumentation and many clients per Node process. Validation, merge, callback frequency, sampling, JIT/GC and allocation behavior all contribute. These figures do not establish the frame rate or memory footprint of a single browser client. A target-device profile is required before claiming a client CPU/RAM improvement.

## 2,000 users: modeled payload only

The following is arithmetic extrapolation of the measured 200-user aggregate payload rate × 10, keeping 20 players per room. It is not a 2,000-user test, worker-scaling test, or VPS capacity guarantee. No CPU/RAM capacity is extrapolated.

| Mode | Modeled down before Mbit/s | Modeled down after Mbit/s | Modeled up before Mbit/s | Modeled up after Mbit/s |
|---|---:|---:|---:|---:|
| near | 1731.96 | 132.59 | 77.27 | 6.71 |
| far | 1723.82 | 39.37 | 78.33 | 6.72 |
| stationary | 1308.68 | 17.07 | 56.51 | 0.91 |

## Scope, reproducibility and evidence

- [Commands, workload and metric definitions](README.md)
- [Machine-readable comparison](benchmark-summary.json)
- [All baseline cases](baseline-all.jsonl) and [all final optimized cases](optimized-all.jsonl)
- [Final source hashes](optimized-final-source.sha256) and [unchanged-source verification](optimized-final-source-check.txt)
- [Environment](benchmark-environment.txt) and [baseline source hashes](baseline-source.sha256)
- [Semantic peer-cadence probe](peer-cadence.jsonl)

All traffic stayed on 127.0.0.1. Payload accounting includes application control/reconnect frames but excludes WebSocket/TCP/IP/TLS/proxy/link overhead. No public endpoint, live leaderboard submission, publishing or deployment was used. Short runs are not a soak test or statistically repeated capacity benchmark; host contention is recorded per case. TLS, Internet latency, browser/GPU behavior, long-session memory growth and real multiworker/VPS capacity remain release validation tasks.

The original unmodified stress run and intermediate optimized explorations are retained separately and excluded from the matched final comparison.
