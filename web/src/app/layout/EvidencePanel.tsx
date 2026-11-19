import { BookingPaceCard } from '../../features/evidence/BookingPaceCard';
import { ChannelMixCard } from '../../features/evidence/ChannelMixCard';
import { PerformanceTableCard } from '../../features/evidence/PerformanceTableCard';
import { ProvenanceCard } from '../../features/evidence/ProvenanceCard';
import { RevenueBridgeCard } from '../../features/evidence/RevenueBridgeCard';
import { isViewAvailable, readExploreData, type InsightView } from '../../features/explore/explore-views';
import type { InvestigationAction } from '../../features/investigation/investigation-actions';
import type { FactInteraction } from '../../features/insights/fact-links';
import { BREAKDOWN_METRICS, type BreakdownMetric } from '@aurora/shared';
import type { ProvenanceData, RunState } from '../../stream/run-reducer';

interface EvidencePanelProps {
  run: RunState;
  /** The answer was opened from history: its charts appear as they are, without drawing in. */
  isRestored: boolean;
  interaction: FactInteraction;
  /** When set, the panel shows "How was this calculated?" for this figure instead of the charts. */
  openProvenance: ProvenanceData | null;
  onShowProvenance: (factId: string) => void;
  onCloseProvenance: () => void;
  onOpenExplore: (view: InsightView) => void;
  onAction: (action: InvestigationAction) => void;
}

/**
 * Right-hand column: the charts behind the answer, in the order their tools
 * answered. Each card appears as soon as its data arrives.
 */
export function EvidencePanel({
  run,
  isRestored,
  interaction,
  openProvenance,
  onShowProvenance,
  onCloseProvenance,
  onOpenExplore,
  onAction,
}: EvidencePanelProps) {
  const revenueBridge = run.charts.revenue_bridge?.kind === 'revenue_bridge' ? run.charts.revenue_bridge.data : null;
  const channelMix = run.charts.channel_mix?.kind === 'channel_mix' ? run.charts.channel_mix.data : null;
  const bookingPace = run.charts.booking_pace?.kind === 'booking_pace' ? run.charts.booking_pace.data : null;
  const performanceTable = run.charts.performance_table?.kind === 'performance_table' ? run.charts.performance_table.data : null;
  const hasCharts = Boolean(revenueBridge || channelMix || bookingPace || performanceTable);
  // The answer's lead metric is the last part of its first fact id (query.0.<row>.<metric>).
  const leadMetric = run.insight?.factIds[0]?.split('.').at(-1);
  const initialMetric: BreakdownMetric = BREAKDOWN_METRICS.includes(leadMetric as BreakdownMetric) ? (leadMetric as BreakdownMetric) : 'room_revenue';

  return (
    <aside className={`evidence-panel workspace__evidence-panel${isRestored ? ' evidence-panel--restored' : ''}`} aria-label="Evidence panel">
      {openProvenance ? (
        <ProvenanceCard provenance={openProvenance} onClose={onCloseProvenance} />
      ) : (
        <>
          {!hasCharts && (
            <div className="evidence-panel__empty">
              <span className="evidence-panel__empty-title">Evidence panel</span>
              <span className="evidence-panel__empty-text">
                Charts appear here as Aurora works. Click any number to see where it comes from.
              </span>
            </div>
          )}
          {performanceTable && (
            <PerformanceTableCard key={run.runId} output={performanceTable} initialMetric={initialMetric} interaction={interaction} />
          )}
          {revenueBridge && (
            <RevenueBridgeCard drivers={revenueBridge} interaction={interaction} onExpand={() => onOpenExplore('bridge')} />
          )}
          {channelMix && (
            <ChannelMixCard
              channelMix={channelMix}
              interaction={interaction}
              onShowProvenance={onShowProvenance}
              onExpand={() => onOpenExplore('channel')}
            />
          )}
          {bookingPace && (
            <BookingPaceCard
              pace={bookingPace}
              interaction={interaction}
              onShowProvenance={onShowProvenance}
              onExpand={() => onOpenExplore('pace')}
              actionOptions={{
                hasEvidenceFor: (factId) => factId in run.provenanceByFactId,
                canOpenView: (view) => isViewAvailable(view, readExploreData(run)),
              }}
              onAction={onAction}
              // A new answer starts without a selected night.
              key={run.runId ?? 'pace'}
            />
          )}
        </>
      )}
    </aside>
  );
}
