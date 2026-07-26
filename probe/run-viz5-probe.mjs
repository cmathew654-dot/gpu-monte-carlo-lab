// run-viz5-probe.mjs — drives probe/viz5-probe.html in headless chromium
// (SwiftShader WebGPU) against a vite dev server, dumps captured WGSL to
// probe/out-*.wgsl and exits nonzero if the probe recorded ANY error.
// Run: node probe/run-viz5-probe.mjs
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import {
  projectRootFromModuleUrl,
  resolveChromiumExecutable,
  systemChromiumCandidates,
} from './launcherPaths.mjs';

const globalRoot = execSync('npm root -g').toString().trim();
const require = createRequire(globalRoot + '/');
const { chromium } = require('playwright');

const PORT = 5198;
const url = `http://127.0.0.1:${PORT}/probe/viz5-probe.html`;
const projectRoot = projectRootFromModuleUrl(import.meta.url);
const chromiumExecutable = resolveChromiumExecutable({
  environmentPath: process.env.CHROMIUM_PATH,
  systemCandidates: systemChromiumCandidates(),
  playwrightPath: chromium.executablePath(),
});

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
  { cwd: projectRoot, stdio: 'ignore' },
);

const waitForServer = async () => {
  for (let i = 0; i < 90; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('vite dev server did not come up');
};

let code = 1;
try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath: chromiumExecutable,
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
  page.on('console', (message) =>
    logs.push(`[console.${message.type()}] ${message.text()}`),
  );
  page.on('pageerror', (error) =>
    logs.push(`[pageerror] ${error.message}`),
  );

  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction(
      () => window.__probe && window.__probe.done === true,
      null,
      { timeout: 60000 },
    );
  } catch {
    console.log('!! probe did not finish in time (device likely died)');
  }
  const probe = await page.evaluate(() => window.__probe || null);

  if (probe && probe.wgsl) {
    for (const [key, value] of Object.entries(probe.wgsl)) {
      fs.writeFileSync(new URL(`./out-${key}.wgsl`, import.meta.url), value);
      console.log(`saved probe/out-${key}.wgsl (${value.length} chars)`);
    }
  }
  console.log('=== PROBE CHECKS ===');
  console.log(JSON.stringify(probe?.checks ?? {}, null, 2));
  console.log('=== PROBE ERRORS ===');
  for (const error of probe?.errors || []) console.log(error);
  console.log('=== PAGE LOGS (tail) ===');
  for (const log of logs.slice(-15)) console.log(log);

  code = probe && probe.done && probe.errors.length === 0 ? 0 : 1;
  await browser.close();
} finally {
  server.kill();
}
process.exit(code);
