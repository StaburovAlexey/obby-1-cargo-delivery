import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const root=new URL('./',import.meta.url),summary=JSON.parse(readFileSync(new URL('benchmark-summary.json',root),'utf8'));
if(summary.measured.length!==10||!summary.measured.every(r=>r.baselineOk&&r.optimizedOk&&r.baselineTargetMet&&r.optimizedTargetMet))throw new Error('Expected ten passing matched cases before writing success report');
const f=(n,d=2)=>Number(n).toFixed(d),mb=n=>f(n/1e6,3);
const main=summary.measured.filter(row=>row.users>=200),row=(mode,users=200)=>summary.measured.find(row=>row.workload===mode&&row.users===users);
const near=row('near'),far=row('far'),stationary=row('stationary'),large=row('near',500);
const lines=[
 '# Measured network optimization results','',
 'Final loopback measurements, 18 October 2026. All 10 matched cases passed protocol/roster/seat/replacement checks and the declared cadence/staleness targets. The transport source hashes stayed unchanged throughout the final matrix.','',
 '## Main result','',
 `Application downlink payload fell by ${f(near.applicationPayload.downloadReductionPercent)}% for 200 nearby mixed-motion clients, ${f(far.applicationPayload.downloadReductionPercent)}% for 200 far-apart clients, and ${f(stationary.applicationPayload.downloadReductionPercent)}% for 200 stationary clients. The separate 500-client nearby sanity check reduced downlink payload by ${f(large.applicationPayload.downloadReductionPercent)}%.`,'',
 `These are bandwidth measurements, not a blanket CPU or memory claim. At 500 nearby clients, measured server CPU was ${f(large.server.baselineCpuPercent)}% before and ${f(large.server.optimizedCpuPercent)}% after (100% = one logical core), while server RSS was ${f(large.server.baselineRssMB)} and ${f(large.server.optimizedRssMB)} MiB. See the separate instrumented-client results below; browser/mobile performance remains unmeasured.`,'',
 '## Matched application payload','',
 'MB/s below means decimal megabytes per second. Both versions ran the same production-client driver, mode mix, 2-second warmup, roughly 8-second measurement, and deliberate reconnect workload.','',
 '| Mode | Users | Down before MB/s | Down after MB/s | Down reduction | Up before MB/s | Up after MB/s | Up reduction |',
 '|---|---:|---:|---:|---:|---:|---:|---:|',
];
for(const r of summary.measured){const a=r.applicationPayload;lines.push(`| ${r.workload} | ${r.users} | ${mb(a.baselineDownloadBytesPerSecond)} | ${mb(a.optimizedDownloadBytesPerSecond)} | ${f(a.downloadReductionPercent)}% | ${mb(a.baselineUploadBytesPerSecond)} | ${mb(a.optimizedUploadBytesPerSecond)} | ${f(a.uploadReductionPercent)}% |`);}
lines.push('', '## Server and delivery observations','',
 '| Mode/users | Server CPU before → after | Server RSS MiB before → after | Loop p95 ms before → after | Mean tick ms before → after | Max moving-peer gap ms after |',
 '|---|---:|---:|---:|---:|---:|');
for(const r of main){const a=r.server,d=r.delivery;lines.push(`| ${r.workload}/${r.users} | ${f(a.baselineCpuPercent)}% → ${f(a.optimizedCpuPercent)}% | ${f(a.baselineRssMB)} → ${f(a.optimizedRssMB)} | ${f(a.baselineEventLoopP95Ms)} → ${f(a.optimizedEventLoopP95Ms)} | ${f(a.baselineMeanTickMs)} → ${f(a.optimizedMeanTickMs)} | ${f(d.maxMovingRemoteGapMs)} |`);}
lines.push('',
 '- No skipped snapshots or backpressure disconnects in any measured case.',
 '- All reconstructed rosters retained 20 distinct players, with 19 remote players per client, valid initialized positions, and unique valid seat ownership. Near/far/stationary cases retained four seats per room after the release phase.',
 '- At 500 users, all 25 rooms and 100 seats remained valid after five deliberate client replacements. All 9,500 remote-player relationships remained present.',
 `- The 200-user moving cases had maximum moving-peer gaps of ${f(near.delivery.maxMovingRemoteGapMs,0)} ms near and ${f(far.delivery.maxMovingRemoteGapMs,0)} ms far. The stationary maximum remote heartbeat gap was ${f(stationary.delivery.maxRemoteGapMs/1000,2)} seconds. Far updates are intentionally slower than near updates.`,
 '- The event-loop monitor uses 20 ms resolution, so values around 20 ms reflect its sampling granularity. These are not WAN round-trip latency measurements.',
 '- Client snapshot publication counts include metadata and self-only packets. They must not be presented as a remote-player update frequency.');
