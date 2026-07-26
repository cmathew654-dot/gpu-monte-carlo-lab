/**
 * SwrButton.tsx — on-demand safe-withdrawal-rate trigger (integrator).
 *
 * The §2.5 SWR binary search re-sims up to 10× at 100k paths and OVERWRITES
 * the shared GPU buffers before restoring them (CONTRACTS_STATS.md §5), so
 * it must not run on every slider tick — it is wired to this explicit
 * button instead. GPU mode only (Agent 6's useCpuSim computes SWR
 * automatically in the CPU pipeline, so the button renders nothing there).
 *
 * Click → simRuntime.requestSafeWithdrawal() (src/scene/simRuntime.ts):
 * aborts the in-flight run, re-enters the driver's own pipeline with
 * withSafeWithdrawal: true under the same markRecomputing handshake, then
 * setStats stamps the result. Pending state is shown via isRecomputing —
 * no new store fields.
 *
 * Aesthetic: Agent 6's `.btn .btn--secondary` (JetBrains Mono, uppercase,
 * hairline border — see theme.css), docked just left of the right stat
 * rail so it reads as part of the Outcomes cluster.
 */
import { simRuntime } from '../scene/simRuntime';
import { useSimStore } from '../store/simStore';

export function SwrButton() {
  const mode = useSimStore((s) => s.mode);
  const isRecomputing = useSimStore((s) => s.isRecomputing);
  const hasSwr = useSimStore((s) => (s.stats?.safeWithdrawalRate ?? 0) > 0);

  // CPU mode computes SWR automatically (useCpuSim); nothing to trigger.
  if (mode !== 'gpu') return null;

  const label = isRecomputing
    ? 'CALCULATING…'
    : hasSwr
      ? 'RECALC SAFE WR'
      : 'CALC SAFE WR';

  return (
    <div className="swr-dock">
      <button
        type="button"
        className="btn btn--secondary"
        disabled={isRecomputing}
        onClick={() => simRuntime.requestSafeWithdrawal?.()}
        title="Binary-search the max monthly withdrawal at ≥90% success (re-sims up to 10× at 100k paths)"
      >
        {label}
      </button>
    </div>
  );
}
