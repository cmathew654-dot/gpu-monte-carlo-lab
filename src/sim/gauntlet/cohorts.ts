/**
 * cohorts.ts — the six worst retirement cohorts in US market history, the
 * "Historical Gauntlet" roster. Pure TS, no DOM/three/store imports.
 *
 * `startMonth` is a month offset into the recovered historical monthly
 * series (month 0 = 1926-01; see engine.ts `recoverMonthlySeries`). Each
 * cohort retires at the START of that month and replays actual real total
 * returns forward.
 *
 * Offsets: 1929-01 → 36, 1937-01 → 132, 1966-01 → 480, 1973-01 → 564,
 * 2000-01 → 888, 2008-01 → 984 (year diff from 1926 × 12).
 */

export interface GauntletCohort {
  /** Stable id used in results and UI keys. */
  id: string;
  /** Display label. */
  label: string;
  /** Calendar label of the retirement month (informational). */
  startDate: string;
  /** Month offset from 1926-01 into the recovered series. */
  startMonth: number;
  /** One client-readable sentence summarizing why this cohort was brutal. */
  oneLine: string;
}

export const GAUNTLET_COHORTS: readonly GauntletCohort[] = [
  {
    id: 'gd1929',
    label: '1929 — Great Depression',
    startDate: '1929-01',
    startMonth: 36,
    oneLine:
      'Retired into the teeth of the Depression — stocks fell 75% in 34 months, yet the plan recovered.',
  },
  {
    id: 'fed1937',
    label: '1937 — Second Depression Leg',
    startDate: '1937-01',
    startMonth: 132,
    oneLine:
      'Retired just before the Fed tightened into a fragile recovery — stocks halved within a year.',
  },
  {
    id: 'stag1966',
    label: '1966 — Stagflation',
    startDate: '1966-01',
    startMonth: 480,
    oneLine:
      'The worst SWR cohort on record — 16 years of flat stocks and rising inflation crushed real withdrawals.',
  },
  {
    id: 'oil1973',
    label: '1973 — Oil Shock',
    startDate: '1973-01',
    startMonth: 564,
    oneLine:
      'Retired into the 1973–74 bear and an oil embargo — real equity wealth halved in two years.',
  },
  {
    id: 'dot2000',
    label: '2000 — Dot-com + GFC Double-bear',
    startDate: '2000-01',
    startMonth: 888,
    oneLine:
      'Retired at the bubble peak — two ~50% bear markets inside the first decade of retirement.',
  },
  {
    id: 'gfc2008',
    label: '2008 — Global Financial Crisis',
    startDate: '2008-01',
    startMonth: 984,
    oneLine:
      'Retired months before the worst crash since 1929 — stocks fell 50%+ almost immediately.',
  },
];

export function cohortById(id: string): GauntletCohort | undefined {
  return GAUNTLET_COHORTS.find((c) => c.id === id);
}
