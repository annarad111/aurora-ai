import { countNightsInRange, divideOrZero } from '@aurora/analytics';
import {
  type ChannelMixOutput,
  type GroupBlock,
  type DateRange,
  type HotelOverviewOutput,
  type IsoDate,
  type KpiComparison,
  type MetricId,
  type RevenueDriversOutput,
} from '@aurora/shared';

// Small read helpers over the tool outputs. The narrative and the provenance
// both use these, so a figure in the text and in "How was this calculated?" is
// always computed the same way.

export function readKpi(overview: HotelOverviewOutput, metric: MetricId): KpiComparison {
  const kpi = overview.kpis.find((candidate) => candidate.metric === metric);
  if (!kpi) throw new Error(`The overview has no ${metric} KPI`);
  return kpi;
}

/** actual / reference − 1: 178 vs 171.15 -> +0.04. */
export function relativeChange(actual: number, reference: number | null): number {
  return reference === null ? 0 : divideOrZero(actual - reference, reference);
}

export type SegmentVarianceRow = RevenueDriversOutput['segments'][number];

/** The segment that lost the most revenue through volume (the MICE congress in the demo). */
export function findBiggestVolumeLoss(drivers: RevenueDriversOutput): SegmentVarianceRow {
  return drivers.segments.reduce((worst, segment) => (segment.volumeEffect < worst.volumeEffect ? segment : worst));
}

/** Segments with the largest drop and the largest rise in share of room nights vs target. */
export function findShareShift(drivers: RevenueDriversOutput): { losing: SegmentVarianceRow; gaining: SegmentVarianceRow } {
  const shareChange = (segment: SegmentVarianceRow) => segment.shareOfRoomsActual - segment.shareOfRoomsTarget;
  return {
    losing: drivers.segments.reduce((lowest, segment) => (shareChange(segment) < shareChange(lowest) ? segment : lowest)),
    gaining: drivers.segments.reduce((highest, segment) => (shareChange(segment) > shareChange(highest) ? segment : highest)),
  };
}

export interface CancelledBlock {
  block: GroupBlock;
  /** The block's nights that fall inside the analysed period. */
  nights: DateRange;
  nightCount: number;
  /** Rooms per night × nights in the period: what the cancellation cost in volume. */
  cancelledRoomNights: number;
}

/**
 * The cancelled group block with the most room nights in the period, read from
 * the group_blocks table (via the overview tool), or null. Every text that
 * quotes the cancelled block uses this, so the numbers always agree.
 */
export function findCancelledBlock(overview: HotelOverviewOutput): CancelledBlock | null {
  const candidates = overview.groupBlocks
    .filter((block) => block.status === 'cancelled')
    .map((block): CancelledBlock => {
      const nights = {
        from: block.firstNight > overview.period.from ? block.firstNight : overview.period.from,
        to: block.lastNight < overview.period.to ? block.lastNight : overview.period.to,
      };
      const nightCount = countNightsInRange(nights);
      return { block, nights, nightCount, cancelledRoomNights: block.roomsPerNight * nightCount };
    });
  return candidates.sort((first, second) => second.cancelledRoomNights - first.cancelledRoomNights)[0] ?? null;
}

export function findChannelLine(channelMix: ChannelMixOutput, channel: ChannelMixOutput['channels'][number]['channel']) {
  const line = channelMix.channels.find((candidate) => candidate.channel === channel);
  if (!line) throw new Error(`The channel mix has no ${channel} line`);
  return line;
}

const MONTH_LONG_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** For sentences: 2026-11-10 … 2026-11-12 -> "10–12 November". */
export function describeNights(range: DateRange): string {
  const [, startMonth, startDay] = range.from.split('-').map(Number) as [number, number, number];
  const [, endMonth, endDay] = range.to.split('-').map(Number) as [number, number, number];
  const endMonthName = MONTH_LONG_NAMES[endMonth - 1];
  if (startMonth !== endMonth) return `${startDay} ${MONTH_LONG_NAMES[startMonth - 1]} – ${endDay} ${endMonthName}`;
  return startDay === endDay ? `${endDay} ${endMonthName}` : `${startDay}–${endDay} ${endMonthName}`;
}

export function describeDate(date: IsoDate): string {
  return describeNights({ from: date, to: date });
}
