/**
 * format.ts — display formatting for the 2D UI (spec §4.6). All numeric
 * output pairs with `tabular-nums` (see theme.css .data-label / .panel).
 */

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** "$1,000,000" — slider values and stat dollars. */
export function fmtUSD(v: number): string {
  return usd0.format(v);
}

/** "$1.24M" / "$860K" — compact form for dense stat rows. */
export function fmtUSDCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return fmtUSD(v);
}

/** "87.3%" from a 0..1 fraction. */
export function fmtPct(frac: number, digits = 1): string {
  return `${(frac * 100).toFixed(digits)}%`;
}

/** "42" — seed as bare integer. */
export function fmtSeed(seed: number): string {
  return String(seed >>> 0);
}

/** "10K" / "100K" / "1M" path-count labels. */
export function fmtPathCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  return `${Math.round(n / 1_000)}K`;
}
