import * as React from 'react';
import type {
  FrontierModelKey,
  FrontierModelResult,
  RobustnessFrontier,
  SpendingCurvePoint,
} from '../sim/frontier/types';
import { FRONTIER_MODEL_LABELS } from './frontierPresentation';
import { fmtPct, fmtUSD } from './format';

export interface FrontierChartProps {
  result: RobustnessFrontier;
}

interface TestedPoint {
  key: string;
  model: FrontierModelKey;
  point: SpendingCurvePoint;
}

interface ModelSeries {
  model: FrontierModelResult;
  points: TestedPoint[];
}

const CHART = {
  width: 960,
  height: 420,
  left: 72,
  right: 132,
  top: 32,
  bottom: 58,
} as const;

const MODEL_STYLE: Record<FrontierModelKey, {
  color: string;
  dash: string;
  symbol: 'circle' | 'square' | 'triangle' | 'diamond';
}> = {
  gbm: {
    color: 'var(--frontier-gbm, #9fd8ff)',
    dash: '0',
    symbol: 'circle',
  },
  bootstrap: {
    color: 'var(--frontier-bootstrap, #e1c26e)',
    dash: '9 5',
    symbol: 'square',
  },
  fattail: {
    color: 'var(--frontier-fattail, #72d6ad)',
    dash: '2 4',
    symbol: 'triangle',
  },
  regime: {
    color: 'var(--frontier-regime, #fb2c36)',
    dash: '12 4 2 4',
    symbol: 'diamond',
  },
};

function testedPoints(model: FrontierModelResult): TestedPoint[] {
  return model.curve
    .filter(
      (point) => Number.isFinite(point.monthlySpending)
        && point.monthlySpending >= 0
        && Number.isFinite(point.successRate),
    )
    .map((point) => ({
      key: model.model + '-' + point.monthlySpending + '-' + point.successRate,
      model: model.model,
      point,
    }))
    .sort((left, right) => left.point.monthlySpending - right.point.monthlySpending);
}

function pointStatus(point: SpendingCurvePoint): string {
  return point.successRate >= 0.9
    ? 'Tested; target met'
    : 'Tested; below target';
}

function PointSymbol({
  symbol,
  x,
  y,
  color,
  highlighted,
}: {
  symbol: 'circle' | 'square' | 'triangle' | 'diamond';
  x: number;
  y: number;
  color: string;
  highlighted: boolean;
}) {
  const radius = highlighted ? 7 : 4.5;
  const common = {
    fill: '#0a0a0a',
    stroke: color,
    strokeWidth: highlighted ? 3 : 2,
  };
  if (symbol === 'square') {
    return <rect x={x - radius} y={y - radius} width={radius * 2} height={radius * 2} {...common} />;
  }
  if (symbol === 'triangle') {
    return (
      <polygon
        points={x + ',' + (y - radius) + ' ' + (x + radius) + ',' + (y + radius) + ' ' + (x - radius) + ',' + (y + radius)}
        {...common}
      />
    );
  }
  if (symbol === 'diamond') {
    return (
      <polygon
        points={x + ',' + (y - radius) + ' ' + (x + radius) + ',' + y + ' ' + x + ',' + (y + radius) + ' ' + (x - radius) + ',' + y}
        {...common}
      />
    );
  }
  return <circle cx={x} cy={y} r={radius} {...common} />;
}

