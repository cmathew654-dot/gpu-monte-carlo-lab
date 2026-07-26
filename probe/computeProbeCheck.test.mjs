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

console.log('compute probe checks: 4 passed, 0 failed');
