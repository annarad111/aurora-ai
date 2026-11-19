import type { Hotel, IsoDate } from '@aurora/shared';
import { parsePeriod } from './question-parser';

// ---------------------------------------------------------------------------
// Messages that are not a question about the data: "hello", "thanks", "what can
// you do?", or something outside the hotel's business. Aurora answers them in
// a sentence or two and offers questions it can answer, like a person would,
// instead of running an analysis nobody asked for.
// ---------------------------------------------------------------------------

export type ConversationReason = 'greeting' | 'small_talk' | 'thanks' | 'capabilities' | 'off_topic';

const GREETING = /^(hi|hello|hey|hiya|howdy|yo|good (morning|afternoon|evening|day)|greetings|salut|bun[aă]( ziua)?|ciao|hola|bonjour|hallo)\b[\s,!.]*(aurora|there|team|everyone)?[\s,!.?]*$/i;
const SMALL_TALK = /^(how are you( doing)?|how('s| is) it going|how are things|what'?s up|are you there)\b[\s\w,!.?']{0,20}$/i;
const THANKS = /^(thanks?|thank you|thx|cheers|great|perfect|ok(ay)?|cool|nice|awesome|got it|understood|merci|mul[tț]umesc)\b[\s\w,!.']{0,40}$/i;
const CAPABILITIES =
  /\b(what can you do|what do you do|who are you|what are you|how can you help|what can i ask|how does (this|it) work|help)\b/i;

/**
 * Words that put a message inside the hotel's business. A message without any
 * of them (and without a date) is outside what Aurora answers.
 */
const HOTEL_TOPIC = new RegExp(
  [
    'revenue', 'sales', 'turnover', 'profit', 'cost', 'costs', 'costing', 'money', 'income', 'business', 'performance', 'performing', 'doing',
    'occupancy', 'occupied', 'full', 'empty', 'adr', 'rate', 'rates', 'price', 'prices', 'pricing', 'revpar', 'kpis?', 'numbers', 'results',
    'target', 'targets', 'budget', 'forecast', 'pace', 'pick-?up', 'books', 'bookings?', 'booked', 'reservations?', 'demand',
    'channels?', 'ota', 'otas', 'direct', 'gds', 'wholesale', 'commissions?', 'booking\\.com', 'expedia', 'distribution',
    'segments?', 'corporate', 'leisure', 'groups?', 'mice', 'congress', 'conference', 'events?', 'blocks?',
    'cancell?ations?', 'cancell?ed', 'nights?', 'rooms?', 'guests?', 'stays?', 'weekends?', 'weekdays?',
    'hotel', 'property', 'month', 'week', 'year', 'yoy', 'today', 'yesterday', 'tonight', 'season',
    'decisions?', 'actions?', 'tasks?', 'to-?dos?', 'overdue', 'priority', 'priorities', 'saved',
    'why', 'gap', 'drivers?', 'trend', 'compare', 'comparison', 'split', 'breakdown', 'what if', 'scenario', 'simulat\\w*',
    'recommend\\w*', 'improve', 'increase', 'grow', 'strategy', 'competitors?', 'comp set', 'market',
  ].map((word) => `\\b${word}\\b`).join('|'),
  'i',
);

export function isAboutTheHotel(question: string, today: IsoDate): boolean {
  return HOTEL_TOPIC.test(question) || parsePeriod(question, today) !== null;
}

/**
 * Greetings, thanks and "what can you do" are recognised by fixed rules, so
 * they get an answer at once. A message outside the hotel's business is
 * "off_topic". Null for everything else: a question about the data.
 */
export function classifyConversation(question: string, today: IsoDate): ConversationReason | null {
  const text = question.trim();
  if (GREETING.test(text)) return 'greeting';
  if (SMALL_TALK.test(text)) return 'small_talk';
  const aboutTheHotel = isAboutTheHotel(text, today);
  if (THANKS.test(text) && !aboutTheHotel) return 'thanks';
  if (CAPABILITIES.test(text) && !aboutTheHotel) return 'capabilities';
  if (!aboutTheHotel) return 'off_topic';
  return null;
}

/** Aurora's own words for each kind of message. The suggestions shown with them come from the data. */
export function writeConversationReply(reason: ConversationReason, hotel: Hotel): string {
  switch (reason) {
    case 'greeting':
      return 'Hello, what would you like to see today about your business?';
    case 'small_talk':
      return 'I am doing well, thank you. What would you like to see today about your business?';
    case 'thanks':
      return 'You are welcome. What else would you like to look at?';
    case 'capabilities':
      return (
        `I am Aurora, the revenue analyst for ${hotel.name}. I can explain revenue against target, occupancy, ADR and RevPAR, ` +
        'what channels and commissions cost, how bookings are pacing, how segments and group blocks moved, and what a change ' +
        'in pace, rate or channel mix would be worth. I can also tell you what is saved in Decisions: your insights, actions, ' +
        'priorities and what is overdue. Ask about any date or period, or start with one of these.'
      );
    case 'off_topic':
      return (
        `I can only help with the business of ${hotel.name}: revenue, occupancy, rates, channels, booking pace, segments, ` +
        'group blocks and your saved decisions. What would you like to look at?'
      );
  }
}

const MAXIMUM_REPLY_WORDS = 90;

/**
 * A reply the language model wrote without calling a tool, if it is safe to
 * show: no figures (numbers only ever come from the tools), no Markdown, short.
 * Null when it is not, and the fixed reply is used instead.
 */
export function acceptModelReply(rawText: string): string | null {
  const text = rawText
    .replace(/\*\*|__|`|^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^"(.*)"$/, '$1');
  if (!text || /\d/.test(text) || /[{}[\]]/.test(text)) return null;
  if (text.split(' ').length > MAXIMUM_REPLY_WORDS) return null;
  return text;
}
