import { DEMO_CURRENT_PERIOD, DEMO_HOTEL } from '@aurora/demo-data';
import { describe, expect, it } from 'vitest';
import { createDemoToolContext } from '../src/demo-context';
import { callTool, TOOL_DEFINITIONS } from '../src/tools/registry';
import { ToolInputError } from '../src/tools/tool-context';

// These tests pin the tools to the numbers of the design handoff
// (docs/design/design_handoff_aurora_ai_chat/README.md, section "Data").

const context = createDemoToolContext();
const periodInput = { hotelId: DEMO_HOTEL.id, period: DEMO_CURRENT_PERIOD };

describe('get_hotel_overview', async () => {
  const overview = await callTool('get_hotel_overview', periodInput, context);
  const kpi = (metric: string) => overview.kpis.find((candidate) => candidate.metric === metric)!;

  it('reports 1,170 room nights and €208,260 out of 1,887 rooms available', () => {
    expect(overview.roomsAvailable).toBe(1887);
    expect(overview.roomsSold).toBe(1170);
    expect(overview.roomRevenue).toBe(208_260);
  });

  it('occupancy 62.0% vs 75% target is off track', () => {
    expect(kpi('occupancy').actual).toBeCloseTo(0.62, 3);
    expect(kpi('occupancy').target).toBeCloseTo(0.75, 3);
    expect(kpi('occupancy').status).toBe('off_track');
  });

  it('ADR €178.00 vs €171.15 target is on track', () => {
    expect(kpi('adr').actual).toBe(178);
    expect(kpi('adr').target).toBeCloseTo(171.15, 2);
    expect(kpi('adr').status).toBe('on_track');
  });

  it('RevPAR €110.37 vs €128.34 target is off track', () => {
    expect(kpi('revpar').actual).toBeCloseTo(110.37, 2);
    expect(kpi('revpar').target).toBeCloseTo(128.34, 2);
    expect(kpi('revpar').status).toBe('off_track');
  });

  it('shows corporate about 15% below last year', () => {
    const corporate = overview.segments.find((segment) => segment.segment === 'corporate')!;
    expect(corporate.roomsSold / corporate.roomsSoldLastYear - 1).toBeCloseTo(-0.15, 2);
  });

  it('returns the group blocks of the period, with the cancelled congress', () => {
    expect(overview.groupBlocks).toEqual([
      expect.objectContaining({ name: 'EU Health Congress', status: 'cancelled', firstNight: '2026-11-10', lastNight: '2026-11-12', roomsPerNight: 68 }),
    ]);
  });

  it('shows the congress dip: 10–12 Nov at 38–41% occupancy, with 68 cancelled rooms each night', () => {
    const congressNights = overview.dailyOccupancy.filter((day) => ['2026-11-10', '2026-11-11', '2026-11-12'].includes(day.date));
    congressNights.forEach((night) => {
      expect(night.occupancy).toBeGreaterThan(0.37);
      expect(night.occupancy).toBeLessThan(0.42);
      expect(night.roomsCancelled).toBeGreaterThanOrEqual(68);
      expect(night.occupancyLastYear).toBeGreaterThan(0.7);
    });
  });
});

describe('analyze_revenue_drivers', async () => {
  const drivers = await callTool('analyze_revenue_drivers', periodInput, context);

  it('finds the −€33,917 gap and splits it exactly: volume −€41,932, mix −€6,240, pure price +€14,255', () => {
    expect(drivers.revenueGap).toBe(-33_917);
    expect(Math.round(drivers.volumeEffect)).toBe(-41_932);
    expect(Math.round(drivers.mixEffect)).toBe(-6240);
    expect(Math.round(drivers.purePriceEffect)).toBe(14_255);
    expect(drivers.volumeEffect + drivers.mixEffect + drivers.purePriceEffect).toBeCloseTo(drivers.revenueGap, 6);
  });

  it('puts most of the volume effect on MICE: −€34,915, which is 83% of the volume effect', () => {
    const mice = drivers.segments.find((segment) => segment.segment === 'mice')!;
    expect(Math.round(mice.volumeEffect)).toBe(-34_915);
    expect(mice.volumeEffect / drivers.volumeEffect).toBeCloseTo(0.83, 2);
  });

  it('ranks the volume effect as the biggest finding, the MICE volume second', () => {
    expect(drivers.findings.slice(0, 2).map((finding) => finding.id)).toEqual(['volume', 'volume_mice']);
  });
});

