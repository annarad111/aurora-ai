import { formatEuroCompact, type RevenueDriversOutput } from '@aurora/shared';

// ---------------------------------------------------------------------------
// Layout of the revenue bridge (waterfall): Target → Volume → Mix → Price → Actual.
//
// Each bar has a bottom and a top in euros. Totals (Target, Actual) stand on
// the axis; effects float between the running totals, so the chart "walks"
// from target to actual and closes exactly.
//
// The axis does not start at €0: a €34k gap on a €242k target would be a
// sliver. It starts a bit below the lowest running total, rounded to €10k,
// and the card says so ("Axis starts at €160k").
// ---------------------------------------------------------------------------

export type BridgeBarTone = 'total' | 'negative' | 'positive' | 'actual';

export interface BridgeBar {
  id: 'target' | 'volume' | 'mix' | 'price' | 'actual';
  label: string;
  valueLabel: string;
  bottomValue: number;
  topValue: number;
  tone: BridgeBarTone;
  /** Clicking the bar selects this fact. */
  primaryFactId: string;
  /** The bar lights up when any of these facts is hovered or selected. */
  factIds: string[];
}

export interface RevenueBridgeGeometry {
  axisMinimum: number;
  axisMaximum: number;
  bars: BridgeBar[];
}

const AXIS_STEP = 10_000;
/** How far below the lowest running total the axis starts, as a share of the bridge's height. */
const BOTTOM_MARGIN_SHARE = 0.6;
const TOP_MARGIN_SHARE = 0.1;

function effectBar(
  id: BridgeBar['id'],
  label: string,
  startValue: number,
  effect: number,
  factIds: string[],
): BridgeBar {
  return {
    id,
    label,
    valueLabel: formatEuroCompact(effect, { signDisplay: 'always' }),
    bottomValue: Math.min(startValue, startValue + effect),
    topValue: Math.max(startValue, startValue + effect),
    tone: effect < 0 ? 'negative' : 'positive',
    primaryFactId: factIds[0]!,
    factIds,
  };
}

export function buildRevenueBridge(drivers: RevenueDriversOutput): RevenueBridgeGeometry {
  const afterVolume = drivers.roomRevenueTarget + drivers.volumeEffect;
  const afterMix = afterVolume + drivers.mixEffect;
  const runningTotals = [drivers.roomRevenueTarget, afterVolume, afterMix, drivers.roomRevenueActual];

  const lowest = Math.min(...runningTotals);
  const highest = Math.max(...runningTotals);
  const span = Math.max(highest - lowest, AXIS_STEP);
  const axisMinimum = Math.max(0, Math.floor((lowest - span * BOTTOM_MARGIN_SHARE) / AXIS_STEP) * AXIS_STEP);
  const axisMaximum = Math.ceil((highest + span * TOP_MARGIN_SHARE) / AXIS_STEP) * AXIS_STEP;

  return {
    axisMinimum,
    axisMaximum,
    bars: [
      {
        id: 'target',
        label: 'Target',
        valueLabel: formatEuroCompact(drivers.roomRevenueTarget),
        bottomValue: axisMinimum,
        topValue: drivers.roomRevenueTarget,
        tone: 'total',
        primaryFactId: 'revenue_gap',
        factIds: ['revenue_gap'],
      },
      effectBar('volume', 'Volume', drivers.roomRevenueTarget, drivers.volumeEffect, [
        'volume',
        ...drivers.segments.map((segment) => `volume_${segment.segment}`),
      ]),
      effectBar('mix', 'Mix', afterVolume, drivers.mixEffect, ['mix']),
      effectBar('price', 'Price', afterMix, drivers.purePriceEffect, ['pure_price', 'adr', 'price_effect']),
      {
        id: 'actual',
        label: 'Actual',
        valueLabel: formatEuroCompact(drivers.roomRevenueActual),
        bottomValue: axisMinimum,
        topValue: drivers.roomRevenueActual,
        tone: 'actual',
        primaryFactId: 'revenue_gap',
        factIds: ['revenue_gap', 'revpar'],
      },
    ],
  };
}

/** Position of a euro value on the axis, as a CSS percentage of the chart height. */
export function toAxisPercent(value: number, geometry: RevenueBridgeGeometry): number {
  return ((value - geometry.axisMinimum) / (geometry.axisMaximum - geometry.axisMinimum)) * 100;
}
