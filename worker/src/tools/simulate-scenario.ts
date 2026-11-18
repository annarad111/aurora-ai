import { calendarMonthOf, calculateChannelMix, listDatesInRange, shiftDateByYears, shiftRangeByYears, simulateScenario } from '@aurora/analytics';
import { CHANNELS, type Channel, type ScenarioBasis, type SimulateScenarioInput, type SimulateScenarioOutput } from '@aurora/shared';
import { requireHotel, ToolInputError, type ToolContext } from './tool-context';

const MAXIMUM_STAY_NIGHTS = 62;

/**
 * Reads what a what-if starts from: rooms and revenue on the books for the
 * stay dates, last year's position at the same point, the channel mix of the
 * month so far and the commission per channel.
 */
export async function loadScenarioBasis(hotelId: string, stayFrom: string, stayTo: string, context: ToolContext): Promise<ScenarioBasis> {
  const hotel = await requireHotel(context, hotelId);
  if (stayFrom > stayTo) throw new ToolInputError('invalid_input', 'stayFrom must not be after stayTo');
  if (stayFrom <= context.today) throw new ToolInputError('invalid_input', `A what-if is about future stay dates: start after ${context.today}`);
  const stayPeriod = { from: stayFrom, to: stayTo };
  const nights = listDatesInRange(stayPeriod).length;
  if (nights > MAXIMUM_STAY_NIGHTS) throw new ToolInputError('invalid_input', `A what-if may cover at most ${MAXIMUM_STAY_NIGHTS} nights`);

  const channelMixPeriod = { from: calendarMonthOf(context.today).from, to: context.today };
  const { repository } = context;
  const [onTheBooks, onTheBooksLastYear, monthSoFar, commissions] = await Promise.all([
    repository.listOnTheBooks(hotel.id, context.today, stayPeriod),
    repository.listOnTheBooks(hotel.id, shiftDateByYears(context.today, -1), shiftRangeByYears(stayPeriod, -1)),
    repository.listDailyStats(hotel.id, channelMixPeriod),
    repository.listChannelCommissions(),
  ]);

  const revenueByChannel = CHANNELS.map((channel) => ({
    channel,
    roomRevenue: monthSoFar.filter((row) => row.channel === channel).reduce((total, row) => total + row.roomRevenue, 0),
  }));
  const channelMix = calculateChannelMix(revenueByChannel, commissions);
  const sharesByChannel = (read: (line: (typeof channelMix.lines)[number]) => number) =>
    Object.fromEntries(channelMix.lines.map((line) => [line.channel, read(line)])) as Record<Channel, number>;

  return {
    stayFrom,
    stayTo,
    roomNightsAvailable: hotel.roomCount * nights,
    roomsOnTheBooks: onTheBooks.reduce((total, row) => total + row.roomsOnTheBooks, 0),
    revenueOnTheBooks: onTheBooks.reduce((total, row) => total + row.revenueOnTheBooks, 0),
    roomsOnTheBooksLastYear: onTheBooksLastYear.reduce((total, row) => total + row.roomsOnTheBooks, 0),
    channelRevenueShares: sharesByChannel((line) => line.revenueShare),
    channelMixPeriod,
    commissionRates: sharesByChannel((line) => line.commissionRate),
  };
}

/** simulate_scenario: the effect of three levers on revenue and net revenue for future stay dates. */
export async function simulateScenarioTool(input: SimulateScenarioInput, context: ToolContext): Promise<SimulateScenarioOutput> {
  const basis = await loadScenarioBasis(input.hotelId, input.stayFrom, input.stayTo, context);
  const levers = { paceRecovery: input.paceRecovery, rateChange: input.rateChange, otaToDirect: input.otaToDirect };
  return { levers, basis, outcome: simulateScenario(basis, levers) };
}
