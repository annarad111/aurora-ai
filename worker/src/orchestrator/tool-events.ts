import { classifyMetricStatus } from '@aurora/analytics';
import { METRIC_META, type MetricId, type ToolName } from '@aurora/shared';
import type { StreamEventPayload } from '../sse/sse-event-stream';
import type { AnalysisContext } from './analysis-context';
import { readKpi } from './derived-facts';

// The structured events that follow each tool: KPI cards and charts. They go
// out as soon as the tool answers, before any text, so the screen fills progressively.

const KPI_CARDS_AFTER_OVERVIEW: MetricId[] = ['occupancy', 'adr', 'revpar'];

export function buildEventsAfterTool(tool: ToolName, analysis: AnalysisContext): StreamEventPayload[] {
  const { overview, drivers, channelMix, pace } = analysis.results;

  switch (tool) {
    case 'get_hotel_overview': {
      if (!overview) return [];
      const kpiEvents = KPI_CARDS_AFTER_OVERVIEW.map((metric): StreamEventPayload => {
        const kpi = readKpi(overview, metric);
        return {
          type: 'kpi',
          factId: metric,
          metric,
          label: METRIC_META[metric].label,
          actual: kpi.actual,
          reference: kpi.target,
          referenceKind: kpi.target === null ? 'none' : 'target',
          status: kpi.status,
        };
      });
      return [
        ...kpiEvents,
        // Not shown in the evidence panel: the data behind the occupancy view of the Explore overlay.
        { type: 'chart', chart: { kind: 'occupancy_trend', data: overview }, factIds: ['occupancy', 'revpar'] },
      ];
    }

    case 'analyze_revenue_drivers':
      if (!drivers) return [];
      return [
        {
          type: 'chart',
          chart: { kind: 'revenue_bridge', data: drivers },
          factIds: ['revenue_gap', 'volume', 'mix', 'pure_price', 'price_effect', ...drivers.segments.map((segment) => `volume_${segment.segment}`)],
        },
      ];

    case 'get_channel_mix':
      if (!channelMix) return [];
      return [
        {
          type: 'kpi',
          factId: 'net_revpar',
          metric: 'net_revpar',
          label: METRIC_META.net_revpar.label,
          actual: channelMix.netRevpar,
          reference: channelMix.netRevparTarget,
          referenceKind: channelMix.netRevparTarget === null ? 'none' : 'target',
          status: classifyMetricStatus('net_revpar', channelMix.netRevpar, channelMix.netRevparTarget),
        },
        { type: 'chart', chart: { kind: 'channel_mix', data: channelMix }, factIds: ['ota_share', 'net_revpar', 'commission_cost'] },
      ];

    case 'get_booking_pace':
      if (!pace) return [];
      return [{ type: 'chart', chart: { kind: 'booking_pace', data: pace }, factIds: ['booking_pace', 'pace_pickup'] }];

    case 'query_performance': {
      // The table of the query that just ran (the latest one).
      const queries = analysis.results.queries ?? [];
      const latest = queries.at(-1);
      if (!latest) return [];
      return [{ type: 'chart', chart: { kind: 'performance_table', data: latest.output }, factIds: [] }];
    }

    case 'get_group_blocks':
      // Blocks are listed in the text; each one links to its provenance.
      return [];

    case 'simulate_scenario':
      // Not used by the chat: the what-if runs in the simulator.
      return [];

    case 'get_decisions':
    case 'get_property_status':
      // Decisions and the property have their own answers (decisions-answer.ts, property-answer.ts).
      return [];
  }
}
