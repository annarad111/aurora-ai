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
}

export interface NewConversationTurn extends StoredTurn {
  conversationId: string;
  hotelId: string;
  /** The conversation's title when it is new, or when it only had greetings so far. */
  titleCandidate: string;
  /** True when the answer is about the hotel's data, so it makes a better title than "hello". */
  isAnalysis: boolean;
}
