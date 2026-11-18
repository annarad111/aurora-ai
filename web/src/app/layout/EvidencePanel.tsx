import { BookingPaceCard } from '../../features/evidence/BookingPaceCard';
import { ChannelMixCard } from '../../features/evidence/ChannelMixCard';
import { ProvenanceCard } from '../../features/evidence/ProvenanceCard';
import { RevenueBridgeCard } from '../../features/evidence/RevenueBridgeCard';
import type { InsightView } from '../../features/explore/explore-views';
import type { FactInteraction } from '../../features/insights/fact-links';
import type { ProvenanceData, RunState } from '../../stream/run-reducer';

interface EvidencePanelProps {
  run: RunState;
  interaction: FactInteraction;
  /** When set, the panel shows "How was this calculated?" for this figure instead of the charts. */
  openProvenance: ProvenanceData | null;
  onShowProvenance: (factId: string) => void;
  onCloseProvenance: () => void;
  onOpenExplore: (view: InsightView) => void;
}

/**
 * Right-hand column: the charts behind the answer, in the order their tools
 * answered. Each card appears as soon as its data arrives.
 */
export function EvidencePanel({ run, interaction, openProvenance, onShowProvenance, onCloseProvenance, onOpenExplore }: EvidencePanelProps) {
  const revenueBridge = run.charts.revenue_bridge?.kind === 'revenue_bridge' ? run.charts.revenue_bridge.data : null;
  const channelMix = run.charts.channel_mix?.kind === 'channel_mix' ? run.charts.channel_mix.data : null;
  const bookingPace = run.charts.booking_pace?.kind === 'booking_pace' ? run.charts.booking_pace.data : null;
  const hasCharts = Boolean(revenueBridge || channelMix || bookingPace);

  return (
    <aside className="evidence-panel workspace__evidence-panel" aria-label="Evidence panel">
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
            />
          )}
        </>
      )}
    </aside>
  );
}
