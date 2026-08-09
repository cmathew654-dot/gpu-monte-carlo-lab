import * as React from 'react';
import type { MagnitudeStats, SimMode, SimParams, SimStats } from '../store/simStore';
import { useSimStore } from '../store/simStore';
import type { FrontierState, FrontierStatus } from '../store/frontierStore';
import { useFrontierStore } from '../store/frontierStore';
import type { FrontierModelKey, ModelComparison, ModelOutcome, RobustnessFrontier } from '../sim/frontier/types';
import { SHIPPED_REGIME_CALIBRATION } from '../sim/regime/artifact';
import historicalReturnsJson from '../data/historicalReturns.json';
import { SegmentedControl } from './controls';
import { FRONTIER_MODEL_LABELS, isFrontierCurrent } from './frontierPresentation';
import { fmtPathCount, fmtPct, fmtSeed, fmtUSD, fmtUSDCompact } from './format';
import './advisorMath.css';

type PrimaryModel = SimParams['model'];
type MathModel = FrontierModelKey;
type HistoricalMeta = { startDate: string; endDate: string; monthCount: number; blockLength: number };
const HISTORICAL_META = (historicalReturnsJson as unknown as { _meta: HistoricalMeta })._meta;
const SYMBOLS: Record<MathModel, string> = { gbm: '◯', bootstrap: '□', fattail: '△', regime: '◇' };
const CLASSES: Record<MathModel, string> = { gbm: 'gbm', bootstrap: 'bootstrap', fattail: 'fattail', regime: 'regime' };
const OPTIONS = [
  { value: 'bootstrap' as const, label: 'Historical bootstrap' },
  { value: 'gbm' as const, label: 'GBM' },
  { value: 'fattail' as const, label: 'Student-t(5)' },
];
const INFO: Record<MathModel, { label: string; client: string; differs: string; assumption: string; anatomy: readonly string[]; schematic: string }> = {
  gbm: {
    label: 'GBM · steady baseline',
    client: 'Each month is a fresh bell-curve surprise around one steady long-run return and volatility.',
    differs: 'Nothing. GBM is the baseline against which the other return generators are compared.',
    assumption: 'The long-run return and volatility stay fixed, and one month’s shock does not affect the next.',
    anatomy: ['Drift: (μeff − σeff²/2) × Δt', 'Shock size: σeff × √Δt', 'Shock draw: Z', 'Compounding: exp[…] converts the log return into gross return g'],
    schematic: 'Z₁ │ Z₂ │ Z₃ · independent monthly shocks',
  },
  bootstrap: {
    label: 'Historical bootstrap · actual one-year sequences',
    client: 'It borrows an actual one-year market sequence, keeps those twelve months in order, then samples another year.',
    differs: 'It replaces GBM’s μ, σ, and theoretical bell-curve shock with observed real stock and bond returns. It makes no parametric return-distribution assumption.',
    assumption: 'History is the sample, and a new block breaks sequences longer than twelve months.',
    anatomy: ['Source: observed simple return', 'Memory: twelve contiguous historical months', 'Gross conversion: 1 + r', 'New draw: after the twelfth month'],
    schematic: '┌──────── one observed 12-month block ────────┐',
  },
  fattail: {
    label: 'Student-t(5) · same engine, heavier tails',
    client: 'It keeps GBM’s long-run return and volatility settings but makes unusually large monthly gains and losses more common.',
    differs: 'Only the shock changes. The normal draw becomes a Student-t draw with five degrees of freedom. The √(3/5) scale normalizes its variance to one, so σ retains the same meaning.',
    assumption: 'The tails are heavier, but monthly shocks remain independent and volatility does not cluster.',
    anatomy: ['Drift: identical to GBM', 'Shock size: identical to GBM', 'Shock draw: T*₅ instead of Z', 'Variance scale: √(3/5) ≈ 0.7746'],
    schematic: 'T*₁ │ T*₂ │ T*₃ · independent, heavier extremes',
  },
  regime: {
    label: 'Regime-t · clustered volatility',
    client: 'Calm and stressful markets tend to arrive in runs, so volatile months cluster instead of resetting independently every month.',
    differs: 'Regime-t adds a persistent hidden volatility state and joint stock and bond shocks. It ignores the plan’s μ and σ sliders and uses the fixed historical calibration instead.',
    assumption: 'Stress means higher volatility, not a lower fitted mean, and the two calibrated states are a simplification of US history rather than a forecast of next month.',
    anatomy: ['State: calm or stress', 'Mean: shared by both states', 'Shock: bivariate, variance-normalized Student-t(5)', 'Persistence: calibrated hidden state'],
    schematic: 'calm → calm → stress → stress · persistent hidden state',
  },
};

