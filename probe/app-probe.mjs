// Loads the REAL app in headless chromium with WebGPU error capture injected.
import { chromium } from '/home/kimi/.npm-global/lib/node_modules/playwright/index.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const waitMs = Number(process.argv[3] || 9000);

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
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
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}\n${err.stack || ''}`));

await page.addInitScript(() => {
  window.__gpuErrors = [];
  window.addEventListener('error', (e) => window.__gpuErrors.push('window.onerror: ' + e.message));
  window.addEventListener('unhandledrejection', (e) =>
    window.__gpuErrors.push('unhandledrejection: ' + (e.reason && (e.reason.stack || e.reason.message || String(e.reason)))),
  );
  // Hook requestDevice to capture uncaptured errors + device loss
  const orig = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...args) {
    const device = await orig.apply(this, args);
    device.addEventListener('uncapturederror', (ev) => {
      window.__gpuErrors.push(`uncapturederror[${ev.error.constructor.name}]: ${ev.error.message}`);
      console.error(`[GPU uncapturederror] ${ev.error.message}`);
    });
    device.lost.then((info) => {
      window.__gpuErrors.push(`device.lost reason=${info.reason} message=${info.message}`);
      console.error(`[GPU device.lost] reason=${info.reason} message=${info.message}`);
    });
    return device;
  };
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(waitMs);

const gpuErrors = await page.evaluate(() => window.__gpuErrors);
console.log('=== GPU ERRORS (in-page) ===');
for (const e of gpuErrors) console.log(e);
console.log('=== CONSOLE ===');
for (const l of logs) console.log(l);

await browser.close();
