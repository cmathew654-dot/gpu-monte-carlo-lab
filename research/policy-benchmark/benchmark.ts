import historical from '../../src/data/historicalReturns.json';
import { recoverPairedLogReturns } from '../../src/sim/regime/series.ts';
import { streamHash } from '../../src/sim/model/hash.ts';

export type PolicyFamily = 'freedom' | 'implementable';
export type Verdict = 'pass' | 'stop' | 'inconclusive';

export interface BenchmarkConfig {
  mode: 'preview' | 'full';
  horizonYears: number;
  monthsPerYear: number;
  startingWealth: readonly number[];
  targetSpending: number;
  essentialFloor: number;
  priorSpending: number;
  spendingGrid: readonly number[];
  freedomEquityGrid: readonly number[];
  implementableEquityGrid: readonly number[];
  wealthGrid: readonly number[];
  penalties: readonly number[];
  trainingPaths: number;
  validationPaths: number;
  representatives: number;
  bootstrapResamples: number;
  trainingSeeds: readonly [number, number];
  validationSeeds: readonly [number, number];
  bootstrapSeed: number;
  inputSha256?: string;
  gitSha?: string;
}

export interface PolicyAction {
  equity: number;
  spending: number;
}

export interface AnnualTransition {
  wealth: number;
  fundedSpending: number;
  unpaidFloor: number;
  floorBreach: boolean;
  monthsAtFloor: number;
  monthsScheduledAtFloor: number;
  failureMonth: number | null;
}

export interface AnnualBlock {
  startDate: string;
  equity: readonly number[];
  bond: readonly number[];
  annualEquityReturn: number;
  annualBondReturn: number;
  equityDrawdown: number;
}

export interface ValidationSegment {
  startDate: string;
  equity: readonly number[];
  bond: readonly number[];
}

export interface HistoricalSeries {
  dates: readonly string[];
  values: readonly (readonly [number, number])[];
  equity: readonly number[];
  bond: readonly number[];
  inputSha256: string;
  trainingValidationOverlap: readonly string[];
  folds: readonly FoldWindow[];
}

export interface FoldWindow {
  name: 'E→L' | 'L→E';
  trainStart: string;
  trainEnd: string;
  validationStart: string;
  validationEnd: string;
}

export interface PathOutcome {
  fundedLifetimeSpending: number;
  unpaidFloorObligations: number;
  floorBreach: boolean;
  terminalWealth: number;
  failureMonth: number | null;
  yearsAtFloor: number;
  spendingAdjustments: number;
  equityExposure: number;
  turnover: number;
  timeAtAllocationBounds: number;
}

export interface OutcomeSummary {
  pathCount: number;
  meanFundedLifetimeSpending: number;
  medianFundedLifetimeSpending: number;
  p10FundedLifetimeSpending: number;
  floorBreachProbability: number;
  severeTailShortfall: number;
  meanTerminalWealth: number;
  medianTerminalWealth: number;
  meanFailureMonth: number | null;
  meanYearsAtFloor: number;
  meanSpendingAdjustments: number;
  meanEquityExposure: number;
  meanTurnover: number;
  meanTimeAtAllocationBounds: number;
}

export interface PairedInterval {
  estimate: number;
  lower: number;
  upper: number;
}

export interface PairedResult {
  fundedSpendingGain: PairedInterval;
  tailShortfallReduction: PairedInterval;
  breachProbabilityDifference: PairedInterval;
  pointRiskDifference: number;
  pointRiskMatched: boolean;
  matchedRisk: boolean;
  winningPointEstimate: 'optimized' | 'counterpart' | 'tie';
}

export interface FrontierFoldResult {
  fold: string;
  train: {
    optimized: OutcomeSummary;
    counterpart: OutcomeSummary;
    paired: PairedResult;
  };
  validation: {
    optimized: OutcomeSummary;
    counterpart: OutcomeSummary;
    paired: PairedResult;
  };
}

export interface FrontierResult {
  family: PolicyFamily;
  rho: number;
  startingWealth: number;
  verdict: Verdict;
  foldResults: readonly FrontierFoldResult[];
  optimizedPolicy: PolicySnapshot;
  counterpartPolicy: CounterpartSpec;
  selectedByFold: readonly SelectedFoldPolicy[];
  learnedActionMap: readonly PolicyMapEntry[];
  trainingRiskMatched: boolean;
  pooledPaired?: PairedResult;
}

export interface BenchmarkReport {
  schemaVersion: 1;
  mode: 'preview' | 'full';
  previewBanner: string;
  verdicts: {
    mathematical: Verdict;
    implementable: Verdict;
  };
  config: BenchmarkConfig;
  inputSha256: string;
  gitSha: string;
  runtimeMs: number;
  runtimeOk: boolean;
  integrity: {
    finite: boolean;
    inputDigestMatches: boolean;
    zeroTrainValidationOverlap: boolean;
  };
  sensitivity: {
    penaltyCount: number;
    foldCount: number;
    stableWinningPointEstimates: boolean;
  };
  folds: readonly FoldWindow[];
  frontiers: readonly FrontierResult[];
  limitations: readonly string[];
  seeds: {
    training: readonly [number, number];
    validation: readonly [number, number];
    bootstrap: number;
  };
  grids: {
    spending: readonly number[];
    freedomEquity: readonly number[];
    implementableEquity: readonly number[];
    wealth: readonly number[];
  };
}

export interface PolicySnapshot {
  family: PolicyFamily;
  rho: number;
  horizonYears: number;
  defaultAction: PolicyAction;
  actionCount: number;
  identity: string;
  stateActionMap: readonly PolicyMapEntry[];
}

export interface PolicyMapEntry {
  family: PolicyFamily;
  fold: string;
  rho: number;
  year: number;
  breached: boolean;
  wealthIndex: number;
  wealth: number;
  priorSpending: number;
  action: PolicyAction;
  spendingAction: number;
  equityAction: number;
}

export interface CounterpartSpec {
  kind: 'fixed' | 'guardrail';
  equity: number;
  spending: number;
  cutTrigger?: number;
  restoreTrigger?: number;
  adjustmentSize?: number;
}

export interface CounterpartPoint {
  spec: CounterpartSpec;
  training: OutcomeSummary;
  objective: number;
  pointRiskMatched: boolean;
  nondominated: boolean;
}

export interface SelectedFoldPolicy {
  fold: string;
  rho: number;
  policy: PolicySnapshot;
  counterpart: CounterpartSpec;
  controllerId: string;
  counterpartId: string;
  refinementHistory: readonly number[];
  trainingRiskDifference: number;
  trainingRiskMatched: boolean;
}

export interface DynamicPolicyResult {
  policy: PolicySnapshot;
  penaltyModel: 'absorbing-any-breach';
  firstBreachPenaltyApplications: number;
  repeatedBreachPenaltyApplications: number;
  valueAtStart: number;
}

export interface CompressedCell extends AnnualBlock {
  cell: string;
  weight: number;
}

const MONTHS_PER_YEAR = 12;
const VALIDATION_BLOCK_MONTHS = 36;
const GRID_DOLLARS = 100;
const PREVIEW_PENALTIES = [0, 1_000_000] as const;
const FULL_PENALTIES = [0, 125_000, 250_000, 500_000, 1_000_000, 2_000_000, 4_000_000, 8_000_000] as const;
export const EXPECTED_INPUT_SHA256 = '22cce814073cdf5fba6288afbdf7d4c78d000a7f62110c757905eb3076cc49e4';
const FOLD_WINDOWS: readonly FoldWindow[] = [
  {
    name: 'E→L',
    trainStart: '1926-01',
    trainEnd: '1975-12',
    validationStart: '1976-01',
    validationEnd: '2026-06',
  },
  {
    name: 'L→E',
    trainStart: '1976-01',
    trainEnd: '2026-06',
    validationStart: '1926-01',
    validationEnd: '1975-12',
  },
];

function makeWealthGrid(): number[] {
  const grid: number[] = [];
  for (let value = 0; value <= 2_000_000; value += 25_000) grid.push(value);
  for (let value = 2_050_000; value <= 4_000_000; value += 50_000) grid.push(value);
  for (let value = 4_100_000; value <= 6_000_000; value += 100_000) grid.push(value);
  return grid;
}

function makeSpendingGrid(): number[] {
  return Array.from({ length: 11 }, (_, index) => 4_000 + index * GRID_DOLLARS);
}

function makeEquityGrid(start: number, end: number): number[] {
  return Array.from({ length: Math.round((end - start) * 10) + 1 }, (_, index) =>
    Number((start + index / 10).toFixed(1)),
  );
}

export const PREVIEW_CONFIG: BenchmarkConfig = {
  mode: 'preview',
  horizonYears: 35,
  monthsPerYear: MONTHS_PER_YEAR,
  startingWealth: [1_000_000, 1_200_000, 1_500_000],
  targetSpending: 5_000,
  essentialFloor: 4_000,
  priorSpending: 5_000,
  spendingGrid: makeSpendingGrid(),
  freedomEquityGrid: makeEquityGrid(0, 1),
  implementableEquityGrid: makeEquityGrid(0.3, 0.8),
  wealthGrid: makeWealthGrid(),
  penalties: PREVIEW_PENALTIES,
  trainingPaths: 256,
  validationPaths: 512,
  representatives: 8,
  bootstrapResamples: 250,
  trainingSeeds: [41001, 41002],
  validationSeeds: [51001, 51002],
  bootstrapSeed: 61001,
};

export const FULL_CONFIG: BenchmarkConfig = {
  ...PREVIEW_CONFIG,
  mode: 'full',
  penalties: FULL_PENALTIES,
  trainingPaths: 20_000,
  validationPaths: 50_000,
  representatives: 24,
  bootstrapResamples: 2_000,
};

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function recursivelyFinite(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => recursivelyFinite(item, seen));
  return Object.values(value).every((item) => recursivelyFinite(item, seen));
}

