/**
 * W2-B focused contracts: monthly replay history, SNAP_MAX sampling,
 * committed-parameter allocation semantics, presentation copy, and fixed
 * cohort route selection. Plain ESM; bundled by npm run test:gauntlet.
 */
import { replayCohort } from './engine.ts';
import {
  TRAIL_END_EXHAUSTED,
  TRAIL_END_FAILED,
  TRAIL_END_HORIZON,
  sampleReplayForTrail,
} from './snapshots.ts';
import {
  allocationScheduleForParams,
  computeGauntletSnapshot,
  useGauntletStore,
} from '../../store/gauntletStore.ts';
import {
  cohortPresentation,
  gauntletNarrative,
} from '../../ui/gauntletPresentation.ts';
import { selectGauntletRoutes } from '../../scene/mountain/gauntletRoutes.ts';
import { ROUTE_POINTS } from '../../scene/mountain/routes.ts';
import { DEFAULT_SIM_PARAMS } from '../../store/simStore.ts';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
  }
}

const series = (equity) => ({
  equity: Float64Array.from(equity),
  bonds: Float64Array.from(equity),
  monthCount: equity.length,
});

console.log('\n[gauntlet-viz a] monthly wealth path');
{
  const replay = replayCohort(
    {
      initialWealth: 1_000,
      contribution: 0,
      withdrawal: 100,
      retireYear: 0,
      horizonYears: 1,
    },
    series(new Array(12).fill(0)),
    0,
  );
  check('failure remains month 10 (exact zero survives)', replay.failureMonth === 10);
  check('path includes initial wealth', replay.wealthPath[0] === 1_000);
  check('path records month-end wealth', replay.wealthPath[1] === 900);
  check('path records exact-zero survivor', replay.wealthPath[10] === 0);
  check('path ends on post-clamp failure zero', replay.wealthPath.at(-1) === 0);
  check(
    'path length = initial + simulated months',
    replay.wealthPath.length === replay.monthsSimulated + 1,
  );

  const exhausted = replayCohort(
    {
      initialWealth: 1_000,
      contribution: 0,
      withdrawal: 0,
      retireYear: 0,
      horizonYears: 1,
    },
    series(new Array(5).fill(0)),
    0,
  );
  check('exhaustion is not failure', exhausted.exhaustedData && !exhausted.failed);
  check('exhausted path retains every real month', exhausted.wealthPath.length === 6);
}

console.log('\n[gauntlet-viz b] SNAP_MAX trail sampling');
{
  const failedReplay = {
    failed: true,
    failureMonth: 25,
    failureYear: 25 / 12,
    endingWealth: 0,
    minWealth: 0,
    monthsSimulated: 26,
    exhaustedData: false,
    wealthPath: Array.from({ length: 27 }, (_, month) =>
      month === 26 ? 0 : 1_000 - month,
    ),
  };
  const sampledFailure = sampleReplayForTrail(failedReplay, 30);
  check('failure uses a separate end state', sampledFailure.endState === TRAIL_END_FAILED);
  check('failure maps to floor(step/stride)+1 slot', sampledFailure.endSlot === 3);
  check('failure trail includes the death slot', sampledFailure.validCount === 4);
  check('death slot is post-clamp zero', sampledFailure.wealth[3] === 0);

  const exhaustedReplay = {
    failed: false,
    failureMonth: null,
    failureYear: null,
    endingWealth: 777,
    minWealth: 777,
    monthsSimulated: 14,
    exhaustedData: true,
    wealthPath: Array.from({ length: 15 }, (_, month) => 1_000 - month),
  };
  const sampledExhaustion = sampleReplayForTrail(exhaustedReplay, 30);
  check(
    'exhaustion uses a separate end state',
    sampledExhaustion.endState === TRAIL_END_EXHAUSTED,
  );
  check('partial period gets a terminal slot', sampledExhaustion.endSlot === 2);
  check('terminal exhaustion wealth is retained', sampledExhaustion.wealth[2] === 986);

  const horizonReplay = {
    failed: false,
    failureMonth: null,
    failureYear: null,
    endingWealth: 1_360,
    minWealth: 1_000,
    monthsSimulated: 360,
    exhaustedData: false,
    wealthPath: Array.from({ length: 361 }, (_, month) => 1_000 + month),
  };
  const sampledHorizon = sampleReplayForTrail(horizonReplay, 30);
  check('full survivor uses horizon end state', sampledHorizon.endState === TRAIL_END_HORIZON);
  check('30y produces 31 valid points', sampledHorizon.validCount === 31);
  check('horizon terminal wealth is retained', sampledHorizon.wealth[30] === 1_360);
}

