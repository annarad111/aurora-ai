import type {
  ChannelCommission,
  Conversation,
  ConversationSummary,
  DailyStat,
  DailyTarget,
  DateRange,
  GroupBlock,
  Hotel,
  IsoDate,
  OnTheBooks,
  PropertyProfile,
  Room,
  RoomStatusEvent,
} from '@aurora/shared';
import { roomTypeSchema, streamEventSchema } from '@aurora/shared';
import type { DecisionRecord, HotelDataRepository, NewConversationTurn } from './hotel-data-repository';

// The only file that writes SQL. Columns are snake_case in the database and
// mapped to the camelCase domain types here, so nothing else knows about tables.

interface ConversationRow {
  id: string;
  hotel_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

function toConversationSummary(row: ConversationRow, turnCount: number): ConversationSummary {
  return { id: row.id, hotelId: row.hotel_id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, turnCount };
}

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


interface DecisionRecordRow {
  id: string;
  hotel_id: string;
  kind: 'insight' | 'action';
  source_key: string | null;
  parent_id: string | null;
  record_version: number;
  record_json: string;
  created_at: string;
  updated_at: string;
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

  async findPropertyProfile(hotelId: string): Promise<PropertyProfile | null> {
    const row = await this.database
      .prepare('SELECT hotel_id, country, address_line, property_type, room_types_json, is_demo_data FROM property_profiles WHERE hotel_id = ?')
      .bind(hotelId)
      .first<{ hotel_id: string; country: string; address_line: string; property_type: string; room_types_json: string; is_demo_data: number }>();
    if (!row) return null;
    return {
      hotelId: row.hotel_id,
      country: row.country,
      addressLine: row.address_line,
      propertyType: row.property_type,
      roomTypes: roomTypeSchema.array().parse(JSON.parse(row.room_types_json)),
      isDemoData: row.is_demo_data === 1,
    };
  }

  async listRooms(hotelId: string): Promise<Room[]> {
    const { results } = await this.database
      .prepare('SELECT hotel_id, room_number, floor, room_type_code FROM rooms WHERE hotel_id = ? ORDER BY floor, room_number')
      .bind(hotelId)
      .all<{ hotel_id: string; room_number: string; floor: number; room_type_code: string }>();
    return results.map((row) => ({ hotelId: row.hotel_id, roomNumber: row.room_number, floor: row.floor, roomTypeCode: row.room_type_code }));
  }

