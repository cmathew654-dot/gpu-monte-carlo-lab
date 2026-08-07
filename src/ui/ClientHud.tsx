/**
 * ClientHud.tsx — the viz4 CLIENT-view DOM overlay (replaces the advisor
 * rails when viewMode === 'client'). One question, answered in 5 seconds:
 * "does my money last, and what changes that?"
 *
 *   (a) the narrative sentence, large and white — "In N of 100 futures,
 *       your money outlives you." — plus a muted second line when failure
 *       data exists ("When it fails, it fails around year Y.");
 *   (b) TWO sliders only — monthly spending and retire-at-year — reusing
 *       ControlPanel's ParamSlider primitive and the same store actions,
 *       so the 150 ms commit debounce and the 10k live-drag preview behave
 *       exactly as in advisor mode (stats update live during drags);
 *   (c) a tiny preset menu — the 5 scenarios, names only;
 *   (d) a quiet ADVISOR MODE (A) hint + the live-preview capability badge.
 *
 * No stat grid, no distribution strip — numbers as sentences, not
 * dashboards. Pointer-events discipline mirrors the rails: the overlay is
 * transparent to the canvas except on its controls.
 */
import * as React from 'react';
import {
  useSimStore,
  type MagnitudeStats,
  type SimMode,
  type SimParams,
  type SimStats,
} from '../store/simStore';
import { type FrontierStatus, useFrontierStore } from '../store/frontierStore';
import type { ModelComparison, RobustnessFrontier } from '../sim/frontier/types';
import { CapabilityBadge } from './CapabilityBadge';
import { ParamSlider } from './controls';
import { fmtPct, fmtUSD, fmtUSDCompact } from './format';
import { GauntletPanel } from './GauntletPanel';
import {
  clientRobustSpendSentence,
  clientSaturationSentence,
  comparisonRange,
  isFrontierCurrent,
} from './frontierPresentation';
import type { ScenarioPreset } from './presets';

export interface ClientNarrativeProps {
  stats: SimStats | null;
  modelComparison: ModelComparison | null;
  magnitudeStats: MagnitudeStats | null;
  frontierStatus: FrontierStatus;
  frontierResult: RobustnessFrontier | null;
  committedParams: SimParams;
  mode: SimMode;
}

export function ClientNarrative({
  stats,
  modelComparison,
  magnitudeStats,
  frontierStatus,
  frontierResult,
  committedParams,
  mode,
}: ClientNarrativeProps) {
  const successCount = stats === null ? null : Math.round(stats.successRate * 100);
  const comparison = modelComparison ? comparisonRange(modelComparison) : null;
  const currentFrontier = frontierStatus === 'complete'
    && isFrontierCurrent(frontierResult, committedParams, mode)
    ? frontierResult
    : null;
  const hasFourModelFrontier = currentFrontier !== null
    && ['gbm', 'bootstrap', 'fattail', 'regime'].every((model) =>
      currentFrontier.models.some((result) => result.model === model));
  const frontierSuccessRates = hasFourModelFrontier
    ? currentFrontier.models.map(({ outcome }) => outcome.stats.successRate)
    : null;
  const successLow = frontierSuccessRates
    ? Math.round(Math.min(...frontierSuccessRates) * 100)
    : comparison
      ? Math.round(comparison.success.min * 100)
      : successCount;
  const successHigh = frontierSuccessRates
    ? Math.round(Math.max(...frontierSuccessRates) * 100)
    : comparison
      ? Math.round(comparison.success.max * 100)
      : successCount;
  const failureYear = stats?.medianFailureYear === null || stats === null
    ? null
    : Math.round(stats.medianFailureYear);
  const saturation = hasFourModelFrontier
    ? frontierSuccessRates?.every((rate) => rate === 1)
      ? 'All four market lenses reached 100.0% success: the ceiling of this measure, not a guarantee.'
      : null
    : modelComparison
      ? clientSaturationSentence(modelComparison)
      : null;
  const robustSpend = currentFrontier
    ? clientRobustSpendSentence(currentFrontier)
    : null;
  const modelBasis = hasFourModelFrontier
    ? {
        visible: 'Your plan, tested through four statistical market models',
        detail: 'GBM, historical bootstrap, Student-t(5), and Regime-t',
      }
    : modelComparison
      ? {
          visible: 'Your plan, tested through three statistical market models',
          detail: 'GBM, historical bootstrap, and Student-t(5)',
        }
      : {
          visible: 'Building your multi-model plan stress test',
          detail: 'The comparison range appears when the background analyses finish',
        };
  const allocation = committedParams.glidepath === null
    ? '100% equities'
    : Math.round(committedParams.glidepath.start * 100)
      + '→'
      + Math.round(committedParams.glidepath.end * 100)
      + '% equities';
  const retirementTiming = committedParams.retireYear === 0
    ? 'retire now'
    : 'retire in ' + committedParams.retireYear + ' years';

  return (
    <div className="client-hud__narrative">
      <p className="client-hud__model-basis">
        {modelBasis.visible}
        <span className="sr-only">. {modelBasis.detail}.</span>
      </p>
      <p className="client-hud__plan-basis">
        Plan: {fmtUSDCompact(committedParams.initialWealth)} invested
        {' · '}{fmtUSD(committedParams.contribution)}/mo saved
        {' · '}{fmtUSD(committedParams.withdrawal)}/mo spending
        {' · '}{retirementTiming}
        {' · '}{committedParams.horizonYears}-year horizon
        {' · '}{allocation}
      </p>
      <details className={'client-hud__method'}>
        <summary>
          <span>How we tested this</span>
          <span className={'client-hud__method-state'}>
            {hasFourModelFrontier
              ? '4 models complete'
              : '3 now · 1 full stress test'}
          </span>
        </summary>
        <div className={'client-hud__method-panel'}>
          <p>No model predicts the future. Each keeps a different risk visible.</p>
          <ul className={'client-hud__method-list'}>
            <li>
              <strong>Baseline compounding</strong>
              <span>GBM · A clean reference case for month-to-month growth.</span>
            </li>
            <li>
              <strong>History in one-year pieces</strong>
              <span>
                Historical bootstrap · Replays real stock and bond sequences
                instead of inventing them.
              </span>
            </li>
            <li>
              <strong>More extreme months</strong>
              <span>Student-t(5) · Makes rare market shocks more common.</span>
            </li>
            <li>
              <strong>Stress that persists</strong>
              <span>
                Regime-t · Keeps turbulent conditions clustered while
                simulating stocks and bonds jointly.
              </span>
            </li>
          </ul>
          <p className={'client-hud__method-status'}>
            {hasFourModelFrontier
              ? 'All four ran on this plan.'
              : 'Three run automatically. Regime-t joins the full robustness test.'}
          </p>
          <p>
            Why it helps: agreement is more reassuring; disagreement shows
            which assumption matters.
          </p>
        </div>
      </details>
      <p className="client-hud__sentence" aria-live="polite">
        {successCount === null ? (
          'Listening to a hundred thousand possible futures…'
        ) : (
          <React.Fragment>
            In <span className="client-hud__number">
              {successLow}
              {successHigh !== successLow ? '–' + successHigh : ''}
            </span> of 100 futures, your money outlives you.
          </React.Fragment>
        )}
      </p>
      {saturation && (
        <p className="client-hud__subline client-hud__subline--saturation">
          {saturation}
        </p>
      )}
      {failureYear !== null && (
        <p className="client-hud__subline client-hud__subline--failure">
          When it fails, it fails around year {failureYear}
          {magnitudeStats?.medianShortfallYears !== null
          && magnitudeStats?.medianShortfallYears !== undefined
          && magnitudeStats.medianUnfundedObligation !== null
            ? ' — typically short '
              + magnitudeStats.medianShortfallYears.toFixed(1)
              + ' years and '
              + fmtUSDCompact(magnitudeStats.medianUnfundedObligation)
              + '.'
            : '.'}
        </p>
      )}
      {stats && (
        <p className="client-hud__subline client-hud__subline--drawdown">
          Across the roughest 1 in 10 futures, the deepest peak-to-trough drop
          averaged {fmtPct(stats.worstDecileMaxDD, 1)}.
        </p>
      )}
      {robustSpend && (
        <p className="client-hud__subline client-hud__subline--frontier">
          {robustSpend}
        </p>
      )}
    </div>
  );
}

