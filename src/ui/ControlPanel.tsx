/**
 * ControlPanel.tsx — left-rail controls for every SimParams field
 * (spec §4.6 task 1). SINGLE OWNER: Agent 6.
 *
 * Layout: ~300px floating panel over the canvas, pointer-events discipline
 * handled by .app-rail (theme.css). Every write goes through store actions:
 * sliders → setParams (150 ms debounced commit), discrete controls →
 * immediate-commit actions (setModel / setPathCount / rerollSeed /
 * applyPreset).
 */
import { useEffect, useState } from 'react';
import {
  CPU_PATH_CAP,
  PATH_COUNT_OPTIONS,
  useSimStore,
  type SimParams,
} from '../store/simStore';
import { PanelSection, ParamSlider, SegmentedControl } from './controls';
import { fmtPathCount, fmtPct, fmtSeed, fmtUSD } from './format';
import { loadScenarioPresets, type ScenarioPreset } from './presets';

const MODEL_OPTIONS: ReadonlyArray<{
  value: SimParams['model'];
  label: string;
  title: string;
}> = [
  { value: 'bootstrap', label: 'Bootstrap', title: 'Historical 12-month block bootstrap (default)' },
  { value: 'gbm', label: 'GBM', title: 'Geometric Brownian motion with μ/σ below' },
  { value: 'fattail', label: 'Fat-tail', title: 'GBM with Student-t (ν=5) innovations' },
];