console.log('\n[gauntlet-viz c] committed allocation + snapshot');
{
  const allEquity = allocationScheduleForParams({
    ...DEFAULT_SIM_PARAMS,
    glidepath: null,
  });
  check('null glidepath stays 100% equity', allEquity(0) === 1 && allEquity(240) === 1);

  const glide = allocationScheduleForParams({
    ...DEFAULT_SIM_PARAMS,
    retireYear: 10,
    glidepath: { start: 0.8, end: 0.4 },
  });
  check('glidepath starts at configured equity', glide(0) === 0.8);
  check('glidepath reaches end allocation at retirement', glide(120) === 0.4);
  check('glidepath remains at end allocation after retirement', glide(240) === 0.4);

  const snapshot = computeGauntletSnapshot(
    {
      ...DEFAULT_SIM_PARAMS,
      withdrawal: (DEFAULT_SIM_PARAMS.initialWealth * 0.04) / 12,
    },
    () => 1234,
  );
  check('snapshot contains six cohorts', snapshot.result.cohorts.length === 6);
  check('snapshot packs 6×32 wealth floats', snapshot.trails.wealth.length === 6 * 32);
  check('snapshot timestamps the committed computation', snapshot.computedAt === 1234);

  useGauntletStore.setState({ snapshot: null });
  useGauntletStore.getState().recompute(DEFAULT_SIM_PARAMS);
  check(
    'dedicated store action lands one complete snapshot',
    useGauntletStore.getState().snapshot?.result.cohorts.length === 6,
  );
}

console.log('\n[gauntlet-viz d] client/advisor presentation truth');
{
  const survived = {
    cohortId: 'gd1929',
    cohort: { startDate: '1929-01' },
    failed: false,
    exhaustedData: false,
    failureYear: null,
  };
  const failed1966 = {
    cohortId: 'stag1966',
    cohort: { startDate: '1966-01' },
    failed: true,
    exhaustedData: false,
    failureYear: 28.17,
  };
  const exhausted = {
    cohortId: 'gfc2008',
    cohort: { startDate: '2008-01' },
    failed: false,
    exhaustedData: true,
    failureYear: null,
  };
  check('survivor status has a checkmark', cohortPresentation(survived).symbol === '✓');
  check('failure status names the year', cohortPresentation(failed1966).detail.includes('28.2'));
  check('exhaustion uses a star, not a checkmark', cohortPresentation(exhausted).symbol === '*');
  check(
    'exhaustion text says history ended',
    cohortPresentation(exhausted).detail.toLowerCase().includes('history'),
  );
  const narrative = gauntletNarrative([survived, failed1966]);
  check('narrative contrasts crash and grind', /crash.*grind/i.test(narrative));
  check('narrative is evidence-grounded in named years', /1929/.test(narrative) && /1966/.test(narrative));
}

console.log('\n[gauntlet-viz e] fixed golden-angle routes');
{
  const count = 12;
  const points = new Float32Array(count * ROUTE_POINTS * 3);
  for (let route = 0; route < count; route++) {
    const angle = (route / count) * Math.PI * 2;
    const offset = route * ROUTE_POINTS * 3;
    points[offset] = Math.sin(angle) * 10;
    points[offset + 2] = Math.cos(angle) * 10;
  }
  const selected = selectGauntletRoutes({ count, points }, 6);
  check('selects one route per cohort', selected.length === 6);
  check('route assignments are distinct', new Set(selected).size === 6);
  check('first route is central +Z', selected[0] === 0);
}

console.log('\ngauntletViz: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
