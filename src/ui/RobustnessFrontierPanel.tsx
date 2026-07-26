import * as React from 'react';
import type { SimMode, SimParams } from '../store/simStore';
import { useSimStore } from '../store/simStore';
import {
  type FrontierState,
  type FrontierStatus,
  useFrontierStore,
} from '../store/frontierStore';
import type {
  ModelComparison,
  ModelOutcome,
  RobustnessFrontier,
} from '../sim/frontier/types';
import { simRuntime } from '../scene/simRuntime';
import { FrontierChart } from './FrontierChart';
import {
  FRONTIER_MODEL_LABELS,
  advisorComparisonSentence,
  capacityLabel,
  isFrontierCurrent,
} from './frontierPresentation';
import { fmtPathCount, fmtPct, fmtSeed, fmtUSD, fmtUSDCompact } from './format';

export interface RobustnessFrontierPanelViewProps {
  status: FrontierStatus;
  progress: FrontierState['progress'];
  result: RobustnessFrontier | null;
  error: string | null;
  committedParams: SimParams;
  mode: SimMode;
  onRun: () => void;
}

function asModelComparison(result: RobustnessFrontier): ModelComparison | null {
  const models = result.models
    .map(({ outcome }) => outcome)
    .filter((outcome): outcome is ModelOutcome => outcome.model !== 'regime');
  const requiredModels = ['gbm', 'bootstrap', 'fattail'];
  if (!requiredModels.every((model) => models.some((outcome) => outcome.model === model))) {
    return null;
  }
  return {
    models,
    pathCount: result.basis.analysisPathCount,
    seed: result.basis.seed,
    computedAt: result.computedAt,
  };
}

function RunButton({
  onRun,
  disabled = false,
  label = 'Run robustness frontier',
}: {
  onRun: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="btn btn--primary frontier-panel__run"
      disabled={disabled}
      onClick={onRun}
    >
      {label}
    </button>
  );
}

function RobustSpendInterpretation({ result }: { result: RobustnessFrontier }) {
  const robustSpend = result.robustSpend;
  if (robustSpend === null || !Number.isFinite(robustSpend)) {
    const limitation = result.robustStatus === 'unbounded-high'
      ? 'Status: unbounded-high — Above tested range.'
      : 'Status: infeasible-at-zero — Below 90% at $0/mo.';
    return (
      <div className="frontier-panel__robust frontier-panel__robust--limited">
        <h3>Robust spend</h3>
        <p>{limitation} No robust dollar result is shown.</p>
      </div>
    );
  }
  const limitingModels = result.models
    .filter(({ capacity90 }) => capacity90.monthlySpending === robustSpend)
    .map(({ model }) => FRONTIER_MODEL_LABELS[model]);
  return (
    <div className="frontier-panel__robust">
      <h3>Robust spend</h3>
      <p className="frontier-panel__robust-value">{fmtUSD(robustSpend)} / month real</p>
      <p>
        The highest tested real monthly spending at which every included model
        reached at least 90 in 100 simulated futures.
      </p>
      {limitingModels.length === 1 && (
        <p>Limiting model: {limitingModels[0]}.</p>
      )}
      {limitingModels.length > 1 && (
        <p>Limiting models: {limitingModels.join(', ')}.</p>
      )}
      {result.robustStatus === 'budget-exhausted' && (
        <p>Status: budget-exhausted. This is best tested and limited by the evaluation budget.</p>
      )}
    </div>
  );
}

