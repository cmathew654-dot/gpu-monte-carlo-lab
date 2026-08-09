import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatCardsView } from './StatCards.tsx';
import { ClientNarrative } from './ClientHud.tsx';
import { AdvisorMathPanelView } from './AdvisorMathPanel.tsx';

const committedParams = {
  model: 'gbm',
  pathCount: 100000,
  horizonYears: 30,
  retireYear: 0,
  initialWealth: 1000000,
  contribution: 0,
  withdrawal: 4000,
  mu: 0.05,
  sigma: 0.15,
  glidepath: null,
  seed: 42,
};

const stats = {
  successRate: 1,
  percentiles: {
    p5: 80000,
    p25: 350000,
    p50: 115188,
    p75: 1600000,
    p95: 3900000,
  },
  worstDecileMaxDD: 0.567,
  safeWithdrawalRate: 4500,
  medianFailureYear: null,
  computedAt: 123,
};

const magnitudeStats = {
  medianShortfallYears: null,
  medianUnfundedObligation: null,
  failedPaths: 0,
  computedAt: 123,
};

function outcome(model, successRate, medianWealth, worstDecileMaxDD, medianFailureYear) {
  return {
    model,
    stats: {
      successRate,
      percentiles: {
        p5: 80000,
        p25: 350000,
        p50: medianWealth,
        p75: 1600000,
        p95: 3900000,
      },
      worstDecileMaxDD,
      medianFailureYear,
    },
    magnitude: {
      medianShortfallYears: medianFailureYear === null ? null : 4.2,
      medianUnfundedObligation: medianFailureYear === null ? null : 210000,
      failedPaths: medianFailureYear === null ? 0 : 900,
    },
  };
}

const saturatedComparison = {
  models: [
    outcome('gbm', 1, 115188, 0.567, null),
    outcome('bootstrap', 1, 150906, 0.713, null),
    outcome('fattail', 1, 115697, 0.569, null),
  ],
  pathCount: 100000,
  seed: 42,
  computedAt: 123,
};

const nonSaturatedComparison = {
  ...saturatedComparison,
  models: [
    outcome('gbm', 0.7, 115188, 0.567, 22.4),
    outcome('bootstrap', 0.74, 150906, 0.713, 20.8),
    outcome('fattail', 0.72, 115697, 0.569, 21.6),
  ],
};

function capacity(monthlySpending, status = 'converged') {
  return {
    monthlySpending,
    successRate: monthlySpending === null ? null : 0.902,
    target: 0.9,
    tolerance: 0.005,
    evaluations: 18,
    status,
  };
}

const frontierResult = {
  basis: {
    params: committedParams,
    analysisPathCount: 100000,
    engine: 'gpu',
    seed: 42,
  },
  models: [
    {
      model: 'gbm',
      outcome: saturatedComparison.models[0],
      curve: [],
      capacity90: capacity(3500),
    },
    {
      model: 'bootstrap',
      outcome: saturatedComparison.models[1],
      curve: [],
      capacity90: capacity(3400),
    },
    {
      model: 'fattail',
      outcome: saturatedComparison.models[2],
      curve: [],
      capacity90: capacity(3600),
    },
  ],
  robustSpend: 3400,
  robustStatus: 'converged',
  computedAt: 123,
};

const fourModelFrontierResult = {
  ...frontierResult,
  models: [
    {
      model: 'gbm',
      outcome: nonSaturatedComparison.models[0],
      curve: [],
      capacity90: capacity(3500),
    },
    {
      model: 'bootstrap',
      outcome: nonSaturatedComparison.models[1],
      curve: [],
      capacity90: capacity(3400),
    },
    {
      model: 'fattail',
      outcome: nonSaturatedComparison.models[2],
      curve: [],
      capacity90: capacity(3600),
    },
    {
      model: 'regime',
      outcome: outcome('regime', 0.81, 132000, 0.62, 19.3),
      curve: [],
      capacity90: capacity(3300),
    },
  ],
  robustSpend: 3300,
};

