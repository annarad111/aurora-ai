import type { ChannelCommission, DailyStat, DailyTarget, DateRange, Hotel, IsoDate, OnTheBooks } from '@aurora/shared';
import type { HotelDataRepository } from './hotel-data-repository';

// The only file that writes SQL. Columns are snake_case in the database and
// mapped to the camelCase domain types here, so nothing else knows about tables.

interface HotelRow {
  id: string;
  name: string;
  city: string;
  room_count: number;
  currency: 'EUR';
  timezone: string;
}

interface DailyStatRow {
  hotel_id: string;
  date: string;
  segment: DailyStat['segment'];
  channel: DailyStat['channel'];
  rooms_sold: number;
  room_revenue: number;
  cancellations: number;
}

interface TargetRow {
  hotel_id: string;
  date: string;
  segment: DailyTarget['segment'];
  rooms_target: number;
  room_revenue_target: number;
}

interface ChannelRow {
  code: ChannelCommission['channel'];
  name: string;
  commission_rate: number;
}

interface OnTheBooksRow {
  hotel_id: string;
  snapshot_date: string;
  stay_date: string;
  rooms_otb: number;
  revenue_otb: number;
}

export class D1HotelDataRepository implements HotelDataRepository {
  constructor(private readonly database: D1Database) {}

  async findHotel(hotelId: string): Promise<Hotel | null> {
    const row = await this.database
      .prepare('SELECT id, name, city, room_count, currency, timezone FROM hotels WHERE id = ?')
      .bind(hotelId)
      .first<HotelRow>();
    if (!row) return null;
    return { id: row.id, name: row.name, city: row.city, roomCount: row.room_count, currency: row.currency, timezone: row.timezone };
  }

  async listDailyStats(hotelId: string, period: DateRange): Promise<DailyStat[]> {
    const { results } = await this.database
      .prepare(
        `SELECT hotel_id, date, segment, channel, rooms_sold, room_revenue, cancellations
         FROM daily_stats
         WHERE hotel_id = ? AND date BETWEEN ? AND ?
         ORDER BY date, segment, channel`,
      )
      .bind(hotelId, period.from, period.to)
      .all<DailyStatRow>();
    return results.map((row) => ({
      hotelId: row.hotel_id,
      date: row.date,
      segment: row.segment,
      channel: row.channel,
      roomsSold: row.rooms_sold,
      roomRevenue: row.room_revenue,
      cancellations: row.cancellations,
    }));
  }

  async listDailyTargets(hotelId: string, period: DateRange): Promise<DailyTarget[]> {
    const { results } = await this.database
      .prepare(
        `SELECT hotel_id, date, segment, rooms_target, room_revenue_target
         FROM targets
         WHERE hotel_id = ? AND date BETWEEN ? AND ?
         ORDER BY date, segment`,
      )
      .bind(hotelId, period.from, period.to)
      .all<TargetRow>();
    return results.map((row) => ({
      hotelId: row.hotel_id,
      date: row.date,
      segment: row.segment,
      roomsTarget: row.rooms_target,
      roomRevenueTarget: row.room_revenue_target,
    }));
  }

  async listChannelCommissions(): Promise<ChannelCommission[]> {
    const { results } = await this.database.prepare('SELECT code, name, commission_rate FROM channels ORDER BY code').all<ChannelRow>();
    return results.map((row) => ({ channel: row.code, name: row.name, commissionRate: row.commission_rate }));
  }

  async listOnTheBooks(hotelId: string, snapshotDate: IsoDate, stayPeriod: DateRange): Promise<OnTheBooks[]> {
    const { results } = await this.database
      .prepare(
        `SELECT hotel_id, snapshot_date, stay_date, rooms_otb, revenue_otb
         FROM on_the_books
         WHERE hotel_id = ? AND snapshot_date = ? AND stay_date BETWEEN ? AND ?
         ORDER BY stay_date`,
      )
      .bind(hotelId, snapshotDate, stayPeriod.from, stayPeriod.to)
      .all<OnTheBooksRow>();
    return results.map((row) => ({
      hotelId: row.hotel_id,
      snapshotDate: row.snapshot_date,
      stayDate: row.stay_date,
      roomsOnTheBooks: row.rooms_otb,
      revenueOnTheBooks: row.revenue_otb,
    }));
  }
}
