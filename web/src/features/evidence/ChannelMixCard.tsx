import { CHANNEL_LABELS, CHANNELS, formatEuro, formatPercent, type Channel, type ChannelMixOutput } from '@aurora/shared';
import { joinClassNames } from '../../lib/class-names';
import { isFactHighlighted, type FactInteraction } from '../insights/fact-links';
import { useDrawOnMount } from './useDrawOnMount';

interface ChannelMixCardProps {
  channelMix: ChannelMixOutput;
  interaction: FactInteraction;
  onShowProvenance: (factId: string) => void;
}

/** Facts this card illustrates. Hovering any of them outlines the card. */
const CHANNEL_FACT_IDS = ['ota_share', 'net_revpar', 'commission_cost', 'commission_mix_shift'];

/** Shares too small to hold a readable label are left unlabelled. */
const MINIMUM_SHARE_FOR_LABEL = 0.1;

export function StackedShareBar({ sharesByChannel, isDrawn }: { sharesByChannel: Record<Channel, number>; isDrawn: boolean }) {
  return (
    <div className="stacked-share-bar">
      {CHANNELS.map((channel) => {
        const share = sharesByChannel[channel];
        return (
          <span
            key={channel}
            className={`stacked-share-bar__part channel-color--${channel}`}
            style={{ width: isDrawn ? `${share * 100}%` : '0%' }}
            title={`${CHANNEL_LABELS[channel]} ${formatPercent(share)}`}
          >
            {share >= MINIMUM_SHARE_FOR_LABEL ? formatPercent(share, { decimals: 0 }) : ''}
          </span>
        );
      })}
    </div>
  );
}

export function ChannelLegend() {
  return (
    <div className="channel-legend">
      {CHANNELS.map((channel) => (
        <span key={channel} className="channel-legend__item">
          <span className={`channel-legend__swatch channel-color--${channel}`} aria-hidden="true" />
          {CHANNEL_LABELS[channel]}
        </span>
      ))}
    </div>
  );
}

export function ChannelMixCard({ channelMix, interaction, onShowProvenance }: ChannelMixCardProps) {
  const isDrawn = useDrawOnMount();
  const isHighlighted = CHANNEL_FACT_IDS.some((factId) => isFactHighlighted(factId, interaction.activeFactId));
  const shareThisPeriod = Object.fromEntries(channelMix.channels.map((line) => [line.channel, line.revenueShare])) as Record<Channel, number>;
  const shareLastYear = Object.fromEntries(channelMix.channels.map((line) => [line.channel, line.revenueShareLastYear])) as Record<Channel, number>;

  return (
    <section
      className={joinClassNames('evidence-card', isHighlighted && 'evidence-card--highlighted')}
      aria-label="Channel mix"
      onMouseEnter={() => interaction.hoverFact('ota_share')}
      onMouseLeave={() => interaction.hoverFact(null)}
    >
      <header className="evidence-card__header">
        <div className="evidence-card__titles">
          <span className="evidence-card__title">Channel mix</span>
          <span className="evidence-card__subtitle">Share of room revenue</span>
        </div>
      </header>

      <div className="channel-mix__rows">
        <span className="channel-mix__row-label">This month</span>
        <StackedShareBar sharesByChannel={shareThisPeriod} isDrawn={isDrawn} />
        <span className="channel-mix__row-label">Last year</span>
        <StackedShareBar sharesByChannel={shareLastYear} isDrawn={isDrawn} />
      </div>

      <ChannelLegend />

      <button type="button" className="evidence-card__link" onClick={() => onShowProvenance('commission_cost')}>
        Commission cost: {formatEuro(channelMix.totalCommissionCost)} ({formatPercent(channelMix.commissionShareOfRevenue)} of revenue)
      </button>
    </section>
  );
}
