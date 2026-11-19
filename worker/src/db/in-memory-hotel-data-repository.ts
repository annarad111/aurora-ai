import { isDateInRange } from '@aurora/analytics';
import type { DemoDataset } from '@aurora/demo-data';
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
} from '@aurora/shared';
import type { DecisionRecord, HotelDataRepository, NewConversationTurn } from './hotel-data-repository';

/** Serves a dataset held in memory. Same behaviour as the D1 version, without a database. */
export class InMemoryHotelDataRepository implements HotelDataRepository {
  private readonly conversations = new Map<string, Conversation & { hasAnalysis: boolean; titleIsCustom?: boolean }>();
  /** Saved insights and actions, in insertion order. */
  readonly decisionRecords: DecisionRecord[] = [];

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

  async listConversations(hotelId: string, limit: number): Promise<ConversationSummary[]> {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.hotelId === hotelId && conversation.turns.length > 0)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
      .slice(0, limit)
      .map(({ turns, hasAnalysis: _hasAnalysis, titleIsCustom: _titleIsCustom, ...summary }) => ({ ...summary, turnCount: turns.length }));
  }

  async findConversation(conversationId: string): Promise<Conversation | null> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return null;
    const { hasAnalysis: _hasAnalysis, titleIsCustom: _titleIsCustom, ...rest } = conversation;
    return { ...rest, turns: [...rest.turns], turnCount: rest.turns.length };
  }

  async saveConversationTurn(turn: NewConversationTurn): Promise<void> {
    const conversation = this.conversations.get(turn.conversationId) ?? {
      id: turn.conversationId,
      hotelId: turn.hotelId,
      title: turn.titleCandidate,
      createdAt: turn.createdAt,
      updatedAt: turn.createdAt,
      turnCount: 0,
      turns: [],
      hasAnalysis: false,
    };
    // A greeting makes a poor title, so the first question about the data replaces it.
    if (turn.isAnalysis && !conversation.hasAnalysis && !conversation.titleIsCustom) conversation.title = turn.titleCandidate;
    conversation.hasAnalysis ||= turn.isAnalysis;
    conversation.updatedAt = turn.createdAt;
    conversation.turns.push({ question: turn.question, events: turn.events, createdAt: turn.createdAt });
    this.conversations.set(conversation.id, conversation);
  }

  async renameConversation(hotelId: string, conversationId: string, title: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.hotelId !== hotelId) return false;
    conversation.title = title;
    conversation.titleIsCustom = true;
    return true;
  }

  async deleteConversation(hotelId: string, conversationId: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.hotelId !== hotelId) return false;
    return this.conversations.delete(conversationId);
  }

  async listDecisionRecords(hotelId: string): Promise<DecisionRecord[]> {
    return this.decisionRecords.filter((record) => record.hotelId === hotelId).map((record) => ({ ...record }));
  }

  async insertDecisionRecord(record: DecisionRecord): Promise<'inserted' | 'duplicate'> {
    const isDuplicate =
      record.sourceKey !== null &&
      this.decisionRecords.some((other) => other.hotelId === record.hotelId && other.kind === record.kind && other.sourceKey === record.sourceKey);
    if (isDuplicate) return 'duplicate';
    this.decisionRecords.push({ ...record });
    return 'inserted';
  }

  async updateDecisionRecord(hotelId: string, id: string, recordJson: string, updatedAt: string): Promise<boolean> {
    const record = this.decisionRecords.find((candidate) => candidate.hotelId === hotelId && candidate.id === id);
    if (!record) return false;
    record.recordJson = recordJson;
    record.updatedAt = updatedAt;
    return true;
  }

  async deleteDecisionRecord(hotelId: string, id: string): Promise<boolean> {
    const index = this.decisionRecords.findIndex((candidate) => candidate.hotelId === hotelId && candidate.id === id);
    if (index === -1) return false;
    this.decisionRecords.splice(index, 1);
    return true;
  }
}
