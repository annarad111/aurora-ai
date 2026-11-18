import { formatCount, formatEuro, formatPercent, SEGMENT_LABELS } from '@aurora/shared';
import type { AnalysisContext } from './analysis-context';
import {
  describeNights,
  findBiggestVolumeLoss,
  findCancelledBlock,
  findChannelLine,
  findShareShift,
  readKpi,
  relativeChange,
} from './derived-facts';

// ---------------------------------------------------------------------------
// The figures the language model may use, each behind a placeholder.
//
// The model writes "Revenue is {revenue_gap} below target", never the number
// itself. We replace each placeholder with the exact text below, computed by
// the analytics. So the model chooses words and order; it cannot change a
// number. Entries only exist for tools that ran.
// ---------------------------------------------------------------------------

export interface CatalogueEntry {
  /** The placeholder name, written as {key} by the model. */
  key: string;
  /** The text that replaces the placeholder. */
  text: string;
  /** What it means, so the model can write a correct sentence around it. */
  meaning: string;
  /** The fact it belongs to. Entries with a fact become clickable figures; others (dates) stay plain text. */
  factId?: string;
}

function percentText(ratio: number, decimals = 1): string {
  return formatPercent(Math.abs(ratio), { decimals });
}

export function buildFigureCatalogue(analysis: AnalysisContext): CatalogueEntry[] {
  const { overview, drivers, channelMix, pace } = analysis.results;
  const entries: CatalogueEntry[] = [{ key: 'period', text: describeNights(analysis.period), meaning: 'the period being analysed (month to date)' }];

  if (overview) {
    const occupancy = readKpi(overview, 'occupancy');
    const adr = readKpi(overview, 'adr');
    const revpar = readKpi(overview, 'revpar');
    const adrChange = relativeChange(adr.actual, adr.target);
    const revparChange = relativeChange(revpar.actual, revpar.target);
    entries.push(
      { key: 'occupancy', factId: 'occupancy', text: formatPercent(occupancy.actual), meaning: 'occupancy so far this month' },
      ...(occupancy.target === null
        ? []
        : [{ key: 'occupancy_target', text: formatPercent(occupancy.target), meaning: 'the occupancy target for the period' }]),
      {
        key: 'adr_vs_target',
        factId: 'adr',
        text: `${percentText(adrChange)} ${adrChange >= 0 ? 'above' : 'below'} target`,
        meaning: 'ADR compared with target, already includes "above/below target". Write: "ADR is {adr_vs_target}"',
      },
      {
        key: 'revpar_change',
        factId: 'revpar',
        text: percentText(revparChange),
        meaning: `percentage RevPAR is ${revparChange < 0 ? 'below' : 'above'} target. Write: "RevPAR is {revpar_change} ${revparChange < 0 ? 'below' : 'above'} target"`,
      },
    );
    const cancelledBlock = findCancelledBlock(overview);
    if (cancelledBlock) {
      entries.push({ key: 'block_nights', text: describeNights(cancelledBlock), meaning: 'the nights of the cancelled group block' });
    }
  }

  if (drivers) {
    const roomNightDifference = drivers.segments.reduce((total, segment) => total + segment.roomsSoldActual - segment.roomsSoldTarget, 0);
    const biggestLoss = findBiggestVolumeLoss(drivers);
    const { gaining, losing } = findShareShift(drivers);
    entries.push(
      {
        key: 'revenue_gap',
        factId: 'revenue_gap',
        text: formatEuro(Math.abs(drivers.revenueGap)),
        meaning: `how far room revenue is ${drivers.revenueGap < 0 ? 'BELOW' : 'ABOVE'} target`,
      },
      {
        key: 'room_nights_difference',
        factId: 'volume',
        text: `${formatCount(Math.abs(roomNightDifference))} ${roomNightDifference < 0 ? 'fewer' : 'more'} room nights`,
        meaning: 'room nights sold compared with the plan, already includes "fewer/more room nights". Write: "you sold {room_nights_difference} than planned"',
      },
      {
        key: 'volume_effect',
        factId: 'volume',
        text: formatEuro(Math.abs(drivers.volumeEffect)),
        meaning: `revenue ${drivers.volumeEffect < 0 ? 'lost' : 'gained'} through volume (room nights). Write: "volume ${drivers.volumeEffect < 0 ? 'cost' : 'added'} {volume_effect}"`,
      },
      {
        key: 'biggest_segment_shortfall',
        factId: `volume_${biggestLoss.segment}`,
        text: `${formatCount(Math.abs(biggestLoss.roomsSoldActual - biggestLoss.roomsSoldTarget))} room nights`,
        meaning: `how many room nights ${SEGMENT_LABELS[biggestLoss.segment]} is below its target; the largest volume loss of any segment. Write: "${SEGMENT_LABELS[biggestLoss.segment]} is {biggest_segment_shortfall} below target"`,
      },
      {
        key: 'pure_price_effect',
        factId: 'pure_price',
        text: formatEuro(Math.abs(drivers.purePriceEffect)),
        meaning: `revenue ${drivers.purePriceEffect >= 0 ? 'added' : 'lost'} by selling at a ${drivers.purePriceEffect >= 0 ? 'higher' : 'lower'} rate than planned. Write: "the higher rate ${drivers.purePriceEffect >= 0 ? 'added' : 'cost'} {pure_price_effect}"`,
      },
      {
        key: 'mix_effect',
        factId: 'mix',
        text: formatEuro(Math.abs(drivers.mixEffect)),
        meaning: `revenue ${drivers.mixEffect < 0 ? 'lost' : 'gained'} because the segment mix moved from ${SEGMENT_LABELS[losing.segment]} to ${SEGMENT_LABELS[gaining.segment]}. Write: "the shift from ${SEGMENT_LABELS[losing.segment]} to ${SEGMENT_LABELS[gaining.segment]} ${drivers.mixEffect < 0 ? 'cost' : 'added'} {mix_effect}"`,
      },
    );
  }

  if (channelMix) {
    const ota = findChannelLine(channelMix, 'ota');
    entries.push(
      { key: 'ota_share', factId: 'ota_share', text: formatPercent(ota.revenueShare, { decimals: 0 }), meaning: 'OTA share of room revenue this period' },
      { key: 'ota_share_last_year', text: formatPercent(ota.revenueShareLastYear, { decimals: 0 }), meaning: 'OTA share of room revenue last year' },
      { key: 'commission_cost', factId: 'commission_cost', text: formatEuro(channelMix.totalCommissionCost), meaning: 'commission paid to booking channels this period. Write: "commissions cost {commission_cost}"' },
      {
        key: 'commission_from_shift',
        factId: 'commission_mix_shift',
        text: formatEuro(Math.abs(channelMix.extraCommissionFromMixShift)),
        meaning: `commission ${channelMix.extraCommissionFromMixShift >= 0 ? 'added' : 'saved'} by the shift in channel mix versus last year`,
      },
    );
    if (channelMix.netRevparTarget !== null) {
      const netChange = relativeChange(channelMix.netRevpar, channelMix.netRevparTarget);
      entries.push({
        key: 'net_revpar_change',
        factId: 'net_revpar',
        text: percentText(netChange),
        meaning: `percentage Net RevPAR (RevPAR after commissions) is ${netChange < 0 ? 'below' : 'above'} target. Write: "Net RevPAR is {net_revpar_change} ${netChange < 0 ? 'below' : 'above'} target"`,
      });
    }
  }

  if (pace) {
    entries.push(
      { key: 'pace_window', text: describeNights(analysis.paceWindow), meaning: 'the future stay dates checked for pace' },
      {
        key: 'pace_vs_last_year',
        factId: 'booking_pace',
        text: `${percentText(pace.changeVsLastYear, 0)} ${pace.changeVsLastYear < 0 ? 'behind' : 'ahead of'} last year`,
        meaning: 'bookings for those dates compared with the same point last year, already includes "behind/ahead of last year". Write: "pace for {pace_window} is {pace_vs_last_year}"',
      },
      {
        key: 'pickup_last_7_days',
        factId: 'pace_pickup',
        text: `${formatCount(pace.pickupLast7Days, { signDisplay: 'always' })} room nights`,
        meaning: `room nights booked in the last 7 days for those dates (last year: ${formatCount(pace.pickupLast7DaysLastYear, { signDisplay: 'always' })})`,
      },
    );
  }

  return entries;
}
