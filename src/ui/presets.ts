/**
 * presets.ts — scenario preset loading (spec §4.6 task 1; data owned by
 * Agent 5, spec §4.5 task 4).
 *
 * Agent 5 produces src/data/scenarios.json IN PARALLEL against the schema
 *   { name: string; description: string; params: Partial<SimParams> }[]
 * We resolve it with import.meta.glob so a missing file is a graceful empty
 * state (dropdown disabled, "presets unavailable") — never a build break.
 * Unknown/invalid entries are dropped; param values are type-checked key by
 * key before they reach the store.
 */
import type { SimParams } from '../store/simStore';

export interface ScenarioPreset {
  name: string;
  description: string;
  params: Partial<SimParams>;
}

const scenarioModules = import.meta.glob('../data/scenarios.json');

const MODELS: ReadonlyArray<SimParams['model']> = ['gbm', 'bootstrap', 'fattail'];
const PATH_COUNTS: ReadonlyArray<SimParams['pathCount']> = [10_000, 100_000, 1_000_000];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Whitelist + type-check each SimParams key; silently drop the rest. */
export function sanitizeParams(raw: unknown): Partial<SimParams> {
  if (!isRecord(raw)) return {};
  const out: Partial<SimParams> = {};

  if (typeof raw.model === 'string' && (MODELS as string[]).includes(raw.model)) {
    out.model = raw.model as SimParams['model'];
  }
  if (typeof raw.pathCount === 'number' && (PATH_COUNTS as number[]).includes(raw.pathCount)) {
    out.pathCount = raw.pathCount as SimParams['pathCount'];
  }
  const horizonYears = num(raw.horizonYears);
  if (horizonYears !== undefined) out.horizonYears = Math.min(40, Math.max(10, horizonYears));
  const retireYear = num(raw.retireYear);
  if (retireYear !== undefined) out.retireYear = Math.max(0, retireYear);
  const initialWealth = num(raw.initialWealth);
  if (initialWealth !== undefined) out.initialWealth = Math.max(0, initialWealth);
  const contribution = num(raw.contribution);
  if (contribution !== undefined) out.contribution = Math.max(0, contribution);
  const withdrawal = num(raw.withdrawal);
  if (withdrawal !== undefined) out.withdrawal = Math.max(0, withdrawal);
  const mu = num(raw.mu);
  if (mu !== undefined) out.mu = mu;
  const sigma = num(raw.sigma);
  if (sigma !== undefined) out.sigma = sigma;
  const seed = num(raw.seed);
  if (seed !== undefined) out.seed = seed >>> 0;

  if (raw.glidepath === null) {
    out.glidepath = null;
  } else if (isRecord(raw.glidepath)) {
    const start = num(raw.glidepath.start);
    const end = num(raw.glidepath.end);
    if (start !== undefined && end !== undefined) {
      out.glidepath = { start, end };
    }
  }
  return out;
}

/**
 * Load Agent 5's scenarios.json if present. Returns [] when the file is
 * missing or malformed — callers render the empty state.
 */
export async function loadScenarioPresets(): Promise<ScenarioPreset[]> {
  const loader = scenarioModules['../data/scenarios.json'];
  if (!loader) return [];
  try {
    const mod: unknown = await loader();
    const payload: unknown = isRecord(mod) && 'default' in mod ? mod.default : mod;
    if (!Array.isArray(payload)) return [];
    const presets: ScenarioPreset[] = [];
    for (const entry of payload) {
      if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.length === 0) {
        continue;
      }
      const params = sanitizeParams(entry.params);
      if (Object.keys(params).length === 0) continue;
      presets.push({
        name: entry.name,
        description: typeof entry.description === 'string' ? entry.description : '',
        params,
      });
    }
    return presets;
  } catch {
    return [];
  }
}
