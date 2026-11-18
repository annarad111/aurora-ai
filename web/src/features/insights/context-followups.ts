// ---------------------------------------------------------------------------
// Context-aware follow-ups: when a figure is selected, the suggested questions
// change to ones about that topic.
//
// Each fact belongs to one "view" (the chart that best explains it). Step 7
// uses the same mapping to decide which Explore overlay a fact opens.
// ---------------------------------------------------------------------------

export type InsightView = 'occupancy' | 'bridge' | 'channel' | 'pace';

export function viewForFact(factId: string): InsightView {
  if (factId === 'volume_mice' || factId === 'occupancy' || factId === 'revpar') return 'occupancy';
  if (['ota_share', 'net_revpar', 'commission_cost', 'commission_mix_shift'].includes(factId)) return 'channel';
  if (factId === 'booking_pace' || factId === 'pace_pickup') return 'pace';
  return 'bridge';
}

const FOLLOWUPS_BY_VIEW: Record<InsightView, string[]> = {
  occupancy: ['Which segments could fill 10–12 Nov next year?', 'Are other group blocks at risk this quarter?', 'Compare weekday and weekend occupancy'],
  bridge: ['Break the volume effect down by segment', 'How much of the price gain came from leisure?', 'What happens to the gap if pace holds?'],
  channel: ['What would moving 10% of OTA to direct be worth?', 'Which OTA has the highest commission?', 'Show Net RevPAR by channel'],
  pace: ['Where should rates move for 21–30 November?', 'Which dates have the weakest pickup?', 'Compare pace by segment'],
};

export function followupsForFact(factId: string): string[] {
  return FOLLOWUPS_BY_VIEW[viewForFact(factId)];
}

export function followupsForView(view: InsightView): string[] {
  return FOLLOWUPS_BY_VIEW[view];
}
