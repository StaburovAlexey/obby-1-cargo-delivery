export default async function(page) {
  // Optional Playwright adapter. Configure on the supplied page before running:
  // window.__fps60Config={baseUrl:'http://127.0.0.1:8095/',scene:'city',profile:'desktop'}.
  const c = await page.evaluate(() => ({ ...(window.__fps60Config || {}) }));
  const { readFile, mkdir, writeFile } = await import('node:fs/promises');
  const root = '/home/gilbertfrost/storage/dev/obby-cargo-delivery';
  const browser = page.context().browser();
  if (!browser) throw Error('Browser context does not expose browser()');
  const phone = c.profile === 'phone' || c.profile === 'phone-844x390-dpr2';
  const profile = phone ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } :
    { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
  const source = await readFile(root + '/qa/fps-60/install.js', 'utf8');
  const init = await readFile(root + '/qa/fps-60/init.js', 'utf8');
  // Do not leave a second WebGL scene competing with the measured page.
  await page.goto('about:blank');
  const context = await browser.newContext(profile), measured = await context.newPage();
  const errors = [], network = [], consoleErrors = [];
  measured.on('pageerror', error => errors.push(error.message));
  measured.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push({ type: message.type(), text: message.text() }); });
  measured.on('requestfailed', request => network.push({ url: request.url(), error: request.failure()?.errorText }));
  measured.on('response', response => { if (response.status() >= 400) network.push({ url: response.url(), status: response.status() }); });
  try {
    await context.addInitScript(init);
    const url = new URL(c.baseUrl || 'http://127.0.0.1:8095/');
    url.searchParams.set('dev', '1'); url.searchParams.set('perf', '1');
    url.searchParams.delete('render');
    await measured.goto(url.href, { waitUntil: 'domcontentloaded' });
    await measured.waitForFunction(() => window.__sceneDebug?.startup.ready && window.__sceneDebug?.characterReady, {}, { timeout: 120000 });
    await measured.evaluate(source);
    await measured.evaluate(c => window.__fps60.prepare(c), { ...c, profile: phone ? 'phone-844x390-dpr2' : 'desktop-1280x720-dpr1' });
    await measured.evaluate(c => window.__fps60.start(c), { warmupMs: c.warmupMs ?? 6000, sampleMs: c.sampleMs ?? 12000 });
    await measured.waitForFunction(() => window.__fps60.status().reportReady, {}, { timeout: (c.warmupMs ?? 6000) + (c.sampleMs ?? 12000) + 60000 });
    const report = await measured.evaluate(() => window.__fps60.report());
    report.browserCapture = { errors, network, consoleErrors };
    const name = `${c.label || 'unspecified'}-${report.config.profile}-${report.config.scene}`;
    if (c.outputDir) {
      await mkdir(c.outputDir, { recursive: true });
      await writeFile(`${c.outputDir}/${name}.json`, JSON.stringify(report, null, 2) + '\n');
      if (c.screenshot !== false) await measured.screenshot({ path: `${c.outputDir}/${name}.png` });
    }
    return report;
  } finally { await context.close(); }
}