export interface AdvisorMathPanelViewProps {
  params: SimParams;
  committedParams: SimParams;
  stats: SimStats | null;
  magnitudeStats: MagnitudeStats | null;
  modelComparison: ModelComparison | null;
  frontierStatus: FrontierStatus;
  frontierProgress: FrontierState['progress'];
  frontierResult: RobustnessFrontier | null;
  frontierError: string | null;
  mode: SimMode;
  isStale?: boolean;
  isRecomputing?: boolean;
  selectedModel?: MathModel;
  inspectRegime?: boolean;
  onModelChange: (model: PrimaryModel) => void;
  onOpenFrontier: () => void;
  onInspectRegime?: () => void;
}

const sameParams = (a: SimParams, b: SimParams) => a.model === b.model
  && a.pathCount === b.pathCount
  && a.horizonYears === b.horizonYears
  && a.retireYear === b.retireYear
  && a.initialWealth === b.initialWealth
  && a.contribution === b.contribution
  && a.withdrawal === b.withdrawal
  && a.mu === b.mu
  && a.sigma === b.sigma
  && a.seed === b.seed
  && (a.glidepath === null
    ? b.glidepath === null
    : b.glidepath !== null && a.glidepath.start === b.glidepath.start && a.glidepath.end === b.glidepath.end);
const rate = (v: number) => (v * 100).toFixed(1) + '%';
const fixed = (v: number, n = 6) => v.toFixed(n);
const label = (m: MathModel) => FRONTIER_MODEL_LABELS[m];

function formula(model: MathModel): string {
  if (model === 'gbm') return 'gₜ = exp[(μeff,ₜ − σeff,ₜ²/2) × Δt\n     + σeff,ₜ × √Δt × Zₜ]\n\nΔt = 1/12     Zₜ ~ Normal(0, 1)';
  if (model === 'bootstrap') return 'B ← one uniformly sampled historical 12-month block\n\ngₜ = 1 + r hist B,t       t = 0,…,11\n\ngₜ = 1 + Aₜ × r equity,hist\n     + (1 − Aₜ) × r bond,hist';
  if (model === 'fattail') return 'gₜ = exp[(μeff,ₜ − σeff,ₜ²/2) × Δt\n     + σeff,ₜ × √Δt × T*₅,ₜ]\n\nT*₅ = [Z ÷ √(V/5)] × √(3/5)\nZ ~ Normal(0, 1)     V ~ χ²(5)';
  const c = SHIPPED_REGIME_CALIBRATION;
  const a = c.states[0].cholesky;
  const s = c.states[1].cholesky;
  return [
    'Sₜ | Sₜ₋₁ ~ P',
    '             next calm     next stress',
    'current calm   ' + fixed(c.transition[0], 3) + '          ' + fixed(c.transition[1], 3),
    'current stress ' + fixed(c.transition[2], 3) + '          ' + fixed(c.transition[3], 3),
    '',
    'xₜ = m + Lstate × T*₅,ₜ',
    'gₜ = Aₜ × exp(x equity,ₜ)',
    '     + (1 − Aₜ) × exp(x bond,ₜ)',
    '',
    'm = [' + fixed(c.states[0].mean[0]) + ', ' + fixed(c.states[0].mean[1]) + ']',
    'L calm = [' + fixed(a[0]) + ', 0; ' + fixed(a[1]) + ', ' + fixed(a[2]) + ']',
    'L stress = [' + fixed(s[0]) + ', 0; ' + fixed(s[1]) + ', ' + fixed(s[2]) + ']',
  ].join('\n');
}

function allocations(params: SimParams): string[] {
  if (!params.glidepath) return ['Aₜ = 1.00 (constant equity allocation)'];
  return [
    'μeff,ₜ = Aₜ × μ + (1 − Aₜ) × 0.019',
    'σeff,ₜ = Aₜ × σ',
    'A₀ = ' + rate(params.glidepath.start) + ' · Aretirement = ' + rate(params.glidepath.end),
  ];
}

