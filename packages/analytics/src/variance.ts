import type { Segment } from '@aurora/shared';
import { calculateAdr, divideOrZero } from './kpi';

// ---------------------------------------------------------------------------
// Revenue gap decomposition: the core of "why is revenue below target?".
//
// Notation: a = actual, t = target, s = segment, Sold = room nights,
//           w_s = segment share of room nights (Sold_s / Sold).
//
//   gap          = Rev_a − Rev_t
//   volume       = (Sold_a − Sold_t) × ADR_t
//   price        = (ADR_a − ADR_t) × Sold_a
//   gap          = volume + price                          (exact)
//
// The price effect splits further, again exactly:
//   mix          = Σ_s (w_a,s − w_t,s) × ADR_t,s × Sold_a
//   pure price   = Σ_s (ADR_a,s − ADR_t,s) × Sold_a,s
//   price        = mix + pure price                        (exact)
//
// So target + volume + mix + pure price = actual, and the waterfall chart
// closes without a remainder. test/variance.test.ts checks this on random data.
// ---------------------------------------------------------------------------

export interface SegmentActualAndTarget {
  segment: Segment;
  roomsSoldActual: number;
  roomRevenueActual: number;
  roomsSoldTarget: number;
  roomRevenueTarget: number;
}

export interface SegmentVariance {
  segment: Segment;
  roomsSoldActual: number;
  roomsSoldTarget: number;
  adrActual: number;
  adrTarget: number;
  shareOfRoomsActual: number;
  shareOfRoomsTarget: number;
  volumeEffect: number;
  mixEffect: number;
  purePriceEffect: number;
}

export interface RevenueVariance {
  roomRevenueActual: number;
  roomRevenueTarget: number;
  revenueGap: number;
  roomsSoldActual: number;
  roomsSoldTarget: number;
  adrActual: number;
  adrTarget: number;
  volumeEffect: number;
  priceEffect: number;
  mixEffect: number;
  purePriceEffect: number;
  segments: SegmentVariance[];
}

export function decomposeRevenueGap(segments: readonly SegmentActualAndTarget[]): RevenueVariance {
  const roomsSoldActual = sum(segments.map((segment) => segment.roomsSoldActual));
  const roomsSoldTarget = sum(segments.map((segment) => segment.roomsSoldTarget));
  const roomRevenueActual = sum(segments.map((segment) => segment.roomRevenueActual));
  const roomRevenueTarget = sum(segments.map((segment) => segment.roomRevenueTarget));

  const adrActual = calculateAdr(roomRevenueActual, roomsSoldActual);
  const adrTarget = calculateAdr(roomRevenueTarget, roomsSoldTarget);

  const segmentVariances = segments.map((segment): SegmentVariance => {
    const segmentAdrActual = calculateAdr(segment.roomRevenueActual, segment.roomsSoldActual);
    // A segment with no target rooms has no target rate of its own. We use the overall
    // target ADR. Any value keeps the identity exact, because the segment's target
    // share is 0, so its rate only appears with the actual share, on both sides.
    const segmentAdrTarget =
      segment.roomsSoldTarget > 0 ? calculateAdr(segment.roomRevenueTarget, segment.roomsSoldTarget) : adrTarget;

    const shareOfRoomsActual = divideOrZero(segment.roomsSoldActual, roomsSoldActual);
    const shareOfRoomsTarget = divideOrZero(segment.roomsSoldTarget, roomsSoldTarget);

    return {
      segment: segment.segment,
      roomsSoldActual: segment.roomsSoldActual,
      roomsSoldTarget: segment.roomsSoldTarget,
      adrActual: segmentAdrActual,
      adrTarget: segmentAdrTarget,
      shareOfRoomsActual,
      shareOfRoomsTarget,
      // Each segment's missing or extra rooms, valued at the overall target ADR.
      // Summed over segments this is exactly (Sold_a − Sold_t) × ADR_t.
      volumeEffect: (segment.roomsSoldActual - segment.roomsSoldTarget) * adrTarget,
      mixEffect: (shareOfRoomsActual - shareOfRoomsTarget) * segmentAdrTarget * roomsSoldActual,
      purePriceEffect: (segmentAdrActual - segmentAdrTarget) * segment.roomsSoldActual,
    };
  });

  return {
    roomRevenueActual,
    roomRevenueTarget,
    revenueGap: roomRevenueActual - roomRevenueTarget,
    roomsSoldActual,
    roomsSoldTarget,
    adrActual,
    adrTarget,
    volumeEffect: (roomsSoldActual - roomsSoldTarget) * adrTarget,
    priceEffect: (adrActual - adrTarget) * roomsSoldActual,
    mixEffect: sum(segmentVariances.map((segment) => segment.mixEffect)),
    purePriceEffect: sum(segmentVariances.map((segment) => segment.purePriceEffect)),
    segments: segmentVariances,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
