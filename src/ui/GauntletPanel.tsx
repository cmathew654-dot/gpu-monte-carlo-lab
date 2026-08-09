/**
 * W2-B historical gauntlet HUD. One deterministic store snapshot feeds both
 * altitudes: calm client chips and the advisor's full cohort table.
 */
import './gauntlet.css';
import { useEffect, type CSSProperties } from 'react';
import { GAUNTLET_CSS_COLORS } from '../sim/gauntlet/palette';
import {
  computeGauntletSnapshot,
  useGauntletStore,
} from '../store/gauntletStore';
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
  const setSnapshot = useGauntletStore((state) => state.setSnapshot);

  useEffect(() => {
    setSnapshot(null);
    setSnapshot(computeGauntletSnapshot(committedParams));
  }, [committedParams, setSnapshot]);

  return null;
}

function ClientGauntlet() {
  const snapshot = useGauntletStore((state) => state.snapshot);
  if (snapshot === null) {
    return (
      <section
        className="gauntlet-panel gauntlet-panel--client"
        aria-labelledby="gauntlet-client-title"
        aria-busy="true"
      >
        <div className="gauntlet-panel__heading">
          <h2 id="gauntlet-client-title">Your plan vs. six hard retirements</h2>
          <span className="gauntlet-panel__source">ACTUAL MONTHLY RETURNS</span>
        </div>
        <p className="gauntlet-panel__loading">REPLAYING SIX HISTORICAL STARTS…</p>
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
        <span className="gauntlet-panel__source">ACTUAL MONTHLY RETURNS</span>
      </div>
      <ul className="gauntlet-chips" aria-label="Historical cohort outcomes">
        {cohorts.map((cohort, index) => {
          const status = cohortPresentation(cohort);
          const clientDetail =
            status.tone === 'failed'
              ? 'Ran out' +
                (cohort.failureYear === null
                  ? ''
                  : ' · yr ' + cohort.failureYear.toFixed(1))
              : status.tone === 'survived'
                ? 'Full plan'
                : 'Still going';
          const style = {
            '--cohort-color': GAUNTLET_CSS_COLORS[index],
          } as CohortStyle;
          return (
            <li
              key={cohort.cohortId}
              className={'gauntlet-chip gauntlet-chip--' + status.tone}
              style={style}
              aria-label={
                cohort.cohort.oneLine + '. ' + status.symbol + ' ' + clientDetail
              }
            >
              <span className="gauntlet-chip__identity">
                <span className="gauntlet-chip__dot" aria-hidden="true" />
                <span className="gauntlet-chip__year">{status.year}</span>
              </span>
              <span className="gauntlet-chip__outcome">
                <span className="gauntlet-chip__symbol" aria-hidden="true">
                  {status.symbol}
                </span>
                <span>{clientDetail}</span>
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
          <span className="gauntlet-panel__note-marker" aria-hidden="true">
            *
          </span>{' '}
          'Still going' means the portfolio was solvent when the available return
          history ended; it is not a full-plan result.
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
        <div className="gauntlet-panel__source-block">
          <span className="gauntlet-panel__source">ACTUAL MONTHLY RETURNS</span>
          <span className="gauntlet-panel__source-date">
            {snapshot.result.seriesStartDate} → {snapshot.result.seriesEndDate}
          </span>
        </div>
      </div>
      <div
        className="gauntlet-table-wrap"
        role="region"
        tabIndex={0}
        aria-label="Scrollable historical gauntlet table"
      >
        <table className="gauntlet-table">
          <thead>
            <tr>
              <th scope="col">Cohort</th>
              <th scope="col">Plan result</th>
              <th scope="col" className="gauntlet-table__numeric">
                Ending wealth
              </th>
              <th scope="col" className="gauntlet-table__numeric">
                Max SWR
              </th>
              <th scope="col" className="gauntlet-table__numeric">
                Observed
              </th>
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
                    <span className="gauntlet-table__cohort">
                      <span className="gauntlet-table__swatch" aria-hidden="true" />
                      {cohort.cohort.label}
                    </span>
                  </th>
                  <td className="gauntlet-table__status">
                    <span
                      className={'gauntlet-table__symbol gauntlet-table__symbol--' + status.tone}
                      aria-hidden="true"
                    >
                      {status.symbol}
                    </span>{' '}
                    {status.detail}
                  </td>
                  <td className="gauntlet-table__numeric data-label">
                    {fmtUSDCompact(cohort.endingWealth)}
                  </td>
                  <td className="gauntlet-table__numeric data-label">
                    {fmtPct(cohort.maxSWR.annualRate, 2)}
                    {cohort.maxSWR.dataLimited ? '*' : ''}
                  </td>
                  <td className="gauntlet-table__numeric data-label">
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
        Max SWR uses level real monthly spending.{' '}
        <span className="gauntlet-panel__note-marker" aria-hidden="true">
          *
        </span>{' '}
        marks a data-limited cohort; it is not a full-horizon result.
      </p>
    </section>
  );
}

export function GauntletPanel() {
  const viewMode = useSimStore((state) => state.viewMode);
  return viewMode === 'client' ? <ClientGauntlet /> : <AdvisorGauntlet />;
}