describe('get_channel_mix', async () => {
  const channelMix = await callTool('get_channel_mix', periodInput, context);
  const ota = channelMix.channels.find((channel) => channel.channel === 'ota')!;

  it('OTA share rose from about 35% to about 48%', () => {
    expect(ota.revenueShare).toBeCloseTo(0.48, 1);
    expect(Math.abs(ota.revenueShare - 0.48)).toBeLessThan(0.01);
    expect(Math.abs(ota.revenueShareLastYear - 0.35)).toBeLessThan(0.01);
  });

  it('commissions are about €22.5k, about 10.8% of revenue', () => {
    expect(Math.abs(channelMix.totalCommissionCost - 22_492)).toBeLessThan(500);
    expect(Math.abs(channelMix.commissionShareOfRevenue - 0.108)).toBeLessThan(0.003);
  });

  it('Net RevPAR is about €98, about 16% below its target', () => {
    expect(Math.abs(channelMix.netRevpar - 98.44)).toBeLessThan(1);
    expect(channelMix.netRevpar / channelMix.netRevparTarget! - 1).toBeCloseTo(-0.16, 2);
  });

  it('compares with Sep 2026, Oct 2026 and the same period last year', () => {
    expect(channelMix.comparisonPeriods.map((comparison) => comparison.label)).toEqual(['Sep 2026', 'Oct 2026', '1–17 Nov 2025']);
  });
});

describe('get_booking_pace', async () => {
  const pace = await callTool('get_booking_pace', { hotelId: DEMO_HOTEL.id, stayFrom: '2026-11-21', stayTo: '2026-11-30' }, context);

  it('612 room nights on the books for 21–30 Nov vs 731 last year: 16% behind, "watch"', () => {
    expect(pace.roomsOnTheBooks).toBe(612);
    expect(pace.roomsOnTheBooksLastYear).toBe(731);
    expect(pace.changeVsLastYear).toBeCloseTo(-0.163, 3);
    expect(pace.status).toBe('watch');
  });

  it('picked up +38 room nights in the last 7 days vs +61 last year', () => {
    expect(pace.pickupLast7Days).toBe(38);
    expect(pace.pickupLast7DaysLastYear).toBe(61);
  });

  it('returns one row per stay date', () => {
    expect(pace.stayDates).toHaveLength(10);
    expect(pace.stayDates[0]).toEqual({ stayDate: '2026-11-21', roomsOnTheBooks: 58, roomsOnTheBooksLastYear: 70 });
  });
});

describe('the registry', () => {
  it('has the eight tools, each with a description for the model', () => {
    expect(TOOL_DEFINITIONS.map((tool) => tool.name).sort()).toEqual(
      ['analyze_revenue_drivers', 'get_booking_pace', 'get_channel_mix', 'get_decisions', 'get_group_blocks', 'get_hotel_overview', 'query_performance', 'simulate_scenario'].sort(),
    );
    TOOL_DEFINITIONS.forEach((tool) => expect(tool.description.length).toBeGreaterThan(60));
  });

  it('rejects an unknown hotel', async () => {
    await expect(callTool('get_hotel_overview', { hotelId: 'nowhere', period: DEMO_CURRENT_PERIOD }, context)).rejects.toThrow(ToolInputError);
  });

  it('rejects malformed input before running the tool', async () => {
    await expect(callTool('get_hotel_overview', { hotelId: DEMO_HOTEL.id, period: { from: '17/11/2026', to: '2026-11-30' } }, context)).rejects.toThrow(
      /Invalid input for get_hotel_overview/,
    );
  });

  it('reports that there is no budget for a period without targets', async () => {
    await expect(
      callTool('analyze_revenue_drivers', { hotelId: DEMO_HOTEL.id, period: { from: '2025-11-01', to: '2025-11-17' } }, context),
    ).rejects.toThrow(/no budget/);
  });
});

