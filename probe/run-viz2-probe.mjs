// run-viz2-probe.mjs — drives probe/viz2-probe.html in headless chromium
// (SwiftShader WebGPU) against a vite dev server, dumps captured WGSL to
// probe/out-*.wgsl and exits nonzero if the probe recorded ANY error.
// Run: node probe/run-viz2-probe.mjs
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';

const globalRoot = execSync('npm root -g').toString().trim();
const require = createRequire(globalRoot + '/');
const { chromium } = require('playwright');

const PORT = 5199;
const url = `http://127.0.0.1:${PORT}/probe/viz2-probe.html`;

// Start the vite dev server DIRECTLY (no npx wrapper — so server.kill()
// kills the real process and no orphan holds the port between runs).
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    String(PORT),
    '--strictPort',
  ],
  { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' },
);
const waitForServer = async () => {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/probe/viz2-probe.html`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite dev server did not come up');
};

let code = 1;
try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,SwiftShader',
      '--use-webgpu-adapter=swiftshader',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__probe && window.__probe.done === true, null, {
      timeout: 45000,
    });
  } catch {
    console.log('!! probe did not finish in time (device likely died)');
  }
  const probe = await page.evaluate(() => window.__probe || null);

  if (probe && probe.wgsl) {
    for (const [k, v] of Object.entries(probe.wgsl)) {
      fs.writeFileSync(new URL(`./out-${k}.wgsl`, import.meta.url), v);
      console.log(`saved probe/out-${k}.wgsl (${v.length} chars)`);
    }
  }
  console.log('=== PROBE CHECKS ===');
  console.log(JSON.stringify(probe?.checks ?? {}, null, 2));
  console.log('=== PROBE ERRORS ===');
  for (const e of probe?.errors || []) console.log(e);
  console.log('=== PAGE LOGS (tail) ===');
  for (const l of logs.slice(-15)) console.log(l);

  code = probe && probe.done && probe.errors.length === 0 ? 0 : 1;
  await browser.close();
} finally {
  server.kill();
}
process.exit(code);
