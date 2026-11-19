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
  StoredTurn,
} from '@aurora/shared';

/**
 * The only way the app reads and writes data. Every method is async, because
 * the real implementation queries Cloudflare D1.
 *
 * Implementations:
 *   D1HotelDataRepository        SQL against D1 (the Worker)
 *   InMemoryHotelDataRepository  the generated demo dataset in memory (tests, scripts)
 */
export interface HotelDataRepository {
  listHotels(): Promise<Hotel[]>;
  findHotel(hotelId: string): Promise<Hotel | null>;
  listDailyStats(hotelId: string, period: DateRange): Promise<DailyStat[]>;
  listDailyTargets(hotelId: string, period: DateRange): Promise<DailyTarget[]>;
  listChannelCommissions(): Promise<ChannelCommission[]>;
  /** Bookings for the stay dates in `stayPeriod`, as they were on `snapshotDate`. */
  listOnTheBooks(hotelId: string, snapshotDate: IsoDate, stayPeriod: DateRange): Promise<OnTheBooks[]>;
  /** Group blocks with at least one night inside the period, any status. */
  listGroupBlocks(hotelId: string, period: DateRange): Promise<GroupBlock[]>;
  /** Conversations with at least one answer, most recently updated first. */
  listConversations(hotelId: string, limit: number): Promise<ConversationSummary[]>;
  /** A conversation with every stored answer, oldest first; null when there is none with this id. */
  findConversation(conversationId: string): Promise<Conversation | null>;
  /** Stores a finished answer, creating the conversation with its first one. */
  saveConversationTurn(turn: NewConversationTurn): Promise<void>;
  /** Sets the user's own title; answers stored later keep it. False when the hotel has no such conversation. */
  renameConversation(hotelId: string, conversationId: string, title: string): Promise<boolean>;
  /** Deletes the conversation and every stored answer. False when the hotel has no such conversation. */
  deleteConversation(hotelId: string, conversationId: string): Promise<boolean>;

  // --- Insight to action. The rules live in worker/src/decisions; these only store records. ---
  /** Every saved insight and action of the hotel, oldest first. */
  listDecisionRecords(hotelId: string): Promise<DecisionRecord[]>;
  /** "duplicate" when an insight with the same source key is already saved. */
  insertDecisionRecord(record: DecisionRecord): Promise<'inserted' | 'duplicate'>;
  /** False when there is no such record for this hotel. */
  updateDecisionRecord(hotelId: string, id: string, recordJson: string, updatedAt: string): Promise<boolean>;
  deleteDecisionRecord(hotelId: string, id: string): Promise<boolean>;
}

/** One stored insight or action: the record as JSON, with the version of its format. */
export interface DecisionRecord {
  id: string;
  hotelId: string;
  kind: 'insight' | 'action';
  sourceKey: string | null;
  parentId: string | null;
  recordVersion: number;
  recordJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewConversationTurn extends StoredTurn {
  conversationId: string;
  hotelId: string;
  /** The conversation's title when it is new, or when it only had greetings so far. */
  titleCandidate: string;
  /** True when the answer is about the hotel's data, so it makes a better title than "hello". */
  isAnalysis: boolean;
}
