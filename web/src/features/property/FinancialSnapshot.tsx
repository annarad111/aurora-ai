import { formatEuroCompact, formatPeriodLabel, METRIC_META, type InvestigationContext, type KpiComparison, type PropertyOverview } from '@aurora/shared';
import { useState } from 'react';
import { ArrowRightIcon } from '../../design-system/icons';
import { joinClassNames } from '../../lib/class-names';
import { formatMetricDelta, formatMetricValue, STATUS_DISPLAY } from '../../lib/metric-display';

/** What each KPI means, shown under it. */
const KPI_DEFINITIONS: Record<string, string> = {
  room_revenue: 'Room revenue of the month, before commissions.',
  occupancy: 'Rooms sold / rooms available.',
  adr: 'Average daily rate: room revenue / rooms sold.',
  revpar: 'Revenue per available room: room revenue / rooms available.',
};

interface FinancialSnapshotProps {
  financial: PropertyOverview['financial'];
  onInvestigate: (question: string, context?: InvestigationContext) => void;
  onShowEvidence: (kpi: KpiComparison) => void;
}

/**
 * The previous completed month at a glance (revenue, occupancy, ADR, RevPAR
 * against target and last year) and room revenue per month. The detail
 * stays in the chat: each question starts an investigation of this month.
 */
export function FinancialSnapshot({ financial, onInvestigate, onShowEvidence }: FinancialSnapshotProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const monthLabel = formatPeriodLabel(financial.period);
  const tallest = Math.max(
    1,
    ...financial.monthlyRevenue.flatMap((month) => [month.roomRevenue, month.roomRevenueTarget ?? 0, month.roomRevenueLastYear ?? 0]),
  );
  const shownMonth = financial.monthlyRevenue.find((month) => month.label === selectedMonth) ?? null;

  return (
    <div className="financial-snapshot">
      <div className="financial-snapshot__kpis">
        {financial.kpis.map((kpi) => {
          const status = STATUS_DISPLAY[kpi.status];
          return (
            <div key={kpi.metric} className="financial-kpi">
              <span className="financial-kpi__label">{METRIC_META[kpi.metric].label}</span>
              <span className="financial-kpi__value">
                {kpi.metric === 'room_revenue' ? formatEuroCompact(kpi.actual) : formatMetricValue(kpi.metric, kpi.actual)}
              </span>
              {kpi.target !== null && (
                <span className={`status-badge status-badge--${status.modifier}`}>
                  <span aria-hidden="true">{status.icon}</span>
                  {formatMetricDelta(kpi.metric, kpi.actual, kpi.target)} vs target
                  <span className="visually-hidden">, {status.label}</span>
                </span>
              )}
              {kpi.lastYear !== null && (
                <span className="financial-kpi__comparison">{formatMetricDelta(kpi.metric, kpi.actual, kpi.lastYear)} vs last year</span>
              )}
              <span className="financial-kpi__definition">{KPI_DEFINITIONS[kpi.metric]}</span>
              <button type="button" className="text-button financial-kpi__evidence" onClick={() => onShowEvidence(kpi)}>
                View evidence
              </button>
            </div>
          );
        })}
      </div>

      <div className="revenue-months">
        <div className="revenue-months__header">
          <span className="revenue-months__title">Room revenue per month</span>
          <span className="revenue-months__legend">
            <span className="revenue-months__swatch revenue-months__swatch--actual" aria-hidden="true" /> Actual
            <span className="revenue-months__swatch revenue-months__swatch--target" aria-hidden="true" /> Target
            <span className="revenue-months__swatch revenue-months__swatch--last-year" aria-hidden="true" /> Last year
          </span>
        </div>
        <div className="revenue-months__chart" role="group" aria-label="Room revenue per month. Select a month for its figures.">
          {financial.monthlyRevenue.map((month) => (
            <button
              key={month.label}
              type="button"
              className={joinClassNames(
                'revenue-months__month',
                !month.isComplete && 'revenue-months__month--partial',
                selectedMonth === month.label && 'revenue-months__month--selected',
              )}
              aria-pressed={selectedMonth === month.label}
              aria-label={`${month.label}${month.isComplete ? '' : ' so far'}: ${formatEuroCompact(month.roomRevenue)}`}
              onClick={() => setSelectedMonth((current) => (current === month.label ? null : month.label))}
            >
              <span className="revenue-months__plot">
                <span className="revenue-months__bar" style={{ height: `${(month.roomRevenue / tallest) * 100}%` }} />
                {month.roomRevenueTarget !== null && (
                  <span className="revenue-months__tick revenue-months__tick--target" style={{ bottom: `${(month.roomRevenueTarget / tallest) * 100}%` }} />
                )}
                {month.roomRevenueLastYear !== null && (
                  <span className="revenue-months__tick revenue-months__tick--last-year" style={{ bottom: `${(month.roomRevenueLastYear / tallest) * 100}%` }} />
                )}
              </span>
              <span className="revenue-months__label">
                {month.label.split(' ')[0]}
                {!month.isComplete && ' (so far)'}
              </span>
            </button>
          ))}
        </div>
        <p className="revenue-months__detail" aria-live="polite">
          {shownMonth
            ? `${formatPeriodLabel(shownMonth.period)}: ${formatEuroCompact(shownMonth.roomRevenue)}${
                shownMonth.roomRevenueTarget !== null ? ` against a target of ${formatEuroCompact(shownMonth.roomRevenueTarget)}` : ''
              }${shownMonth.roomRevenueLastYear !== null ? ` and ${formatEuroCompact(shownMonth.roomRevenueLastYear)} last year` : ''}.`
            : `Results start on ${formatPeriodLabel({ from: financial.historyStart, to: financial.historyStart })}, so the chart shows ${financial.monthlyRevenue.length} months. Select one for its figures.`}
        </p>
      </div>

      <div className="financial-snapshot__actions">
        <button
          type="button"
          className="primary-button"
          onClick={() =>
            onInvestigate(`Why was revenue below target in ${monthLabel}?`, {
              origin: 'property',
              intent: 'revenue_gap',
              interaction: 'explain',
              metric: 'room_revenue',
              dateRange: financial.period,
            })
          }
        >
          Investigate {monthLabel} with Aurora <ArrowRightIcon />
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            onInvestigate(`How did ${monthLabel} compare with last year?`, {
              origin: 'property',
              intent: 'data_question',
              interaction: 'compare',
              metric: 'room_revenue',
              breakdown: 'segment',
              dateRange: financial.period,
            })
          }
        >
          Compare with last year
        </button>
      </div>
    </div>
  );
}
