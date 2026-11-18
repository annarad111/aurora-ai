import type { ScenarioBasis } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { simulateScenario } from '../src/scenario';

// Round numbers so every result can be checked by hand.
const BASIS: ScenarioBasis = {
  stayFrom: '2026-11-21',
  stayTo: '2026-11-30',
  roomNightsAvailable: 1000,
  roomsOnTheBooks: 600,
  revenueOnTheBooks: 90_000, // €150 a room night
  roomsOnTheBooksLastYear: 700, // 100 room nights behind
  channelRevenueShares: { direct: 0.5, ota: 0.5, gds: 0, wholesale: 0 },
  channelMixPeriod: { from: '2026-11-01', to: '2026-11-17' },
  commissionRates: { direct: 0, ota: 0.2, gds: 0.08, wholesale: 0.2 },
};
const NO_CHANGE = { paceRecovery: 0, rateChange: 0, otaToDirect: 0 };

describe('simulateScenario', () => {
  it('with no lever moved, the scenario is today\'s position', () => {
    const outcome = simulateScenario(BASIS, NO_CHANGE);
    expect(outcome.baseline).toEqual({ roomNights: 600, roomRevenue: 90_000, commission: 9_000, netRevenue: 81_000 });
    expect(outcome.scenario).toEqual(outcome.baseline);
    expect(outcome.effects.netChange).toBe(0);
    expect(outcome.roomNightsBehindLastYear).toBe(100);
    expect(outcome.averageRateOnTheBooks).toBe(150);
  });

  it('half the pace gap back: 50 room nights at €150, minus 10% commission', () => {
    const outcome = simulateScenario(BASIS, { ...NO_CHANGE, paceRecovery: 0.5 });
    expect(outcome.recoveredRoomNights).toBe(50);
    expect(outcome.effects.recoveredNights).toBe(7_500);
    expect(outcome.effects.commissionOnNewRevenue).toBeCloseTo(-750, 6);
    expect(outcome.effects.netChange).toBeCloseTo(6_750, 6);
  });

  it('the rate lever prices the rooms still to sell, not the ones on the books', () => {
    const outcome = simulateScenario(BASIS, { ...NO_CHANGE, paceRecovery: 1, rateChange: -0.1 });
    expect(outcome.rateForNewBookings).toBeCloseTo(135, 6);
    expect(outcome.effects.rateOnNewBookings).toBeCloseTo(-1_500, 6); // 100 × −€15
    expect(outcome.scenario.roomRevenue).toBeCloseTo(103_500, 6);
    // Without recovered nights the rate lever changes nothing.
    expect(simulateScenario(BASIS, { ...NO_CHANGE, rateChange: 0.2 }).effects.netChange).toBe(0);
  });

  it('moving OTA to direct saves the OTA commission on that revenue', () => {
    const outcome = simulateScenario(BASIS, { ...NO_CHANGE, otaToDirect: 0.4 });
    // 40% of the €45,000 OTA revenue pays 0% instead of 20%: €3,600 saved; gross revenue unchanged.
    expect(outcome.effects.commissionSavedByDirect).toBeCloseTo(3_600, 6);
    expect(outcome.scenario.roomRevenue).toBe(90_000);
    expect(outcome.scenario.netRevenue).toBeCloseTo(84_600, 6);
  });

  it('the effects always add up to the change in net revenue', () => {
    const outcome = simulateScenario(BASIS, { paceRecovery: 0.7, rateChange: 0.05, otaToDirect: 0.25 });
    const { recoveredNights, rateOnNewBookings, commissionOnNewRevenue, commissionSavedByDirect, netChange } = outcome.effects;
    expect(recoveredNights + rateOnNewBookings + commissionOnNewRevenue + commissionSavedByDirect).toBeCloseTo(netChange, 6);
    expect(netChange).toBeCloseTo(outcome.scenario.netRevenue - outcome.baseline.netRevenue, 6);
  });

  it('never sells more rooms than the hotel has', () => {
    const outcome = simulateScenario({ ...BASIS, roomNightsAvailable: 630 }, { ...NO_CHANGE, paceRecovery: 1 });
    expect(outcome.recoveredRoomNights).toBe(30);
    expect(outcome.limitedByCapacity).toBe(true);
  });
});
