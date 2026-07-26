// viz4 visual check: loads the real app, waits, dumps the HUD text and a
// screenshot for both view modes (client default; 'a' → advisor).
import { chromium } from '/home/kimi/.npm-global/lib/node_modules/playwright/index.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const waitMs = Number(process.argv[3] || 12000);

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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(waitMs);

const clientText = await page.evaluate(() => document.body.innerText.slice(0, 600));
console.log('=== CLIENT HUD TEXT ===');
console.log(clientText);
await page.screenshot({ path: '/tmp/viz4-client.png' });

// Toggle advisor mode.
await page.keyboard.press('a');
await page.waitForTimeout(4000);
const advisorText = await page.evaluate(() => document.body.innerText.slice(0, 400));
console.log('=== ADVISOR TEXT (head) ===');
console.log(advisorText);
await page.screenshot({ path: '/tmp/viz4-advisor.png' });

console.log('=== LOG TAIL ===');
for (const l of logs.slice(-8)) console.log(l);
await browser.close();
