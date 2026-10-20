import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createRsbuild } from '@rsbuild/core';
import { createHash } from 'node:crypto';

// Execute an actual production Rspack bundle, not the source module or a mocked URL.
// This catches Rspack URL-context exports being strings rather than URL objects.
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await fs.mkdtemp(path.join(root, 'qa/livery-url-check-'));
const entry = path.join(temp, 'entry.js'), output = path.join(temp, 'output');
await fs.writeFile(entry, `import {vehicleLiveryTextureURL} from '../../dist/vehicle-livery-materials.js'; globalThis.liveryURL = vehicleLiveryTextureURL;`);
let server;
try {
  const build = await createRsbuild({ cwd: root, rsbuildConfig: {
    source: { entry: { index: entry } },
    output: { distPath: { root: output }, assetPrefix: './' },
  } });
  await build.build();
  const jsDirectory = path.join(output, 'static/js');
  const script = (await fs.readdir(jsDirectory)).find(name => name.endsWith('.js'));
  const context = { URL }; context.self = context;
  vm.runInNewContext(await fs.readFile(path.join(jsDirectory, script), 'utf8'), context);
  server = http.createServer(async (request, response) => {
    try {
      const bytes = await fs.readFile(path.join(output, new URL(request.url, 'http://test').pathname));
      response.setHeader('Content-Type', request.url.endsWith('.webp') ? 'image/webp' : 'application/octet-stream');
      response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/`;
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'dist/assets/liveries/manifest.json')));
  for (const item of manifest.files) {
    const [vehicle, filename] = item.file.split('/');
    const url = context.liveryURL(vehicle, filename.replace('.webp', ''));
    assert.equal(typeof url, 'string', `production URL for ${item.file} must not be undefined`);
    assert.match(url, /\.webp$/);
    const response = await fetch(new URL(url, base));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    assert.equal(context.liveryURL(vehicle, 'base'), null);
  }
  console.log('PASS: all 44 production-bundled livery URLs return HTTP 200 image/webp with exact authored hashes.');
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await fs.rm(temp, { recursive: true, force: true });
}
