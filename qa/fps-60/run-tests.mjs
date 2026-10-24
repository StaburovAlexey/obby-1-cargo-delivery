import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import os from 'node:os';

// Run only when browser performance capture is idle: these are CPU-heavy suites.
const args = process.argv.slice(2);
const option = (name, fallback) => { const value = args.find(arg => arg.startsWith(name + '=')); return value ? value.slice(name.length + 1) : fallback; };
const snapshot = resolve(option('--snapshot', 'output/fps-60/baseline'));
const output = resolve(option('--output', 'output/fps-60/baseline/tests-evidence'));
const inventory = [
  { id: 'rendering', args: ['run', 'test:rendering'] },
  { id: 'startup', args: ['run', 'test:startup'] },
  { id: 'world-labels', args: ['run', 'test:world-labels'] },
  { id: 'camera', args: ['run', 'test:camera'] },
  { id: 'rapier', args: ['run', 'test:rapier'] },
  { id: 'physics-app', executable: process.execPath, args: ['tests/physics-app-integration.mjs'] },
];
const selected = option('--suites', '').split(',').filter(Boolean);
if (selected.some(id => !inventory.some(suite => suite.id === id))) throw Error('Unknown --suites id');
await mkdir(output, { recursive: true });
const packageSource = await readFile(resolve(snapshot, 'package.json'));
const metadata = { startedAt: new Date().toISOString(), snapshot, output,
  node: process.version, platform: `${os.platform()} ${os.release()}`, arch: os.arch(),
  cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryGiB: os.totalmem() / 2 ** 30,
  packageSha256: createHash('sha256').update(packageSource).digest('hex'),
  suites: [] };
for (const suite of inventory.filter(suite => !selected.length || selected.includes(suite.id))) {
  const executable = suite.executable || 'npm', logPath = resolve(output, suite.id + '.log');
  const stream = createWriteStream(logPath), started = performance.now();
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(executable, suite.args, { cwd: snapshot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(stream, { end: false }); child.stderr.pipe(stream, { end: false });
    child.once('error', reject);
    child.once('close', (code, signal) => { stream.end(); resolveResult({ code, signal }); });
  });
  const resultRecord = { id: suite.id, command: [executable, ...suite.args], ...result,
    elapsedSeconds: Math.round((performance.now() - started) / 100) / 10, logPath };
  metadata.suites.push(resultRecord); console.log(JSON.stringify(resultRecord));
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(metadata, null, 2) + '\n');
}
metadata.finishedAt = new Date().toISOString();
await writeFile(resolve(output, 'summary.json'), JSON.stringify(metadata, null, 2) + '\n');
process.exitCode = metadata.suites.some(suite => suite.code !== 0) ? 1 : 0;
