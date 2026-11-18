import { SEGMENT_LABELS, type Finding } from '@aurora/shared';
import type { BookingPaceComparison } from './pace';
import type { RevenueVariance } from './variance';

// ---------------------------------------------------------------------------
// Turn analysis results into findings: facts ranked by their euro impact.
// The narrative (scripted or LLM) is written only from these, and every
// figure in the text points back to one finding id.
// ---------------------------------------------------------------------------

export function buildRevenueFindings(variance: RevenueVariance): Finding[] {
  const revenueGapFinding: Finding = {
    id: 'revenue_gap',
    metric: 'room_revenue',
    title: 'Revenue gap vs target',
    value: variance.roomRevenueActual,
    delta: variance.revenueGap,
    impactEur: variance.revenueGap,
    evidence: [
      { label: 'Room revenue, actual', value: variance.roomRevenueActual },
      { label: 'Room revenue, target', value: variance.roomRevenueTarget },
    ],
  };

  const volumeFinding: Finding = {
    id: 'volume',
    metric: 'rooms_sold',
    title: 'Volume effect',
    value: variance.roomsSoldActual,
    delta: variance.roomsSoldActual - variance.roomsSoldTarget,
    impactEur: variance.volumeEffect,
    evidence: [
      { label: 'Room nights sold', value: variance.roomsSoldActual },
      { label: 'Room nights target', value: variance.roomsSoldTarget },
      { label: 'ADR target', value: variance.adrTarget },
    ],
  };

  const mixFinding: Finding = {
    id: 'mix',
    metric: 'adr',
    title: 'Segment mix effect',
    value: variance.mixEffect,
    delta: variance.mixEffect,
    impactEur: variance.mixEffect,
    evidence: variance.segments.map((segment) => ({
      label: `${SEGMENT_LABELS[segment.segment]} share of room nights, actual minus target`,
      value: segment.shareOfRoomsActual - segment.shareOfRoomsTarget,
    })),
  };

  const purePriceFinding: Finding = {
    id: 'pure_price',
    metric: 'adr',
    title: 'Pure price effect',
    value: variance.adrActual,
    delta: variance.adrActual - variance.adrTarget,
    impactEur: variance.purePriceEffect,
    evidence: [
      { label: 'ADR actual', value: variance.adrActual },
      { label: 'ADR target', value: variance.adrTarget },
      { label: 'Rooms sold', value: variance.roomsSoldActual },
    ],
  };

  const segmentVolumeFindings = variance.segments.map(
    (segment): Finding => ({
      id: `volume_${segment.segment}`,
      metric: 'rooms_sold',
      title: `${SEGMENT_LABELS[segment.segment]} volume`,
      value: segment.roomsSoldActual,
      delta: segment.roomsSoldActual - segment.roomsSoldTarget,
      impactEur: segment.volumeEffect,
      evidence: [
        { label: 'Room nights sold', value: segment.roomsSoldActual },
        { label: 'Room nights target', value: segment.roomsSoldTarget },
      ],
    }),
  );

  return rankFindingsByImpact([revenueGapFinding, volumeFinding, mixFinding, purePriceFinding, ...segmentVolumeFindings]);
}

export interface CommissionFindingInput {
  totalCommissionCost: number;
  commissionShareOfRevenue: number;
  /** From calculateExtraCommissionFromMixShift. */
  extraCommissionFromMixShift: number;
  otaShare: number;
  otaShareLastYear: number;
}

export function buildCommissionFinding(input: CommissionFindingInput): Finding {
  return {
    id: 'commission_cost',
    metric: 'ota_share',
    title: 'Commission cost of the channel mix',
    value: input.otaShare,
    delta: input.otaShare - input.otaShareLastYear,
    // The extra commission reduces net revenue, so its impact is negative.
    impactEur: -input.extraCommissionFromMixShift,
    evidence: [
      { label: 'Commission paid', value: input.totalCommissionCost },
      { label: 'Commission share of revenue', value: input.commissionShareOfRevenue },
      { label: 'OTA share, this period', value: input.otaShare },
      { label: 'OTA share, last year', value: input.otaShareLastYear },
    ],
  };
}

/**
 * Pace finding. The impact is the room nights behind last year, valued at a
 * reference rate (usually the target ADR). It estimates the risk; it is not revenue already lost.
 */
export function buildPaceFinding(pace: BookingPaceComparison, referenceAdr: number): Finding {
  return {
    id: 'booking_pace',
    metric: 'booking_pace',
    title: 'Booking pace vs last year',
    value: pace.roomsOnTheBooks,
    delta: pace.difference,
    impactEur: pace.difference * referenceAdr,
    evidence: [
      { label: 'Rooms on the books', value: pace.roomsOnTheBooks },
      { label: 'Same point last year', value: pace.roomsOnTheBooksLastYear },
      { label: 'Reference ADR', value: referenceAdr },
    ],
  };
}

/** Biggest euro impact first, positive or negative. Ties keep their original order. */
export function rankFindingsByImpact(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((first, second) => Math.abs(second.impactEur) - Math.abs(first.impactEur));
}