const statsMarkup = renderToStaticMarkup(
  React.createElement(StatCardsView, {
    stats,
    isStale: false,
    isRecomputing: false,
    magnitudeStats,
    modelComparison: saturatedComparison,
  }),
);
assert.match(statsMarkup, /Success agrees at 100\.0%/);
assert.match(statsMarkup, /Median ending wealth/);
assert.match(statsMarkup, /\$115K to \$151K/);
assert.match(statsMarkup, /Worst-decile max drawdown/);
assert.match(statsMarkup, /GBM/);
assert.match(statsMarkup, /Historical bootstrap/);
assert.match(statsMarkup, /Student-t\(5\)/);

function clientMarkup(overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(ClientNarrative, {
      stats,
      modelComparison: saturatedComparison,
      magnitudeStats,
      frontierStatus: 'idle',
      frontierResult: null,
      committedParams,
      mode: 'gpu',
      ...overrides,
    }),
  );
}

const saturatedMarkup = clientMarkup();
assert.match(saturatedMarkup, /ceiling of this measure, not a guarantee/i);
assert.match(saturatedMarkup, /roughest 1 in 10 futures/i);
assert.match(saturatedMarkup, /Your plan, tested through three statistical market models/i);
assert.match(saturatedMarkup, /GBM, historical bootstrap, and Student-t\(5\)/i);
assert.match(saturatedMarkup, /Plan: \$1(?:\.00)?M invested/i);
assert.match(saturatedMarkup, /\$0\/mo saved/i);
assert.match(saturatedMarkup, /\$4,000\/mo spending/i);
assert.match(saturatedMarkup, /retire now/i);
assert.match(saturatedMarkup, /30-year horizon/i);
assert.match(saturatedMarkup, /100% equities/i);
assert.match(saturatedMarkup, /How we tested this/i);
assert.match(saturatedMarkup, /No model predicts the future/i);
assert.match(saturatedMarkup, /Baseline compounding/i);
assert.match(saturatedMarkup, /History in one-year pieces/i);
assert.match(saturatedMarkup, /More extreme months/i);
assert.match(saturatedMarkup, /Stress that persists/i);
assert.match(
  saturatedMarkup,
  /Three run automatically\. Regime-t joins the full robustness test/i,
);
assert.doesNotMatch(saturatedMarkup, /All four ran on this plan/i);
assert.doesNotMatch(saturatedMarkup, /guaranteed|recommended|affordable/i);

const nonSaturatedMarkup = clientMarkup({
  stats: { ...stats, successRate: 0.7, medianFailureYear: 22.4 },
  modelComparison: nonSaturatedComparison,
});
assert.match(nonSaturatedMarkup, /70–74/);
assert.doesNotMatch(nonSaturatedMarkup, /ceiling of this measure, not a guarantee/i);

const currentFrontierMarkup = clientMarkup({
  frontierStatus: 'complete',
  frontierResult,
});
assert.match(currentFrontierMarkup, /Across all included models/);
assert.match(currentFrontierMarkup, /real monthly spending/i);

const fourModelFrontierMarkup = clientMarkup({
  stats: { ...stats, successRate: 0.7, medianFailureYear: 22.4 },
  modelComparison: nonSaturatedComparison,
  frontierStatus: 'complete',
  frontierResult: fourModelFrontierResult,
});
assert.match(fourModelFrontierMarkup, /Your plan, tested through four statistical market models/i);
assert.match(
  fourModelFrontierMarkup,
  /GBM, historical bootstrap, Student-t\(5\), and Regime-t/i,
);
assert.match(fourModelFrontierMarkup, /70.81/);
assert.match(fourModelFrontierMarkup, /All four ran on this plan/i);

const runningFrontierMarkup = clientMarkup({
  frontierStatus: 'running',
  frontierResult: fourModelFrontierResult,
});
assert.doesNotMatch(runningFrontierMarkup, /Across all included models/);
assert.match(runningFrontierMarkup, /three statistical market models/i);
assert.doesNotMatch(runningFrontierMarkup, /All four ran on this plan/i);

const errorFrontierMarkup = clientMarkup({
  frontierStatus: 'error',
  frontierResult,
});
assert.doesNotMatch(errorFrontierMarkup, /Across all included models/);

