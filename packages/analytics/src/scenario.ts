import { CHANNELS, type Channel, type ScenarioBasis, type ScenarioLevers, type ScenarioOutcome } from '@aurora/shared';

// ---------------------------------------------------------------------------
// What-if simulation for future stay dates. Pure and deterministic: the same
// basis and levers always give the same result, in the server tool, in the
// MCP tool and in the browser, which runs this same function while the
// sliders move.
//
//   Starting point     what is on the books today (rooms, revenue).
//   Pace recovery      win back part of the room nights behind last year's
//                      pace, at most up to a full hotel.
//   Rate               the rooms still to sell (the recovered ones) are sold
//                      at the rate on the books, changed by this percentage.
//   OTA → direct       part of the OTA revenue arrives direct instead, so it
//                      pays the direct commission instead of the OTA one.
//
// Commission is estimated with the channel mix of the month so far.
// ---------------------------------------------------------------------------

/** Average commission rate of a channel mix: Σ share × commission. */
function blendedCommissionRate(shares: Record<Channel, number>, rates: Record<Channel, number>): number {
  return CHANNELS.reduce((total, channel) => total + (shares[channel] ?? 0) * (rates[channel] ?? 0), 0);
}

/** The mix after part of the OTA share moves to direct. */
function moveOtaToDirect(shares: Record<Channel, number>, movedFraction: number): Record<Channel, number> {
  const movedShare = (shares.ota ?? 0) * movedFraction;
  return { ...shares, ota: (shares.ota ?? 0) - movedShare, direct: (shares.direct ?? 0) + movedShare };
}

export function simulateScenario(basis: ScenarioBasis, levers: ScenarioLevers): ScenarioOutcome {
  const averageRateOnTheBooks = basis.roomsOnTheBooks === 0 ? 0 : basis.revenueOnTheBooks / basis.roomsOnTheBooks;
  const roomNightsBehindLastYear = Math.max(0, basis.roomsOnTheBooksLastYear - basis.roomsOnTheBooks);
  const unsoldRoomNights = Math.max(0, basis.roomNightsAvailable - basis.roomsOnTheBooks);

  // Whole room nights only: half a room night cannot be sold.
  const wantedRoomNights = Math.round(roomNightsBehindLastYear * levers.paceRecovery);
  const recoveredRoomNights = Math.min(wantedRoomNights, unsoldRoomNights);
  const rateForNewBookings = averageRateOnTheBooks * (1 + levers.rateChange);

  const baseCommissionRate = blendedCommissionRate(basis.channelRevenueShares, basis.commissionRates);
  const scenarioCommissionRate = blendedCommissionRate(moveOtaToDirect(basis.channelRevenueShares, levers.otaToDirect), basis.commissionRates);

  const baselineRevenue = basis.revenueOnTheBooks;
  const baselineCommission = baselineRevenue * baseCommissionRate;
  const scenarioRevenue = baselineRevenue + recoveredRoomNights * rateForNewBookings;
  const scenarioCommission = scenarioRevenue * scenarioCommissionRate;

  const recoveredNights = recoveredRoomNights * averageRateOnTheBooks;
  const rateOnNewBookings = recoveredRoomNights * (rateForNewBookings - averageRateOnTheBooks);
  // Extra revenue pays commission at today's mix; moving OTA to direct then saves on all of it.
  const commissionOnNewRevenue = -(scenarioRevenue - baselineRevenue) * baseCommissionRate;
  const commissionSavedByDirect = scenarioRevenue * (baseCommissionRate - scenarioCommissionRate);

  return {
    averageRateOnTheBooks,
    roomNightsBehindLastYear,
    recoveredRoomNights,
    limitedByCapacity: wantedRoomNights > unsoldRoomNights,
    rateForNewBookings,
    baseline: {
      roomNights: basis.roomsOnTheBooks,
      roomRevenue: baselineRevenue,
      commission: baselineCommission,
      netRevenue: baselineRevenue - baselineCommission,
    },
    scenario: {
      roomNights: basis.roomsOnTheBooks + recoveredRoomNights,
      roomRevenue: scenarioRevenue,
      commission: scenarioCommission,
      netRevenue: scenarioRevenue - scenarioCommission,
    },
    effects: {
      recoveredNights,
      rateOnNewBookings,
      commissionOnNewRevenue,
      commissionSavedByDirect,
      netChange: scenarioRevenue - scenarioCommission - (baselineRevenue - baselineCommission),
    },
  };
}
