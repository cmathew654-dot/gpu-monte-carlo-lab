/**
 * Presentation-only wording derived from gauntlet engine truth. Keeping this
 * pure makes client chips and the advisor table share status semantics.
 */
export interface CohortPresentationInput {
  cohortId: string;
  cohort: { startDate: string };
  failed: boolean;
  exhaustedData: boolean;
  failureYear: number | null;
}

export type CohortTone = 'survived' | 'failed' | 'exhausted';

export interface CohortPresentation {
  year: string;
  symbol: '✓' | '✗' | '*';
  detail: string;
  tone: CohortTone;
}

export function cohortPresentation(
  cohort: CohortPresentationInput,
): CohortPresentation {
  const year = cohort.cohort.startDate.slice(0, 4);
  if (cohort.failed) {
    return {
      year,
      symbol: '✗',
      detail:
        cohort.failureYear === null
          ? 'plan failed'
          : 'failed year ' + cohort.failureYear.toFixed(1),
      tone: 'failed',
    };
  }
  if (cohort.exhaustedData) {
    return {
      year,
      symbol: '*',
      detail: 'still going — history ended',
      tone: 'exhausted',
    };
  }
  return {
    year,
    symbol: '✓',
    detail: 'lasted the full plan',
    tone: 'survived',
  };
}

export function gauntletNarrative(
  cohorts: readonly CohortPresentationInput[],
): string {
  const depression = cohorts.find((cohort) => cohort.cohortId === 'gd1929');
  const stagflation = cohorts.find((cohort) => cohort.cohortId === 'stag1966');

  if (depression && stagflation) {
    if (!depression.failed && stagflation.failed) {
      const year =
        stagflation.failureYear === null
          ? ''
          : ' around year ' + Math.round(stagflation.failureYear);
      return (
        "The crash you survive vs. the grind you don't: " +
        '1929 lasts; 1966 runs out' +
        year +
        '.'
      );
    }
    if (!depression.failed && !stagflation.failed) {
      return 'This plan lasts through both the 1929 crash and the long 1966 inflationary grind.';
    }
    if (depression.failed && stagflation.failed) {
      return 'Both 1929 and 1966 break this plan: the opening crash and the long inflationary grind.';
    }
    return 'The 1966 inflationary grind lasts; the opening 1929 crash is the harder test for this plan.';
  }

  const failedCount = cohorts.filter((cohort) => cohort.failed).length;
  return failedCount === 0
    ? 'The plan lasts through every fully observed historical cohort.'
    : failedCount + ' of the six historical cohorts run out of money.';
}
