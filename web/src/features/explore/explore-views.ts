import { formatPeriodLabel } from '@aurora/shared';
import type { ProvenanceData, RunState } from '../../stream/run-reducer';

/** The four Explore overlay views. Each figure's provenance says which one explains it. */
export type InsightView = NonNullable<ProvenanceData['exploreView']>;

/** The figure whose follow-up questions the overlay footer shows when nothing else is selected. */
export const MAIN_FACT_OF_VIEW: Record<InsightView, string> = {
  occupancy: 'occupancy',
  bridge: 'revenue_gap',
  channel: 'ota_share',
  pace: 'booking_pace',
};

// Which chart data each Explore view needs, and its title. A view can only
// open when its tool has answered (a pace question has no revenue bridge).

export function readExploreData(run: RunState) {
  const charts = run.charts;
  return {
    overview: charts.occupancy_trend?.kind === 'occupancy_trend' ? charts.occupancy_trend.data : null,
    drivers: charts.revenue_bridge?.kind === 'revenue_bridge' ? charts.revenue_bridge.data : null,
    channelMix: charts.channel_mix?.kind === 'channel_mix' ? charts.channel_mix.data : null,
    pace: charts.booking_pace?.kind === 'booking_pace' ? charts.booking_pace.data : null,
  };
}

export type ExploreData = ReturnType<typeof readExploreData>;

export function isViewAvailable(view: InsightView, data: ExploreData): boolean {
  switch (view) {
    case 'occupancy':
      return data.overview !== null;
    case 'bridge':
      return data.drivers !== null;
    case 'channel':
      return data.channelMix !== null;
    case 'pace':
      return data.pace !== null;
  }
}

export function describeView(view: InsightView, data: ExploreData): { title: string; subtitle: string } {
  switch (view) {
    case 'occupancy':
      return {
        title: 'Occupancy trend vs target',
        subtitle: `Daily occupancy for ${data.overview ? formatPeriodLabel(data.overview.period) : 'the period'}. Nights with a cancelled group block are highlighted.`,
      };
    case 'bridge':
      return {
        title: 'Revenue bridge',
        subtitle: 'How target becomes actual, with the volume effect broken down by segment. Click a bar to see its formula.',
      };
    case 'channel':
      return {
        title: 'Channel mix and distribution cost',
        subtitle: 'Share of room revenue by channel and the commission paid, compared with previous months and last year.',
      };
    case 'pace':
      return {
        title: data.pace ? `Booking pace, ${formatPeriodLabel({ from: data.pace.stayFrom, to: data.pace.stayTo })}` : 'Booking pace',
        subtitle: 'Room nights on the books per stay date compared with the same point last year.',
      };
  }
}
