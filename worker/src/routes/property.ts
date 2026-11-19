import { addDays, calendarMonthOf } from '@aurora/analytics';
import { propertyOverviewSchema, type IsoDate, type MonthlyRevenue, type PropertyEvent, type PropertyOverview } from '@aurora/shared';
import { previousCompletedMonth } from '../orchestrator/analysis-context';
import type { AppDependencies } from '../app';
import { errorResponse, jsonResponse } from '../http/json-response';
import { callTool } from '../tools/registry';
import type { ToolContext } from '../tools/tool-context';

/** How many months the revenue chart goes back at most. */
const MAXIMUM_MONTHS = 6;
const FINANCIAL_KPIS = ['room_revenue', 'occupancy', 'adr', 'revpar'] as const;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(date: IsoDate): string {
  const [year, month] = date.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Room revenue per month, against target and last year: the current month so far,
 * and up to five months before it, as long as the dataset has results for them.
 */
async function readMonthlyRevenue(context: ToolContext, hotelId: string): Promise<MonthlyRevenue[]> {
  const months: MonthlyRevenue[] = [];
  let month = calendarMonthOf(context.today);
  for (let index = 0; index < MAXIMUM_MONTHS; index += 1) {
    const isComplete = month.to < context.today;
    const period = { from: month.from, to: isComplete ? month.to : context.today };
    try {
      const overview = await callTool('get_hotel_overview', { hotelId, period }, context);
      if (overview.roomsSold === 0) break;
      const revenue = overview.kpis.find((kpi) => kpi.metric === 'room_revenue');
      months.unshift({
        label: monthLabel(month.from),
        period,
        isComplete,
        roomRevenue: overview.roomRevenue,
        roomRevenueTarget: revenue?.target ?? null,
        roomRevenueLastYear: revenue?.lastYear ?? null,
      });
    } catch {
      // No results this far back: the history starts after this month.
      break;
    }
    month = calendarMonthOf(addDays(month.from, -1));
  }
  return months;
}

/** Group arrivals in the next 30 days, cancellations made in the last 30. */
const GROUP_DAYS_AHEAD = 30;
const CANCELLATION_DAYS_BACK = 30;

/** What the next weeks hold, in order of urgency: running work, then what is coming, then what happened. */
const EVENT_ORDER = { in_progress: 0, scheduled: 1, cancellation: 2, completed: 3 } as const;

/**
 * Events & alerts: maintenance (with its measured impact), confirmed group
 * arrivals and recent group cancellations, all read from the data.
 */
export async function readPropertyEvents(context: ToolContext, hotelId: string): Promise<PropertyEvent[]> {
  const today = context.today;
  const [roomEvents, blocks] = await Promise.all([
    callTool('get_room_events', { hotelId }, context),
    context.repository.listGroupBlocks(hotelId, { from: addDays(today, -CANCELLATION_DAYS_BACK * 2), to: addDays(today, GROUP_DAYS_AHEAD) }),
  ]);
  const nightsOf = (from: IsoDate, to: IsoDate) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

  const events: Array<{ order: number; date: IsoDate; event: PropertyEvent }> = roomEvents.events.map((event) => ({
    order: EVENT_ORDER[event.status],
    date: event.firstNight,
    event: { ...event, type: 'maintenance' },
  }));
  for (const block of blocks) {
    const roomNights = block.roomsPerNight * nightsOf(block.firstNight, block.lastNight);
    if (block.status === 'confirmed' && block.lastNight >= today && block.firstNight <= addDays(today, GROUP_DAYS_AHEAD)) {
      const status = block.firstNight <= today ? 'in_progress' : 'scheduled';
      events.push({
        order: EVENT_ORDER[status],
        date: block.firstNight,
        event: { type: 'group_arrival', id: block.id, name: block.name, segment: block.segment, firstNight: block.firstNight, lastNight: block.lastNight, roomsPerNight: block.roomsPerNight, roomNights, status },
      });
    }
    if (block.status === 'cancelled' && block.cancelledOn && block.cancelledOn >= addDays(today, -CANCELLATION_DAYS_BACK)) {
      events.push({
        order: EVENT_ORDER.cancellation,
        date: block.firstNight,
        event: { type: 'group_cancellation', id: block.id, name: block.name, segment: block.segment, firstNight: block.firstNight, lastNight: block.lastNight, roomsPerNight: block.roomsPerNight, roomNights, cancelledOn: block.cancelledOn },
      });
    }
  }
  return events.sort((first, second) => first.order - second.order || first.date.localeCompare(second.date)).map(({ event }) => event);
}

/**
 * GET /api/property?hotel=<id>
 * The Property Overview: the rooms tonight (get_property_status) and the
 * financial snapshot of the previous completed month, with the revenue trend.
 */
export async function handlePropertyOverview(url: URL, dependencies: AppDependencies): Promise<Response> {
  const hotelId = url.searchParams.get('hotel');
  if (!hotelId) return errorResponse(400, 'missing_hotel', 'Add ?hotel=<id>');
  const context = dependencies.toolContext;
  if (!(await context.repository.findHotel(hotelId))) return errorResponse(404, 'unknown_hotel', `No hotel with id "${hotelId}"`);

  const previousMonth = previousCompletedMonth(context.today);
  const [status, events, previousMonthOverview, monthlyRevenue] = await Promise.all([
    callTool('get_property_status', { hotelId }, context),
    readPropertyEvents(context, hotelId),
    callTool('get_hotel_overview', { hotelId, period: previousMonth }, context),
    readMonthlyRevenue(context, hotelId),
  ]);

  const overview: PropertyOverview = {
    status,
    events,
    financial: {
      period: previousMonth,
      kpis: FINANCIAL_KPIS.flatMap((metric) => previousMonthOverview.kpis.filter((kpi) => kpi.metric === metric)),
      monthlyRevenue,
      historyStart: monthlyRevenue[0]?.period.from ?? previousMonth.from,
    },
  };
  return jsonResponse(propertyOverviewSchema.parse(overview));
}
