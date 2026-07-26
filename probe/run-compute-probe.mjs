// run-compute-probe.mjs — validates the real production compute graphs in a
// headless SwiftShader WebGPU browser against a short-lived local Vite server.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import {
  projectRootFromModuleUrl,
  resolveChromiumExecutable,
  systemChromiumCandidates,
} from './launcherPaths.mjs';

const PORT = 5199;
const EXPECTED_CHECKS = [
  'computeInit',
  'computeRegimeStep',
  'regimeStateParity',
  'computeStep',
  'computeStatsClear',
  'computeStatsReduce',
  'computeStatsHistogram',
];
const projectRoot = projectRootFromModuleUrl(import.meta.url);
const url = `http://127.0.0.1:${PORT}/probe/compute-probe.html`;
const viteLogs = [];
const pageLogs = [];

function appendTail(target, chunk) {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (line.length > 0) target.push(line);
  }
  if (target.length > 100) target.splice(0, target.length - 100);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopVite(server) {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, 'exit');
  server.kill();
  const result = await Promise.race([
    exited.then(() => 'exited'),
    sleep(5_000).then(() => 'timed-out'),
  ]);
  if (result === 'timed-out' && server.exitCode === null) {
    server.kill('SIGKILL');
    await Promise.race([once(server, 'exit'), sleep(5_000)]);
  }
}

async function waitForServer(server) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Vite exited during readiness (code=${server.exitCode}, signal=${server.signalCode})`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite has not bound the strict local port yet.
    }
    await sleep(500);
  }
  throw new Error('Vite did not become ready on port 5199');
}

function printDiagnostics(probe) {
  console.log('=== PROBE CHECKS ===');
  console.log(JSON.stringify(probe?.checks ?? {}, null, 2));
  console.log('=== PROBE EXPECTED ===');
  console.log(JSON.stringify(probe?.expected ?? EXPECTED_CHECKS));
  console.log('=== PROBE DEVICE LOST ===');
  console.log(JSON.stringify(probe?.deviceLost ?? null));
  console.log('=== PROBE ERRORS ===');
  for (const error of probe?.errors ?? []) console.log(error);
  console.log('=== PAGE LOGS (tail) ===');
  for (const line of pageLogs.slice(-20)) console.log(line);
  console.log('=== VITE LOGS (tail) ===');
  for (const line of viteLogs.slice(-20)) console.log(line);
}

const globalRoot = execSync('npm root -g', { cwd: projectRoot }).toString().trim();
const require = createRequire(`${globalRoot}/`);
const { chromium } = require('playwright');
const chromiumExecutable = resolveChromiumExecutable({
  environmentPath: process.env.CHROMIUM_PATH,
  systemCandidates: systemChromiumCandidates(),
  playwrightPath: chromium.executablePath(),
});

let server;
let browser;
let page;
let probe = null;
let failure = null;
try {
  server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(PORT),
      '--strictPort',
    ],
    { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout.on('data', (chunk) => appendTail(viteLogs, chunk));
  server.stderr.on('data', (chunk) => appendTail(viteLogs, chunk));

  await waitForServer(server);
  browser = await chromium.launch({
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
  page = await browser.newPage();
  page.on('console', (message) =>
    pageLogs.push(`[console.${message.type()}] ${message.text()}`),
  );
  page.on('pageerror', (error) => pageLogs.push(`[pageerror] ${error.message}`));

  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction(
      () => window.__probe && window.__probe.done === true,
      null,
      { timeout: 60_000 },
    );
  } catch {
    pageLogs.push('[launcher] probe did not finish in 60 seconds');
  }
  probe = await page.evaluate(() => window.__probe ?? null);
  if (!probe?.done) failure = new Error('compute probe did not report done');
  else if (probe?.deviceLost) failure = new Error('compute probe lost its WebGPU device');
  else if ((probe?.errors?.length ?? 0) > 0) failure = new Error('compute probe recorded errors');
  else if (!EXPECTED_CHECKS.every((name) => probe?.checks?.[name] === 'passed')) {
    failure = new Error('compute probe did not pass every expected graph');
  }
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
} finally {
  if (page && probe === null) {
    try {
      probe = await page.evaluate(() => window.__probe ?? null);
    } catch (error) {
      pageLogs.push(`[launcher] failed to read page state: ${String(error)}`);
    }
  }
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      pageLogs.push(`[launcher] browser close failed: ${String(error)}`);
      failure ??= error instanceof Error ? error : new Error(String(error));
    }
  }
  try {
    await stopVite(server);
  } catch (error) {
    viteLogs.push(`[launcher] Vite cleanup failed: ${String(error)}`);
    failure ??= error instanceof Error ? error : new Error(String(error));
  }
  printDiagnostics(probe);
}

if (failure) {
  console.error(`compute probe failed: ${failure.message}`);
  process.exitCode = 1;
}
