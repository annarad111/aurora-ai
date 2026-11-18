import type {
  AskedQuestion,
  ChannelCommission,
  DailyStat,
  DailyTarget,
  DateRange,
  GroupBlock,
  Hotel,
  IsoDate,
  OnTheBooks,
  SuggestedQuestion,
} from '@aurora/shared';
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

interface GroupBlockRow {
  id: string;
  hotel_id: string;
  name: string;
  segment: GroupBlock['segment'];
  first_night: string;
  last_night: string;
  rooms_per_night: number;
  status: GroupBlock['status'];
  cancelled_on: string | null;
}

interface SuggestedQuestionRow {
  hotel_id: string;
  position: number;
  topic: string;
  question: string;
}

function toHotel(row: HotelRow): Hotel {
  return { id: row.id, name: row.name, city: row.city, roomCount: row.room_count, currency: row.currency, timezone: row.timezone };
}

export class D1HotelDataRepository implements HotelDataRepository {
  constructor(private readonly database: D1Database) {}

  async listHotels(): Promise<Hotel[]> {
    const { results } = await this.database
      .prepare('SELECT id, name, city, room_count, currency, timezone FROM hotels ORDER BY name')
      .all<HotelRow>();
    return results.map(toHotel);
  }

  async findHotel(hotelId: string): Promise<Hotel | null> {
    const row = await this.database
      .prepare('SELECT id, name, city, room_count, currency, timezone FROM hotels WHERE id = ?')
      .bind(hotelId)
      .first<HotelRow>();
    return row ? toHotel(row) : null;
  }

  async listGroupBlocks(hotelId: string, period: DateRange): Promise<GroupBlock[]> {
    const { results } = await this.database
      .prepare(
        `SELECT id, hotel_id, name, segment, first_night, last_night, rooms_per_night, status, cancelled_on
         FROM group_blocks
         WHERE hotel_id = ? AND first_night <= ? AND last_night >= ?
         ORDER BY first_night`,
      )
      .bind(hotelId, period.to, period.from)
      .all<GroupBlockRow>();
    return results.map((row) => ({
      id: row.id,
      hotelId: row.hotel_id,
      name: row.name,
      segment: row.segment,
      firstNight: row.first_night,
      lastNight: row.last_night,
      roomsPerNight: row.rooms_per_night,
      status: row.status,
      cancelledOn: row.cancelled_on,
    }));
  }

  async listSuggestedQuestions(hotelId: string): Promise<SuggestedQuestion[]> {
    const { results } = await this.database
      .prepare('SELECT hotel_id, position, topic, question FROM suggested_questions WHERE hotel_id = ? ORDER BY position')
      .bind(hotelId)
      .all<SuggestedQuestionRow>();
    return results.map((row) => ({ hotelId: row.hotel_id, position: row.position, topic: row.topic, question: row.question }));
  }

  async recordAskedQuestion(askedQuestion: AskedQuestion): Promise<void> {
    await this.database
      .prepare('INSERT INTO asked_questions (hotel_id, question, asked_at) VALUES (?, ?, ?)')
      .bind(askedQuestion.hotelId, askedQuestion.question, askedQuestion.askedAt)
      .run();
  }

  async listRecentQuestions(hotelId: string, limit: number): Promise<Array<{ question: string; askedAt: string }>> {
    const { results } = await this.database
      .prepare(
        `SELECT question, MAX(asked_at) AS asked_at
         FROM asked_questions
         WHERE hotel_id = ?
         GROUP BY question
         ORDER BY asked_at DESC
         LIMIT ?`,
      )
      .bind(hotelId, limit)
      .all<{ question: string; asked_at: string }>();
    return results.map((row) => ({ question: row.question, askedAt: row.asked_at }));
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
