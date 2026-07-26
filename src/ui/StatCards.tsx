/**
 * StatCards.tsx — right-rail advisor stat cards for the five §2.5 stats
 * (spec §4.6 task 2). SINGLE OWNER: Agent 6.
 *
 * The "recomputing…" shimmer appears ONLY when isStale/isRecomputing — it
 * never blocks interaction. Empty state (stats === null) shows skeletons
 * until the first readback lands. All numbers use tabular-nums.
 */
import { useSimStore, type SimStats } from '../store/simStore';
import { fmtPct, fmtUSDCompact } from './format';
import { successRateRange } from '../sim/model/triangulation';

// ---------------------------------------------------------------------------
// Distribution strip — p5..p95 band with quartile ticks (reused by the CPU
// fallback DOM view).
// ---------------------------------------------------------------------------

export function DistributionStrip({
  percentiles,
}: {
  percentiles: SimStats['percentiles'];
}) {
  const { p5, p25, p50, p75, p95 } = percentiles;
  const span = p95 - p5;
  const pos = (v: number) => (span > 0 ? ((v - p5) / span) * 100 : 50);
  return (
    <div
      className="dist-strip"
      role="img"
      aria-label={`Terminal wealth distribution: 5th percentile ${fmtUSDCompact(p5)}, median ${fmtUSDCompact(p50)}, 95th percentile ${fmtUSDCompact(p95)}`}
    >
      <div className="dist-strip__band" />
      {[
        { v: p5, cls: 'dist-strip__tick--edge' },
        { v: p25, cls: '' },
        { v: p50, cls: 'dist-strip__tick--median' },
        { v: p75, cls: '' },
        { v: p95, cls: 'dist-strip__tick--edge' },
      ].map((t, i) => (
        <div
          key={i}
          className={`dist-strip__tick ${t.cls}`}
          style={{ left: `${pos(t.v)}%` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational pieces.
// ---------------------------------------------------------------------------

function StatRow({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: 'accent' | 'danger';
  sub?: string;
}) {
  return (
    <div className="stat-row">
      <div className="stat-row__label">{label}</div>
      <div
        className={`stat-row__value data-label${
          tone === 'danger' ? ' stat-row__value--danger' : ''
        }${tone === 'accent' ? ' stat-row__value--accent' : ''}`}
      >
        {value}
      </div>
      {sub ? <div className="stat-row__sub">{sub}</div> : null}
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="stat-cards__body" aria-busy="true">
      <div className="stat-skeleton stat-skeleton--hero" />
      <div className="stat-skeleton" />
      <div className="stat-skeleton" />
      <div className="stat-skeleton" />
      <p className="stat-cards__empty data-label">AWAITING FIRST SIMULATION…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCards panel.
// ---------------------------------------------------------------------------

export function StatCards() {
  const stats = useSimStore((s) => s.stats);
  const isStale = useSimStore((s) => s.isStale);
  const isRecomputing = useSimStore((s) => s.isRecomputing);
  const magnitudeStats = useSimStore((s) => s.magnitudeStats);
  const triStats = useSimStore((s) => s.triStats);

  const busy = isStale || isRecomputing;
  const triRange = triStats ? successRateRange(triStats) : null;

  return (
    <div className="app-rail app-rail--right">
      <aside
        className={`panel stat-cards${busy ? ' stat-cards--stale' : ''}`}
        aria-label="Simulation statistics"
      >
        <div className="panel__scroll">
          <div className="stat-cards__header">
            <span className="panel-section__title">Outcomes</span>
            {busy ? (
              <span className="stat-cards__shimmer-tag data-label" role="status">
                RECOMPUTING…
              </span>
            ) : null}
          </div>

          {stats === null ? (
            <SkeletonCards />
          ) : (
            <div className={`stat-cards__body${busy ? ' stat-cards__body--stale' : ''}`}>
              {/* 1. Probability of success — the headline number */}
              <div className="stat-hero">
                <div className="stat-row__label">Probability of success</div>
                <div
                  className="stat-hero__value data-label"
                  aria-live="polite"
                >
                  {fmtPct(stats.successRate, 1)}
                </div>
                <div className="stat-row__sub">
                  PATHS SOLVENT FOR FULL HORIZON
                </div>
              </div>

              {/* 2. Terminal wealth percentiles */}
              <div className="stat-block">
                <div className="stat-row__label">Terminal wealth — percentiles</div>
                <DistributionStrip percentiles={stats.percentiles} />
                <div className="stat-pctl-grid data-label">
                  <span>P5</span>
                  <span>{fmtUSDCompact(stats.percentiles.p5)}</span>
                  <span>P25</span>
                  <span>{fmtUSDCompact(stats.percentiles.p25)}</span>
                  <span className="stat-pctl-grid__median">P50</span>
                  <span className="stat-pctl-grid__median">
                    {fmtUSDCompact(stats.percentiles.p50)}
                  </span>
                  <span>P75</span>
                  <span>{fmtUSDCompact(stats.percentiles.p75)}</span>
                  <span>P95</span>
                  <span>{fmtUSDCompact(stats.percentiles.p95)}</span>
                </div>
              </div>

              {triStats && triRange ? (
                <div className="model-triangulation">
                  <div className="stat-row__label">Model triangulation</div>
                  <div className="model-triangulation__range data-label">
                    {fmtPct(triRange.min, 1)}–{fmtPct(triRange.max, 1)}
                  </div>
                  {(
                    [
                      ['GBM', triStats.successRates.gbm],
                      ['Historical bootstrap', triStats.successRates.bootstrap],
                      ['Student-t(5)', triStats.successRates.fattail],
                    ] as const
                  ).map(([label, rate]) => (
                    <div className="model-triangulation__row" key={label}>
                      <span>{label}</span>
                      <span className="data-label">{fmtPct(rate, 1)}</span>
                    </div>
                  ))}
                  <p>Where the models disagree, the assumptions live.</p>
                </div>
              ) : null}

              {/* 3. Worst-decile max drawdown */}
              <StatRow
                label="Worst-decile max drawdown"
                value={`−${fmtPct(stats.worstDecileMaxDD, 1)}`}
                tone="danger"
                sub="MEAN OF DEEPEST 10% OF PEAK-TO-TROUGH DRAWDOWNS"
              />

              {/* 4. Safe withdrawal rate */}
              <StatRow
                label="Safe withdrawal rate"
                value={
                  stats.safeWithdrawalRate > 0
                    ? `${fmtUSDCompact(stats.safeWithdrawalRate)}/MO`
                    : '—'
                }
                tone="accent"
                sub="MAX SPEND AT ≥90% SUCCESS"
              />

              {magnitudeStats ? (
                <>
                  <StatRow
                    label="Median shortfall"
                    value={
                      magnitudeStats.medianShortfallYears === null
                        ? '—'
                        : `${magnitudeStats.medianShortfallYears.toFixed(1)} YRS`
                    }
                    tone={
                      magnitudeStats.medianShortfallYears === null
                        ? undefined
                        : 'danger'
                    }
                    sub="FAILED PATHS ONLY"
                  />
                  <StatRow
                    label="Median unfunded obligation"
                    value={
                      magnitudeStats.medianUnfundedObligation === null
                        ? '—'
                        : fmtUSDCompact(
                            magnitudeStats.medianUnfundedObligation,
                          )
                    }
                    tone={
                      magnitudeStats.medianUnfundedObligation === null
                        ? undefined
                        : 'danger'
                    }
                    sub="REAL, UNDISCOUNTED WITHDRAWALS"
                  />
                </>
              ) : null}

              {/* 5. Median failure year */}
              <StatRow
                label="Median failure year"
                value={
                  stats.medianFailureYear === null
                    ? '—'
                    : `YR ${Math.round(stats.medianFailureYear)}`
                }
                tone={stats.medianFailureYear === null ? undefined : 'danger'}
                sub={
                  stats.medianFailureYear === null
                    ? 'NO FAILED PATHS'
                    : 'MEDIAN, FAILED PATHS ONLY'
                }
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
