import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [beforePath='qa/network-optimization/baseline-matched.jsonl',afterPath='qa/network-optimization/optimized-matched.jsonl',output='qa/network-optimization/benchmark-summary.json']=process.argv.slice(2);
function steps(path){return readFileSync(path,'utf8').trim().split('\n').map(line=>JSON.parse(line)).filter(row=>row.event==='step');}
const before=steps(beforePath),after=steps(afterPath),round=value=>Math.round(value*100)/100;
const reduction=(a,b)=>a?round((1-b/a)*100):null;
const measured=after.map(row=>{
 const baseline=before.find(other=>other.users===row.users&&other.workload===row.workload);
 if(!baseline)throw new Error(`Missing matching baseline ${row.users}/${row.workload}`);
 return {users:row.users,rooms:row.rooms,workload:row.workload,baselineOk:baseline.ok,optimizedOk:row.ok,baselineTargetMet:baseline.targetMet,optimizedTargetMet:row.targetMet,
  baselineDurationSeconds:baseline.durationSeconds,optimizedDurationSeconds:row.durationSeconds,
  applicationPayload:{baselineDownloadBytesPerSecond:baseline.throughput.sentBytesPerSecond,optimizedDownloadBytesPerSecond:row.throughput.sentBytesPerSecond,downloadReductionPercent:reduction(baseline.throughput.sentBytesPerSecond,row.throughput.sentBytesPerSecond),
   baselineUploadBytesPerSecond:baseline.throughput.uploadBytesPerSecond,optimizedUploadBytesPerSecond:row.throughput.uploadBytesPerSecond,uploadReductionPercent:reduction(baseline.throughput.uploadBytesPerSecond,row.throughput.uploadBytesPerSecond)},
  server:{baselineCpuPercent:baseline.server.cpuPercent,optimizedCpuPercent:row.server.cpuPercent,baselineRssMB:baseline.server.rssMB,optimizedRssMB:row.server.rssMB,baselineEventLoopP95Ms:baseline.server.eventLoopP95Ms,optimizedEventLoopP95Ms:row.server.eventLoopP95Ms,baselineMeanTickMs:baseline.server.meanTickDurationMs,optimizedMeanTickMs:row.server.meanTickDurationMs},
  generator:{baselineCpuPercent:baseline.generator.cpuPercent,optimizedCpuPercent:row.generator.cpuPercent,baselineRssMB:baseline.generator.rssMB,optimizedRssMB:row.generator.rssMB},
  delivery:{...row.delivery,skippedSnapshots:row.server.skippedSnapshots,backpressureDisconnects:row.server.backpressureDisconnects,reconnects:row.reconnects},
  host:{baselineBusyCpuPercent:baseline.host.busyCpuPercent,optimizedBusyCpuPercent:row.host.busyCpuPercent}};
});
const modeled2000=measured.filter(row=>row.users===200).map(row=>({users:2000,rooms:100,workload:row.workload,method:'Arithmetic aggregate payload projection: measured 200-player application payload rate × 10. Not a measured load or a capacity prediction.',
 baselineDownloadMegabitsPerSecond:round(row.applicationPayload.baselineDownloadBytesPerSecond*10*8/1e6),optimizedDownloadMegabitsPerSecond:round(row.applicationPayload.optimizedDownloadBytesPerSecond*10*8/1e6),
 baselineUploadMegabitsPerSecond:round(row.applicationPayload.baselineUploadBytesPerSecond*10*8/1e6),optimizedUploadMegabitsPerSecond:round(row.applicationPayload.optimizedUploadBytesPerSecond*10*8/1e6)}));
const report={generatedAt:new Date().toISOString(),inputs:{baseline:resolve(beforePath),optimized:resolve(afterPath)},measured,modeled2000,caveats:[
 'Both versions use the same loopback harness and their own production createOnlineClient; server and generator batches run as separate Node processes.',
 'Application payload bytes include JSON controls, binary frames, and an intentional reconnect during measurement; they exclude WebSocket, TCP/IP, TLS, reverse-proxy, and Ethernet overhead.',
 'Warmup is excluded; interval CPU deltas are measured. 100% CPU denotes one logical CPU. RSS is resident process memory, not a whole-VPS estimate.',
 'The original unmodified stress output is archival context only, because its raw JSON generator differs from this production-client workload.',
 'Far actors remain in the full roster/map and are measured against lower cadence, not an obsolete 10Hz full-snapshot expectation.',
 'Host load, loopback scheduling, short duration, garbage collection, and CPU instrumentation limit precision; these results are not a VPS capacity claim.',
 '2,000 users were not measured. Only application payload is extrapolated; CPU/RAM, Internet latency, packet loss, TLS, multiworker scaling, long-lived connections, and soak behavior require target-host validation.'
]};
writeFileSync(output,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({output,measuredCases:measured.length,allChecksPass:measured.every(row=>row.baselineOk&&row.optimizedOk),allTargetsMet:measured.every(row=>row.baselineTargetMet&&row.optimizedTargetMet),modeled2000}));
