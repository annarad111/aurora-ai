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
  listSuggestedQuestions(hotelId: string): Promise<SuggestedQuestion[]>;
  recordAskedQuestion(askedQuestion: AskedQuestion): Promise<void>;
  /** The latest distinct questions, newest first. */
  listRecentQuestions(hotelId: string, limit: number): Promise<Array<{ question: string; askedAt: string }>>;
}
