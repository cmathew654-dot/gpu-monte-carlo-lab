import assert from 'node:assert/strict';

const module = await import('./computeProbeCheck.mjs').catch(() => null);

assert.ok(module, 'compute probe checks must expose a dispatch helper');

const probe = {
  checks: { computeInit: 'pending' },
  errors: [],
  deviceLost: null,
};
const device = {
  pushErrorScope() {},
  async popErrorScope() {
    throw new Error('scope pop rejected');
  },
};
const renderer = {
  async computeAsync() {},
};

await module.runComputeProbeCheck({
  device,
  renderer,
  probe,
  name: 'computeInit',
  node: {},
  out() {},
});

assert.notEqual(
  probe.checks.computeInit,
  'passed',
  'a rejected validation-scope pop must not publish a passing graph check',
);
assert.match(probe.checks.computeInit, /pop.*rejected/i);
assert.equal(probe.errors.length, 1);
assert.match(probe.errors[0], /^computeInit popErrorScope: Error: scope pop rejected/);

const reasonlessProbe = {
  checks: { computeStep: 'pending' },
  errors: [],
  deviceLost: null,
};
await module.runComputeProbeCheck({
  device: {
    pushErrorScope() {},
    async popErrorScope() {
      throw undefined;
    },
  },
  renderer,
  probe: reasonlessProbe,
  name: 'computeStep',
  node: {},
  out() {},
});
assert.notEqual(
  reasonlessProbe.checks.computeStep,
  'passed',
  'a reasonless rejected scope pop must not publish a passing graph check',
);
assert.equal(reasonlessProbe.errors.length, 1);
assert.match(reasonlessProbe.errors[0], /^computeStep popErrorScope: undefined$/);

console.log('compute probe checks: 7 passed, 0 failed');
