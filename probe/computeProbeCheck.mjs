function errorMessage(error) {
  return error?.stack || error?.message || String(error);
}

export async function runComputeProbeCheck({
  device,
  renderer,
  probe,
  name,
  node,
  out,
}) {
  let thrown = null;
  let gpuError = null;
  let popFailure = null;

  // pushErrorScope is synchronous. Pop it even after computeAsync rejects so
  // no stale scope can contaminate the next production graph check.
  device.pushErrorScope('validation');
  try {
    await renderer.computeAsync(node);
  } catch (error) {
    thrown = error;
  } finally {
    try {
      gpuError = await device.popErrorScope();
    } catch (error) {
      popFailure = error;
      const message = errorMessage(error);
      probe.errors.push(`${name} popErrorScope: ${message}`);
      out(`${name} POP SCOPE THREW: ${message.slice(0, 3000)}`);
    }
  }

  if (thrown) {
    const message = errorMessage(thrown);
    probe.checks[name] = `threw: ${message}`;
    probe.errors.push(`${name}: ${message}`);
    out(`${name} THREW: ${message.slice(0, 3000)}`);
  } else if (popFailure) {
    probe.checks[name] = `popErrorScope failed: ${errorMessage(popFailure)}`;
  } else if (gpuError) {
    probe.checks[name] = gpuError.message;
    probe.errors.push(`${name} validation: ${gpuError.message}`);
    out(`${name} VALIDATION ERROR: ${gpuError.message.slice(0, 3000)}`);
  } else if (probe.deviceLost) {
    probe.checks[name] = 'device lost';
  } else {
    probe.checks[name] = 'passed';
    out(name + ' passed validation scope');
  }
}
