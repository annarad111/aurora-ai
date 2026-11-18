import { divideOrZero } from '@aurora/analytics';
import {
  isCancelledBlockNight,
  type ChannelMixOutput,
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

/** The nights with a cancelled group block (see isCancelledBlockNight), as one range, or null. */
export function findCancelledBlock(overview: HotelOverviewOutput): DateRange | null {
  const blockNights = overview.dailyOccupancy
    .filter((night) => isCancelledBlockNight(night, overview.hotel.roomCount))
    .map((night) => night.date);
  if (blockNights.length === 0) return null;
  return { from: blockNights[0]!, to: blockNights[blockNights.length - 1]! };
}

/** Room nights cancelled for the nights of a range (e.g. the cancelled block). Used by every text that quotes this number. */
export function countCancelledRoomsIn(overview: HotelOverviewOutput, range: DateRange): number {
  return overview.dailyOccupancy
    .filter((night) => night.date >= range.from && night.date <= range.to)
    .reduce((total, night) => total + night.roomsCancelled, 0);
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
