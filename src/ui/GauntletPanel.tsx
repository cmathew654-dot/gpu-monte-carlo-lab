/**
 * W2-B historical gauntlet HUD. One deterministic store snapshot feeds both
 * altitudes: calm client chips and the advisor's full cohort table.
 */
import { useEffect, type CSSProperties } from 'react';
import { GAUNTLET_CSS_COLORS } from '../sim/gauntlet/palette';
import { useGauntletStore } from '../store/gauntletStore';
import { useSimStore } from '../store/simStore';
import { fmtPct, fmtUSDCompact } from './format';
import {
  cohortPresentation,
  gauntletNarrative,
} from './gauntletPresentation';

type CohortStyle = CSSProperties & { '--cohort-color': string };

/** Runs only when committedParams changes; slider-preview writes never land. */
export function GauntletDriver() {
  const committedParams = useSimStore((state) => state.committedParams);
  const recompute = useGauntletStore((state) => state.recompute);

  useEffect(() => {
    recompute(committedParams);
  }, [committedParams, recompute]);

  return null;
}

function ClientGauntlet() {
  const snapshot = useGauntletStore((state) => state.snapshot);
  if (snapshot === null) {
    return (
      <section
        className="gauntlet-panel gauntlet-panel--client"
        aria-label="Historical retirement cohorts"
        aria-busy="true"
      >
        <p className="gauntlet-panel__loading data-label">
          REPLAYING SIX HISTORICAL STARTS…
        </p>
      </section>
    );
  }

  const cohorts = snapshot.result.cohorts;
  return (
    <section
      className="gauntlet-panel gauntlet-panel--client"
      aria-labelledby="gauntlet-client-title"
    >
      <div className="gauntlet-panel__heading">
        <h2 id="gauntlet-client-title">Your plan vs. six hard retirements</h2>
        <span className="data-label">ACTUAL MONTHLY RETURNS</span>
      </div>
      <ul className="gauntlet-chips">
        {cohorts.map((cohort, index) => {
          const status = cohortPresentation(cohort);
          const style = {
            '--cohort-color': GAUNTLET_CSS_COLORS[index],
          } as CohortStyle;
          return (
            <li
              key={cohort.cohortId}
              className={'gauntlet-chip gauntlet-chip--' + status.tone}
              style={style}
              title={cohort.cohort.oneLine}
            >
              <span className="gauntlet-chip__year data-label">
                {status.year}
              </span>
              <span className="gauntlet-chip__symbol" aria-hidden="true">
                {status.symbol}
              </span>
              <span className="gauntlet-chip__detail">{status.detail}</span>
              <span className="sr-only">
                {status.year + ': ' + status.detail}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="gauntlet-panel__narrative">
        {gauntletNarrative(cohorts)}
      </p>
      {cohorts.some((cohort) => cohort.exhaustedData) && (
        <p className="gauntlet-panel__note">
          * Still solvent when the historical record ends; not a full-horizon
          pass.
        </p>
      )}
    </section>
  );
}

function AdvisorGauntlet() {
  const snapshot = useGauntletStore((state) => state.snapshot);
  if (snapshot === null) return null;

  return (
    <section
      className="gauntlet-panel gauntlet-panel--advisor"
      aria-labelledby="gauntlet-advisor-title"
    >
      <div className="gauntlet-panel__heading">
        <div>
          <h2 id="gauntlet-advisor-title">Historical gauntlet</h2>
          <p>Current plan replayed from six named retirement months.</p>
        </div>
        <span className="data-label">
          {snapshot.result.seriesStartDate} → {snapshot.result.seriesEndDate}
        </span>
      </div>
      <div className="gauntlet-table-wrap">
        <table className="gauntlet-table">
          <thead>
            <tr>
              <th scope="col">Cohort</th>
              <th scope="col">Plan result</th>
              <th scope="col">Ending wealth</th>
              <th scope="col">Max SWR</th>
              <th scope="col">Observed</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.result.cohorts.map((cohort, index) => {
              const status = cohortPresentation(cohort);
              const style = {
                '--cohort-color': GAUNTLET_CSS_COLORS[index],
              } as CohortStyle;
              return (
                <tr key={cohort.cohortId} style={style}>
                  <th scope="row">
                    <span className="gauntlet-table__swatch" aria-hidden="true" />
                    {cohort.cohort.label}
                  </th>
                  <td className={'gauntlet-table__status gauntlet-table__status--' + status.tone}>
                    <span aria-hidden="true">{status.symbol}</span>{' '}
                    {status.detail}
                  </td>
                  <td className="data-label">
                    {fmtUSDCompact(cohort.endingWealth)}
                  </td>
                  <td className="data-label">
                    {fmtPct(cohort.maxSWR.annualRate, 2)}
                    {cohort.maxSWR.dataLimited ? '*' : ''}
                  </td>
                  <td className="data-label">
                    {(cohort.monthsSimulated / 12).toFixed(1)} yr
                    {cohort.exhaustedData ? '*' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="gauntlet-panel__note">
        Max SWR uses level real monthly spending; * indicates a data-limited
        cohort, not a full-horizon result.
      </p>
    </section>
  );
}

export function GauntletPanel() {
  const viewMode = useSimStore((state) => state.viewMode);
  return viewMode === 'client' ? <ClientGauntlet /> : <AdvisorGauntlet />;
}
