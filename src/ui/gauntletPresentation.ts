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
  symbol: '✓' | '×' | '*';
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
      symbol: '×',
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
        'This plan lasts through the 1929 crash, but runs out during the long 1966 inflationary period' +
        year +
        '.'
      );
    }
    if (!depression.failed && !stagflation.failed) {
      return 'This plan lasts through both the 1929 crash and the long 1966 inflationary period.';
    }
    if (depression.failed && stagflation.failed) {
      return 'This plan runs out in both the 1929 crash cohort and the long 1966 inflationary period.';
    }
    return 'This plan lasts through the 1966 inflationary period, but runs out in the 1929 crash cohort.';
  }

  const failedCount = cohorts.filter((cohort) => cohort.failed).length;
  return failedCount === 0
    ? 'This plan lasts through every fully observed historical cohort.'
    : failedCount + ' of six historical cohorts run out of money.';
}