describe('query_performance', async () => {
  const weekendByChannel = await callTool(
    'query_performance',
    { hotelId: DEMO_HOTEL.id, period: DEMO_CURRENT_PERIOD, groupBy: 'channel', dayType: 'weekend', compareWithLastYear: true },
    context,
  );

  it('keeps the filters in the total: weekend nights only, so the total is the sum of the rows', () => {
    const roomsInRows = weekendByChannel.rows.reduce((total, row) => total + row.roomsSold, 0);
    const revenueInRows = weekendByChannel.rows.reduce((total, row) => total + row.roomRevenue, 0);
    expect(weekendByChannel.totals.roomsSold).toBe(roomsInRows);
    expect(weekendByChannel.totals.roomRevenue).toBeCloseTo(revenueInRows, 6);
    // 1–17 Nov 2026 has four Friday and Saturday nights (6, 7, 13 and 14 Nov), and the total uses only those.
    expect(weekendByChannel.totals.nights).toBe(4);
  });

  it('compares with the same calendar dates last year, whose weekend nights differ', () => {
    weekendByChannel.rows.forEach((row) => expect(row.lastYear).not.toBeNull());
    // 1 Nov 2025 was a Saturday: 1, 7, 8, 14 and 15 Nov 2025 are five weekend nights.
    expect(weekendByChannel.totals.lastYear?.nights).toBe(5);
  });

  it('matches the overview on the whole period', async () => {
    const total = await callTool('query_performance', { hotelId: DEMO_HOTEL.id, period: DEMO_CURRENT_PERIOD }, context);
    expect(total.totals.roomsSold).toBe(1170);
    expect(total.totals.roomRevenue).toBe(208_260);
    expect(total.totals.occupancy).toBeCloseTo(0.62, 3);
  });

  it('refuses a period that starts after today, pointing to the pace tool', async () => {
    await expect(
      callTool('query_performance', { hotelId: DEMO_HOTEL.id, period: { from: '2026-11-21', to: '2026-11-30' } }, context),
    ).rejects.toThrow(/get_booking_pace/);
  });
});

describe('simulate_scenario', async () => {
  const lateNovember = { hotelId: DEMO_HOTEL.id, stayFrom: '2026-11-21', stayTo: '2026-11-30' };
  const today = await callTool('simulate_scenario', lateNovember, context);

  it('starts from the books: 119 room nights behind last year for 21–30 Nov', () => {
    expect(today.outcome.roomNightsBehindLastYear).toBe(119);
    expect(today.basis.roomNightsAvailable).toBe(111 * 10);
    expect(today.outcome.effects.netChange).toBe(0);
  });

  it('uses the channel mix and commissions of the month so far', () => {
    const shares = Object.values(today.basis.channelRevenueShares).reduce((total, share) => total + share, 0);
    expect(shares).toBeCloseTo(1, 9);
    expect(today.basis.commissionRates.ota).toBe(0.18);
  });

  it('recovering the whole gap adds 119 room nights at the rate on the books', async () => {
    const recovered = await callTool('simulate_scenario', { ...lateNovember, paceRecovery: 1 }, context);
    expect(recovered.outcome.recoveredRoomNights).toBe(119);
    expect(recovered.outcome.effects.recoveredNights).toBeCloseTo(119 * today.outcome.averageRateOnTheBooks, 6);
  });

  it('refuses past stay dates', async () => {
    await expect(callTool('simulate_scenario', { ...lateNovember, stayFrom: '2026-11-10' }, context)).rejects.toThrow(/future stay dates/);
  });
});
