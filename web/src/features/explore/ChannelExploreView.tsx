import { formatEuro, formatPercent, formatPercentagePoints, formatPeriodLabel, type Channel, type ChannelMixOutput } from '@aurora/shared';
import { ChannelLegend, StackedShareBar } from '../evidence/ChannelMixCard';
import { useDrawOnMount } from '../evidence/useDrawOnMount';

interface ChannelExploreViewProps {
  channelMix: ChannelMixOutput;
}

interface ChannelRow {
  label: string;
  sharesByChannel: Record<Channel, number>;
  commissionShareOfRevenue: number;
  isCurrentPeriod: boolean;
}

/** Channel shares over time (previous months, this period, last year) with the commission each period cost. */
export function ChannelExploreView({ channelMix }: ChannelExploreViewProps) {
  const isDrawn = useDrawOnMount();
  const currentYear = channelMix.period.from.slice(0, 4);
  const toRow = (comparison: ChannelMixOutput['comparisonPeriods'][number]): ChannelRow => ({
    label: comparison.label,
    // The schema guarantees every channel is present (Zod 4 records with enum keys are exhaustive).
    sharesByChannel: comparison.revenueShareByChannel,
    commissionShareOfRevenue: comparison.commissionShareOfRevenue,
    isCurrentPeriod: false,
  });

  // Earlier months of this year first, then this period, then last year.
  const rows: ChannelRow[] = [
    ...channelMix.comparisonPeriods.filter((comparison) => comparison.period.from.startsWith(currentYear)).map(toRow),
    {
      label: formatPeriodLabel(channelMix.period),
      sharesByChannel: Object.fromEntries(channelMix.channels.map((line) => [line.channel, line.revenueShare])) as Record<Channel, number>,
      commissionShareOfRevenue: channelMix.commissionShareOfRevenue,
      isCurrentPeriod: true,
    },
    ...channelMix.comparisonPeriods.filter((comparison) => !comparison.period.from.startsWith(currentYear)).map(toRow),
  ];

  const ota = channelMix.channels.find((line) => line.channel === 'ota');
  const statTiles = [
    { label: `Commission paid, ${formatPeriodLabel(channelMix.period)}`, value: formatEuro(channelMix.totalCommissionCost) },
    { label: 'Net RevPAR', value: formatEuro(channelMix.netRevpar, { decimals: 2 }) },
    ...(ota ? [{ label: 'OTA share vs last year', value: formatPercentagePoints(ota.revenueShare - ota.revenueShareLastYear, { decimals: 0 }) }] : []),
  ];

  return (
    <div className="explore-view">
      <div className="channel-table">
        <div className="channel-table__row channel-table__row--header">
          <span>Period</span>
          <span>Share of room revenue</span>
          <span className="channel-table__commission">Commission</span>
        </div>
        {rows.map((row) => (
          <div key={row.label} className={`channel-table__row ${row.isCurrentPeriod ? 'channel-table__row--current' : ''}`}>
            <span className="channel-table__period">{row.label}</span>
            <StackedShareBar sharesByChannel={row.sharesByChannel} isDrawn={isDrawn} />
            <span className="channel-table__commission">{formatPercent(row.commissionShareOfRevenue)}</span>
          </div>
        ))}
      </div>

      <ChannelLegend />

      <div className="stat-tiles">
        {statTiles.map((tile) => (
          <div key={tile.label} className="stat-tile">
            <span className="stat-tile__label">{tile.label}</span>
            <span className="stat-tile__value">{tile.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
