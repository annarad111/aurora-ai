import {
  formatEuro,
  formatPeriodLabel,
  METRIC_META,
  type BriefingInsight,
  type DateRange,
  type GetPropertyStatusOutput,
  type KpiComparison,
  type PropertyEvent,
} from '@aurora/shared';
import { formatMetricValue } from '../../lib/metric-display';
import type { ProvenanceData } from '../../stream/run-reducer';
import { formatMeasureValue } from '../briefing/briefing-display';

// ---------------------------------------------------------------------------
// The evidence behind the figures of the Property Overview, in the same shape
// as an answer's "How was this calculated?", so the existing provenance card
// shows it. Built only from the data the page already has.
// ---------------------------------------------------------------------------

function evidence(fields: Omit<ProvenanceData, 'type' | 'runId' | 'sequence' | 'exploreView' | 'followupQuestions' | 'contextLabel' | 'contextText'>): ProvenanceData {
  return { type: 'provenance', runId: 'property-overview', sequence: 0, exploreView: null, followupQuestions: [], contextLabel: fields.title, contextText: '', ...fields };
}

export function inventoryEvidence(status: GetPropertyStatusOutput): ProvenanceData {
  const { inventory } = status;
  const isResults = status.basis === 'results';
  return evidence({
    factId: 'property_rooms',
    title: `Rooms on ${formatPeriodLabel({ from: status.date, to: status.date })}`,
    displayValue: `${inventory.vacantAvailable} vacant and available`,
    tool: 'get_property_status',
    formula: 'vacant & available = physical rooms − occupied − out of order − out of service',
    inputs: [
      { label: 'Physical rooms', value: String(inventory.physicalRooms) },
      { label: isResults ? 'Occupied (rooms sold)' : `Booked so far (as of ${status.asOf})`, value: String(inventory.occupied) },
      { label: 'Out of order', value: String(inventory.outOfOrder) },
      { label: 'Out of service', value: String(inventory.outOfService) },
      { label: 'Occupancy (of physical rooms)', value: formatMetricValue('occupancy', inventory.occupancyOfPhysical) },
    ],
    sourceQuery: isResults
      ? `daily_stats: Σ rooms_sold on ${status.date} + room_status_events covering ${status.date}`
      : `on_the_books: snapshot ${status.asOf}, stay ${status.date} + room_status_events covering ${status.date}`,
  });
}

const KPI_FORMULAS: Record<string, string> = {
  room_revenue: 'Σ room revenue of the period',
  occupancy: 'rooms sold / rooms available',
  adr: 'room revenue / rooms sold',
  revpar: 'room revenue / rooms available',
};

export function kpiEvidence(kpi: KpiComparison, period: DateRange): ProvenanceData {
  const format = (value: number) => (kpi.metric === 'room_revenue' ? formatEuro(value) : formatMetricValue(kpi.metric, value));
  return evidence({
    factId: `property_${kpi.metric}`,
    title: `${METRIC_META[kpi.metric].label}, ${formatPeriodLabel(period)}`,
    displayValue: format(kpi.actual),
    tool: 'get_hotel_overview',
    formula: KPI_FORMULAS[kpi.metric] ?? METRIC_META[kpi.metric].label,
    inputs: [
      { label: 'Actual', value: format(kpi.actual) },
      ...(kpi.target === null ? [] : [{ label: 'Target', value: format(kpi.target) }]),
      ...(kpi.lastYear === null ? [] : [{ label: 'Last year (same nights)', value: format(kpi.lastYear) }]),
    ],
    sourceQuery: `daily_stats and targets WHERE date BETWEEN ${period.from} AND ${period.to}`,
  });
}

export function eventEvidence(event: PropertyEvent): ProvenanceData {
  const nights = formatPeriodLabel({ from: event.firstNight, to: event.lastNight });
  if (event.type === 'maintenance') {
    return evidence({
      factId: `event_${event.id}`,
      title: `${event.roomNumbers.length === 1 ? 'Room' : 'Rooms'} ${event.roomNumbers.join(', ')}: ${event.reason}`,
      displayValue: `${event.impact.roomNights} room nights unsellable, ${event.impact.nightsFull} full nights`,
      tool: 'get_room_events',
      formula: 'per night: vacant = physical rooms − rooms sold (or booked so far) − rooms out of order or out of service; a full night has no vacant room',
      inputs: event.impact.nights.map((night) => ({
        label: `${night.date}${night.basis === 'on_the_books' ? ' (booked so far)' : ''}`,
        value: `${night.vacantRooms} vacant${night.isFull ? ', full' : ''}`,
      })),
      sourceQuery: `room_status_events ${event.id} (${nights}) + daily_stats / on_the_books for those nights`,
    });
  }
  return evidence({
    factId: `event_${event.id}`,
    title: event.type === 'group_arrival' ? `${event.name} (group arrival)` : `${event.name} (cancelled)`,
    displayValue: `${event.roomNights} room nights`,
    tool: 'get_group_blocks',
    formula: 'room nights = rooms per night × nights',
    inputs: [
      { label: 'Nights', value: nights },
      { label: 'Rooms per night', value: String(event.roomsPerNight) },
      { label: 'Segment', value: event.segment },
      ...(event.type === 'group_cancellation' ? [{ label: 'Cancelled on', value: event.cancelledOn }] : []),
    ],
    sourceQuery: `group_blocks WHERE id = ${event.id}`,
  });
}

export function briefingEvidence(item: BriefingInsight): ProvenanceData {
  const { measure } = item;
  return evidence({
    factId: `briefing_${item.id}`,
    title: item.title,
    displayValue: formatMeasureValue(measure.unit, measure.value),
    tool: item.sourceTool,
    formula: `${measure.label} against ${measure.baselineLabel}`,
    inputs: [
      { label: measure.label, value: formatMeasureValue(measure.unit, measure.value) },
      { label: `Baseline (${measure.baselineLabel})`, value: formatMeasureValue(measure.unit, measure.baseline) },
      { label: 'Period', value: formatPeriodLabel(item.period) },
      { label: 'Priority', value: item.priority },
    ],
    sourceQuery: item.source,
  });
}