function StatusLine({ params, committedParams, stats, isStale, isRecomputing }: Pick<AdvisorMathPanelViewProps, 'params' | 'committedParams' | 'stats' | 'isStale' | 'isRecomputing'>) {
  const preview = !sameParams(params, committedParams);
  const text = preview
    ? 'Assumption preview · simulation updates after you pause'
    : isRecomputing
      ? 'Applied · recomputing'
      : !isStale && stats
        ? 'Current · ' + label(params.model) + ' · ' + fmtPathCount(committedParams.pathCount) + ' paths · seed ' + fmtSeed(committedParams.seed)
        : 'No current result for these inputs';
  return <p className="advisor-math__status" role="status" aria-live="polite">{text}</p>;
}

function WealthEquation() {
  return <section className="advisor-math__constant" aria-labelledby="advisor-math-constant-heading">
    <h3 id="advisor-math-constant-heading">The part that never changes</h3>
    <pre className="advisor-math__equation advisor-math__equation--wealth" aria-label="W(t+1) = W(t) × g(t+1) + C(t+1)">Wₜ₊₁ = Wₜ × gₜ₊₁ + Cₜ₊₁</pre>
    <div className="advisor-math__definitions"><span>Cₜ₊₁ = + monthly contribution before retirement</span><span>Cₜ₊₁ = − monthly withdrawal from retirement onward</span></div>
    <p>Every path uses the same household plan. At each month end, current wealth is multiplied by that model’s gross return, then saving is added before retirement or spending is subtracted after retirement.</p>
    <p>A path fails when calculated wealth first falls below zero. Failure is absorbing: that path stays failed and its displayed wealth remains at zero.</p>
    <pre className="advisor-math__equation advisor-math__equation--success" aria-label="success = paths that never fail ÷ total simulated paths">success = paths that never fail ÷ total simulated paths</pre>
  </section>;
}

