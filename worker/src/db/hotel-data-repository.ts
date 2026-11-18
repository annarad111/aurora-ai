import type { ChannelCommission, DailyStat, DailyTarget, DateRange, Hotel, IsoDate, OnTheBooks } from '@aurora/shared';

/**
 * The only way the tools read data. Every method is async, because the real
 * implementation (step 4) queries Cloudflare D1.
 *
 * Implementations:
 *   InMemoryHotelDataRepository  the generated demo dataset in memory (tests, scripts)
 *   D1HotelDataRepository        SQL against D1 (step 4)
 */
export interface HotelDataRepository {
  findHotel(hotelId: string): Promise<Hotel | null>;
  listDailyStats(hotelId: string, period: DateRange): Promise<DailyStat[]>;
  listDailyTargets(hotelId: string, period: DateRange): Promise<DailyTarget[]>;
  listChannelCommissions(): Promise<ChannelCommission[]>;
  /** Bookings for the stay dates in `stayPeriod`, as they were on `snapshotDate`. */
  listOnTheBooks(hotelId: string, snapshotDate: IsoDate, stayPeriod: DateRange): Promise<OnTheBooks[]>;
}