const staleParamsMarkup = clientMarkup({
  frontierStatus: 'complete',
  frontierResult,
  committedParams: { ...committedParams, withdrawal: 4200 },
});
assert.doesNotMatch(staleParamsMarkup, /Across all included models/);

const staleEngineMarkup = clientMarkup({
  frontierStatus: 'complete',
  frontierResult,
  mode: 'cpu',
});
assert.doesNotMatch(staleEngineMarkup, /Across all included models/);

const incompleteMarkup = clientMarkup({
  frontierStatus: 'complete',
  frontierResult: {
    ...frontierResult,
    models: frontierResult.models.map((model, index) => (
      index === 1
        ? { ...model, capacity90: capacity(null, 'unbounded-high') }
        : model
    )),
  },
});
assert.doesNotMatch(incompleteMarkup, /Across all included models/);

const visualCss = readFileSync('src/app/theme.css', 'utf8');
const gauntletCss = readFileSync('src/ui/gauntlet.css', 'utf8');
const visualHtml = readFileSync('index.html', 'utf8');
const clientHudSource = readFileSync('src/ui/ClientHud.tsx', 'utf8');
const appSource = readFileSync('src/app/App.tsx', 'utf8');
const shortLandscapeRule = '@media (max-height: 560px) and (min-aspect-ratio: 4/3)';
const shortHeightRuleIndex = visualCss.indexOf(shortLandscapeRule);
const baseClientCss = visualCss.slice(0, shortHeightRuleIndex);

assert.match(visualHtml, /Barlow\+Semi\+Condensed/);
assert.match(visualHtml, /IBM\+Plex\+Mono/);
assert.doesNotMatch(visualHtml, /family=Inter/);
assert.match(visualCss, /--control-line:\s*#606060/);
assert.match(visualCss, /--frontier-gbm:/);
assert.match(visualCss, /--frontier-bootstrap:/);
assert.match(visualCss, /--frontier-fattail:/);
assert.match(visualCss, /data:image\/svg\+xml/);
assert.doesNotMatch(visualCss, /repeating-linear-gradient/);
assert.doesNotMatch(visualCss, /backdrop-filter/);
assert.match(visualCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(visualCss, /\.frontier-point-button:focus-visible/);
assert.match(visualCss, /\.frontier-panel:has\(\.frontier-panel__idle\)/);
assert.doesNotMatch(visualCss, /\.gauntlet-panel/);
assert.match(gauntletCss, /\.gauntlet-panel\s*\{[^}]*z-index:\s*7/s);
assert.match(
  gauntletCss,
  /\.gauntlet-panel--client\s*\{[^}]*background:\s*var\(--gauntlet-overlay\)[^}]*border:\s*1px solid var\(--gauntlet-border\)/s,
);
assert.match(gauntletCss, /box-shadow:\s*none/);
assert.doesNotMatch(gauntletCss.replace(/box-shadow\s*:\s*none/g, ''), /box-shadow/);
assert.doesNotMatch(gauntletCss, /backdrop-filter/);
assert.match(visualCss, /\.model-triangulation__row > :last-child/);
assert.match(visualCss, /@media \(max-width: 720px\)/);
assert.match(visualCss, /@media \(max-width: 600px\)/);
assert.match(
  visualCss,
  /padding:\s*clamp\(36px,\s*6vh,\s*48px\)\s+24px\s+28px/,
);
assert.match(clientHudSource, /className="client-hud__top"/);
assert.match(clientHudSource, /<GauntletPanel \/>/);
assert.doesNotMatch(appSource, /viewMode === 'client' && <GauntletPanel \/>/);
assert.match(
  gauntletCss,
  /\.gauntlet-panel--client\s*\{[^}]*position:\s*static/s,
);
assert.match(
  gauntletCss,
  /@media \(max-height: 560px\) and \(min-aspect-ratio: 4\/3\)/,
);
assert.doesNotMatch(visualCss, /@media \(max-height: 560px\)\s*\{/);
assert.match(
  gauntletCss,
  /@media \(max-height: 560px\) and \(min-aspect-ratio: 4\/3\)[\s\S]*\.gauntlet-panel--client \.gauntlet-panel__narrative\s*\{[^}]*display:\s*none/s,
);
assert.doesNotMatch(
  gauntletCss,
  /\.gauntlet-panel__source(?:-date|-block)?[^}]*display:\s*none/,
);
assert.doesNotMatch(gauntletCss, /\.gauntlet-panel__note[^}]*display:\s*none/);
assert.match(
  gauntletCss,
  /\.gauntlet-chip\s*\{[^}]*background:\s*var\(--raised-black\)[^}]*border:\s*1px solid var\(--gauntlet-border\)/s,
);
for (const selector of ['identity', 'outcome', 'symbol']) {
  assert.match(gauntletCss, new RegExp('\\.gauntlet-chip__' + selector + '\\b'));
}
assert.match(visualCss, /\.client-hud__method > summary:focus-visible/);
assert.match(
  baseClientCss,
  /\.client-hud__method-state\s*\{[^}]*font-size:\s*10px/s,
);
assert.match(
  gauntletCss,
  /\.gauntlet-chips\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)/s,
);
assert.match(
  gauntletCss,
  /@media \(min-width: 481px\) and \(max-width: 839px\)[\s\S]*\.gauntlet-chips\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)/s,
);
assert.match(
  gauntletCss,
  /@media \(max-width: 480px\)[\s\S]*\.gauntlet-chips\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)/s,
);
const compactClientCss = visualCss.slice(shortHeightRuleIndex);
for (const selector of [
  'client-hud__model-basis',
  'client-hud__plan-basis',
  'client-hud__method > summary',
  'client-hud__method-state',
]) {
  assert.match(
    compactClientCss,
    new RegExp('\\.' + selector + '\\s*\\{[^}]*font-size:\\s*(?:1[0-9]|[2-9][0-9])px', 's'),
  );
}
assert.match(
  gauntletCss,
  /@media \(max-height: 560px\) and \(min-aspect-ratio: 4\/3\)[\s\S]*\.gauntlet-panel--client \.gauntlet-chip\s*\{[^}]*min-height:\s*40px[^}]*padding:\s*6px 8px/s,
);
assert.match(
  visualCss,
  /\.app-shell:has\(\.client-hud\) \.fallback-container > \.capability-badge\s*\{[^}]*display:\s*none/s,
);
assert.match(
  visualCss,
  /\.app-shell:has\(\.client-hud\) \.fallback-container > \.fallback-dom\s*\{[^}]*display:\s*none/s,
);

