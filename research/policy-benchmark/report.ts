import type {
  BenchmarkReport,
  FrontierResult,
  OutcomeSummary,
  PolicyFamily,
} from './benchmark.ts';

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(value: number | null): string {
  if (value === null) return '—';
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function fixed(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function summaryCells(summary: OutcomeSummary): string {
  return [
    money(summary.meanFundedLifetimeSpending),
    money(summary.medianFundedLifetimeSpending),
    money(summary.p10FundedLifetimeSpending),
    percent(summary.floorBreachProbability),
    money(summary.severeTailShortfall),
    money(summary.medianTerminalWealth),
    summary.meanFailureMonth === null ? '—' : `${summary.meanFailureMonth.toFixed(1)} mo`,
    `${summary.meanYearsAtFloor.toFixed(2)} y`,
    fixed(summary.meanSpendingAdjustments),
    percent(summary.meanEquityExposure),
    fixed(summary.meanTurnover),
    percent(summary.meanTimeAtAllocationBounds),
  ].map((value) => `<td>${escapeHtml(value)}</td>`).join('');
}

function summaryTable(title: string, optimized: OutcomeSummary, counterpart: OutcomeSummary): string {
  const headings = ['Mean funded', 'Median', 'P10', 'Floor breach', 'Severe tail', 'Median terminal', 'Failure month', 'Years at floor', 'Spend moves', 'Equity exposure', 'Turnover', 'At bounds'];
  return `<div class="table-wrap"><table><caption>${escapeHtml(title)}</caption><thead><tr><th scope="col">Policy</th>${headings.map((heading) => `<th scope="col">${escapeHtml(heading)}</th>`).join('')}</tr></thead><tbody><tr><th scope="row">Optimized</th>${summaryCells(optimized)}</tr><tr><th scope="row">Counterpart</th>${summaryCells(counterpart)}</tr></tbody></table></div>`;
}

function ci(value: { estimate: number; lower: number; upper: number }, isMoney = false): string {
  const format = (number: number) => isMoney ? money(number) : percent(number);
  return `${format(value.estimate)} [${format(value.lower)}, ${format(value.upper)}]`;
}

function chart(family: PolicyFamily, frontiers: readonly FrontierResult[], wealth: readonly number[]): string {
  const points = wealth.map((amount, index) => {
    const frontier = frontiers.find((item) => item.startingWealth === amount) ?? frontiers[index];
    const optimized = frontier?.foldResults[0]?.validation.optimized.meanFundedLifetimeSpending ?? 0;
    const counterpart = frontier?.foldResults[0]?.validation.counterpart.meanFundedLifetimeSpending ?? 0;
    const x = 42 + index * 128;
    const scale = (value: number) => 132 - Math.min(104, Math.max(0, value / 1_500_000 * 104));
    return `<g><line x1="${x}" y1="24" x2="${x}" y2="142" stroke="#d7dce2"/><circle cx="${x - 7}" cy="${scale(optimized)}" r="4" fill="#0b5cff"><title>${escapeHtml(money(optimized))} optimized</title></circle><circle cx="${x + 7}" cy="${scale(counterpart)}" r="4" fill="#b42318"><title>${escapeHtml(money(counterpart))} counterpart</title></circle><text x="${x}" y="160" text-anchor="middle">${escapeHtml(money(amount))}</text></g>`;
  }).join('');
  return `<figure class="chart"><figcaption>${escapeHtml(family === 'freedom' ? 'Mathematical freedom' : 'Implementable policy')} · held-out funded spending by starting wealth</figcaption><svg viewBox="0 0 430 180" role="img" aria-label="${escapeHtml(family)} held-out funded spending chart"><line x1="20" y1="142" x2="414" y2="142" stroke="#111827"/><line x1="20" y1="24" x2="20" y2="142" stroke="#111827"/><text x="24" y="18">higher funded spending ↑</text>${points}<text x="25" y="176" fill="#4b5563">blue optimized · red counterpart</text></svg></figure>`;
}

function frontierTables(frontiers: readonly FrontierResult[]): string {
  return frontiers.map((frontier) => {
    const rows = frontier.foldResults.map((fold) => `<tr><th scope="row">${escapeHtml(fold.fold)}</th><td>${escapeHtml(money(fold.validation.optimized.meanFundedLifetimeSpending))}</td><td>${escapeHtml(money(fold.validation.counterpart.meanFundedLifetimeSpending))}</td><td>${escapeHtml(percent(fold.validation.optimized.floorBreachProbability))}</td><td>${escapeHtml(percent(fold.validation.counterpart.floorBreachProbability))}</td><td>${escapeHtml(ci(fold.validation.paired.fundedSpendingGain))}</td><td>${escapeHtml(ci(fold.validation.paired.breachProbabilityDifference))}</td></tr>`).join('');
    return `<section class="panel"><h3>${escapeHtml(frontier.family)} · ${escapeHtml(money(frontier.startingWealth))} · ρ ${escapeHtml(money(frontier.rho))}</h3><p class="verdict verdict-${escapeHtml(frontier.verdict)}">Verdict: <strong>${escapeHtml(frontier.verdict)}</strong></p><p>Selected policy: ${escapeHtml(frontier.optimizedPolicy.actionCount)} actions; counterpart: ${escapeHtml(JSON.stringify(frontier.counterpartPolicy))}</p><div class="table-wrap"><table><caption>Held-out fold results and paired intervals</caption><thead><tr><th scope="col">Fold</th><th scope="col">Optimized funded</th><th scope="col">Counterpart funded</th><th scope="col">Optimized breach</th><th scope="col">Counterpart breach</th><th scope="col">Spending gain CI</th><th scope="col">Breach difference CI</th></tr></thead><tbody>${rows}</tbody></table></div>${summaryTable('Training summaries', frontier.foldResults[0]?.train.optimized ?? emptySummary(), frontier.foldResults[0]?.train.counterpart ?? emptySummary())}</section>`;
  }).join('');
}

function emptySummary(): OutcomeSummary {
  return { pathCount: 0, meanFundedLifetimeSpending: 0, medianFundedLifetimeSpending: 0, p10FundedLifetimeSpending: 0, floorBreachProbability: 0, severeTailShortfall: 0, meanTerminalWealth: 0, medianTerminalWealth: 0, meanFailureMonth: null, meanYearsAtFloor: 0, meanSpendingAdjustments: 0, meanEquityExposure: 0, meanTurnover: 0, meanTimeAtAllocationBounds: 0 };
}

export function renderBenchmarkHtml(report: BenchmarkReport): string {
  const freedom = report.frontiers.filter((frontier) => frontier.family === 'freedom');
  const implementable = report.frontiers.filter((frontier) => frontier.family === 'implementable');
  const uniqueWealth = [...new Set(report.frontiers.map((frontier) => frontier.startingWealth))];
  const actionRows = report.frontiers.slice(0, 2).flatMap((frontier) => frontier.actionMap.slice(0, 18).map((action) => `<tr><th scope="row">${escapeHtml(frontier.family)}</th><td>${escapeHtml(percent(action.equity))}</td><td>${escapeHtml(money(action.spending))}</td></tr>`)).join('');
  const limitations = report.limitations.map((limitation) => `<li>${escapeHtml(limitation)}</li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Policy optimization benchmark</title>
<style>
:root{color-scheme:light;--ink:#111827;--muted:#4b5563;--line:#d7dce2;--paper:#f8fafc;--panel:#fff;--blue:#0b5cff;--red:#b42318;--green:#067647;--amber:#9a6700}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Barlow Semi Condensed","Arial Narrow",sans-serif;font-size:16px;line-height:1.45}main{max-width:1180px;margin:auto;padding:32px 20px 64px}h1,h2,h3{line-height:1.1}h1{font-size:clamp(2rem,4vw,3.5rem);margin:0 0 8px}h2{font-size:1.6rem;margin:32px 0 12px}h3{font-size:1.1rem;margin:0 0 8px}.lede{max-width:70ch;color:var(--muted)}.meta,.data{font-family:"IBM Plex Mono",Consolas,monospace;font-size:.78rem}.verdicts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:24px 0}.verdict-card,.panel{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:16px}.verdict{font-family:"IBM Plex Mono",Consolas,monospace;margin:6px 0}.verdict-inconclusive{color:var(--amber)}.verdict-pass{color:var(--green)}.verdict-stop{color:var(--red)}.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.chart{margin:0;background:var(--panel);border:1px solid var(--line);padding:12px}.chart figcaption{font-weight:600;margin-bottom:8px}.chart svg{width:100%;height:auto;font-family:"IBM Plex Mono",Consolas,monospace;font-size:10px}.table-wrap{overflow-x:auto;margin:12px 0 20px}table{border-collapse:collapse;width:100%;min-width:720px;background:var(--panel)}caption{text-align:left;font-weight:600;padding:8px 0}th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left;white-space:nowrap}th{font-weight:600}td,.data{font-variant-numeric:tabular-nums}.key{font-family:"IBM Plex Mono",Consolas,monospace;word-break:break-word}.note{border-left:4px solid var(--amber);padding:10px 14px;background:#fffdf2}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:760px){main{padding:24px 12px 48px}.verdicts,.charts{grid-template-columns:1fr}.panel{padding:12px}}
</style>
</head>
<body><main>
<header><p class="meta">RESEARCH-ONLY · ${escapeHtml(report.mode.toUpperCase())}</p><h1>Policy optimization benchmark</h1><p class="lede">A cross-fit comparison of mathematical freedom and an implementable policy against fixed and guardrail counterparts. This instrument reports historical evidence; it does not give advice.</p><p class="note"><strong>${escapeHtml(report.previewBanner)}</strong> Preview estimates are intentionally not a verdict.</p></header>
<section aria-labelledby="verdict-heading"><h2 id="verdict-heading">Verdicts first</h2><div class="verdicts"><article class="verdict-card"><h3>Mathematical freedom</h3><p class="verdict verdict-${escapeHtml(report.verdicts.mathematical)}"><strong>${escapeHtml(report.verdicts.mathematical)}</strong></p><p>Unconstrained annual spending and allocation grid.</p></article><article class="verdict-card"><h3>Implementable policy</h3><p class="verdict verdict-${escapeHtml(report.verdicts.implementable)}"><strong>${escapeHtml(report.verdicts.implementable)}</strong></p><p>30–80% equity and spending changes limited to 10% of prior spending.</p></article></div></section>
<section aria-labelledby="charts-heading"><h2 id="charts-heading">Three-state frontier charts</h2><div class="charts">${chart('freedom', freedom, uniqueWealth)}${chart('implementable', implementable, uniqueWealth)}</div><p class="meta">Blue markers are optimized; red markers are the paired counterpart. Markers are evaluated points.</p></section>
<section aria-labelledby="results-heading"><h2 id="results-heading">Held-out fold results and paired CIs</h2>${frontierTables(report.frontiers)}</section>
<section aria-labelledby="action-heading"><h2 id="action-heading">Selected policies and action maps</h2><div class="table-wrap"><table><caption>Action-map sample</caption><thead><tr><th scope="col">Family</th><th scope="col">Equity</th><th scope="col">Monthly spending</th></tr></thead><tbody>${actionRows}</tbody></table></div><p>Adjustment burden is reported in each policy table as spending moves, equity exposure, turnover, and time at allocation bounds.</p></section>
<section aria-labelledby="method-heading"><h2 id="method-heading">Seeds, grids, input, and runtime</h2><div class="table-wrap"><table><caption>Reproducibility metadata</caption><tbody><tr><th scope="row">Input digest</th><td class="key">${escapeHtml(report.inputSha256)}</td></tr><tr><th scope="row">Git SHA</th><td class="key">${escapeHtml(report.gitSha)}</td></tr><tr><th scope="row">Runtime</th><td>${escapeHtml(report.runtimeMs)} ms</td></tr><tr><th scope="row">Training seeds</th><td class="data">${escapeHtml(report.seeds.training.join(', '))}</td></tr><tr><th scope="row">Validation seeds</th><td class="data">${escapeHtml(report.seeds.validation.join(', '))}</td></tr><tr><th scope="row">Bootstrap seed</th><td class="data">${escapeHtml(report.seeds.bootstrap)}</td></tr><tr><th scope="row">Spending grid</th><td class="data">${escapeHtml(report.grids.spending.join(', '))}</td></tr><tr><th scope="row">Freedom equity grid</th><td class="data">${escapeHtml(report.grids.freedomEquity.map(percent).join(', '))}</td></tr><tr><th scope="row">Implementable equity grid</th><td class="data">${escapeHtml(report.grids.implementableEquity.map(percent).join(', '))}</td></tr><tr><th scope="row">Wealth grid</th><td class="data">${escapeHtml(report.grids.wealth.length)} states, capped at $6,000,000</td></tr></tbody></table></div></section>
<section aria-labelledby="limits-heading"><h2 id="limits-heading">Limitations</h2><ul>${limitations}</ul></section>
<footer class="meta">Policy benchmark schema v${escapeHtml(report.schemaVersion)} · accessible tables are the source of numeric detail.</footer>
</main></body></html>`;
}