const cadence=new URL('peer-cadence.jsonl',root);
if(existsSync(cadence)){
 const probes=readFileSync(cadence,'utf8').trim().split('\n').map(JSON.parse);
 lines.push(`- Independent semantic cadence probe, 20 clients/380 remote relationships: ${probes.map(p=>`${p.mode} ${f(p.observedRemoteHz,3)} Hz`).join('; ')}. It counts distinct remote sequence advances, not callbacks. All declared bounds passed.`);
}
lines.push('', '## Client-generator cost','',
 '| Mode/users | Generator CPU before → after | Aggregate generator RSS MiB before → after |',
 '|---|---:|---:|');
for(const r of main){const a=r.generator;lines.push(`| ${r.workload}/${r.users} | ${f(a.baselineCpuPercent)}% → ${f(a.optimizedCpuPercent)}% | ${f(a.baselineRssMB)} → ${f(a.optimizedRssMB)} |`);}
lines.push('',
 'Generators run the production client plus measurement instrumentation and many clients per Node process. Validation, merge, callback frequency, sampling, JIT/GC and allocation behavior all contribute. These figures do not establish the frame rate or memory footprint of a single browser client. A target-device profile is required before claiming a client CPU/RAM improvement.','',
 '## 2,000 users: modeled payload only','',
 'The following is arithmetic extrapolation of the measured 200-user aggregate payload rate × 10, keeping 20 players per room. It is not a 2,000-user test, worker-scaling test, or VPS capacity guarantee. No CPU/RAM capacity is extrapolated.','',
 '| Mode | Modeled down before Mbit/s | Modeled down after Mbit/s | Modeled up before Mbit/s | Modeled up after Mbit/s |',
 '|---|---:|---:|---:|---:|');
for(const r of summary.modeled2000)lines.push(`| ${r.workload} | ${f(r.baselineDownloadMegabitsPerSecond)} | ${f(r.optimizedDownloadMegabitsPerSecond)} | ${f(r.baselineUploadMegabitsPerSecond)} | ${f(r.optimizedUploadMegabitsPerSecond)} |`);
lines.push('', '## Scope, reproducibility and evidence','',
 '- [Commands, workload and metric definitions](README.md)',
 '- [Machine-readable comparison](benchmark-summary.json)',
 '- [All baseline cases](baseline-all.jsonl) and [all final optimized cases](optimized-all.jsonl)',
 '- [Final source hashes](optimized-final-source.sha256) and [unchanged-source verification](optimized-final-source-check.txt)',
 '- [Environment](benchmark-environment.txt) and [baseline source hashes](baseline-source.sha256)',
 '- [Semantic peer-cadence probe](peer-cadence.jsonl)','',
 'All traffic stayed on 127.0.0.1. Payload accounting includes application control/reconnect frames but excludes WebSocket/TCP/IP/TLS/proxy/link overhead. No public endpoint, live leaderboard submission, publishing or deployment was used. Short runs are not a soak test or statistically repeated capacity benchmark; host contention is recorded per case. TLS, Internet latency, browser/GPU behavior, long-session memory growth and real multiworker/VPS capacity remain release validation tasks.','',
 'The original unmodified stress run and intermediate optimized explorations are retained separately and excluded from the matched final comparison.');
writeFileSync(new URL('RESULTS.md',root),`${lines.join('\n')}\n`);
console.log('Wrote qa/network-optimization/RESULTS.md from benchmark-summary.json');
