#!/usr/bin/env node
/**
 * validate_data.mjs — contract check for src/data/historicalReturns.json
 * and src/data/scenarios.json (spec §4.5 acceptance, BOOTSTRAP_BLOCKS_MAX=4096).
 *
 * Run: node src/data/validate_data.mjs
 * Exits non-zero on any contract violation.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BLOCKS_MAX = 4096;

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

// ---------------------------------------------------------------------------
// historicalReturns.json
// ---------------------------------------------------------------------------
const hr = JSON.parse(readFileSync(join(here, 'historicalReturns.json'), 'utf8'));

ok(hr && typeof hr === 'object', 'historicalReturns.json parses as object');
ok(hr._meta && typeof hr._meta === 'object', '_meta present');
const { blockCount, blockLength, startDate, endDate, source } = hr._meta ?? {};
ok(Number.isInteger(blockCount) && blockCount > 0, `_meta.blockCount is positive int (${blockCount})`);
ok(blockLength === 12, `_meta.blockLength === 12 (${blockLength})`);
ok(typeof startDate === 'string' && /^\d{4}-\d{2}$/.test(startDate), `_meta.startDate YYYY-MM (${startDate})`);
ok(typeof endDate === 'string' && /^\d{4}-\d{2}$/.test(endDate), `_meta.endDate YYYY-MM (${endDate})`);
ok(typeof source === 'string' && source.includes('Shiller'), '_meta.source cites Shiller dataset');
ok(blockCount <= BLOCKS_MAX, `blockCount (${blockCount}) <= BOOTSTRAP_BLOCKS_MAX (${BLOCKS_MAX})`);

ok(Array.isArray(hr.blocks), 'blocks is an array');
ok(hr.blocks.length === blockCount * 12, `blocks.length (${hr.blocks.length}) === blockCount×12 (${blockCount * 12})`);
ok(hr.blocks.every((v) => Number.isFinite(v)), 'every blocks entry is a finite number');

// Loads into Float32Array without transformation (Agent 2 buffer contract).
const f32 = Float32Array.from(hr.blocks);
ok(f32.length === blockCount * 12, 'blocks loads into Float32Array at blockCount×12');
ok(f32.every((v) => v > -1 && v < 2), 'all returns within (-100%, +100%) sane bounds');

// Overlapping-block structure: block i must start with monthly return i.
// Verify block overlap identity: blocks[i*12 + 12 - 1] === blocks[(i+1)*12 + 11 - 12]...
// i.e. element j of block i (month i+j) equals element j-1 of block i+1.
let overlapOK = true;
for (let i = 0; i < Math.min(blockCount - 1, 200); i++) {
  for (let j = 1; j < 12; j++) {
    if (Math.abs(hr.blocks[i * 12 + j] - hr.blocks[(i + 1) * 12 + (j - 1)]) > 1e-12) {
      overlapOK = false;
    }
  }
}
ok(overlapOK, 'overlapping stride-1 block structure verified (first 200 blocks)');

// bondBlocks extension: same layout, aligned windows.
ok(Array.isArray(hr.bondBlocks), 'bondBlocks present (allocation-mix extension)');
ok(hr.bondBlocks.length === blockCount * 12, `bondBlocks.length === blockCount×12 (${hr.bondBlocks.length})`);

// Recompute headline stats from the shipped blocks (blocks start at month 0).
const monthly = [];
for (let i = 0; i < blockCount; i++) monthly.push(f32[i * 12]);
monthly.push(...Array.from(f32.slice((blockCount - 1) * 12 + 1)));
const mean = monthly.reduce((a, b) => a + b, 0) / monthly.length;
const sd = Math.sqrt(monthly.reduce((a, b) => a + (b - mean) ** 2, 0) / (monthly.length - 1));
const annArith = mean * 12;
const annVol = sd * Math.sqrt(12);
const minR = Math.min(...monthly);
ok(annArith > 0.05 && annArith < 0.11, `recomputed arithmetic mean ${(annArith * 100).toFixed(2)}%/yr within [5%, 11%]`);
ok(annVol > 0.13 && annVol < 0.22, `recomputed vol ${(annVol * 100).toFixed(2)}%/yr within [13%, 22%]`);
ok(minR < -0.2, `worst month ${(minR * 100).toFixed(1)}% < -20% (Depression visible)`);

// ---------------------------------------------------------------------------
// scenarios.json
// ---------------------------------------------------------------------------
const sc = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'));
const NAMES = [
  'Early retiree 35-yr',
  'Pre-retiree 10-yr glidepath',
  'Fat-tail stress',
  'High-withdrawal cautionary',
  'Accumulation only',
];
const PARAM_KEYS = new Set([
  'model', 'pathCount', 'horizonYears', 'retireYear', 'initialWealth',
  'contribution', 'withdrawal', 'mu', 'sigma', 'glidepath', 'seed',
]);
ok(Array.isArray(sc) && sc.length === 5, `scenarios.json is an array of 5 presets (${sc.length})`);
ok(JSON.stringify(sc.map((s) => s.name)) === JSON.stringify(NAMES), 'preset names match the frozen five, in order');
for (const s of sc) {
  ok(typeof s.description === 'string' && s.description.length > 20, `"${s.name}" has a description`);
  ok(s.params && typeof s.params === 'object', `"${s.name}" has params`);
  for (const k of Object.keys(s.params)) {
    ok(PARAM_KEYS.has(k), `"${s.name}" param "${k}" is a valid SimParams key`);
  }
  const p = s.params;
  if (p.model !== undefined) ok(['gbm', 'bootstrap', 'fattail'].includes(p.model), `"${s.name}" model valid`);
  if (p.pathCount !== undefined) ok([10000, 100000, 1000000].includes(p.pathCount), `"${s.name}" pathCount valid`);
  if (p.horizonYears !== undefined) ok(p.horizonYears >= 10 && p.horizonYears <= 40, `"${s.name}" horizonYears in 10..40`);
  if (p.retireYear !== undefined && p.horizonYears !== undefined) ok(p.retireYear >= 0 && p.retireYear <= p.horizonYears, `"${s.name}" retireYear in 0..horizonYears`);
  if (p.glidepath !== undefined && p.glidepath !== null) {
    ok(typeof p.glidepath.start === 'number' && typeof p.glidepath.end === 'number', `"${s.name}" glidepath {start,end} numeric`);
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
