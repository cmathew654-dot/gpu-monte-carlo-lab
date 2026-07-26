/* Compute-kernel probe: dispatches the REAL production graphs exactly once,
 * with an awaited validation scope around every individual graph.
 */
import { WebGPURenderer } from 'three/webgpu';
import { computeInit } from '/src/sim/kernels/initPaths.tsl.ts';
import { computeRegimeStep } from '/src/sim/kernels/regimeStep.tsl.ts';
import { computeStep } from '/src/sim/kernels/stepPaths.tsl.ts';
import { computeStatsClear, computeStatsReduce, computeStatsHistogram } from '/src/sim/stats/histogram.tsl.ts';
import {
  getStorageAttribute,
  pathBlockBase,
  uActiveN,
  uSeed,
  uStep,
} from '/src/sim/buffers.ts';
import { stepSeedU, streamUniform } from '/src/sim/model/hash.ts';
import { REGIME_CALIBRATION_F32 } from '/src/sim/regime/artifact.ts';
import { runComputeProbeCheck } from './computeProbeCheck.mjs';

const out = (s) => {
  document.getElementById('out').textContent += '\n' + s;
  console.log('[probe] ' + s);
};
const expected = [
  'computeInit',
  'computeRegimeStep',
  'regimeStateParity',
  'computeStep',
  'computeStatsClear',
  'computeStatsReduce',
  'computeStatsHistogram',
];

window.__probe = {
  done: false,
  checks: Object.fromEntries(expected.map((name) => [name, 'pending'])),
  errors: [],
  expected,
  deviceLost: null,
};
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
  void device.lost.then((info) => {
    window.__probe.deviceLost = {
      reason: info.reason,
      message: info.message,
    };
    window.__probe.errors.push(`device.lost: ${info.reason} ${info.message}`);
    out(`DEVICE LOST: ${info.reason} ${info.message}`);
  });

  uActiveN.value = 16;
  uSeed.value = 17;
  uStep.value = 0;

  for (const [name, node] of [
    ['computeInit', computeInit],
    ['computeRegimeStep', computeRegimeStep],
    ['computeStep', computeStep],
    ['computeStatsClear', computeStatsClear],
    ['computeStatsReduce', computeStatsReduce],
    ['computeStatsHistogram', computeStatsHistogram],
  ]) {
    await runComputeProbeCheck({
      device,
      renderer,
      probe: window.__probe,
      name,
      node,
      out,
    });
    if (name === 'computeRegimeStep') {
      try {
        const readback = await renderer.getArrayBufferAsync(
          getStorageAttribute(pathBlockBase),
        );
        const actual = Array.from(new Uint32Array(readback).subarray(0, 16));
        const stressProbability = REGIME_CALIBRATION_F32.latestFiltered[1];
        const expectedStates = Array.from({ length: 16 }, (_, path) => {
          const seedU = stepSeedU(path, 0, 17);
          return streamUniform(seedU, 0) < stressProbability ? 1 : 0;
        });
        const mismatch = actual.findIndex(
          (state, path) => state !== expectedStates[path],
        );
        if (mismatch >= 0) {
          throw new Error(
            `lane ${mismatch}: GPU ${actual[mismatch]}, CPU ${expectedStates[mismatch]}`,
          );
        }
        window.__probe.checks.regimeStateParity = 'passed';
        out(`regimeStateParity passed: ${actual.join(',')}`);
      } catch (error) {
        const message = error?.stack || error?.message || String(error);
        window.__probe.checks.regimeStateParity = message;
        window.__probe.errors.push(`regimeStateParity: ${message}`);
        out(`regimeStateParity FAILED: ${message.slice(0, 3000)}`);
      }
    }
  }

  window.__probe.done = true;
  out('DONE errors=' + window.__probe.errors.length + ' deviceLost=' + Boolean(window.__probe.deviceLost));
}

main().catch((e) => {
  window.__probe.errors.push('main: ' + (e.stack || e.message));
  window.__probe.done = true;
  out('MAIN THREW: ' + e.message);
});
