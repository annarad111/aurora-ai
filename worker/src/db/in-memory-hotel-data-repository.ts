import { isDateInRange } from '@aurora/analytics';
import type { DemoDataset } from '@aurora/demo-data';
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

/** Serves a dataset held in memory. Same behaviour as the D1 version, without a database. */
export class InMemoryHotelDataRepository implements HotelDataRepository {
  private readonly askedQuestions: AskedQuestion[] = [];

  constructor(private readonly dataset: DemoDataset) {}

  async listHotels(): Promise<Hotel[]> {
    return [...this.dataset.hotels].sort((first, second) => first.name.localeCompare(second.name));
  }

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

  async listGroupBlocks(hotelId: string, period: DateRange): Promise<GroupBlock[]> {
    return this.dataset.groupBlocks.filter(
      (block) => block.hotelId === hotelId && block.firstNight <= period.to && block.lastNight >= period.from,
    );
  }

  async listSuggestedQuestions(hotelId: string): Promise<SuggestedQuestion[]> {
    return this.dataset.suggestedQuestions
      .filter((suggestion) => suggestion.hotelId === hotelId)
      .sort((first, second) => first.position - second.position);
  }

  async recordAskedQuestion(askedQuestion: AskedQuestion): Promise<void> {
    this.askedQuestions.push(askedQuestion);
  }

  async listRecentQuestions(hotelId: string, limit: number): Promise<Array<{ question: string; askedAt: string }>> {
    const latestByQuestion = new Map<string, string>();
    for (const asked of this.askedQuestions.filter((candidate) => candidate.hotelId === hotelId)) {
      const previous = latestByQuestion.get(asked.question);
      if (!previous || asked.askedAt > previous) latestByQuestion.set(asked.question, asked.askedAt);
    }
    return [...latestByQuestion.entries()]
      .map(([question, askedAt]) => ({ question, askedAt }))
      .sort((first, second) => second.askedAt.localeCompare(first.askedAt))
      .slice(0, limit);
  }
}
