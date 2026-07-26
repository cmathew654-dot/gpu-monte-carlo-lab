/**
 * probe5.mjs — extra DEMO.md beats, all @100k seed 42:
 *  S1 early-retiree: withdrawal at SWR ($4,464) success (verify ~90%)
 *  S2 glidepath: on (93.55%) vs OFF (stay 90% equity)
 *  S3 fat-tail preset params on all three models
 *  S4 cautionary at SWR ($3,958)
 *  S5 accumulation: contribution 1500 vs 3000 vs 750
 */
import { runCpuSim } from '../sim/fallback/cpuSim.ts';
import { parseBootstrapBlocksFile } from '../sim/model/bootstrap.ts';
import historicalReturnsJson from '../data/historicalReturns.json' with { type: 'json' };
import scenariosJson from '../data/scenarios.json' with { type: 'json' };

const bootstrap = parseBootstrapBlocksFile(historicalReturnsJson);
const NOW = () => 1700000000000;
const S = Object.fromEntries(scenariosJson.map((s) => [s.name, s.params]));
const run = (p) => runCpuSim({ ...p, pathCount: 100_000 }, { bootstrapData: bootstrap, now: NOW }).stats;
const show = (label, s) =>
  console.log(
    `${label.padEnd(46)} success=${(s.successRate * 100).toFixed(2)}%  p5=${Math.round(s.percentiles.p5)}  p50=${Math.round(s.percentiles.p50)}  p95=${Math.round(s.percentiles.p95)}  worstDD=${(s.worstDecileMaxDD * 100).toFixed(1)}%  failYr=${s.medianFailureYear?.toFixed(1) ?? '—'}`,
  );

show('S1 withdrawal $4,464 (SWR)', run({ ...S['Early retiree 35-yr'], withdrawal: 4464 }));
show('S1 withdrawal $4,000', run({ ...S['Early retiree 35-yr'], withdrawal: 4000 }));
show('S2 glidepath ON (preset)', run(S['Pre-retiree 10-yr glidepath']));
show('S2 glidepath OFF (flat 90%)', run({ ...S['Pre-retiree 10-yr glidepath'], glidepath: null, mu: 0.07 * 0.9, sigma: 0.15 * 0.9 }));
show('S3 preset on bootstrap', run({ ...S['Fat-tail stress'], model: 'bootstrap' }));
show('S3 preset on gbm', run({ ...S['Fat-tail stress'], model: 'gbm' }));
show('S3 preset on fattail', run(S['Fat-tail stress']));
show('S4 withdrawal $3,958 (SWR)', run({ ...S['High-withdrawal cautionary'], withdrawal: 3958 }));
show('S5 contribution $1,500 (preset)', run(S['Accumulation only']));
show('S5 contribution $3,000', run({ ...S['Accumulation only'], contribution: 3000 }));
show('S5 contribution $750', run({ ...S['Accumulation only'], contribution: 750 }));
show('S2 contribution $3,500', run({ ...S['Pre-retiree 10-yr glidepath'], contribution: 3500 }));