export function ClientHud() {
  const stats = useSimStore((s) => s.stats);
  const params = useSimStore((s) => s.params);
  const mode = useSimStore((s) => s.mode);
  const setParams = useSimStore((s) => s.setParams);
  const applyPreset = useSimStore((s) => s.applyPreset);
  const toggleViewMode = useSimStore((s) => s.toggleViewMode);
  const modelComparison = useSimStore((s) => s.modelComparison);
  const magnitudeStats = useSimStore((s) => s.magnitudeStats);
  const committedParams = useSimStore((s) => s.committedParams);
  const frontierStatus = useFrontierStore((s) => s.status);
  const frontierResult = useFrontierStore((s) => s.result);

  const [presets, setPresets] = React.useState<ScenarioPreset[] | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void import('./presets').then(({ loadScenarioPresets }) =>
      loadScenarioPresets().then((loaded) => {
        if (!cancelled) setPresets(loaded);
      }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="client-hud">
      <div className="client-hud__top">
        <ClientNarrative
          stats={stats}
          modelComparison={modelComparison}
          magnitudeStats={magnitudeStats}
          frontierStatus={frontierStatus}
          frontierResult={frontierResult}
          committedParams={committedParams}
          mode={mode}
        />
      </div>

      <div className="client-hud__bottom">
        <GauntletPanel />

        {presets !== null && presets.length > 0 && (
          <nav className="client-hud__presets" aria-label="Scenario presets">
            {presets.map((p) => (
              <button
                key={p.name}
                type="button"
                className="client-hud__preset"
                title={p.description}
                onClick={() => applyPreset(p)}
              >
                {p.name}
              </button>
            ))}
          </nav>
        )}

        <div className="client-hud__sliders">
          <ParamSlider
            label="Monthly spending"
            value={params.withdrawal}
            min={0}
            max={10_000}
            step={100}
            format={(v) => `${fmtUSD(v)}`}
            onChange={(v) => setParams({ withdrawal: v })}
          />
          <ParamSlider
            label="Retire at year"
            value={params.retireYear}
            min={0}
            max={params.horizonYears}
            step={1}
            format={(v) => (v === 0 ? 'NOW' : `YEAR ${v}`)}
            onChange={(v) => setParams({ retireYear: v })}
          />
        </div>

        <div className="client-hud__meta">
          <CapabilityBadge mode={mode} />
          <button
            type="button"
            className="client-hud__advisor-hint"
            onClick={toggleViewMode}
            title="Switch to the full advisor terminal (A)"
          >
            ADVISOR MODE <kbd className="kbd" aria-hidden="true">A</kbd>
          </button>
        </div>

        {/* viz5 terrain attribution (public/terrain/terrain.json source). */}
        <p className="client-hud__credit">
          Mt. Rainier · Elevation: USGS NED / SRTM via Mapzen Terrarium
        </p>
      </div>
    </div>
  );
}