  async listRoomStatusEvents(hotelId: string, period: DateRange): Promise<RoomStatusEvent[]> {
    const { results } = await this.database
      .prepare(
        `SELECT id, hotel_id, room_number, kind, reason, description, first_night, last_night
         FROM room_status_events
         WHERE hotel_id = ? AND first_night <= ? AND last_night >= ?
         ORDER BY first_night, room_number`,
      )
      .bind(hotelId, period.to, period.from)
      .all<{ id: string; hotel_id: string; room_number: string; kind: RoomStatusEvent['kind']; reason: string; description: string; first_night: string; last_night: string }>();
    return results.map((row) => ({
      id: row.id,
      hotelId: row.hotel_id,
      roomNumber: row.room_number,
      kind: row.kind,
      reason: row.reason,
      description: row.description,
      firstNight: row.first_night,
      lastNight: row.last_night,
    }));
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

  async listConversations(hotelId: string, limit: number): Promise<ConversationSummary[]> {
    const { results } = await this.database
      .prepare(
        `SELECT conversations.id, conversations.hotel_id, conversations.title, conversations.created_at, conversations.updated_at,
                COUNT(conversation_turns.position) AS turn_count
         FROM conversations
         JOIN conversation_turns ON conversation_turns.conversation_id = conversations.id
         WHERE conversations.hotel_id = ?
         GROUP BY conversations.id
         ORDER BY conversations.updated_at DESC
         LIMIT ?`,
      )
      .bind(hotelId, limit)
      .all<ConversationRow & { turn_count: number }>();
    return results.map((row) => toConversationSummary(row, row.turn_count));
  }

  async findConversation(conversationId: string): Promise<Conversation | null> {
    const conversation = await this.database
      .prepare('SELECT id, hotel_id, title, created_at, updated_at FROM conversations WHERE id = ?')
      .bind(conversationId)
      .first<ConversationRow>();
    if (!conversation) return null;
    const { results } = await this.database
      .prepare('SELECT question, events_json, created_at FROM conversation_turns WHERE conversation_id = ? ORDER BY position')
      .bind(conversationId)
      .all<{ question: string; events_json: string; created_at: string }>();
    return {
      ...toConversationSummary(conversation, results.length),
      turns: results.map((row) => ({
        question: row.question,
        events: (JSON.parse(row.events_json) as unknown[]).map((event) => streamEventSchema.parse(event)),
        createdAt: row.created_at,
      })),
    };
  }

  async saveConversationTurn(turn: NewConversationTurn): Promise<void> {
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO conversations (id, hotel_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at`,
        )
        .bind(turn.conversationId, turn.hotelId, turn.titleCandidate, turn.createdAt, turn.createdAt),
      // A greeting makes a poor title, so the first question about the data replaces it.
      this.database
        .prepare(
          `UPDATE conversations SET title = ?
           WHERE id = ? AND ? = 1 AND title_is_custom = 0
             AND NOT EXISTS (SELECT 1 FROM conversation_turns WHERE conversation_id = ? AND is_analysis = 1)`,
        )
        .bind(turn.titleCandidate, turn.conversationId, turn.isAnalysis ? 1 : 0, turn.conversationId),
      this.database
        .prepare(
          `INSERT INTO conversation_turns (conversation_id, position, question, events_json, created_at, is_analysis)
           VALUES (?, (SELECT COUNT(*) FROM conversation_turns WHERE conversation_id = ?), ?, ?, ?, ?)`,
        )
        .bind(turn.conversationId, turn.conversationId, turn.question, JSON.stringify(turn.events), turn.createdAt, turn.isAnalysis ? 1 : 0),
    ]);
  }

  async renameConversation(hotelId: string, conversationId: string, title: string): Promise<boolean> {
    const result = await this.database
      .prepare('UPDATE conversations SET title = ?, title_is_custom = 1 WHERE hotel_id = ? AND id = ?')
      .bind(title, hotelId, conversationId)
      .run();
    return result.meta.changes > 0;
  }

  async deleteConversation(hotelId: string, conversationId: string): Promise<boolean> {
    // The answers go first, in the same batch, so no answer is ever left without its conversation.
    const [, deleted] = await this.database.batch([
      this.database
        .prepare('DELETE FROM conversation_turns WHERE conversation_id IN (SELECT id FROM conversations WHERE hotel_id = ? AND id = ?)')
        .bind(hotelId, conversationId),
      this.database.prepare('DELETE FROM conversations WHERE hotel_id = ? AND id = ?').bind(hotelId, conversationId),
    ]);
    return (deleted?.meta.changes ?? 0) > 0;
  }

  async listDecisionRecords(hotelId: string): Promise<DecisionRecord[]> {
    const { results } = await this.database
      .prepare(
        `SELECT id, hotel_id, kind, source_key, parent_id, record_version, record_json, created_at, updated_at
         FROM decision_records WHERE hotel_id = ? ORDER BY created_at, id`,
      )
      .bind(hotelId)
      .all<DecisionRecordRow>();
    return results.map((row) => ({
      id: row.id,
      hotelId: row.hotel_id,
      kind: row.kind,
      sourceKey: row.source_key,
      parentId: row.parent_id,
      recordVersion: row.record_version,
      recordJson: row.record_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async insertDecisionRecord(record: DecisionRecord): Promise<'inserted' | 'duplicate'> {
    // The unique index on (hotel_id, kind, source_key) makes a second save of the same insight a no-op.
    const result = await this.database
      .prepare(
        `INSERT INTO decision_records (id, hotel_id, kind, source_key, parent_id, record_version, record_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .bind(record.id, record.hotelId, record.kind, record.sourceKey, record.parentId, record.recordVersion, record.recordJson, record.createdAt, record.updatedAt)
      .run();
    return result.meta.changes > 0 ? 'inserted' : 'duplicate';
  }

  async updateDecisionRecord(hotelId: string, id: string, recordJson: string, updatedAt: string): Promise<boolean> {
    const result = await this.database
      .prepare('UPDATE decision_records SET record_json = ?, updated_at = ? WHERE hotel_id = ? AND id = ?')
      .bind(recordJson, updatedAt, hotelId, id)
      .run();
    return result.meta.changes > 0;
  }

  async deleteDecisionRecord(hotelId: string, id: string): Promise<boolean> {
    const result = await this.database.prepare('DELETE FROM decision_records WHERE hotel_id = ? AND id = ?').bind(hotelId, id).run();
    return result.meta.changes > 0;
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