export function FrontierChart({ result }: FrontierChartProps) {
  const [focusedPoint, setFocusedPoint] = React.useState<string | null>(null);
  const series: ModelSeries[] = result.models.map((model) => ({
    model,
    points: testedPoints(model),
  }));
  const allPoints = series.flatMap((model) => model.points);
  const innerWidth = CHART.width - CHART.left - CHART.right;
  const innerHeight = CHART.height - CHART.top - CHART.bottom;
  const robustSpend = result.robustSpend;
  const hasRobustSpend = robustSpend !== null && Number.isFinite(robustSpend);
  const xMax = Math.max(
    1000,
    ...allPoints.map(({ point }) => point.monthlySpending),
    Math.max(0, result.basis.params.withdrawal),
    ...(hasRobustSpend ? [Math.max(0, robustSpend)] : []),
  );
  const x = (value: number) => CHART.left + (value / xMax) * innerWidth;
  const y = (rate: number) => CHART.top + (1 - Math.min(1, Math.max(0, rate))) * innerHeight;
  const modelNames = series
    .map(({ model }) => FRONTIER_MODEL_LABELS[model.model])
    .join(', ');

  return (
    <section className="frontier-chart" aria-labelledby="frontier-chart-heading">
      <h3 id="frontier-chart-heading">Tested robustness frontier</h3>
      <svg
        viewBox="0 0 960 420"
        role="img"
        aria-labelledby="frontier-chart-title frontier-chart-description"
        className="frontier-chart__svg"
      >
        <title id="frontier-chart-title">Robustness frontier from tested spending points</title>
        <desc id="frontier-chart-description">
          {modelNames + ' at a 90% target, using '
            + result.basis.analysisPathCount
            + ' paths per model on the '
            + result.basis.engine
            + ' engine. Lines connect evaluated spending points and do not simulate intervening values.'}
        </desc>
        {[0, 0.25, 0.5, 0.75, 0.9, 1].map((rate) => (
          <g key={rate}>
            <line
              x1={CHART.left}
              x2={CHART.width - CHART.right}
              y1={y(rate)}
              y2={y(rate)}
              className={rate === 0.9 ? 'frontier-chart__threshold' : 'frontier-chart__contour'}
            />
            <text x={CHART.left - 10} y={y(rate) + 4} textAnchor="end" className="frontier-chart__axis-label">
              {fmtPct(rate, 0)}
            </text>
          </g>
        ))}
        <text x={CHART.left} y={y(0.9) - 8} className="frontier-chart__threshold-label">
          90% target
        </text>
        <line
          x1={x(Math.max(0, result.basis.params.withdrawal))}
          x2={x(Math.max(0, result.basis.params.withdrawal))}
          y1={CHART.top}
          y2={CHART.height - CHART.bottom}
          className="frontier-chart__current-line"
        />
        <text
          x={x(Math.max(0, result.basis.params.withdrawal)) + 6}
          y={CHART.height - CHART.bottom + 22}
          className="frontier-chart__annotation"
        >
          Current {fmtUSD(result.basis.params.withdrawal)}
        </text>
        {hasRobustSpend && (
          <React.Fragment>
            <line
              x1={x(Math.max(0, robustSpend))}
              x2={x(Math.max(0, robustSpend))}
              y1={CHART.top}
              y2={CHART.height - CHART.bottom}
              className="frontier-chart__robust-line"
            />
            <text
              x={x(Math.max(0, robustSpend)) + 6}
              y={CHART.top + 16}
              className="frontier-chart__robust-label"
            >
              Robust {fmtUSD(robustSpend)}
            </text>
          </React.Fragment>
        )}
        {series.map(({ model, points }) => {
          const style = MODEL_STYLE[model.model];
          const path = points
            .map(({ point }, index) => (index === 0 ? 'M ' : 'L ')
              + x(point.monthlySpending)
              + ' '
              + y(point.successRate))
            .join(' ');
          const endpoint = points[points.length - 1];
          return (
            <g key={model.model} className={'frontier-chart__series frontier-chart__series--' + model.model}>
              {points.length > 0 && (
                <path
                  d={path}
                  fill="none"
                  stroke={style.color}
                  strokeDasharray={style.dash}
                  strokeWidth="2.5"
                />
              )}
              {points.map(({ key, point }) => (
                <PointSymbol
                  key={key}
                  symbol={style.symbol}
                  x={x(point.monthlySpending)}
                  y={y(point.successRate)}
                  color={style.color}
                  highlighted={focusedPoint === key}
                />
              ))}
              {endpoint && (
                <text
                  x={x(endpoint.point.monthlySpending) + 9}
                  y={y(endpoint.point.successRate) - 8}
                  fill={style.color}
                  className="frontier-chart__direct-label"
                >
                  {FRONTIER_MODEL_LABELS[model.model]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {series.some(({ points }) => points.length === 0) && (
        <p className="frontier-chart__empty">
          No finite tested points are available for {series
            .filter(({ points }) => points.length === 0)
            .map(({ model }) => FRONTIER_MODEL_LABELS[model.model])
            .join(', ')}.
        </p>
      )}
      <div className="frontier-chart__point-list" aria-label="Keyboard-accessible tested points">
        {series.flatMap(({ points }) => points).map(({ key, model, point }) => (
          <button
            key={key}
            type="button"
            className="frontier-point-button"
            onFocus={() => setFocusedPoint(key)}
            onBlur={() => setFocusedPoint(null)}
            aria-label={
              FRONTIER_MODEL_LABELS[model]
              + ', '
              + fmtUSD(point.monthlySpending)
              + ' real monthly spending, '
              + fmtPct(point.successRate)
              + ' success, '
              + pointStatus(point)
            }
          >
            {FRONTIER_MODEL_LABELS[model] + ' ' + fmtUSD(point.monthlySpending) + ' ' + fmtPct(point.successRate)}
          </button>
        ))}
      </div>
      <section className="frontier-chart__tested-points" aria-labelledby="frontier-tested-points-heading">
        <h4 id="frontier-tested-points-heading">Tested spending points</h4>
        <table>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Real monthly spending</th>
              <th scope="col">Success</th>
              <th scope="col">Measured status</th>
            </tr>
          </thead>
          <tbody>
            {series.flatMap(({ points }) => points).map(({ key, model, point }) => (
              <tr key={key}>
                <th scope="row">{FRONTIER_MODEL_LABELS[model]}</th>
                <td>{fmtUSD(point.monthlySpending)}</td>
                <td>{fmtPct(point.successRate)}</td>
                <td>{pointStatus(point)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