function ComparisonTable({ result }: { result: RobustnessFrontier }) {
  return (
    <section className="frontier-panel__comparison" aria-labelledby="frontier-comparison-heading">
      <h3 id="frontier-comparison-heading">Model comparison at the current plan</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Success now</th>
            <th scope="col">Median ending wealth</th>
            <th scope="col">Worst-decile max drawdown</th>
            <th scope="col">Median failure year</th>
            <th scope="col">90% spending</th>
          </tr>
        </thead>
        <tbody>
          {result.models.map(({ model, outcome, capacity90 }) => (
            <tr key={model}>
              <th scope="row">{FRONTIER_MODEL_LABELS[model]}</th>
              <td>{fmtPct(outcome.stats.successRate)}</td>
              <td>{fmtUSDCompact(outcome.stats.percentiles.p50)}</td>
              <td>{'−' + fmtPct(outcome.stats.worstDecileMaxDD)}</td>
              <td>
                {outcome.stats.medianFailureYear === null
                  ? '—'
                  : 'Year ' + outcome.stats.medianFailureYear.toFixed(1)}
              </td>
              <td>{capacityLabel(capacity90)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CompleteResult({ result }: { result: RobustnessFrontier }) {
  const comparison = asModelComparison(result);
  return (
    <React.Fragment>
      <div className="frontier-panel__completion" aria-live="polite">
        Frontier complete for {fmtPathCount(result.basis.analysisPathCount)} paths per model,
        seed {fmtSeed(result.basis.seed)}, on the {result.basis.engine.toUpperCase()} engine.
      </div>
      <RobustSpendInterpretation result={result} />
      {comparison && (
        <p className="frontier-panel__interpretation">
          {advisorComparisonSentence(comparison)}
        </p>
      )}
      <p className="frontier-panel__reading-guide">
        Within a curve: simulated path variation. Between curves: model-assumption uncertainty.
        Along the spending axis: decision sensitivity.
      </p>
      <FrontierChart result={result} />
      <ComparisonTable result={result} />
    </React.Fragment>
  );
}

export function RobustnessFrontierPanelView({
  status,
  progress,
  result,
  error,
  committedParams,
  mode,
  onRun,
}: RobustnessFrontierPanelViewProps) {
  const isCurrent = isFrontierCurrent(result, committedParams, mode);
  const isStale = status === 'complete' && result !== null && !isCurrent;

  return (
    <section className="frontier-panel" aria-labelledby="robustness-frontier-heading">
      <header className="frontier-panel__header">
        <h2 id="robustness-frontier-heading">Robustness frontier</h2>
        <p>
          Compare tested real monthly spending across return models without treating
          connected points as untested simulations. Regime-t uses the shipped
          1926-2026 calibration and ignores the mu / sigma sliders.
        </p>
      </header>
      {status === 'running' && (
        <div role="status" aria-busy="true" aria-live="off" className="frontier-panel__running">
          {'RUNNING MODEL '
            + (progress.model === null ? 'PREPARING' : FRONTIER_MODEL_LABELS[progress.model].toUpperCase())
            + ' — '
            + progress.completed
            + ' / '
            + progress.total
            + ' EVALUATIONS'}
          <RunButton onRun={onRun} disabled label="Running robustness frontier" />
        </div>
      )}
      {status === 'error' && (
        <div role="alert" className="frontier-panel__error">
          <p>Robustness frontier error: {error ?? 'Unknown error'}</p>
          <RunButton onRun={onRun} label="Run robustness frontier" />
        </div>
      )}
      {isStale && (
        <div className="frontier-panel__stale" aria-live="polite">
          <p>Current plan changed. Run the robustness frontier again for these committed inputs.</p>
          <RunButton onRun={onRun} />
        </div>
      )}
      {status === 'complete' && isCurrent && result && <CompleteResult result={result} />}
      {status === 'idle' && (
        <div className="frontier-panel__idle">
          <p>
            Run an explicit four-model frontier analysis using up to 100,000 paths per model.
            Opening this lens does not start the analysis.
          </p>
          <RunButton onRun={onRun} />
        </div>
      )}
    </section>
  );
}

export function RobustnessFrontierPanel() {
  const status = useFrontierStore((state) => state.status);
  const progress = useFrontierStore((state) => state.progress);
  const result = useFrontierStore((state) => state.result);
  const error = useFrontierStore((state) => state.error);
  const committedParams = useSimStore((state) => state.committedParams);
  const mode = useSimStore((state) => state.mode);

  return (
    <RobustnessFrontierPanelView
      status={status}
      progress={progress}
      result={result}
      error={error}
      committedParams={committedParams}
      mode={mode}
      onRun={() => simRuntime.requestRobustnessFrontier?.()}
    />
  );
}
