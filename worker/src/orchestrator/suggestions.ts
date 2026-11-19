import { formatPeriodLabel, SEGMENT_LABELS, type Hotel, type IsoDate, type Suggestion } from '@aurora/shared';
import { callTool } from '../tools/registry';
import type { ToolContext } from '../tools/tool-context';
import { monthToDate, paceWindowFor } from './analysis-context';

// ---------------------------------------------------------------------------
// Starter questions, written from what the data shows today: the biggest gap,
// weak pace, a channel that is getting more expensive, a segment that fell
// short, a cancelled group block. Nothing is stored or written by hand: when
// the numbers change, the suggestions change with them.
// ---------------------------------------------------------------------------

const MAXIMUM_SUGGESTIONS = 4;
/** Pace this far behind last year (or more) is worth a question. */
const PACE_WORTH_ASKING = -0.03;
/** An OTA share this much above last year is worth a question. */
const OTA_SHARE_RISE_WORTH_ASKING = 0.02;

export async function buildSuggestions(context: ToolContext, hotel: Hotel, today: IsoDate = context.today): Promise<Suggestion[]> {
  const period = monthToDate(today);
  const paceWindow = paceWindowFor(today);
  const hotelId = hotel.id;
  const [drivers, channelMix, pace, groupBlocks] = await Promise.all([
    callTool('analyze_revenue_drivers', { hotelId, period }, context),
    callTool('get_channel_mix', { hotelId, period }, context),
    callTool('get_booking_pace', { hotelId, stayFrom: paceWindow.from, stayTo: paceWindow.to }, context),
    callTool('get_group_blocks', { hotelId, period }, context),
  ]);

  const suggestions: Suggestion[] = [];

  suggestions.push(
    drivers.revenueGap < 0
      ? { topic: 'Revenue', question: 'Why is revenue below target this month?' }
      : { topic: 'Revenue', question: 'What is driving revenue above target this month?' },
  );

  const paceLabel = formatPeriodLabel({ from: pace.stayFrom, to: pace.stayTo });
  suggestions.push(
    pace.changeVsLastYear <= PACE_WORTH_ASKING
      ? { topic: 'Pace', question: `Are we on pace for ${paceLabel}?` }
      : { topic: 'Pace', question: `How does booking pace look for ${paceLabel}?` },
  );

  const ota = channelMix.channels.find((channel) => channel.channel === 'ota');
  suggestions.push(
    ota && ota.revenueShare - ota.revenueShareLastYear >= OTA_SHARE_RISE_WORTH_ASKING
      ? { topic: 'Channels', question: 'What are OTA commissions costing us this month?' }
      : { topic: 'Channels', question: 'Show Net RevPAR by channel this month' },
  );

  const cancelledBlock = groupBlocks.blocks.find((block) => block.status === 'cancelled');
  const weakestSegment = [...drivers.segments].sort((first, second) => first.volumeEffect - second.volumeEffect)[0];
  if (cancelledBlock) {
    suggestions.push({ topic: 'Groups', question: 'Are other group blocks at risk this quarter?' });
  } else if (weakestSegment && weakestSegment.volumeEffect < 0) {
    suggestions.push({ topic: 'Segments', question: `Which segments replaced the lost ${SEGMENT_LABELS[weakestSegment.segment]} nights?` });
  } else {
    suggestions.push({ topic: 'Segments', question: 'Which segment moved most vs last year?' });
  }

  return suggestions.slice(0, MAXIMUM_SUGGESTIONS);
}
