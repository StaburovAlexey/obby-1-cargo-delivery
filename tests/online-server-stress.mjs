import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['scripts/stress-online.mjs','--users=20,40','--duration=0.7'],{encoding:'utf8',timeout:20000});
assert.equal(result.status,0,`Stress smoke must complete: ${result.stderr}`);
const records=result.stdout.trim().split('\n').map(line=>JSON.parse(line));
const reports=records.filter(row=>row.event==='step');
assert.equal(reports.length,2);
assert.deepEqual(reports.map(row=>[row.users,row.rooms]),[[20,1],[40,2]]);
for(const report of reports){
  assert.ok(report.generator?.processes>=1,'load generators must run in separate processes');
  assert.ok(!report.generator.pids.includes(report.server.pid),'server and load processes must be isolated');
  assert.ok(report.host.before.logicalCpus>=1);
  assert.ok(report.generator.eventLoopP95Ms>=0);
  assert.equal(report.ok,true); assert.equal(report.errors.length,0);assert.ok(report.reconnects>=1);
  assert.ok(report.server.rssMB>0);assert.ok(report.server.cpuPercent>=0);assert.ok(report.delivery.receivedSnapshots>0);assert.ok(report.throughput.sentBytesPerSecond>0);
}
assert.equal(records.at(-1).event,'complete');
console.log('PASS independent-process moving-client load smoke, counts, seats, reconnects and metrics');