function NativePrimarySwitch({ value, onChange }: { value: PrimaryModel; onChange: (model: PrimaryModel) => void }) {
  const groupRef = React.useRef<HTMLDivElement>(null);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = OPTIONS.findIndex((option) => option.value === value);
    const next = OPTIONS[(index + (event.key === 'ArrowRight' ? 1 : -1) + OPTIONS.length) % OPTIONS.length];
    onChange(next.value);
    groupRef.current?.querySelector<HTMLButtonElement>('button[data-model="' + next.value + '"]')?.focus();
  };
  return <div ref={groupRef} className="segmented" role="radiogroup" aria-label="Live primary return model" onKeyDown={onKeyDown}>{OPTIONS.map((option) => <button key={option.value} type="button" data-model={option.value} className={'segmented__btn' + (option.value === value ? ' segmented__btn--active' : '')} role="radio" aria-checked={option.value === value} tabIndex={option.value === value ? 0 : -1} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
function PrimarySwitch(props: { value: PrimaryModel; onChange: (model: PrimaryModel) => void }) {
  if (typeof window !== 'undefined') return <SegmentedControl ariaLabel="Live primary return model" options={OPTIONS} value={props.value} onChange={props.onChange} />;
  return <NativePrimarySwitch {...props} />;
}
function QuickSwap({ params, frontierStatus, inspectRegime, onModelChange, onInspectRegime }: Pick<AdvisorMathPanelViewProps, 'params' | 'frontierStatus' | 'inspectRegime' | 'onModelChange' | 'onInspectRegime'>) {
  return <section className="advisor-math__quick-swap" aria-labelledby="advisor-math-switch-heading">
    {frontierStatus === 'running' && <p className="advisor-math__frontier-warning">A four-model Frontier is running. Changing the live model cancels that run.</p>}
    <h3 id="advisor-math-switch-heading">Run the current plan with</h3>
    <PrimarySwitch value={params.model} onChange={onModelChange} />
    <button type="button" className="btn btn--secondary advisor-math__inspect" aria-pressed={inspectRegime} onClick={onInspectRegime}>Inspect Regime-t · Frontier only</button>
    {inspectRegime && <p className="advisor-math__inspection">Inspecting Regime-t. The live primary simulation remains {label(params.model)}.</p>}
  </section>;
}

function Parameters({ model, params }: { model: MathModel; params: SimParams }) {
  const c = SHIPPED_REGIME_CALIBRATION;
  if (model === 'bootstrap') return <ul className="advisor-math__parameters"><li>History: {HISTORICAL_META.startDate} through {HISTORICAL_META.endDate}</li><li>Observations: {HISTORICAL_META.monthCount.toLocaleString('en-US')} monthly real returns</li><li>Block length: L = {HISTORICAL_META.blockLength}</li><li>μ and σ are not used by this model</li></ul>;
  if (model === 'regime') return <ul className="advisor-math__parameters"><li>ν = {c.degreesOfFreedom}</li><li>Mean vector m = [{fixed(c.states[0].mean[0])}, {fixed(c.states[0].mean[1])}]</li><li>Calm equity volatility: {rate(c.states[0].equityVolMonthly)} monthly</li><li>Stress equity volatility: {rate(c.states[1].equityVolMonthly)} monthly</li><li>Expected duration: {c.expectedDurationMonths[0].toFixed(1)} months calm / {c.expectedDurationMonths[1].toFixed(1)} months stress</li><li>Initial state: {rate(c.latestFiltered[0])} calm / {rate(c.latestFiltered[1])} stress</li><li>Calibration window: {c.data.start} through {c.data.end}</li><li>μ and σ are not used by this model</li></ul>;
  return <ul className="advisor-math__parameters"><li>μ = {rate(params.mu)} real annual return</li><li>σ = {rate(params.sigma)} annual volatility</li><li>Δt = 1/12 fixed</li><li>{params.glidepath ? 'Glidepath: ' + rate(params.glidepath.start) + ' → ' + rate(params.glidepath.end) + ' equity allocation' : 'Glidepath: disabled; Aₜ = 1.00'}</li>{model === 'fattail' && <li>ν = 5 fixed; variance scale = √(3/5)</li>}</ul>;
}

function Workbench({ model, params }: { model: MathModel; params: SimParams }) {
  const info = INFO[model];
  const equation = formula(model);
  return <section className={'advisor-math__workbench advisor-math__workbench--' + CLASSES[model]} aria-labelledby="advisor-math-formula-heading">
    <header className="advisor-math__workbench-heading"><span className={'advisor-math__symbol advisor-math__symbol--' + CLASSES[model]} aria-hidden="true">{SYMBOLS[model]}</span><h3 id="advisor-math-formula-heading">{info.label}</h3><span className="advisor-math__execution">{model === 'regime' ? 'Frontier only' : 'Live primary'}</span></header>
    <p className="advisor-math__model-status">{model === 'regime' ? 'Comparison-only model · uses shipped calibration' : 'Replaceable return generator · selected now'}</p>
    <pre className={"advisor-math__equation advisor-math__equation--formula advisor-math__equation--" + CLASSES[model] + " advisor-math__formula-change"} aria-label={equation}>{equation}</pre>
    <p className="advisor-math__client-sentence">{info.client}</p>
    <div className="advisor-math__anatomy"><h4>Formula anatomy</h4><ul>{info.anatomy.map((item) => <li key={item}>{item}</li>)}</ul></div>
    <div className="advisor-math__schematic" aria-label="Explanatory month-memory schematic"><span>Month memory</span><code>{info.schematic}</code></div>
    <div className="advisor-math__parameter-grid"><div><h4>Parameters</h4><Parameters model={model} params={params} /></div><div><h4>What differs from GBM</h4><p>{info.differs}</p></div><div><h4>Assumption to say out loud</h4><p>{info.assumption}</p></div></div>
    <details className="advisor-math__disclosure"><summary>Portfolio mixing and glidepath details</summary><pre className="advisor-math__equation">{allocations(params).join('\n')}</pre><p>For GBM and Student-t(5), the non-equity sleeve uses the verified 0.019 real annual bond mean. Bootstrap mixes month-aligned equity and bond returns from the same historical block.</p></details>
  </section>;
}

function Ledger({ selected }: { selected: PrimaryModel }) {
  const rows: Array<[MathModel, string, string, string, string, string]> = [
    ['gbm', 'Normal log-return shock', 'Normal-distribution frequency', 'None', 'Yes', selected === 'gbm' ? 'Selected now' : 'Live primary'],
    ['bootstrap', 'One month inside an actual 12-month block', 'Whatever occurred in history', 'Twelve months within each block', 'No', selected === 'bootstrap' ? 'Selected now' : 'Live primary'],
    ['fattail', 'Variance-normalized t(5) log-return shock', 'More frequent', 'None', 'Yes', selected === 'fattail' ? 'Selected now' : 'Live primary'],
    ['regime', 'Calm or stress bivariate t(5) return', 'More frequent', 'Persistent hidden state', 'No', 'Frontier only'],
  ];
  return <section className="advisor-math__ledger" aria-labelledby="advisor-math-ledger-heading"><h3 id="advisor-math-ledger-heading">Four-model difference ledger</h3><div className="advisor-math__table-scroll" tabIndex={0} aria-label="Four-model difference ledger table"><table><thead><tr><th scope="col">Model</th><th scope="col">Next month comes from</th><th scope="col">Extreme months</th><th scope="col">Memory</th><th scope="col">Uses plan μ and σ</th><th scope="col">Execution</th></tr></thead><tbody>{rows.map(([model, source, extremes, memory, uses, execution]) => <tr className={'advisor-math__row advisor-math__row--' + CLASSES[model]} key={model}><th scope="row"><span className="advisor-math__row-symbol">{SYMBOLS[model]}</span>{label(model)}</th><td>{source}</td><td>{extremes}</td><td>{memory}</td><td>{uses}</td><td>{execution}</td></tr>)}</tbody></table></div></section>;
}

function SelectedOutcome({ params, stats, magnitudeStats, current }: { params: SimParams; stats: SimStats | null; magnitudeStats: MagnitudeStats | null; current: boolean }) {
  return <section className="advisor-math__selected-outcome" aria-labelledby="advisor-math-selected-heading"><div className="advisor-math__section-heading"><h4 id="advisor-math-selected-heading">Last valid selected outcome</h4>{!current && <span className="advisor-math__not-current">Not current</span>}</div>{stats ? <dl className="advisor-math__metrics"><div><dt>Success rate</dt><dd>{fmtPct(stats.successRate)}</dd></div><div><dt>Median ending real wealth</dt><dd>{fmtUSDCompact(stats.percentiles.p50)}</dd></div><div><dt>Worst-decile maximum drawdown</dt><dd>−{fmtPct(stats.worstDecileMaxDD)}</dd></div></dl> : <div className="advisor-math__metric-skeleton">Waiting for a completed result</div>}{magnitudeStats?.medianShortfallYears != null && <p className="advisor-math__metric-note">When it fails, the median shortfall is {magnitudeStats.medianShortfallYears.toFixed(1)} years and {fmtUSD(magnitudeStats.medianUnfundedObligation ?? 0)} of withdrawals.</p>}<p className="advisor-math__metric-note">The selected {label(params.model)} point is retained while a committed change recomputes.</p></section>;
}

function complete(value: ModelComparison | null): value is ModelComparison {
  return Boolean(value && value.models.length === 3 && ['gbm', 'bootstrap', 'fattail'].every((model) => value.models.some((outcome) => outcome.model === model)));
}

function Comparison({ value, ready }: { value: ModelComparison | null; ready: boolean }) {
  const find = (model: PrimaryModel): ModelOutcome | null => value?.models.find((outcome) => outcome.model === model) ?? null;
  return <section className="advisor-math__comparison" aria-labelledby="advisor-math-comparison-heading"><div className="advisor-math__section-heading"><h4 id="advisor-math-comparison-heading">Three-model current-plan evidence</h4>{!ready && <span className="advisor-math__comparison-state">Waiting for all three models</span>}</div><div className="advisor-math__table-scroll" tabIndex={0} aria-label="Three-model current-plan evidence table"><table><thead><tr><th scope="col">Model</th><th scope="col">Success rate</th><th scope="col">Median ending real wealth</th><th scope="col">Worst-decile maximum drawdown</th><th scope="col">Execution</th></tr></thead><tbody>{(['gbm', 'bootstrap', 'fattail'] as const).map((model) => { const row = ready ? find(model) : null; return <tr key={model}><th scope="row"><span className="advisor-math__row-symbol">{SYMBOLS[model]}</span>{label(model)}</th><td>{row ? fmtPct(row.stats.successRate) : <span className="advisor-math__skeleton">Pending</span>}</td><td>{row ? fmtUSDCompact(row.stats.percentiles.p50) : <span className="advisor-math__skeleton">Pending</span>}</td><td>{row ? '−' + fmtPct(row.stats.worstDecileMaxDD) : <span className="advisor-math__skeleton">Pending</span>}</td><td>{row ? 'Complete' : 'Waiting'}</td></tr>; })}</tbody></table></div></section>;
}

function RegimeEvidence({ status, progress, result, committedParams, mode, error, onOpenFrontier }: { status: FrontierStatus; progress: FrontierState['progress']; result: RobustnessFrontier | null; committedParams: SimParams; mode: SimMode; error: string | null; onOpenFrontier: () => void }) {
  const current = isFrontierCurrent(result, committedParams, mode);
  const outcome = result?.models.find(({ model }) => model === 'regime')?.outcome;
  const currentComplete = status === 'complete' && current && outcome;
  const body = status === 'running'
    ? <>Frontier running · {progress.model ? label(progress.model) : 'preparing'} · {progress.completed} of {progress.total} evaluations</>
    : currentComplete
      ? <><strong>From the current four-model Frontier</strong><dl className="advisor-math__metrics advisor-math__metrics--frontier"><div><dt>Success rate</dt><dd>{fmtPct(outcome.stats.successRate)}</dd></div><div><dt>Median ending real wealth</dt><dd>{fmtUSDCompact(outcome.stats.percentiles.p50)}</dd></div><div><dt>Worst-decile maximum drawdown</dt><dd>−{fmtPct(outcome.stats.worstDecileMaxDD)}</dd></div></dl>{result?.robustSpend != null && Number.isFinite(result.robustSpend) && <p className="advisor-math__robust-floor">Four-model robust floor: {fmtUSD(result.robustSpend)} per month real. <button type="button" className="advisor-math__text-action" onClick={onOpenFrontier}>View tested points in Robustness frontier.</button></p>}</>
      : status === 'complete' && result
        ? <>Result is not current for this plan</>
        : status === 'error'
          ? <>Frontier could not complete{error ? ': ' + error : ''}</>
          : <>Not run for this plan</>;
  return <section className="advisor-math__regime-evidence" aria-labelledby="advisor-math-regime-heading"><div className="advisor-math__section-heading"><h4 id="advisor-math-regime-heading">Regime-t outcome</h4><span className="advisor-math__frontier-only">Frontier only</span></div><p>{body}</p>{!currentComplete && <button type="button" className="btn btn--secondary" onClick={onOpenFrontier}>{status === 'running' ? 'View frontier progress' : status === 'error' ? 'Open frontier to retry' : 'Open four-model frontier'}</button>}</section>;
}

function Disclosures({ params }: { params: SimParams }) {
  const c = SHIPPED_REGIME_CALIBRATION;
  return <div className="advisor-math__disclosures">
    <details><summary>Term glossary</summary><dl><div><dt>g</dt><dd>Gross monthly return. 1.02 means wealth grows by 2% before cashflow.</dd></div><div><dt>μ</dt><dd>Assumed real annual stock return used by GBM and Student-t(5).</dd></div><div><dt>σ</dt><dd>Assumed annual stock volatility used by GBM and Student-t(5).</dd></div><div><dt>Δt</dt><dd>One month expressed as one twelfth of a year.</dd></div><div><dt>ν</dt><dd>Student-t degrees of freedom; fixed at five here.</dd></div><div><dt>Aₜ</dt><dd>Stock allocation for month t, including any glidepath.</dd></div></dl></details>
    <details><summary>Full Regime-t calibration</summary><p>US real returns from {c.data.start} through {c.data.end}, {c.data.observations.toLocaleString('en-US')} monthly observations. Latest filtered initialization is conditional on the final observed month.</p><table><thead><tr><th scope="col">State</th><th scope="col">Transition row</th><th scope="col">Equity volatility</th><th scope="col">Expected duration</th><th scope="col">Initial probability</th></tr></thead><tbody><tr><th scope="row">Calm</th><td>{fixed(c.transition[0], 3)} / {fixed(c.transition[1], 3)}</td><td>{rate(c.states[0].equityVolMonthly)} monthly</td><td>{c.expectedDurationMonths[0].toFixed(1)} months</td><td>{rate(c.latestFiltered[0])}</td></tr><tr><th scope="row">Stress</th><td>{fixed(c.transition[2], 3)} / {fixed(c.transition[3], 3)}</td><td>{rate(c.states[1].equityVolMonthly)} monthly</td><td>{c.expectedDurationMonths[1].toFixed(1)} months</td><td>{rate(c.latestFiltered[1])}</td></tr></tbody></table><p>μ and σ are not used by Regime-t. Shared mean m = [{fixed(c.states[0].mean[0])}, {fixed(c.states[0].mean[1])}].</p></details>
    <details><summary>How success is counted</summary><p>Success is the share of paths that never fail. A failure begins when wealth drops below zero and remains absorbing.</p></details>
    <details><summary>How the 90-in-100 spending floor is found</summary><p>For each model, the engine tests current real monthly spending and zero, expands upward until success falls below 90 in 100 futures, then runs up to eight bisections. The result is the best tested spending amount that reached the target.</p><p>The robust floor is the smallest of the four model results. It is a tested comparison result, not advice or a guarantee.</p></details>
    <details><summary>Model limitations</summary><p>These are US historical statistical models, not predictions. History can exhaust; a regime is a latent class, not a literal market label; model disagreement is not a confidence interval.</p></details>
    <p className="advisor-math__parameter-note">Live μ = {rate(params.mu)} · live σ = {rate(params.sigma)} · path count {fmtPathCount(params.pathCount)}</p>
  </div>;
}

export function AdvisorMathPanelView({
  params,
  committedParams,
  stats,
  magnitudeStats,
  modelComparison,
  frontierStatus,
  frontierProgress,
  frontierResult,
  frontierError,
  mode,
  isStale = false,
  isRecomputing = false,
  selectedModel = params.model,
  inspectRegime = false,
  onModelChange,
  onOpenFrontier,
  onInspectRegime = () => {},
}: AdvisorMathPanelViewProps) {
  const model: MathModel = inspectRegime ? 'regime' : selectedModel;
  const current = !isStale && !isRecomputing && sameParams(params, committedParams);
  const ready = !isStale && complete(modelComparison);
  return <section className="advisor-math" aria-labelledby="advisor-math-heading">
    <header className="advisor-math__header"><div><h2 id="advisor-math-heading">How the models work</h2><p className="advisor-math__lead">Same wealth equation. Same cashflows. The models differ only in how they imagine next month’s return.</p><p className="advisor-math__support">Choose one of the three live primary models to update the current simulation. Regime-t is a comparison-only model and runs inside the four-model robustness frontier.</p></div><StatusLine params={params} committedParams={committedParams} stats={stats} isStale={isStale} isRecomputing={isRecomputing} /></header>
    <WealthEquation />
    <QuickSwap params={params} frontierStatus={frontierStatus} inspectRegime={inspectRegime} onModelChange={onModelChange} onInspectRegime={onInspectRegime} />
    <Workbench model={model} params={params} />
    <Ledger selected={params.model} />
    <section className="advisor-math__evidence" aria-labelledby="advisor-math-evidence-heading"><h3 id="advisor-math-evidence-heading">Current-plan evidence</h3><SelectedOutcome params={params} stats={stats} magnitudeStats={magnitudeStats} current={current} /><Comparison value={modelComparison} ready={ready} /><RegimeEvidence status={frontierStatus} progress={frontierProgress} result={frontierResult} committedParams={committedParams} mode={mode} error={frontierError} onOpenFrontier={onOpenFrontier} /></section>
    <Disclosures params={params} />
    <p className="advisor-math__footer-note">Where the models disagree, the assumptions live.</p>
  </section>;
}

export function AdvisorMathPanel() {
  const params = useSimStore((s) => s.params);
  const committedParams = useSimStore((s) => s.committedParams);
  const stats = useSimStore((s) => s.stats);
  const magnitudeStats = useSimStore((s) => s.magnitudeStats);
  const modelComparison = useSimStore((s) => s.modelComparison);
  const isStale = useSimStore((s) => s.isStale);
  const isRecomputing = useSimStore((s) => s.isRecomputing);
  const mode = useSimStore((s) => s.mode);
  const setModel = useSimStore((s) => s.setModel);
  const frontierStatus = useFrontierStore((s) => s.status);
  const frontierProgress = useFrontierStore((s) => s.progress);
  const frontierResult = useFrontierStore((s) => s.result);
  const frontierError = useFrontierStore((s) => s.error);
  const setAdvisorLens = useFrontierStore((s) => s.setAdvisorLens);
  const [inspectRegime, setInspectRegime] = React.useState(false);
  return <AdvisorMathPanelView params={params} committedParams={committedParams} stats={stats} magnitudeStats={magnitudeStats} modelComparison={modelComparison} frontierStatus={frontierStatus} frontierProgress={frontierProgress} frontierResult={frontierResult} frontierError={frontierError} mode={mode} isStale={isStale} isRecomputing={isRecomputing} inspectRegime={inspectRegime} onModelChange={setModel} onOpenFrontier={() => setAdvisorLens('frontier')} onInspectRegime={() => setInspectRegime((active) => !active)} />;
}
