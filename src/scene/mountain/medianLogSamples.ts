/**
 * Builds the shared survivor-median reference consumed by both stochastic
 * and historical Rainier trails. Kept pure so partial-terminal alignment can
 * be pinned without importing three.js.
 */
import { SNAP_MAX } from '../../sim/model/history';
import { SNAP_QUANTILE_LEVELS } from '../../sim/stats/snapStats';
import type { SimStats, SnapshotStats } from '../../store/simStore';

const P50_INDEX = SNAP_QUANTILE_LEVELS.indexOf(0.5);

export function buildMedianLogSamples(
  initialWealth: number,
  snapshotStats: SnapshotStats | null,
  terminalStats: SimStats | null,
): Float32Array {
  const samples = new Float32Array(SNAP_MAX);
  const fallback = Math.log10(Math.max(initialWealth, 1));
  const hasPartialTerminal =
    snapshotStats !== null &&
    snapshotStats.horizonMonths % snapshotStats.snapStrideMonths !== 0;

  for (let slot = 0; slot < SNAP_MAX; slot++) {
    if (snapshotStats !== null && slot < snapshotStats.snapCount) {
      samples[slot] = Math.log10(
        Math.max(
          snapshotStats.quantiles[
            slot * SNAP_QUANTILE_LEVELS.length + P50_INDEX
          ],
          1,
        ),
      );
    } else if (
      snapshotStats !== null &&
      terminalStats !== null &&
      hasPartialTerminal &&
      slot === snapshotStats.snapCount
    ) {
      // The adaptive grid can end between regular snapshots (notably 32–39y).
      // Use the terminal readback's p50 for that extra endpoint instead of
      // silently snapping the reference back to initial wealth.
      samples[slot] = Math.log10(
        Math.max(terminalStats.percentiles.p50, 1),
      );
    } else {
      samples[slot] = fallback;
    }
  }
  return samples;
}
