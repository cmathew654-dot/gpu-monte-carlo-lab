/**
 * PresentationOverlay.tsx — minimal client-meeting view (spec §4.6 task 5).
 * Hides both rails; enlarges the 3–4 key stats over the live canvas.
 * Toggle: 'p' keyboard shortcut (wired in App) or the PRESENT button.
 */
import { useSimStore } from '../store/simStore';
import { fmtPct, fmtUSDCompact } from './format';

export function PresentationOverlay() {
  const stats = useSimStore((s) => s.stats);
  const busy = useSimStore((s) => s.isStale || s.isRecomputing);
  const setPresentation = useSimStore((s) => s.setPresentation);

  return (
    <div className={`presentation${busy ? ' presentation--stale' : ''}`}>
      <div className="presentation__stats">
        <div className="presentation__hero">
          <div className="presentation__label">Probability of success</div>
          <div className="presentation__value data-label" aria-live="polite">
            {stats ? fmtPct(stats.successRate, 1) : '—'}
          </div>
        </div>
        <div className="presentation__row">
          <div className="presentation__cell">
            <div className="presentation__label">Median outcome</div>
            <div className="presentation__cell-value data-label">
              {stats ? fmtUSDCompact(stats.percentiles.p50) : '—'}
            </div>
          </div>
          <div className="presentation__cell">
            <div className="presentation__label">Worst-decile drawdown</div>
            <div className="presentation__cell-value presentation__cell-value--danger data-label">
              {stats ? `−${fmtPct(stats.worstDecileMaxDD, 1)}` : '—'}
            </div>
          </div>
          <div className="presentation__cell">
            <div className="presentation__label">Safe withdrawal</div>
            <div className="presentation__cell-value data-label">
              {stats && stats.safeWithdrawalRate > 0
                ? `${fmtUSDCompact(stats.safeWithdrawalRate)}/MO`
                : '—'}
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="btn btn--secondary presentation__exit"
        onClick={() => setPresentation(false)}
        aria-label="Exit presentation mode"
      >
        EXIT <kbd className="kbd">P</kbd>
      </button>
    </div>
  );
}
