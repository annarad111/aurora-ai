import type { Channel, ChannelCommission } from '@aurora/shared';
import { divideOrZero } from './kpi';

// ---------------------------------------------------------------------------
// Channel mix and distribution cost.
//
// Gross revenue can look "almost fine" while more of it goes to OTAs. The
// commission cost shows that revenue is not profit.
// ---------------------------------------------------------------------------

export interface ChannelRevenue {
  channel: Channel;
  roomRevenue: number;
}

export interface ChannelMixLine extends ChannelRevenue {
  revenueShare: number;
  commissionRate: number;
  commissionCost: number;
}

export interface ChannelMix {
  roomRevenue: number;
  lines: ChannelMixLine[];
  totalCommissionCost: number;
  /** Commission as a fraction of room revenue: 22,492 / 208,260 = 0.108. */
  commissionShareOfRevenue: number;
}

function findCommissionRate(channel: Channel, commissions: readonly ChannelCommission[]): number {
  const commission = commissions.find((candidate) => candidate.channel === channel);
  if (!commission) {
    // Fail loudly: a missing commission would silently overstate net revenue.
    throw new Error(`No commission rate configured for channel "${channel}"`);
  }
  return commission.commissionRate;
}

export function calculateChannelMix(
  revenueByChannel: readonly ChannelRevenue[],
  commissions: readonly ChannelCommission[],
): ChannelMix {
  const roomRevenue = revenueByChannel.reduce((total, line) => total + line.roomRevenue, 0);

  const lines = revenueByChannel.map((line): ChannelMixLine => {
    const commissionRate = findCommissionRate(line.channel, commissions);
    return {
      channel: line.channel,
      roomRevenue: line.roomRevenue,
      revenueShare: divideOrZero(line.roomRevenue, roomRevenue),
      commissionRate,
      commissionCost: line.roomRevenue * commissionRate,
    };
  });

  const totalCommissionCost = lines.reduce((total, line) => total + line.commissionCost, 0);

  return {
    roomRevenue,
    lines,
    totalCommissionCost,
    commissionShareOfRevenue: divideOrZero(totalCommissionCost, roomRevenue),
  };
}

/**
 * What the change in channel mix costs: the commission paid now, minus the
 * commission the same revenue would have cost with last year's channel shares.
 * A positive number means the new mix is more expensive.
 */
export function calculateExtraCommissionFromMixShift(
  currentMix: ChannelMix,
  revenueShareLastYearByChannel: Readonly<Record<Channel, number>>,
): number {
  const commissionWithLastYearMix = currentMix.lines.reduce(
    (total, line) => total + currentMix.roomRevenue * revenueShareLastYearByChannel[line.channel] * line.commissionRate,
    0,
  );
  return currentMix.totalCommissionCost - commissionWithLastYearMix;
}
