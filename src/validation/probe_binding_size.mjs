/**
 * probe_binding_size.mjs — Agent 7B independent re-probe of FINDING-1's fix
 * (AMENDMENT A2). Requires playwright (`npm root -g`/playwright) and the
 * container's headless Chromium; run: `node src/validation/probe_binding_size.mjs`
 * (exit 0 = fix verified). Launch flags that expose SwiftShader WebGPU in
 * this container: --enable-unsafe-webgpu --enable-features=Vulkan
 * --use-vulkan=swiftshader (see REPORT.md §10).
 *
 * Falsification design: a probe that ALWAYS passes proves nothing, so we run
 * a discriminating control. With a DEFAULT device (requiredLimits: {} — what
 * three r185 passes unless told otherwise):
 *   A) bind-group creation at 128,000,000 B (A2 pathHistory size) must PASS;
 *   B) the same at 160,000,000 B (A1 size, the original defect) must FAIL
 *      with a binding-size GPUValidationError;
 *   C) a real compute dispatch writing through the 128 MB binding must
 *      complete without validation error and produce correct data (readback).
 * If (B) unexpectedly passes or (A) fails, the probe itself is suspect and
 * the fix is NOT verified.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const globalRoot = execSync('npm root -g').toString().trim();
const require = createRequire(globalRoot + '/');
const { chromium } = require('playwright');

const PAGE_JS = `
(async () => {
  const out = {};
  if (!('gpu' in navigator)) return { fatal: 'navigator.gpu absent' };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { fatal: 'no adapter' };
  out.adapterDefaultLimit = adapter.limits.maxStorageBufferBindingSize;

  // three r185 default: no requiredLimits -> default limits.
  const device = await adapter.requestDevice({ requiredLimits: {} });
  out.deviceLimit = device.limits.maxStorageBufferBindingSize;

  const errors = [];
  device.addEventListener('uncapturederror', (e) => errors.push(String(e.error.message)));

  const wgsl = \`
    @group(0) @binding(0) var<storage, read_write> big: array<f32>;
    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x == 0u) { big[0] = 42.0; }
      if (gid.x == 64u) { big[arrayLength(&big) - 1u] = 43.0; }
    }\`;

  async function tryBindAndDispatch(sizeBytes, label) {
    errors.length = 0;
    const r = { label, sizeBytes };
    try {
      const buf = device.createBuffer({
        size: sizeBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      const module = device.createShaderModule({ code: wgsl });
      const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module, entryPoint: 'main' },
      });
      const bg = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: buf, offset: 0, size: sizeBytes } }],
      });
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(2);
      pass.end();
      const readback = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      enc.copyBufferToBuffer(buf, 0, readback, 0, 16);
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      // drain async validation
      const err = await device.popErrorScope().catch(() => null);
      await readback.mapAsync(GPUMapMode.READ);
      const first = new Float32Array(readback.getMappedRange())[0];
      readback.unmap();
      r.bindGroupCreated = true;
      r.firstElement = first;
      r.errors = errors.slice();
      if (err) r.errors.push(String(err.message ?? err));
      r.pass = errors.length === 0 && first === 42;
      buf.destroy(); readback.destroy();
    } catch (e) {
      r.bindGroupCreated = false;
      r.thrown = String(e.message ?? e);
      r.errors = errors.slice();
      r.pass = false;
    }
    return r;
  }

  out.fit = await tryBindAndDispatch(128000000, 'A2 pathHistory size (fits)');
  out.control = await tryBindAndDispatch(160000000, 'A1 pathHistory size (defect control)');
  device.destroy();
  return out;
})()
`;

import http from 'node:http';
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end('<html><body>probe</body></html>');
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-vulkan=swiftshader',
    '--no-sandbox',
  ],
});
const page = await browser.newPage();
await page.goto(url);
const result = await page.evaluate(PAGE_JS);
console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

// Verdict logic
if (result.fatal) { console.log('PROBE FATAL:', result.fatal); process.exit(2); }
const okDefault = result.deviceLimit === 134217728;
const fitOK = result.fit?.pass === true;
const controlFailedAsExpected = result.control?.pass === false &&
  JSON.stringify(result.control).match(/binding size|larger than the maximum/i);
console.log('---');
console.log('default limit is 128 MiB:', okDefault);
console.log('128,000,000 B bind+dispatch PASSES:', fitOK);
console.log('160,000,000 B control FAILS with binding-size error:', !!controlFailedAsExpected);
process.exit(okDefault && fitOK && controlFailedAsExpected ? 0 : 1);
