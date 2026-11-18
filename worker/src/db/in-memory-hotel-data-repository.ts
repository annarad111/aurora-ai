import { isDateInRange } from '@aurora/analytics';
import type { DemoDataset } from '@aurora/demo-data';
import type { ChannelCommission, DailyStat, DailyTarget, DateRange, Hotel, IsoDate, OnTheBooks } from '@aurora/shared';
import type { HotelDataRepository } from './hotel-data-repository';

/** Serves a dataset held in memory. Same behaviour as the D1 version, without a database. */
export class InMemoryHotelDataRepository implements HotelDataRepository {
  constructor(private readonly dataset: DemoDataset) {}

  async findHotel(hotelId: string): Promise<Hotel | null> {
    return this.dataset.hotels.find((hotel) => hotel.id === hotelId) ?? null;
  }

  async listDailyStats(hotelId: string, period: DateRange): Promise<DailyStat[]> {
    return this.dataset.dailyStats.filter((row) => row.hotelId === hotelId && isDateInRange(row.date, period));
  }

  async listDailyTargets(hotelId: string, period: DateRange): Promise<DailyTarget[]> {
    return this.dataset.dailyTargets.filter((row) => row.hotelId === hotelId && isDateInRange(row.date, period));
  }

  async listChannelCommissions(): Promise<ChannelCommission[]> {
    return this.dataset.channelCommissions;
  }

  async listOnTheBooks(hotelId: string, snapshotDate: IsoDate, stayPeriod: DateRange): Promise<OnTheBooks[]> {
    return this.dataset.onTheBooks.filter(
      (row) => row.hotelId === hotelId && row.snapshotDate === snapshotDate && isDateInRange(row.stayDate, stayPeriod),
    );
  }
}