export function ControlPanel() {
  const params = useSimStore((s) => s.params);
  const mode = useSimStore((s) => s.mode);
  const setParams = useSimStore((s) => s.setParams);
  const setModel = useSimStore((s) => s.setModel);
  const setPathCount = useSimStore((s) => s.setPathCount);
  const rerollSeed = useSimStore((s) => s.rerollSeed);
  const applyPreset = useSimStore((s) => s.applyPreset);

  const [presets, setPresets] = useState<ScenarioPreset[] | null>(null);
  const [presetIndex, setPresetIndex] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    void loadScenarioPresets().then((loaded) => {
      if (!cancelled) setPresets(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const glideOn = params.glidepath !== null;
  const cpuCapped = mode === 'cpu';

  return (
    <div className="app-rail app-rail--left">
      <aside className="panel control-panel" aria-label="Simulation controls">
        <div className="panel__scroll">
          <PanelSection title="Scenario preset">
            {presets === null ? (
              <div className="preset-empty data-label">LOADING PRESETS…</div>
            ) : presets.length === 0 ? (
              <div className="preset-empty data-label">
                PRESETS UNAVAILABLE
              </div>
            ) : (
              <select
                className="preset-select"
                aria-label="Scenario preset"
                value={presetIndex}
                onChange={(e) => {
                  const idx = e.currentTarget.value;
                  setPresetIndex(idx);
                  if (idx === '') return;
                  const preset = presets[Number(idx)];
                  if (preset) applyPreset(preset);
                }}
              >
                <option value="">CUSTOM — CHOOSE A PRESET…</option>
                {presets.map((p, i) => (
                  <option key={p.name} value={String(i)} title={p.description}>
                    {p.name.toUpperCase()}
                  </option>
                ))}
              </select>
            )}
          </PanelSection>

          <PanelSection title="Return model">
            <SegmentedControl
              ariaLabel="Return model"
              options={MODEL_OPTIONS}
              value={params.model}
              onChange={setModel}
            />
          </PanelSection>

          <PanelSection title="Portfolio">
            <ParamSlider
              label="Initial wealth"
              value={params.initialWealth}
              min={0}
              max={5_000_000}
              step={25_000}
              format={fmtUSD}
              onChange={(v) => setParams({ initialWealth: v })}
            />
            <ParamSlider
              label="Contribution / mo"
              value={params.contribution}
              min={0}
              max={10_000}
              step={100}
              format={(v) => `${fmtUSD(v)}`}
              onChange={(v) => setParams({ contribution: v })}
            />
            <ParamSlider
              label="Withdrawal / mo"
              value={params.withdrawal}
              min={0}
              max={10_000}
              step={100}
              format={(v) => `${fmtUSD(v)}`}
              onChange={(v) => setParams({ withdrawal: v })}
            />
          </PanelSection>

          <PanelSection title="Timeline">
            <ParamSlider
              label="Horizon"
              value={params.horizonYears}
              min={10}
              max={40}
              step={1}
              format={(v) => `${v} YRS`}
              onChange={(v) => setParams({ horizonYears: v })}
            />
            <ParamSlider
              label="Retire at year"
              value={params.retireYear}
              min={0}
              max={params.horizonYears}
              step={1}
              format={(v) => (v === 0 ? 'NOW' : `YR ${v}`)}
              onChange={(v) => setParams({ retireYear: v })}
            />
          </PanelSection>

          <PanelSection title="Market assumptions">
            <ParamSlider
              label="Real return μ"
              value={params.mu}
              min={0}
              max={0.12}
              step={0.001}
              format={(v) => fmtPct(v, 1)}
              onChange={(v) => setParams({ mu: v })}
              disabled={params.model === 'bootstrap'}
              hint={params.model === 'bootstrap' ? 'NOT USED BY BOOTSTRAP MODEL' : undefined}
            />
            <ParamSlider
              label="Volatility σ"
              value={params.sigma}
              min={0.05}
              max={0.3}
              step={0.005}
              format={(v) => fmtPct(v, 1)}
              onChange={(v) => setParams({ sigma: v })}
              disabled={params.model === 'bootstrap'}
            />
            <div className="glidepath-row">
              <label className="glidepath-toggle" htmlFor="glidepath-switch">
                <input
                  id="glidepath-switch"
                  type="checkbox"
                  role="switch"
                  aria-checked={glideOn}
                  checked={glideOn}
                  onChange={(e) =>
                    setParams({
                      glidepath: e.currentTarget.checked
                        ? { start: 1.0, end: 0.4 }
                        : null,
                    })
                  }
                />
                <span className="glidepath-toggle__track" aria-hidden="true" />
                <span className="param-slider__label">Glidepath</span>
              </label>
            </div>
            <ParamSlider
              label="Equity at start"
              value={params.glidepath?.start ?? 1}
              min={0}
              max={1}
              step={0.05}
              format={(v) => fmtPct(v, 0)}
              onChange={(v) =>
                setParams({
                  glidepath: { start: v, end: params.glidepath?.end ?? 0.4 },
                })
              }
              disabled={!glideOn}
            />
            <ParamSlider
              label="Equity at retirement"
              value={params.glidepath?.end ?? 0.4}
              min={0}
              max={1}
              step={0.05}
              format={(v) => fmtPct(v, 0)}
              onChange={(v) =>
                setParams({
                  glidepath: { start: params.glidepath?.start ?? 1, end: v },
                })
              }
              disabled={!glideOn}
            />
          </PanelSection>

          <PanelSection title="Simulation">
            <SegmentedControl
              ariaLabel="Path count"
              options={PATH_COUNT_OPTIONS.map((n) => ({
                value: n,
                label: fmtPathCount(n),
                disabled: cpuCapped && n > CPU_PATH_CAP,
                title:
                  cpuCapped && n > CPU_PATH_CAP
                    ? 'CPU fallback mode is capped at 10K paths'
                    : `${n.toLocaleString('en-US')} paths`,
              }))}
              value={params.pathCount}
              onChange={(v) => setPathCount(v)}
            />
            <div className="seed-row">
              <span className="param-slider__label">Seed</span>
              <span className="seed-row__value data-label" aria-live="polite">
                {fmtSeed(params.seed)}
              </span>
              <button
                type="button"
                className="btn btn--secondary seed-row__reroll"
                onClick={rerollSeed}
                aria-label="Reroll random seed"
              >
                REROLL
              </button>
            </div>
          </PanelSection>
        </div>
      </aside>
    </div>
  );
}
