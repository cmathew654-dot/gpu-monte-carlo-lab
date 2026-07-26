/* Compute-kernel probe: compiles the REAL sim kernels (initPaths + stepPaths)
 * by dispatching each exactly once inside a validation error scope,
 * immediately after init to fit inside the container's device lifetime.
 */
import { WebGPURenderer } from 'three/webgpu';
import { computeInit } from '/src/sim/kernels/initPaths.tsl.ts';
import { computeStep } from '/src/sim/kernels/stepPaths.tsl.ts';
import { computeStatsClear, computeStatsReduce, computeStatsHistogram } from '/src/sim/stats/histogram.tsl.ts';

const out = (s) => {
  document.getElementById('out').textContent += '\n' + s;
  console.log('[probe] ' + s);
};
window.__probe = { done: false, errors: [] };
window.addEventListener('error', (e) => window.__probe.errors.push('window.onerror: ' + e.message));
window.addEventListener('unhandledrejection', (e) =>
  window.__probe.errors.push('unhandledrejection: ' + (e.reason && (e.reason.stack || e.reason.message || String(e.reason)))),
);

async function main() {
  const renderer = new WebGPURenderer({ canvas: document.getElementById('c') });
  await renderer.init();
  out('renderer.init OK');
  const device = renderer.backend.device;
  device.addEventListener('uncapturederror', (ev) => {
    window.__probe.errors.push('uncapturederror: ' + ev.error.message);
    out('UNCAPTURED: ' + ev.error.message.slice(0, 3000));
  });

  for (const [name, node] of [
    ['computeInit', computeInit],
    ['computeStep', computeStep],
    ['computeStatsClear', computeStatsClear],
    ['computeStatsReduce', computeStatsReduce],
    ['computeStatsHistogram', computeStatsHistogram],
  ]) {
    try {
      await device.pushErrorScope('validation');
      renderer.compute(node);
      const gpuErr = await device.popErrorScope();
      if (gpuErr) {
        window.__probe.errors.push(name + ' validation: ' + gpuErr.message);
        out(name + ' VALIDATION ERROR: ' + gpuErr.message.slice(0, 3000));
      } else {
        out(name + ' dispatch passed validation scope');
      }
    } catch (e) {
      window.__probe.errors.push(name + ': ' + (e.stack || e.message));
      out(name + ' THREW: ' + e.message);
    }
  }

  window.__probe.done = true;
  out('DONE errors=' + window.__probe.errors.length);
}

main().catch((e) => {
  window.__probe.errors.push('main: ' + (e.stack || e.message));
  window.__probe.done = true;
  out('MAIN THREW: ' + e.message);
});