export function validateBenchmarkIntegrity(
  inputSha256: string,
  value: unknown,
  trainingValidationOverlap: readonly string[],
): BenchmarkReport['integrity'] {
  return {
    finite: recursivelyFinite(value),
    inputDigestMatches: inputSha256 === EXPECTED_INPUT_SHA256,
    zeroTrainValidationOverlap: trainingValidationOverlap.length === 0,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function dateIndex(series: HistoricalSeries, date: string): number {
  const index = series.dates.indexOf(date);
  if (index < 0) throw new Error(`policy benchmark: missing date ${date}`);
  return index;
}

function quantile(values: readonly number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function recoverHistoricalSeries(file: unknown = historical): HistoricalSeries {
  const recovered = recoverPairedLogReturns(file);
  const equity = recovered.values.map(([value]) => Math.expm1(value));
  const bond = recovered.values.map(([, value]) => Math.expm1(value));
  const overlaps = new Set<string>();
  for (const fold of FOLD_WINDOWS) {
    const trainStart = recovered.dates.indexOf(fold.trainStart);
    const trainEnd = recovered.dates.indexOf(fold.trainEnd);
    const validationStart = recovered.dates.indexOf(fold.validationStart);
    const validationEnd = recovered.dates.indexOf(fold.validationEnd);
    if (trainStart < 0 || trainEnd < 0 || validationStart < 0 || validationEnd < 0) {
      throw new Error(`policy benchmark: fold ${fold.name} is outside the historical series`);
    }
    const trainDates = new Set(recovered.dates.slice(trainStart, trainEnd + 1));
    for (const date of recovered.dates.slice(validationStart, validationEnd + 1)) {
      if (trainDates.has(date)) overlaps.add(date);
    }
  }
  return {
    dates: recovered.dates,
    values: recovered.values,
    equity,
    bond,
    inputSha256: recovered.inputSha256,
    trainingValidationOverlap: [...overlaps].sort(),
    folds: FOLD_WINDOWS,
  };
}

export function buildAnnualBlocks(
  series: HistoricalSeries,
  startDate: string,
  endDate: string,
): AnnualBlock[] {
  const start = dateIndex(series, startDate);
  const end = dateIndex(series, endDate);
  if (start > end || (end - start + 1) % MONTHS_PER_YEAR !== 0) {
    throw new Error(`policy benchmark: annual range ${startDate}..${endDate} is not full years`);
  }
  const blocks: AnnualBlock[] = [];
  for (let index = start; index <= end; index += MONTHS_PER_YEAR) {
    const equity = series.equity.slice(index, index + MONTHS_PER_YEAR);
    const bond = series.bond.slice(index, index + MONTHS_PER_YEAR);
    let equityLevel = 1;
    let peak = 1;
    let drawdown = 0;
    for (const monthly of equity) {
      equityLevel *= 1 + monthly;
      peak = Math.max(peak, equityLevel);
      drawdown = Math.min(drawdown, equityLevel / peak - 1);
    }
    blocks.push({
      startDate: series.dates[index],
      equity,
      bond,
      annualEquityReturn: equity.reduce((value, monthly) => value * (1 + monthly), 1) - 1,
      annualBondReturn: bond.reduce((value, monthly) => value * (1 + monthly), 1) - 1,
      equityDrawdown: drawdown,
    });
  }
  return blocks;
}

export function buildValidationSegments(
  series: HistoricalSeries,
  startDate: string,
  endDate: string,
): ValidationSegment[] {
  const start = dateIndex(series, startDate);
  const end = dateIndex(series, endDate);
  const segments: ValidationSegment[] = [];
  for (let index = start; index + VALIDATION_BLOCK_MONTHS - 1 <= end; index += 1) {
    segments.push({
      startDate: series.dates[index],
      equity: series.equity.slice(index, index + VALIDATION_BLOCK_MONTHS),
      bond: series.bond.slice(index, index + VALIDATION_BLOCK_MONTHS),
    });
  }
  return segments;
}

export function annualAffineTransition(
  startWealth: number,
  equity: number,
  spending: number,
  equityReturns: readonly number[],
  bondReturns: readonly number[],
  essentialFloor = 4_000,
): AnnualTransition {
  if (equityReturns.length !== bondReturns.length) {
    throw new Error('policy benchmark: paired annual returns must have equal length');
  }
  let wealth = Math.max(0, startWealth);
  let fundedSpending = 0;
  let unpaidFloor = 0;
  let monthsAtFloor = 0;
  let monthsScheduledAtFloor = 0;
  let failureMonth: number | null = null;
  for (let month = 0; month < equityReturns.length; month += 1) {
    const grossReturn = 1 + equity * equityReturns[month] + (1 - equity) * bondReturns[month];
    wealth = wealth * grossReturn;
    const funded = Math.min(wealth, spending);
    wealth -= funded;
    fundedSpending += funded;
    if (spending === essentialFloor) monthsScheduledAtFloor += 1;
    if (funded < essentialFloor) {
      monthsAtFloor += 1;
      unpaidFloor += essentialFloor - funded;
      if (failureMonth === null) failureMonth = month;
    }
  }
  return {
    wealth: finite(wealth),
    fundedSpending: finite(fundedSpending),
    unpaidFloor: finite(unpaidFloor),
    floorBreach: unpaidFloor > 0,
    monthsAtFloor,
    monthsScheduledAtFloor,
    failureMonth,
  };
}

export function getPolicyActions(
  family: PolicyFamily,
  priorSpending = 5_000,
  spendingGrid = makeSpendingGrid(),
): PolicyAction[] {
  const equityGrid = family === 'freedom' ? makeEquityGrid(0, 1) : makeEquityGrid(0.3, 0.8);
  const allowedSpending = family === 'freedom'
    ? spendingGrid
    : spendingGrid.filter((spending) => {
        const low = Math.ceil((priorSpending * 0.9) / GRID_DOLLARS) * GRID_DOLLARS;
        const high = Math.floor((priorSpending * 1.1) / GRID_DOLLARS) * GRID_DOLLARS;
        return spending >= Math.max(spendingGrid[0], low) && spending <= Math.min(spendingGrid.at(-1), high);
      });
  const actions: PolicyAction[] = [];
  for (const equity of equityGrid) {
    for (const spending of allowedSpending) actions.push({ equity, spending });
  }
  return actions;
}

export function guardrailAction(
  priorSpending: number,
  cutTrigger: number,
  restoreTrigger: number,
  withdrawalRate: number,
  adjustmentSize = 0.05,
): number {
  if (restoreTrigger >= cutTrigger) throw new Error('policy benchmark: restore trigger must be below cut trigger');
  if (withdrawalRate >= cutTrigger) {
    return clamp(Math.ceil((priorSpending * (1 - adjustmentSize)) / GRID_DOLLARS) * GRID_DOLLARS, 4_000, 5_000);
  }
  if (withdrawalRate <= restoreTrigger) {
    return clamp(Math.floor((priorSpending * (1 + adjustmentSize)) / GRID_DOLLARS) * GRID_DOLLARS, 4_000, 5_000);
  }
  return priorSpending;
}

export function makeCommonBlockStarts(
  pathCount: number,
  drawsPerPath: number,
  choices: number,
  seed: number,
): number[][] {
  if (choices <= 0) throw new Error('policy benchmark: common-random-number choices must be positive');
  return Array.from({ length: pathCount }, (_, path) =>
    Array.from({ length: drawsPerPath }, (_, draw) => {
      const mixed = (seed + Math.imul(path + 1, 0x9e3779b9) + Math.imul(draw + 1, 0x85ebca6b)) >>> 0;
      return Math.min(Math.floor(streamHash(mixed) * choices), choices - 1);
    }),
  );
}

function standardized(value: number, mean: number, deviation: number): number {
  return deviation > 0 ? (value - mean) / deviation : 0;
}

export function compressTrainingBlocks(blocks: readonly AnnualBlock[], maxRepresentatives = Number.POSITIVE_INFINITY): CompressedCell[] {
  if (blocks.length === 0) return [];
  const metrics = blocks.map((block) => [block.annualEquityReturn, block.annualBondReturn, block.equityDrawdown] as const);
  const means = metrics[0].map((_, dimension) => metrics.reduce((sum, row) => sum + row[dimension], 0) / metrics.length);
  const deviations = metrics[0].map((_, dimension) => Math.sqrt(metrics.reduce((sum, row) => sum + (row[dimension] - means[dimension]) ** 2, 0) / metrics.length));
  const ranked = metrics[0].map((_, dimension) => metrics.map((row) => row[dimension]).sort((a, b) => a - b));
  const groups = new Map<string, number[]>();
  for (let index = 0; index < blocks.length; index += 1) {
    const equityBucket = Math.min(5, Math.floor((ranked[0].indexOf(metrics[index][0]) / Math.max(1, blocks.length - 1)) * 6));
    const bondBucket = Math.min(3, Math.floor((ranked[1].indexOf(metrics[index][1]) / Math.max(1, blocks.length - 1)) * 4));
    const key = `${equityBucket}:${bondBucket}`;
    const values = groups.get(key) ?? [];
    values.push(index);
    groups.set(key, values);
  }
  const compressed: CompressedCell[] = [];
  for (const [cell, indices] of groups) {
    const centroid = [0, 0, 0].map((_, dimension) => indices.reduce((sum, index) => sum + standardized(metrics[index][dimension], means[dimension], deviations[dimension]), 0) / indices.length);
    const selected = [...indices].sort((left, right) => {
      const distance = (index: number) => metrics[index].reduce((sum, value, dimension) => sum + (standardized(value, means[dimension], deviations[dimension]) - centroid[dimension]) ** 2, 0);
      const difference = distance(left) - distance(right);
      return Math.abs(difference) > 1e-14 ? difference : blocks[left].startDate.localeCompare(blocks[right].startDate);
    })[0];
    compressed.push({ ...blocks[selected], cell, weight: indices.length / blocks.length });
  }
  const selected = compressed.length <= maxRepresentatives
    ? compressed
    : [...compressed].sort((left, right) => right.weight - left.weight || left.cell.localeCompare(right.cell)).slice(0, maxRepresentatives);
  const totalWeight = selected.reduce((sum, cell) => sum + cell.weight, 0) || 1;
  return selected.map((cell) => ({ ...cell, weight: cell.weight / totalWeight })).sort((left, right) => left.cell.localeCompare(right.cell));
}

function nearestGridIndex(value: number, grid: readonly number[]): number {
  let best = 0;
  let distance = Infinity;
  for (let index = 0; index < grid.length; index += 1) {
    const nextDistance = Math.abs(grid[index] - value);
    if (nextDistance < distance) {
      best = index;
      distance = nextDistance;
    }
  }
  return best;
}

export function interpolateValue(values: Float64Array, wealth: number, grid: readonly number[], offset = 0, stride = 1): number {
  if (wealth <= grid[0]) return values[offset];
  if (wealth >= grid.at(-1)) return values[offset + (grid.length - 1) * stride];
  let upper = 1;
  while (upper < grid.length && grid[upper] < wealth) upper += 1;
  const lower = upper - 1;
  const ratio = (wealth - grid[lower]) / (grid[upper] - grid[lower]);
  return values[offset + lower * stride] * (1 - ratio) + values[offset + upper * stride] * ratio;
}

export function allocationBound(family: PolicyFamily, equity: number): boolean {
  return family === 'freedom' ? equity === 0 || equity === 1 : equity === 0.3 || equity === 0.8;
}

interface TransitionCache {
  actions: readonly PolicyAction[];
  actionIndexByKey: ReadonlyMap<string, number>;
  nextWealth: Float64Array;
  reward: Float64Array;
  breach: Uint8Array;
  actionCount: number;
  cellCount: number;
  wealthCount: number;
}

function transitionCacheIndex(action: number, cell: number, wealth: number, cellCount: number, wealthCount: number): number {
  return (action * cellCount + cell) * wealthCount + wealth;
}

function createTransitionCache(
  family: PolicyFamily,
  cells: readonly CompressedCell[],
  config: BenchmarkConfig,
): TransitionCache {
  const actionMap = new Map<string, PolicyAction>();
  for (const prior of config.spendingGrid) {
    for (const action of getPolicyActions(family, prior, config.spendingGrid)) actionMap.set(`${action.equity}|${action.spending}`, action);
  }
  const actions = [...actionMap.values()];
  const size = actions.length * cells.length * config.wealthGrid.length;
  const nextWealth = new Float64Array(size);
  const reward = new Float64Array(size);
  const breach = new Uint8Array(size);
  for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    const action = actions[actionIndex];
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const block = cells[cellIndex];
      for (let wealthIndex = 0; wealthIndex < config.wealthGrid.length; wealthIndex += 1) {
        const transition = annualAffineTransition(
          config.wealthGrid[wealthIndex], action.equity, action.spending,
          block.equity, block.bond, config.essentialFloor,
        );
        const index = transitionCacheIndex(actionIndex, cellIndex, wealthIndex, cells.length, config.wealthGrid.length);
        nextWealth[index] = transition.wealth;
        reward[index] = transition.fundedSpending - transition.unpaidFloor;
        breach[index] = transition.floorBreach ? 1 : 0;
      }
    }
  }
  const actionIndexByKey = new Map(actions.map((action, index) => [`${action.equity}|${action.spending}`, index] as const));
  return { actions, actionIndexByKey, nextWealth, reward, breach, actionCount: actions.length, cellCount: cells.length, wealthCount: config.wealthGrid.length };
}

interface TrainedPolicy {
  family: PolicyFamily;
  actions: readonly PolicyAction[];
  table: readonly Int16Array[];
  wealthGrid: readonly number[];
  spendingGrid: readonly number[];
  defaultAction: PolicyAction;
  rho: number;
  baseStateCount: number;
  firstBreachPenaltyApplications: number;
  repeatedBreachPenaltyApplications: number;
  initialValues: Float64Array;
}

function isAllowedAction(family: PolicyFamily, action: PolicyAction, priorSpending: number, spendingGrid: readonly number[]): boolean {
  if (family === 'freedom') return true;
  const low = Math.ceil((priorSpending * 0.9) / GRID_DOLLARS) * GRID_DOLLARS;
  const high = Math.floor((priorSpending * 1.1) / GRID_DOLLARS) * GRID_DOLLARS;
  return spendingGrid.includes(action.spending) && action.spending >= low && action.spending <= high;
}

function trainPolicy(
  family: PolicyFamily,
  cells: readonly CompressedCell[],
  config: BenchmarkConfig,
  rho: number,
  cache = createTransitionCache(family, cells, config),
): TrainedPolicy {
  const wealthCount = config.wealthGrid.length;
  const spendingCount = family === 'freedom' ? 1 : config.spendingGrid.length;
  const baseStateCount = wealthCount * spendingCount;
  const stateCount = baseStateCount * 2;
  let nextValues = new Float64Array(stateCount);
  let initialValues = new Float64Array(stateCount);
  const table: Int16Array[] = [];
  const defaultAction = getPolicyActions(family, config.priorSpending, config.spendingGrid)[0];
  let firstBreachPenaltyApplications = 0;
  let repeatedBreachPenaltyApplications = 0;
  const allowedActionIndices = Array.from({ length: spendingCount }, (_, priorIndex) => {
    const priorSpending = family === 'freedom' ? config.priorSpending : config.spendingGrid[priorIndex];
    return getPolicyActions(family, priorSpending, config.spendingGrid)
      .map((action) => cache.actionIndexByKey.get(`${action.equity}|${action.spending}`))
      .filter((index): index is number => index !== undefined);
  });
  for (let year = config.horizonYears - 1; year >= 0; year -= 1) {
    const values = new Float64Array(stateCount);
    const decisions = new Int16Array(stateCount);
    for (let breachedState = 0; breachedState <= 1; breachedState += 1) {
      for (let priorIndex = 0; priorIndex < spendingCount; priorIndex += 1) {
        const priorSpending = family === 'freedom' ? config.priorSpending : config.spendingGrid[priorIndex];
        for (let wealthIndex = 0; wealthIndex < wealthCount; wealthIndex += 1) {
          let bestValue = -Infinity;
          let bestActionIndex = 0;
          for (const actionIndex of allowedActionIndices[priorIndex]) {
            const action = cache.actions[actionIndex];
            if (!isAllowedAction(family, action, priorSpending, config.spendingGrid)) continue;
            let value = 0;
            for (let cellIndex = 0; cellIndex < cache.cellCount; cellIndex += 1) {
              const index = transitionCacheIndex(actionIndex, cellIndex, wealthIndex, cache.cellCount, cache.wealthCount);
              const nextWealth = cache.nextWealth[index];
              const breachedNext = breachedState === 1 || cache.breach[index] === 1;
              const nextPriorIndex = family === 'freedom' ? 0 : nearestGridIndex(action.spending, config.spendingGrid);
              const futureOffset = (breachedNext ? baseStateCount : 0) + nextPriorIndex * wealthCount;
              const penalty = breachedState === 0 && cache.breach[index] === 1 ? rho : 0;
              if (penalty > 0) firstBreachPenaltyApplications += 1;
              value += cells[cellIndex].weight * (
                cache.reward[index] - penalty +
                interpolateValue(nextValues, nextWealth, config.wealthGrid, futureOffset, 1)
              );
            }
            if (value > bestValue) {
              bestValue = value;
              bestActionIndex = actionIndex;
            }
          }
          const stateIndex = breachedState * baseStateCount + priorIndex * wealthCount + wealthIndex;
          values[stateIndex] = finite(bestValue, 0);
          decisions[stateIndex] = bestActionIndex;
        }
      }
    }
    table[year] = decisions;
    if (year === 0) initialValues = values;
    nextValues = values;
  }
  return {
    family,
    actions: cache.actions,
    table,
    wealthGrid: config.wealthGrid,
    spendingGrid: config.spendingGrid,
    defaultAction,
    rho,
    baseStateCount,
    firstBreachPenaltyApplications,
    repeatedBreachPenaltyApplications,
    initialValues,
  };
}

export function solveDynamicPolicy(
  family: PolicyFamily,
  cells: readonly CompressedCell[],
  config: BenchmarkConfig,
  rho: number,
): DynamicPolicyResult {
  const policy = trainPolicy(family, cells, config, rho);
  return {
    policy: policySnapshot(policy),
    penaltyModel: 'absorbing-any-breach',
    firstBreachPenaltyApplications: policy.firstBreachPenaltyApplications,
    repeatedBreachPenaltyApplications: policy.repeatedBreachPenaltyApplications,
    valueAtStart: policyAction(policy, 0, config.startingWealth[0] ?? 0, config.priorSpending, false).spending,
  };
}

function policyAction(policy: TrainedPolicy, year: number, wealth: number, priorSpending: number, breached = false): PolicyAction {
  const wealthIndex = nearestGridIndex(clamp(wealth, 0, policy.wealthGrid.at(-1)), policy.wealthGrid);
  const priorIndex = policy.family === 'freedom' ? 0 : nearestGridIndex(priorSpending, policy.spendingGrid);
  const stateIndex = (breached ? policy.baseStateCount : 0) + priorIndex * policy.wealthGrid.length + wealthIndex;
  const actionIndex = policy.table[Math.min(year, policy.table.length - 1)][stateIndex];
  return policy.actions[actionIndex] ?? policy.defaultAction;
}

function annualReturnsForTraining(blocks: readonly AnnualBlock[], starts: readonly number[], path: number, year: number): AnnualBlock {
  return blocks[starts[path][year] % blocks.length];
}

function annualReturnsForValidation(segments: readonly ValidationSegment[], starts: readonly number[], path: number, year: number): { equity: number[]; bond: number[] } {
  const segment = segments[starts[path][Math.floor((year * MONTHS_PER_YEAR) / VALIDATION_BLOCK_MONTHS)] % segments.length];
  const offset = (year * MONTHS_PER_YEAR) % VALIDATION_BLOCK_MONTHS;
  return {
    equity: segment.equity.slice(offset, offset + MONTHS_PER_YEAR),
    bond: segment.bond.slice(offset, offset + MONTHS_PER_YEAR),
  };
}

function simulatePath(
  family: PolicyFamily,
  policy: TrainedPolicy | CounterpartSpec,
  startWealth: number,
  path: number,
  horizonYears: number,
  config: BenchmarkConfig,
  source: { kind: 'training'; blocks: readonly AnnualBlock[]; starts: readonly number[][] } | { kind: 'validation'; segments: readonly ValidationSegment[]; starts: readonly number[][] },
): PathOutcome {
  let wealth = startWealth;
  let priorSpending = config.priorSpending;
  let fundedLifetimeSpending = 0;
  let unpaidFloorObligations = 0;
  let floorBreach = false;
  let failureMonth: number | null = null;
  let yearsAtFloor = 0;
  let spendingAdjustments = 0;
  let equityExposure = 0;
  let turnover = 0;
  let timeAtAllocationBounds = 0;
  let previousEquity = priorSpending === config.priorSpending ? 0.6 : 0.6;
  for (let year = 0; year < horizonYears; year += 1) {
    const returns = source.kind === 'training'
      ? annualReturnsForTraining(source.blocks, source.starts, path, year)
      : annualReturnsForValidation(source.segments, source.starts, path, year);
    const action = 'family' in policy
      ? policyAction(policy, year, wealth, priorSpending, floorBreach)
      : counterpartAction(policy, wealth, priorSpending, family);
    const transition = annualAffineTransition(wealth, action.equity, action.spending, returns.equity, returns.bond, config.essentialFloor);
    fundedLifetimeSpending += transition.fundedSpending;
    unpaidFloorObligations += transition.unpaidFloor;
    floorBreach ||= transition.floorBreach;
    yearsAtFloor += transition.monthsScheduledAtFloor / MONTHS_PER_YEAR;
    if (failureMonth === null && transition.failureMonth !== null) failureMonth = year * MONTHS_PER_YEAR + transition.failureMonth;
    if (action.spending !== priorSpending) spendingAdjustments += 1;
    equityExposure += action.equity;
    turnover += Math.abs(action.equity - previousEquity);
    if (allocationBound(family, action.equity)) timeAtAllocationBounds += 1;
    previousEquity = action.equity;
    priorSpending = action.spending;
    wealth = transition.wealth;
  }
  return {
    fundedLifetimeSpending: finite(fundedLifetimeSpending),
    unpaidFloorObligations: finite(unpaidFloorObligations),
    floorBreach,
    terminalWealth: finite(wealth),
    failureMonth,
    yearsAtFloor: finite(yearsAtFloor),
    spendingAdjustments,
    equityExposure: finite(equityExposure / horizonYears),
    turnover: finite(turnover / horizonYears),
    timeAtAllocationBounds: finite(timeAtAllocationBounds / horizonYears),
  };
}

function counterpartAction(spec: CounterpartSpec, wealth: number, priorSpending: number, family: PolicyFamily): PolicyAction {
  if (spec.kind === 'fixed') return { equity: spec.equity, spending: spec.spending };
  const withdrawalRate = wealth > 0 ? (priorSpending * MONTHS_PER_YEAR) / wealth : Infinity;
  return {
    equity: spec.equity,
    spending: guardrailAction(priorSpending, spec.cutTrigger, spec.restoreTrigger, withdrawalRate, spec.adjustmentSize),
  };
}

export function summarizeOutcomes(outcomes: readonly PathOutcome[]): OutcomeSummary {
  const spending = outcomes.map((outcome) => outcome.fundedLifetimeSpending).sort((a, b) => a - b);
  const terminal = outcomes.map((outcome) => outcome.terminalWealth).sort((a, b) => a - b);
  const tailCount = Math.max(1, Math.ceil(outcomes.length * 0.05));
  const worst = [...outcomes].sort((left, right) => right.unpaidFloorObligations - left.unpaidFloorObligations).slice(0, tailCount);
  const mean = (values: readonly number[]) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  const failures = outcomes.filter((outcome) => outcome.failureMonth !== null).map((outcome) => outcome.failureMonth);
  return {
    pathCount: outcomes.length,
    meanFundedLifetimeSpending: mean(spending),
    medianFundedLifetimeSpending: quantile(spending, 0.5),
    p10FundedLifetimeSpending: quantile(spending, 0.1),
    floorBreachProbability: outcomes.length === 0 ? 0 : outcomes.filter((outcome) => outcome.floorBreach).length / outcomes.length,
    severeTailShortfall: mean(worst.map((outcome) => outcome.unpaidFloorObligations)),
    meanTerminalWealth: mean(terminal),
    medianTerminalWealth: quantile(terminal, 0.5),
    meanFailureMonth: failures.length === 0 ? null : mean(failures),
    meanYearsAtFloor: mean(outcomes.map((outcome) => outcome.yearsAtFloor)),
    meanSpendingAdjustments: mean(outcomes.map((outcome) => outcome.spendingAdjustments)),
    meanEquityExposure: mean(outcomes.map((outcome) => outcome.equityExposure)),
    meanTurnover: mean(outcomes.map((outcome) => outcome.turnover)),
    meanTimeAtAllocationBounds: mean(outcomes.map((outcome) => outcome.timeAtAllocationBounds)),
  };
}

export function evaluateSevereTail(outcomes: readonly PathOutcome[]): number {
  return summarizeOutcomes(outcomes).severeTailShortfall;
}

export interface BootstrapOptions {
  resamples: number;
  seed: number;
  riskThreshold?: number;
  indices?: readonly (readonly number[])[];
}

function bootstrapIndexRow(pathCount: number, sample: number, seed: number): Uint32Array {
  const row = new Uint32Array(pathCount);
  for (let index = 0; index < pathCount; index += 1) {
    const random = streamHash((seed + Math.imul(sample + 1, 0x9e3779b9) + Math.imul(index + 1, 0x85ebca6b)) >>> 0);
    row[index] = Math.min(pathCount - 1, Math.floor(random * pathCount));
  }
  return row;
}

export function makeBootstrapIndexRows(pathCount: number, resamples: number, seed: number): Uint32Array[] {
  return Array.from({ length: Math.max(0, resamples) }, (_, sample) => bootstrapIndexRow(pathCount, sample, seed));
}

export function makeBootstrapIndices(pathCount: number, resamples: number, seed: number): number[][] {
  return makeBootstrapIndexRows(pathCount, resamples, seed).map((row) => [...row]);
}

interface BootstrapColumn {
  spending: Float64Array;
  unpaidFloor: Float64Array;
  breach: Uint8Array;
  tailOrder: number[];
}

function prepareBootstrapColumn(outcomes: readonly PathOutcome[]): BootstrapColumn {
  const spending = new Float64Array(outcomes.length);
  const unpaidFloor = new Float64Array(outcomes.length);
  const breach = new Uint8Array(outcomes.length);
  for (let index = 0; index < outcomes.length; index += 1) {
    spending[index] = outcomes[index].fundedLifetimeSpending;
    unpaidFloor[index] = outcomes[index].unpaidFloorObligations;
    breach[index] = outcomes[index].floorBreach ? 1 : 0;
  }
  return { spending, unpaidFloor, breach, tailOrder: Array.from({ length: outcomes.length }, (_, index) => index).sort((left, right) => unpaidFloor[right] - unpaidFloor[left] || right - left) };
}

function weightedTail(column: BootstrapColumn, counts: Uint32Array, sampleCount: number): number {
  let remaining = Math.max(1, Math.ceil(sampleCount * 0.05));
  let total = 0;
  for (const index of column.tailOrder) {
    const take = Math.min(remaining, counts[index]);
    total += column.unpaidFloor[index] * take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  return total / Math.max(1, Math.ceil(sampleCount * 0.05));
}

function aggregateBootstrapMetrics(
  optimized: BootstrapColumn,
  counterpart: BootstrapColumn,
  indices: readonly number[],
  counts: Uint32Array,
): { spending: number; tail: number; risk: number } {
  counts.fill(0);
  let optimizedSpending = 0;
  let counterpartSpending = 0;
  let risk = 0;
  for (const index of indices) {
    const safeIndex = Math.max(0, Math.min(index, optimized.spending.length - 1));
    counts[safeIndex] += 1;
    optimizedSpending += optimized.spending[safeIndex];
    counterpartSpending += counterpart.spending[safeIndex];
    risk += optimized.breach[safeIndex] - counterpart.breach[safeIndex];
  }
  optimizedSpending /= Math.max(1, indices.length);
  counterpartSpending /= Math.max(1, indices.length);
  const optimizedTail = weightedTail(optimized, counts, indices.length);
  const counterpartTail = weightedTail(counterpart, counts, indices.length);
  return {
    spending: (optimizedSpending - counterpartSpending) / Math.max(1, Math.abs(counterpartSpending)),
    tail: (counterpartTail - optimizedTail) / Math.max(1, Math.abs(counterpartTail)),
    risk: risk / Math.max(1, indices.length),
  };
}

export function pairedBootstrapMetrics(
  optimized: readonly PathOutcome[],
  counterpart: readonly PathOutcome[],
  options: BootstrapOptions,
): PairedResult {
  const pathCount = Math.min(optimized.length, counterpart.length);
  if (pathCount === 0) {
    return {
      fundedSpendingGain: { estimate: 0, lower: 0, upper: 0 },
      tailShortfallReduction: { estimate: 0, lower: 0, upper: 0 },
      breachProbabilityDifference: { estimate: 0, lower: 0, upper: 0 },
      pointRiskDifference: 0,
      pointRiskMatched: true,
      matchedRisk: true,
      winningPointEstimate: 'tie',
    };
  }
  const optimizedColumn = prepareBootstrapColumn(optimized.slice(0, pathCount));
  const counterpartColumn = prepareBootstrapColumn(counterpart.slice(0, pathCount));
  const counts = new Uint32Array(pathCount);
  const fullIndices = Array.from({ length: pathCount }, (_, index) => index);
  const estimate = aggregateBootstrapMetrics(optimizedColumn, counterpartColumn, fullIndices, counts);
  const samples = options.indices
    ? options.indices.map((indices) => aggregateBootstrapMetrics(optimizedColumn, counterpartColumn, indices, counts))
    : makeBootstrapIndexRows(pathCount, options.resamples, options.seed).map((indices) => aggregateBootstrapMetrics(optimizedColumn, counterpartColumn, indices, counts));
  const interval = (values: readonly number[], point: number): PairedInterval => options.resamples <= 0 || values.length === 0
    ? { estimate: point, lower: point, upper: point }
    : { estimate: point, lower: quantile(values, 0.025), upper: quantile(values, 0.975) };
  const riskThreshold = options.riskThreshold ?? 0.01;
  return {
    fundedSpendingGain: interval(samples.map((sample) => sample.spending), estimate.spending),
    tailShortfallReduction: interval(samples.map((sample) => sample.tail), estimate.tail),
    breachProbabilityDifference: interval(samples.map((sample) => sample.risk), estimate.risk),
    pointRiskDifference: estimate.risk,
    pointRiskMatched: Math.abs(estimate.risk) <= 0.005,
    matchedRisk: options.resamples <= 0
      ? Math.abs(estimate.risk) <= riskThreshold
      : interval(samples.map((sample) => sample.risk), estimate.risk).lower >= -riskThreshold && interval(samples.map((sample) => sample.risk), estimate.risk).upper <= riskThreshold,
    winningPointEstimate: estimate.spending > 0 || estimate.tail > 0 ? 'optimized' : estimate.spending < 0 || estimate.tail < 0 ? 'counterpart' : 'tie',
  };
}

export interface FrozenPairCandidate {
  rho: number;
  policyId: string;
  risk: number;
  counterpartId: string;
}

export function chooseFrozenPair(
  candidates: readonly FrozenPairCandidate[],
  counterpartRisk: number,
): FrozenPairCandidate {
  const matched = candidates
    .filter((candidate) => Math.abs(candidate.risk - counterpartRisk) <= 0.005)
    .sort((left, right) => Math.abs(left.risk - counterpartRisk) - Math.abs(right.risk - counterpartRisk) || left.rho - right.rho);
  return matched[0] ?? [...candidates].sort((left, right) => Math.abs(left.risk - counterpartRisk) - Math.abs(right.risk - counterpartRisk) || left.rho - right.rho)[0];
}

interface PooledBootstrapPair {
  folds: readonly {
    optimized: readonly PathOutcome[];
    counterpart: readonly PathOutcome[];
  }[];
}

function pooledRawMetrics(
  columns: readonly { optimized: BootstrapColumn; counterpart: BootstrapColumn; counts: Uint32Array; sampleCount: number }[],
): { spending: number; tail: number; risk: number } {
  let optimizedSpending = 0;
  let counterpartSpending = 0;
  let optimizedTail = 0;
  let counterpartTail = 0;
  let risk = 0;
  let totalCount = 0;
  for (const fold of columns) {
    totalCount += fold.sampleCount;
    for (let index = 0; index < fold.sampleCount; index += 1) {
      const count = fold.counts[index];
      optimizedSpending += fold.optimized.spending[index] * count;
      counterpartSpending += fold.counterpart.spending[index] * count;
      risk += (fold.optimized.breach[index] - fold.counterpart.breach[index]) * count;
    }
    optimizedTail += weightedTail(fold.optimized, fold.counts, fold.sampleCount) * fold.sampleCount;
    counterpartTail += weightedTail(fold.counterpart, fold.counts, fold.sampleCount) * fold.sampleCount;
  }
  const denominator = Math.max(1, totalCount);
  optimizedSpending /= denominator;
  counterpartSpending /= denominator;
  optimizedTail /= denominator;
  counterpartTail /= denominator;
  return {
    spending: (optimizedSpending - counterpartSpending) / Math.max(1, Math.abs(counterpartSpending)),
    tail: (counterpartTail - optimizedTail) / Math.max(1, Math.abs(counterpartTail)),
    risk: risk / denominator,
  };
}

export function pooledBootstrapMetrics(
  pairs: readonly PooledBootstrapPair[],
  options: { resamples: number; seed: number; riskThreshold?: number },
): { metrics: PairedResult[]; drawCount: number } {
  if (pairs.length === 0) return { metrics: [], drawCount: 0 };
  const foldCount = Math.max(...pairs.map((pair) => pair.folds.length));
  const prepared = pairs.map((pair) => pair.folds.map((fold) => {
    const pathCount = Math.min(fold.optimized.length, fold.counterpart.length);
    return {
      optimized: prepareBootstrapColumn(fold.optimized.slice(0, pathCount)),
      counterpart: prepareBootstrapColumn(fold.counterpart.slice(0, pathCount)),
      pathCount,
    };
  }));
  const countsByFold = Array.from({ length: foldCount }, (_, foldIndex) => new Uint32Array(prepared[0]?.[foldIndex]?.pathCount ?? 0));
  const pointColumns = prepared[0].map((fold, foldIndex) => ({
    optimized: fold.optimized,
    counterpart: fold.counterpart,
    counts: Uint32Array.from({ length: fold.pathCount }, () => 1),
    sampleCount: fold.pathCount,
  }));
  const point = pairs.map((_, pairIndex) => pooledRawMetrics(prepared[pairIndex].map((fold, foldIndex) => ({
    optimized: fold.optimized,
    counterpart: fold.counterpart,
    counts: pointColumns[foldIndex]?.counts ?? new Uint32Array(fold.pathCount),
    sampleCount: fold.pathCount,
  }))));
  const samples = pairs.map(() => ({ spending: [] as number[], tail: [] as number[], risk: [] as number[] }));
  let drawCount = 0;
  for (let sample = 0; sample < Math.max(0, options.resamples); sample += 1) {
    for (let foldIndex = 0; foldIndex < foldCount; foldIndex += 1) {
      const counts = countsByFold[foldIndex];
      counts.fill(0);
      const pathCount = counts.length;
      for (let draw = 0; draw < pathCount; draw += 1) {
        const random = streamHash((options.seed + Math.imul(sample + 1, 0x9e3779b9) + Math.imul(foldIndex + 1, 0x85ebca6b) + Math.imul(draw + 1, 0xc2b2ae35)) >>> 0);
        counts[Math.min(pathCount - 1, Math.floor(random * pathCount))] += 1;
      }
      drawCount += pathCount;
    }
    for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
      const raw = pooledRawMetrics(prepared[pairIndex].map((fold, foldIndex) => ({
        optimized: fold.optimized,
        counterpart: fold.counterpart,
        counts: countsByFold[foldIndex] ?? new Uint32Array(fold.pathCount),
        sampleCount: fold.pathCount,
      })));
      samples[pairIndex].spending.push(raw.spending);
      samples[pairIndex].tail.push(raw.tail);
      samples[pairIndex].risk.push(raw.risk);
    }
  }
  const interval = (values: readonly number[], estimate: number): PairedInterval => options.resamples <= 0 || values.length === 0
    ? { estimate, lower: estimate, upper: estimate }
    : { estimate, lower: quantile(values, 0.025), upper: quantile(values, 0.975) };
  const riskThreshold = options.riskThreshold ?? 0.01;
  return {
    drawCount,
    metrics: point.map((estimate, index) => {
      const sample = samples[index];
      const riskInterval = interval(sample.risk, estimate.risk);
      return {
        fundedSpendingGain: interval(sample.spending, estimate.spending),
        tailShortfallReduction: interval(sample.tail, estimate.tail),
        breachProbabilityDifference: riskInterval,
        pointRiskDifference: estimate.risk,
        pointRiskMatched: Math.abs(estimate.risk) <= 0.005,
        matchedRisk: options.resamples <= 0
          ? Math.abs(estimate.risk) <= riskThreshold
          : riskInterval.lower >= -riskThreshold && riskInterval.upper <= riskThreshold,
        winningPointEstimate: estimate.spending > 0 || estimate.tail > 0 ? 'optimized' : estimate.spending < 0 || estimate.tail < 0 ? 'counterpart' : 'tie',
      };
    }),
  };
}

function pairedResult(
  optimized: readonly PathOutcome[],
  counterpart: readonly PathOutcome[],
  config: BenchmarkConfig,
  seedOffset: number,
  riskThreshold = 0.01,
  indices?: readonly (readonly number[])[],
  resamples = config.bootstrapResamples,
): PairedResult {
  return pairedBootstrapMetrics(optimized, counterpart, {
    resamples,
    seed: config.bootstrapSeed + seedOffset,
    riskThreshold,
    indices,
  });
}

export interface VerdictInputs {
  matchedRisk: boolean;
  runtimeOk: boolean;
  integrityOk: boolean;
  sensitivityOk: boolean;
  spendingGainCiLow: number;
  tailReductionCiLow: number;
  spendingDeltaCiLow: number;
}

export function assessVerdict(inputs: VerdictInputs): Verdict {
  if (!inputs.matchedRisk || !inputs.runtimeOk || !inputs.integrityOk || !inputs.sensitivityOk) return 'inconclusive';
  const spendingMaterial = inputs.spendingGainCiLow >= 0.05 && inputs.tailReductionCiLow >= -0.05;
  const tailMaterial = inputs.tailReductionCiLow >= 0.2 && inputs.spendingDeltaCiLow >= -0.02;
  return spendingMaterial || tailMaterial ? 'pass' : 'stop';
}

export function buildCounterpartCandidates(family: PolicyFamily, config: BenchmarkConfig): CounterpartSpec[] {
  const equity = family === 'freedom' ? config.freedomEquityGrid : config.implementableEquityGrid;
  const candidateSpending = family === 'implementable'
    ? config.spendingGrid.filter((spending) => spending >= 4_500 && spending <= 5_000)
    : config.spendingGrid;
  const candidates: CounterpartSpec[] = [];
  for (const allocation of equity) {
    for (const spending of candidateSpending) candidates.push({ kind: 'fixed', equity: allocation, spending });
  }
  const adjustments = family === 'freedom' ? [0.05, 0.1, 0.2] : [0.05, 0.1];
  for (const allocation of equity) {
    for (const cutTrigger of [0.05, 0.06, 0.07, 0.08]) {
      for (const restoreTrigger of [0.03, 0.04, 0.05]) {
        if (restoreTrigger >= cutTrigger) continue;
        for (const adjustmentSize of adjustments) {
          candidates.push({ kind: 'guardrail', equity: allocation, spending: config.targetSpending, cutTrigger, restoreTrigger, adjustmentSize });
        }
      }
    }
  }
  return candidates;
}

export function buildCounterpartEnvelope(
  family: PolicyFamily,
  blocks: readonly AnnualBlock[],
  starts: readonly number[][],
  wealth: number,
  config: BenchmarkConfig,
  rho: number,
  optimizedTraining?: readonly PathOutcome[],
): { selected: CounterpartSpec; points: CounterpartPoint[] } {
  const candidates = buildCounterpartCandidates(family, config);
  const pathCount = starts.length;
  const points: CounterpartPoint[] = [];
  for (const candidate of candidates) {
    const outcomes: PathOutcome[] = [];
    for (let path = 0; path < pathCount; path += 1) {
      outcomes.push(simulatePath(family, candidate, wealth, path, config.horizonYears, config, { kind: 'training', blocks, starts }));
    }
    const summary = summarizeOutcomes(outcomes);
    const optimizedRisk = optimizedTraining && optimizedTraining.length > 0
      ? summarizeOutcomes(optimizedTraining.slice(0, pathCount)).floorBreachProbability
      : summary.floorBreachProbability;
    points.push({
      spec: candidate,
      training: summary,
      objective: summary.meanFundedLifetimeSpending - summary.severeTailShortfall - rho * summary.floorBreachProbability,
      pointRiskMatched: Math.abs(summary.floorBreachProbability - optimizedRisk) <= 0.005,
      nondominated: false,
    });
  }
  for (const point of points) {
    point.nondominated = !points.some((other) => other !== point &&
      other.training.meanFundedLifetimeSpending >= point.training.meanFundedLifetimeSpending &&
      other.training.floorBreachProbability <= point.training.floorBreachProbability &&
      other.training.severeTailShortfall <= point.training.severeTailShortfall &&
      (other.training.meanFundedLifetimeSpending > point.training.meanFundedLifetimeSpending ||
        other.training.floorBreachProbability < point.training.floorBreachProbability ||
        other.training.severeTailShortfall < point.training.severeTailShortfall));
  }
  const eligible = points.filter((point) => point.nondominated && point.pointRiskMatched);
  const fallback = points.filter((point) => point.nondominated);
  const selected = [...(eligible.length > 0 ? eligible : fallback)].sort((left, right) => right.objective - left.objective || JSON.stringify(left.spec).localeCompare(JSON.stringify(right.spec)))[0] ?? points[0];
  return { selected: selected.spec, points };
}

function selectCounterpart(
  family: PolicyFamily,
  blocks: readonly AnnualBlock[],
  starts: readonly number[][],
  wealth: number,
  config: BenchmarkConfig,
  rho: number,
  optimizedTraining?: readonly PathOutcome[],
): { selected: CounterpartSpec; points: CounterpartPoint[] } {
  return buildCounterpartEnvelope(family, blocks, starts, wealth, config, rho, optimizedTraining);
}

function policySnapshot(policy: TrainedPolicy, identity = `${policy.family}:rho=${policy.rho}`, fold = 'sample'): PolicySnapshot {
  const years = [...new Set([0, Math.floor(policy.table.length / 2), Math.max(0, policy.table.length - 1)])];
  const wealthIndices = [...new Set([0, Math.floor(policy.wealthGrid.length / 2), Math.max(0, policy.wealthGrid.length - 1)])];
  const priorIndices = policy.family === 'freedom'
    ? [0]
    : [...new Set([0, Math.floor(policy.spendingGrid.length / 2), Math.max(0, policy.spendingGrid.length - 1)])];
  const stateActionMap: PolicyMapEntry[] = [];
  for (const year of years) {
    for (const breached of [false, true]) {
      for (const priorIndex of priorIndices) {
        for (const wealthIndex of wealthIndices) {
          const stateIndex = (breached ? policy.baseStateCount : 0) + priorIndex * policy.wealthGrid.length + wealthIndex;
          const action = policy.actions[policy.table[year][stateIndex]] ?? policy.defaultAction;
          stateActionMap.push({
            family: policy.family,
            fold,
            rho: policy.rho,
            year,
            breached,
            wealthIndex,
            wealth: policy.wealthGrid[wealthIndex],
            priorSpending: policy.spendingGrid[priorIndex],
            action,
            spendingAction: action.spending,
            equityAction: action.equity,
          });
        }
      }
    }
  }
  return {
    family: policy.family,
    rho: policy.rho,
    horizonYears: policy.table.length,
    defaultAction: policy.defaultAction,
    actionCount: policy.actions.length,
    identity,
    stateActionMap,
  };
}

function makeTrainingOutcomes(
  policy: TrainedPolicy | CounterpartSpec,
  family: PolicyFamily,
  wealth: number,
  blocks: readonly AnnualBlock[],
  starts: readonly number[][],
  config: BenchmarkConfig,
): PathOutcome[] {
  return Array.from({ length: starts.length }, (_, path) => simulatePath(family, policy, wealth, path, config.horizonYears, config, { kind: 'training', blocks, starts }));
}

function makeValidationOutcomes(
  policy: TrainedPolicy | CounterpartSpec,
  family: PolicyFamily,
  wealth: number,
  segments: readonly ValidationSegment[],
  starts: readonly number[][],
  config: BenchmarkConfig,
): PathOutcome[] {
  return Array.from({ length: starts.length }, (_, path) => simulatePath(family, policy, wealth, path, config.horizonYears, config, { kind: 'validation', segments, starts }));
}

export function simulatePolicyPair(
  family: PolicyFamily,
  left: CounterpartSpec,
  right: CounterpartSpec,
  wealth: number,
  blocks: readonly AnnualBlock[],
  starts: readonly (readonly number[])[],
  config: BenchmarkConfig,
): { left: { pathIds: number[]; outcomes: PathOutcome[] }; right: { pathIds: number[]; outcomes: PathOutcome[] } } {
  const pathIds = starts.map((_, path) => path);
  const outcomes = (policy: CounterpartSpec) => pathIds.map((path) => simulatePath(family, policy, wealth, path, config.horizonYears, config, { kind: 'training', blocks, starts }));
  return { left: { pathIds, outcomes: outcomes(left) }, right: { pathIds: [...pathIds], outcomes: outcomes(right) } };
}

function combineOutcomes(results: readonly PathOutcome[][]): PathOutcome[] {
  return results.flat();
}

function frontierVerdict(
  family: PolicyFamily,
  foldResults: readonly FrontierFoldResult[],
  preview: boolean,
  runtimeOk = true,
  integrityOk = true,
  sensitivityOk = true,
  pooled?: PairedResult,
): Verdict {
  if (preview) return 'inconclusive';
  const paired = pooled ?? foldResults[0]?.validation.paired;
  if (!paired) return 'inconclusive';
  const stable = paired.winningPointEstimate !== 'counterpart';
  return assessVerdict({
    matchedRisk: foldResults.every((fold) => fold.train.paired.pointRiskMatched) && paired.matchedRisk,
    runtimeOk,
    integrityOk,
    sensitivityOk: sensitivityOk && stable,
    spendingGainCiLow: paired.fundedSpendingGain.lower,
    tailReductionCiLow: paired.tailShortfallReduction.lower,
    spendingDeltaCiLow: paired.fundedSpendingGain.lower,
  });
}

export function aggregateVerdicts(items: readonly Pick<FrontierResult, 'rho' | 'startingWealth' | 'verdict'>[], mode: 'preview' | 'full' = 'full'): Verdict {
  if (mode === 'preview') return 'inconclusive';
  if (items.filter((item) => item.verdict === 'pass').length >= 2) return 'pass';
  return items.some((item) => item.verdict === 'inconclusive') ? 'inconclusive' : 'stop';
}

interface PreparedFold {
  fold: FoldWindow;
  blocks: readonly AnnualBlock[];
  segments: readonly ValidationSegment[];
  trainingStarts: readonly (readonly number[])[];
  validationStarts: readonly (readonly number[])[];
  cells: readonly CompressedCell[];
  cache: TransitionCache;
}

/*

    previewBanner: config.mode === 'preview' ? 'PREVIEW — NO VERDICT' : 'FULL CROSS-FIT BENCHMARK',
    verdicts: { mathematical: aggregateVerdict(mathematical), implementable: aggregateVerdict(implementable) },
    config,
    inputSha256: series.inputSha256,
    gitSha: config.gitSha ?? 'unknown',
    runtimeMs: Date.now() - started,
    folds: series.folds,
    frontiers,
    limitations: [
      'Cross-fit is not an external never-touched dataset.',
      'Bootstrap confidence intervals are conditional on two historical eras.',
      'Thirty-six-month validation blocks miss longer dependence.',
      'Mathematical freedom is not advice.',
      'Implementable policy ignores taxes, costs, RMDs, cash flows, mortality, and allocation-change limits.',
      'No consumption-smoothing utility is modeled.',
    ],
    seeds: { training: config.trainingSeeds, validation: config.validationSeeds, bootstrap: config.bootstrapSeed },
    grids: {
      spending: config.spendingGrid,
      freedomEquity: config.freedomEquityGrid,
      implementableEquity: config.implementableEquityGrid,
      wealth: config.wealthGrid,
    },
  };
  return report;
}

              optimized: summarizeOutcomes(trainOptimized),
              counterpart: summarizeOutcomes(trainCounterpart),
              paired: pairedResult(trainOptimized, trainCounterpart, config, foldIndex * 100 + wealth / 1000, 0.005),
            },
            validation: {
              optimized: summarizeOutcomes(validationOptimized),
              counterpart: summarizeOutcomes(validationCounterpart),
              paired: pairedResult(validationOptimized, validationCounterpart, config, foldIndex * 100 + 50 + wealth / 1000, 0.01),
            },
          };
          perWealth.set(wealth, foldResult);
          const foldSelections = selectedByWealth.get(wealth) ?? [];
          foldSelections.push({
            fold: prepared.fold.name,
            policy: policySnapshot(policy, `${family}|${prepared.fold.name}|rho=${rho}|wealth=${wealth}`),
            counterpart,
            counterpartEnvelope: envelope.points,
            trainingRiskMatched: foldResult.train.paired.pointRiskMatched,
          });
          selectedByWealth.set(wealth, foldSelections);
          envelopeByWealth.set(wealth, [...(envelopeByWealth.get(wealth) ?? []), ...envelope.points]);
        }
        for (const [wealth, result] of perWealth) {
          const results = foldResultsByWealth.get(wealth) ?? [];
          results.push(result);
          foldResultsByWealth.set(wealth, results);
        }
      }
      for (const wealth of config.startingWealth) {
        const foldResults = foldResultsByWealth.get(wealth) ?? [];
        const selectedByFold = selectedByWealth.get(wealth) ?? [];
        const policy = selectedByFold[0]?.policy ?? policySnapshot(trainPolicy(family, preparedFolds[0].cells, config, rho, preparedFolds[0].cache));
        const counterpart = selectedByFold[0]?.counterpart ?? { kind: 'fixed', equity: 0.6, spending: config.targetSpending };
        frontiers.push({
          family,
          rho,
          startingWealth: wealth,
          verdict: frontierVerdict(family, foldResults, config.mode === 'preview'),
          foldResults,
          optimizedPolicy: policy,
          counterpartPolicy: counterpart,
          selectedByFold,
          counterpartEnvelope: envelopeByWealth.get(wealth) ?? [],
          feasibleActions: getPolicyActions(family, config.priorSpending, config.spendingGrid),
          learnedActionMap: policy.stateActionMap,
          trainingRiskMatched: selectedByFold.every((selection) => selection.trainingRiskMatched),
        });
      }
    }
  }

  const runtimeMs = Date.now() - started;
  const runtimeOk = runtimeMs <= 600_000;
  const inputDigestMatches = series.inputSha256 === recoverHistoricalSeries().inputSha256;
  const zeroTrainValidationOverlap = series.trainingValidationOverlap.length === 0;
  const finiteOutput = !JSON.stringify(frontiers).match(/NaN|Infinity/);
  const stableWinningPointEstimates = frontiers.every((frontier) => frontier.foldResults.every((fold) => fold.validation.paired.winningPointEstimate !== 'counterpart'));
  const integrityOk = finiteOutput && inputDigestMatches && zeroTrainValidationOverlap;
  const mathematical = finalFrontiers.filter((frontier) => frontier.family === 'freedom');
  const implementable = finalFrontiers.filter((frontier) => frontier.family === 'implementable');
  return {
    schemaVersion: 1,
    mode: config.mode,
    previewBanner: config.mode === 'preview' ? 'PREVIEW — NO VERDICT' : 'FULL CROSS-FIT BENCHMARK',
    verdicts: { mathematical: aggregateVerdicts(mathematical, config.mode), implementable: aggregateVerdicts(implementable, config.mode) },
    config,
    inputSha256: series.inputSha256,
    gitSha: config.gitSha ?? 'unknown',
    runtimeMs,
    runtimeOk,
    integrity: { finite: finiteOutput, inputDigestMatches, zeroTrainValidationOverlap },
    sensitivity: { penaltyCount: config.penalties.length, foldCount: series.folds.length, stableWinningPointEstimates },
    folds: series.folds,
    frontiers: finalFrontiers,
    limitations: [
      'Cross-fit is not an external never-touched dataset.',
      'Bootstrap confidence intervals are conditional on two historical eras.',
      'Thirty-six-month validation blocks miss longer dependence.',
      'Mathematical freedom is not advice.',
      'Implementable policy ignores taxes, costs, RMDs, cash flows, mortality, and allocation-change limits.',
      'No consumption-smoothing utility is modeled.',
      'Counterpart envelope selection uses no more than three training-only refinement bisections (preview used zero).',
    ],
    seeds: { training: config.trainingSeeds, validation: config.validationSeeds, bootstrap: config.bootstrapSeed },
    grids: {
      spending: config.spendingGrid,
      freedomEquity: config.freedomEquityGrid,
      implementableEquity: config.implementableEquityGrid,
      wealth: config.wealthGrid,
    },
  };
}

*/
interface SolvedController {
  rho: number;
  policy: TrainedPolicy;
  outcomes: Map<number, PathOutcome[]>;
}

function chooseMatchedPoint(points: readonly CounterpartPoint[], optimizedRisk: number, rho: number): CounterpartPoint | undefined {
  const normalized = points.map((point) => ({ ...point, pointRiskMatched: Math.abs(point.training.floorBreachProbability - optimizedRisk) <= 0.005 }));
  return normalized
    .filter((point) => point.nondominated && point.pointRiskMatched)
    .sort((left, right) => right.objective - left.objective || JSON.stringify(left.spec).localeCompare(JSON.stringify(right.spec)))[0];
}

function chooseFallbackPoint(points: readonly CounterpartPoint[], optimizedRisk: number, rho: number): CounterpartPoint {
  const normalized = points.map((point) => ({ ...point, pointRiskMatched: Math.abs(point.training.floorBreachProbability - optimizedRisk) <= 0.005 }));
  return normalized
    .filter((point) => point.nondominated)
    .sort((left, right) => Number(right.pointRiskMatched) - Number(left.pointRiskMatched) || right.objective - left.objective || JSON.stringify(left.spec).localeCompare(JSON.stringify(right.spec)))[0] ?? normalized[0];
}

export function runBenchmark(input: BenchmarkConfig = PREVIEW_CONFIG): BenchmarkReport {
  const started = Date.now();
  const config: BenchmarkConfig = {
    ...input,
    spendingGrid: [...input.spendingGrid],
    freedomEquityGrid: [...input.freedomEquityGrid],
    implementableEquityGrid: [...input.implementableEquityGrid],
    wealthGrid: [...input.wealthGrid],
    penalties: [...input.penalties],
  };
  const series = recoverHistoricalSeries();
  const frontiers: FrontierResult[] = [];
  const pooledInputs: Array<{ key: string; folds: PooledBootstrapPair['folds'] }> = [];
  const pooledByKey = new Map<string, PairedResult>();

  for (const family of ['freedom', 'implementable'] as const) {
    const preparedFolds: PreparedFold[] = series.folds.map((fold, foldIndex) => {
      const blocks = buildAnnualBlocks(series, fold.trainStart, fold.trainEnd === '2026-06' ? '2025-12' : fold.trainEnd);
      const segments = buildValidationSegments(series, fold.validationStart, fold.validationEnd);
      const trainingStarts = makeCommonBlockStarts(config.trainingPaths, config.horizonYears, blocks.length, config.trainingSeeds[foldIndex]);
      const validationStarts = makeCommonBlockStarts(config.validationPaths, Math.ceil((config.horizonYears * MONTHS_PER_YEAR) / VALIDATION_BLOCK_MONTHS), segments.length, config.validationSeeds[foldIndex]);
      const cells = compressTrainingBlocks(blocks, config.representatives);
      return { fold, blocks, segments, trainingStarts, validationStarts, cells, cache: createTransitionCache(family, cells, config) };
    });
    const selectedByWealth = new Map<number, SelectedFoldPolicy[]>();
    const foldResultsByWealth = new Map<number, FrontierFoldResult[]>();
    const validationOutcomesByWealth = new Map<number, Array<{ optimized: PathOutcome[]; counterpart: PathOutcome[] }>>();

    for (let foldIndex = 0; foldIndex < preparedFolds.length; foldIndex += 1) {
      const prepared = preparedFolds[foldIndex];
      const envelopeByWealth = new Map<number, { points: CounterpartPoint[]; optimizedRiskByRho: Map<number, number> }>();
      for (const wealth of config.startingWealth) {
        const envelope = buildCounterpartEnvelope(family, prepared.blocks, prepared.trainingStarts, wealth, config, 0);
        envelopeByWealth.set(wealth, { points: envelope.points, optimizedRiskByRho: new Map() });
      }
      const solvedControllers = new Map<number, SolvedController>();
      const solve = (rho: number): SolvedController => {
        const existing = solvedControllers.get(rho);
        if (existing) return existing;
        const policy = trainPolicy(family, prepared.cells, config, rho, prepared.cache);
        const outcomes = new Map<number, PathOutcome[]>();
        for (const wealth of config.startingWealth) outcomes.set(wealth, makeTrainingOutcomes(policy, family, wealth, prepared.blocks, prepared.trainingStarts, config));
        const solved = { rho, policy, outcomes };
        solvedControllers.set(rho, solved);
        return solved;
      };
      for (const rho of config.penalties) solve(rho);

      for (const wealth of config.startingWealth) {
        const envelope = envelopeByWealth.get(wealth);
        if (!envelope) continue;
          const candidates: Array<{ solved: SolvedController; point: CounterpartPoint; history: number[] }> = [];
        const baseRhos = [...config.penalties].sort((left, right) => left - right);
        for (const rho of baseRhos) {
          const solved = solve(rho);
          const optimizedTraining = solved.outcomes.get(wealth) ?? [];
            const optimizedRisk = summarizeOutcomes(optimizedTraining).floorBreachProbability;
          envelope.optimizedRiskByRho.set(rho, optimizedRisk);
            let point = chooseMatchedPoint(envelope.points, optimizedRisk, rho);
            const history: number[] = [];
            let refinedMatch: SolvedController | undefined;
          if (!point) {
            let lower: SolvedController | undefined;
            let upper: SolvedController | undefined;
            const target = envelope.points.find((candidate) => candidate.nondominated)?.training.floorBreachProbability ?? optimizedRisk;
            for (let index = 0; index + 1 < baseRhos.length; index += 1) {
              const left = solve(baseRhos[index]);
              const right = solve(baseRhos[index + 1]);
              const leftRisk = summarizeOutcomes(left.outcomes.get(wealth) ?? []).floorBreachProbability;
              const rightRisk = summarizeOutcomes(right.outcomes.get(wealth) ?? []).floorBreachProbability;
              if ((leftRisk - target) * (rightRisk - target) <= 0 && leftRisk !== rightRisk) {
                lower = leftRisk <= rightRisk ? left : right;
                upper = leftRisk <= rightRisk ? right : left;
                break;
              }
            }
            for (let attempt = 0; attempt < 3 && lower && upper && !point; attempt += 1) {
              const midpoint = (lower.rho + upper.rho) / 2;
              history.push(midpoint);
              const refined = solve(midpoint);
              const refinedOutcomes = refined.outcomes.get(wealth) ?? [];
              const refinedRisk = summarizeOutcomes(refinedOutcomes).floorBreachProbability;
              point = chooseMatchedPoint(envelope.points, refinedRisk, midpoint);
              if (!point) {
                if (refinedRisk < target) lower = refined;
                else upper = refined;
              } else {
                refinedMatch = refined;
              }
            }
            if (refinedMatch) {
              candidates.push({ solved: refinedMatch, point: point!, history: [...history] });
            } else {
              if (!point) point = chooseFallbackPoint(envelope.points, optimizedRisk, rho);
              candidates.push({ solved, point, history });
            }
          } else {
            candidates.push({ solved, point, history });
        }
        }
        const selected = candidates.sort((left, right) => Number(right.point.pointRiskMatched) - Number(left.point.pointRiskMatched) || right.point.objective - left.point.objective || left.solved.rho - right.solved.rho)[0];
        if (!selected) continue;
        const optimizedTraining = selected.solved.outcomes.get(wealth) ?? [];
        const counterpartTraining = makeTrainingOutcomes(selected.point.spec, family, wealth, prepared.blocks, prepared.trainingStarts, config);
        const validationOptimized = makeValidationOutcomes(selected.solved.policy, family, wealth, prepared.segments, prepared.validationStarts, config);
        const validationCounterpart = makeValidationOutcomes(selected.point.spec, family, wealth, prepared.segments, prepared.validationStarts, config);
        const trainPaired = pairedResult(optimizedTraining, counterpartTraining, config, foldIndex * 100 + wealth / 1000, 0.005, undefined, 0);
          const validationPaired = pairedResult(validationOptimized, validationCounterpart, config, foldIndex * 100 + 50 + wealth / 1000, 0.01, undefined, 0);
        const foldResult: FrontierFoldResult = {
          fold: prepared.fold.name,
          train: { optimized: summarizeOutcomes(optimizedTraining), counterpart: summarizeOutcomes(counterpartTraining), paired: trainPaired },
          validation: { optimized: summarizeOutcomes(validationOptimized), counterpart: summarizeOutcomes(validationCounterpart), paired: validationPaired },
        };
        const selectedPolicy = policySnapshot(selected.solved.policy, `${family}|${prepared.fold.name}|rho=${selected.solved.rho}|wealth=${wealth}`, prepared.fold.name);
        const selection: SelectedFoldPolicy = {
          fold: prepared.fold.name,
          rho: selected.solved.rho,
          policy: selectedPolicy,
          counterpart: selected.point.spec,
          controllerId: `${family}|${prepared.fold.name}|rho=${selected.solved.rho}`,
          counterpartId: `${selected.point.spec.kind}|equity=${selected.point.spec.equity}|spending=${selected.point.spec.spending}`,
          refinementHistory: selected.history,
          trainingRiskDifference: trainPaired.pointRiskDifference,
          trainingRiskMatched: trainPaired.pointRiskMatched,
        };
          selectedByWealth.set(wealth, [...(selectedByWealth.get(wealth) ?? []), selection]);
          foldResultsByWealth.set(wealth, [...(foldResultsByWealth.get(wealth) ?? []), foldResult]);
          validationOutcomesByWealth.set(wealth, [...(validationOutcomesByWealth.get(wealth) ?? []), { optimized: validationOptimized, counterpart: validationCounterpart }]);
      }
    }

    for (const wealth of config.startingWealth) {
      const selectedByFold = selectedByWealth.get(wealth) ?? [];
      const foldResults = foldResultsByWealth.get(wealth) ?? [];
      const first = selectedByFold[0];
      if (!first) continue;
      pooledInputs.push({ key: `${family}|${wealth}`, folds: (validationOutcomesByWealth.get(wealth) ?? []) });
      const pooledMetric = pooledBootstrapMetrics([pooledInputs.at(-1)!], { resamples: config.bootstrapResamples, seed: config.bootstrapSeed }).metrics[0];
      if (pooledMetric) pooledByKey.set(`${family}|${wealth}`, pooledMetric);
      frontiers.push({
        family,
        rho: first.rho,
        startingWealth: wealth,
        verdict: frontierVerdict(family, foldResults, config.mode === 'preview'),
        foldResults,
        optimizedPolicy: { ...first.policy, identity: selectedByFold.map((selection) => `${selection.policy.identity} [${selection.counterpartId}]`).join(' | ') },
        counterpartPolicy: first.counterpart,
        selectedByFold,
        learnedActionMap: selectedByFold.flatMap((selection) => selection.policy.stateActionMap),
        trainingRiskMatched: selectedByFold.every((selection) => selection.trainingRiskMatched),
      });
    }
  }

  const runtimeMs = Date.now() - started;
  const runtimeOk = runtimeMs <= 600_000;
  const integrity = validateBenchmarkIntegrity(series.inputSha256, frontiers, series.trainingValidationOverlap);
  const integrityOk = integrity.finite && integrity.inputDigestMatches && integrity.zeroTrainValidationOverlap;
  const stableWinningPointEstimates = frontiers.every((frontier) => frontier.foldResults.every((fold) => fold.validation.paired.winningPointEstimate !== 'counterpart'));
  const finalFrontiers = frontiers.map((frontier) => {
    const pooledPaired = pooledByKey.get(`${frontier.family}|${frontier.startingWealth}`);
    const verdict = runtimeOk && integrityOk
      ? frontierVerdict(frontier.family, frontier.foldResults, config.mode === 'preview', runtimeOk, integrityOk, stableWinningPointEstimates, pooledPaired)
      : 'inconclusive' as Verdict;
    return { ...frontier, pooledPaired, verdict };
  });
  return {
    schemaVersion: 1,
    mode: config.mode,
    previewBanner: config.mode === 'preview' ? 'PREVIEW — NO VERDICT' : 'FULL CROSS-FIT BENCHMARK',
    verdicts: {
      mathematical: aggregateVerdicts(finalFrontiers.filter((frontier) => frontier.family === 'freedom'), config.mode),
      implementable: aggregateVerdicts(finalFrontiers.filter((frontier) => frontier.family === 'implementable'), config.mode),
    },
    config,
    inputSha256: series.inputSha256,
    gitSha: config.gitSha ?? 'unknown',
    runtimeMs,
    runtimeOk,
    integrity,
    sensitivity: { penaltyCount: config.penalties.length, foldCount: series.folds.length, stableWinningPointEstimates },
    folds: series.folds,
    frontiers: finalFrontiers,
    limitations: [
      'Cross-fit is not an external never-touched dataset.',
      'Bootstrap confidence intervals are conditional on two historical eras.',
      'Thirty-six-month validation blocks miss longer dependence.',
      'Mathematical freedom is not advice.',
      'Implementable policy ignores taxes, costs, RMDs, cash flows, mortality, and allocation-change limits.',
      'No consumption-smoothing utility is modeled.',
      'Counterpart selection uses every configured training path; refinement history records at most three training-only midpoint attempts.',
      'Validation bootstrap rows are generated once and reused only after the frozen pair is selected.',
    ],
    seeds: { training: config.trainingSeeds, validation: config.validationSeeds, bootstrap: config.bootstrapSeed },
    grids: { spending: config.spendingGrid, freedomEquity: config.freedomEquityGrid, implementableEquity: config.implementableEquityGrid, wealth: config.wealthGrid },
  };
}
