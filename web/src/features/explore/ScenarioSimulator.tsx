import { simulateScenario } from '@aurora/analytics';
import { formatCount, formatEuro, formatPercent, formatPeriodLabel, type ScenarioBasis, type ScenarioLevers } from '@aurora/shared';
import { useId, useMemo, useState } from 'react';
import { joinClassNames } from '../../lib/class-names';
import { useScenarioBasis } from './useScenarioBasis';

const NO_CHANGE: ScenarioLevers = { paceRecovery: 0, rateChange: 0, otaToDirect: 0 };

interface ScenarioSimulatorProps {
  hotelId: string;
  stayFrom: string;
  stayTo: string;
}

/**
 * "What if": three levers for the coming stay dates and their effect on
 * revenue and net revenue. Loads the basis from the simulate_scenario tool,
 * then recalculates in the browser with the same function as the tool.
 */
export function ScenarioSimulator({ hotelId, stayFrom, stayTo }: ScenarioSimulatorProps) {
  const basisState = useScenarioBasis(hotelId, stayFrom, stayTo);

  return (
    <section className="scenario-simulator" aria-labelledby="scenario-simulator-title">
      <header className="scenario-simulator__header">
        <span className="scenario-simulator__eyebrow">What if</span>
        <h3 id="scenario-simulator-title" className="scenario-simulator__title">
          Try levers for {formatPeriodLabel({ from: stayFrom, to: stayTo })}
        </h3>
      </header>
      {basisState.status === 'loading' && <p className="scenario-simulator__status">Loading what is on the books…</p>}
      {basisState.status === 'error' && <p className="scenario-simulator__status scenario-simulator__status--error">{basisState.message}</p>}
      {basisState.status === 'ready' && <ScenarioControls basis={basisState.basis} />}
    </section>
  );
}

interface LeverProps {
  label: string;
  valueText: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

function Lever({ label, valueText, hint, min, max, step, value, onChange }: LeverProps) {
  const inputId = useId();
  return (
    <div className="scenario-lever">
      <div className="scenario-lever__top">
        <label htmlFor={inputId} className="scenario-lever__label">
          {label}
        </label>
        <span className="scenario-lever__value">{valueText}</span>
      </div>
      <input
        id={inputId}
        className="scenario-lever__slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="scenario-lever__hint">{hint}</span>
    </div>
  );
}

function ScenarioControls({ basis }: { basis: ScenarioBasis }) {
  const [levers, setLevers] = useState<ScenarioLevers>(NO_CHANGE);
  // The same deterministic function the simulate_scenario tool runs on the server.
  const outcome = useMemo(() => simulateScenario(basis, levers), [basis, levers]);
  const setLever = (lever: keyof ScenarioLevers) => (value: number) => setLevers((current) => ({ ...current, [lever]: value }));
  const hasChanges = levers.paceRecovery !== 0 || levers.rateChange !== 0 || levers.otaToDirect !== 0;

  const otaShare = basis.channelRevenueShares.ota ?? 0;
  const otaCommission = basis.commissionRates.ota ?? 0;
  const directCommission = basis.commissionRates.direct ?? 0;
  const { baseline, scenario, effects } = outcome;

  const comparisonRows = [
    { label: 'Room nights', today: formatCount(baseline.roomNights), withLevers: formatCount(scenario.roomNights) },
    { label: 'Room revenue', today: formatEuro(baseline.roomRevenue), withLevers: formatEuro(scenario.roomRevenue) },
    { label: 'Commission (estimated)', today: formatEuro(baseline.commission), withLevers: formatEuro(scenario.commission) },
    { label: 'Net revenue', today: formatEuro(baseline.netRevenue), withLevers: formatEuro(scenario.netRevenue) },
  ];
  const effectRows = [
    { label: `Recovered room nights (${formatCount(outcome.recoveredRoomNights)} at ${formatEuro(outcome.averageRateOnTheBooks)})`, amount: effects.recoveredNights },
    { label: 'Rate on those room nights', amount: effects.rateOnNewBookings },
    { label: 'Commission on the extra revenue', amount: effects.commissionOnNewRevenue },
    { label: 'Commission saved by direct bookings', amount: effects.commissionSavedByDirect },
  ];

  return (
    <div className="scenario-simulator__body">
      <div className="scenario-simulator__levers">
        <Lever
          label="Win back the pace gap"
          valueText={formatPercent(levers.paceRecovery, { decimals: 0 })}
          hint={`${formatCount(outcome.roomNightsBehindLastYear)} room nights behind last year · ${formatCount(outcome.recoveredRoomNights)} won back`}
          min={0}
          max={1}
          step={0.05}
          value={levers.paceRecovery}
          onChange={setLever('paceRecovery')}
        />
        <Lever
          label="Rate for the rooms still to sell"
          valueText={formatPercent(levers.rateChange, { decimals: 0, signDisplay: levers.rateChange === 0 ? 'negative_only' : 'always' })}
          hint={`${formatEuro(outcome.rateForNewBookings, { decimals: 2 })} vs ${formatEuro(outcome.averageRateOnTheBooks, { decimals: 2 })} on the books · applies to won-back nights`}
          min={-0.2}
          max={0.2}
          step={0.01}
          value={levers.rateChange}
          onChange={setLever('rateChange')}
        />
        <Lever
          label="OTA bookings that come direct"
          valueText={formatPercent(levers.otaToDirect, { decimals: 0 })}
          hint={`OTA is ${formatPercent(otaShare, { decimals: 0 })} of revenue · commission ${formatPercent(otaCommission, { decimals: 0 })} vs ${formatPercent(directCommission, { decimals: 0 })} direct`}
          min={0}
          max={0.5}
          step={0.05}
          value={levers.otaToDirect}
          onChange={setLever('otaToDirect')}
        />
        <button type="button" className="secondary-button scenario-simulator__reset" onClick={() => setLevers(NO_CHANGE)} disabled={!hasChanges}>
          Reset levers
        </button>
      </div>

      <div className="scenario-simulator__result" aria-live="polite">
        <span className="scenario-simulator__result-label">Net revenue change</span>
        <strong
          className={joinClassNames(
            'scenario-simulator__headline',
            effects.netChange > 0.5 && 'scenario-simulator__headline--positive',
            effects.netChange < -0.5 && 'scenario-simulator__headline--negative',
          )}
        >
          {formatEuro(effects.netChange, { signDisplay: Math.abs(effects.netChange) < 0.5 ? 'negative_only' : 'always' })}
        </strong>

        <table className="scenario-table">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">On the books</th>
              <th scope="col">With levers</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.today}</td>
                <td>{row.withLevers}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="scenario-effects">
          {effectRows.map((row) => (
            <li key={row.label} className="scenario-effects__row">
              <span>{row.label}</span>
              <span className="scenario-effects__amount">{formatEuro(row.amount, { signDisplay: Math.abs(row.amount) < 0.5 ? 'negative_only' : 'always' })}</span>
            </li>
          ))}
        </ul>

        {outcome.limitedByCapacity && <p className="scenario-simulator__note">The hotel is full before the whole gap fits; the recovery stops at capacity.</p>}
        <p className="scenario-simulator__note">
          Calculated with simulate_scenario (also available to MCP clients) from rooms on the books today and the channel mix of{' '}
          {formatPeriodLabel(basis.channelMixPeriod)}. Rooms already booked keep their rate.
        </p>
      </div>
    </div>
  );
}
