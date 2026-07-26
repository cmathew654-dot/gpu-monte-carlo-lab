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
import { useEffect, useState } from 'react';
import { useSimStore } from '../store/simStore';
import { CapabilityBadge } from './CapabilityBadge';
import { ParamSlider } from './controls';
import { fmtUSD, fmtUSDCompact } from './format';
import { successRateRange } from '../sim/model/triangulation';
import { loadScenarioPresets, type ScenarioPreset } from './presets';

export function ClientHud() {
  const stats = useSimStore((s) => s.stats);
  const params = useSimStore((s) => s.params);
  const mode = useSimStore((s) => s.mode);
  const setParams = useSimStore((s) => s.setParams);
  const applyPreset = useSimStore((s) => s.applyPreset);
  const toggleViewMode = useSimStore((s) => s.toggleViewMode);
  const triStats = useSimStore((s) => s.triStats);
  const magnitudeStats = useSimStore((s) => s.magnitudeStats);

  const [presets, setPresets] = useState<ScenarioPreset[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadScenarioPresets().then((loaded) => {
      if (!cancelled) setPresets(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const successCount =
    stats === null ? null : Math.round(stats.successRate * 100);
  const failureYear =
    stats !== null && stats.medianFailureYear !== null
      ? Math.round(stats.medianFailureYear)
      : null;
  const triRange = triStats ? successRateRange(triStats) : null;
  const successLow = triRange ? Math.round(triRange.min * 100) : successCount;
  const successHigh = triRange ? Math.round(triRange.max * 100) : successCount;

  return (
    <div className="client-hud">
      <div className="client-hud__narrative">
        <p className="client-hud__sentence" aria-live="polite">
          {successCount === null ? (
            'Listening to a hundred thousand possible futures…'
          ) : (
            <>
              In <span className="client-hud__number">
                {successLow}
                {successHigh !== successLow ? `–${successHigh}` : ''}
              </span> of 100 futures, your money outlives you.
            </>
          )}
        </p>
        {failureYear !== null && (
          <p className="client-hud__subline">
            When it fails, it fails around year {failureYear}
            {magnitudeStats?.medianShortfallYears !== null &&
            magnitudeStats?.medianShortfallYears !== undefined &&
            magnitudeStats.medianUnfundedObligation !== null
              ? ` — typically short ${magnitudeStats.medianShortfallYears.toFixed(1)} years and ${fmtUSDCompact(magnitudeStats.medianUnfundedObligation)}.`
              : '.'}
          </p>
        )}
      </div>

      <div className="client-hud__bottom">
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