const mathProps = {
  params: committedParams,
  committedParams,
  stats,
  magnitudeStats,
  modelComparison: saturatedComparison,
  frontierStatus: 'idle',
  frontierProgress: { completed: 0, total: 0, model: null },
  frontierResult: null,
  frontierError: null,
  mode: 'gpu',
  onModelChange: () => {},
  onOpenFrontier: () => {},
  onSetAdvisorLens: () => {},
};

const clientSentences = {
  gbm: /Each month is a fresh bell-curve surprise/i,
  bootstrap: /It borrows an actual one-year market sequence/i,
  fattail: /It keeps GBM.+unusually large monthly gains and losses more common/i,
  regime: /Calm and stressful markets tend to arrive in runs/i,
};

for (const model of Object.keys(clientSentences)) {
  const mathMarkup = renderToStaticMarkup(
    React.createElement(AdvisorMathPanelView, {
      ...mathProps,
      selectedModel: model,
      inspectRegime: model === 'regime',
    }),
  );
  assert.match(mathMarkup, /W.*t\+1.*×.*g.*C/s);
  assert.match(mathMarkup, clientSentences[model]);
  assert.equal((mathMarkup.match(/role="radio"/g) ?? []).length, 3);
  assert.match(mathMarkup, /Regime-t[^<]{0,80}Frontier only/i);
}

const advisorMathCss = readFileSync('src/ui/advisorMath.css', 'utf8');
assert.match(advisorMathCss, /@media \(max-width: 720px\)/);
assert.match(advisorMathCss, /@media \(max-width: 600px\)/);
assert.match(advisorMathCss, /@media \(max-height: 560px\) and \(min-aspect-ratio: 4\/3\)/);
assert.match(advisorMathCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(advisorMathCss, /gradient|box-shadow|backdrop-filter/i);
