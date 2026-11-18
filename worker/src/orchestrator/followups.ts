import { SEGMENT_LABELS, type Segment } from '@aurora/shared';
import type { AnalysisContext } from './analysis-context';
import { describeNights, findBiggestVolumeLoss, findCancelledBlock, findShareShift } from './derived-facts';
import { followupsForDataQuestion } from './data-answers';
import type { InsightIntent } from './insight-plan';

// ---------------------------------------------------------------------------
// Suggested next questions, written from the data: the dates, segments and
// blocks in them come from the tool results, so they are right for any hotel
// and any period.
//
//   for an answer        followupsForIntent
//   for a selected figure followupsForFact (sent with its provenance)
// ---------------------------------------------------------------------------

export type ExploreView = 'occupancy' | 'bridge' | 'channel' | 'pace';

/** The Explore overlay view that best explains a fact. */
export function exploreViewForFact(factId: string, analysis: AnalysisContext): ExploreView {
  if (factId === 'occupancy' || factId === 'revpar') return 'occupancy';
  if (['ota_share', 'net_revpar', 'commission_cost', 'commission_mix_shift'].includes(factId)) return 'channel';
  if (factId === 'booking_pace' || factId === 'pace_pickup') return 'pace';
  // The segment hit by a cancelled block is best seen night by night.
  const blockSegment = analysis.results.overview ? findCancelledBlock(analysis.results.overview)?.block.segment : undefined;
  if (blockSegment && factId === `volume_${blockSegment}`) return 'occupancy';
  return 'bridge';
}

function segmentInSentence(segment: Segment): string {
  return segment === 'mice' ? 'MICE' : SEGMENT_LABELS[segment].toLowerCase();
}

/** Pieces of data the questions are written with, or neutral words when a tool did not run. */
function readQuestionContext(analysis: AnalysisContext) {
  const { overview, drivers } = analysis.results;
  const cancelledBlock = overview ? findCancelledBlock(overview) : null;
  const biggestLoss = drivers ? findBiggestVolumeLoss(drivers) : null;
  const shareShift = drivers ? findShareShift(drivers) : null;
  return {
    blockName: cancelledBlock?.block.name ?? null,
    blockNights: cancelledBlock ? describeNights(cancelledBlock.nights) : null,
    lostSegment: biggestLoss ? segmentInSentence(biggestLoss.segment) : 'lost',
    gainingSegment: shareShift ? segmentInSentence(shareShift.gaining.segment) : 'the growing segment',
    paceWindow: describeNights(analysis.paceWindow),
  };
}

const VIEW_QUESTIONS: Record<ExploreView, (context: ReturnType<typeof readQuestionContext>) => string[]> = {
  occupancy: (context) => [
    context.blockNights ? `Which segments could fill ${context.blockNights} next year?` : 'Which nights had the lowest occupancy?',
    'Are other group blocks at risk this quarter?',
    'Compare weekday and weekend occupancy',
  ],
  bridge: (context) => [
    'Break the volume effect down by segment',
    `How much of the price gain came from ${context.gainingSegment}?`,
    'What happens to the gap if pace holds?',
  ],
  channel: () => ['What would moving 10% of OTA to direct be worth?', 'Which OTA has the highest commission?', 'Show Net RevPAR by channel'],
  pace: (context) => [
    `Where should rates move for ${context.paceWindow}?`,
    'Which dates have the weakest pickup?',
    'Compare pace by segment',
  ],
};

export function followupsForFact(factId: string, analysis: AnalysisContext): string[] {
  return VIEW_QUESTIONS[exploreViewForFact(factId, analysis)](readQuestionContext(analysis));
}

export function followupsForIntent(intent: InsightIntent, analysis: AnalysisContext): string[] {
  const context = readQuestionContext(analysis);
  switch (intent) {
    case 'revenue_gap':
      return [
        context.blockName ? `Which segments replaced the lost ${context.lostSegment} nights?` : 'Which segments fell short of target?',
        'What would moving 10% of OTA to direct be worth?',
        `Are we on pace for ${context.paceWindow}?`,
      ];
    case 'channel_cost':
      return VIEW_QUESTIONS.channel(context);
    case 'booking_pace':
      return [...VIEW_QUESTIONS.pace(context).slice(1), 'Why is my hotel revenue below target this month?'];
    case 'segment_shift':
      return [
        context.blockNights ? `Which segments could fill ${context.blockNights} next year?` : 'Which segments fell short of target?',
        'Are other group blocks at risk this quarter?',
        'What are OTA commissions costing us this month?',
      ];
    case 'data_question':
    case 'group_blocks':
      return followupsForDataQuestion(analysis);
  }
}
