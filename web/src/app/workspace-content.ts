// Static content shown in the workspace shell.
//
// The property and the reporting period are fixed for the demo. In step 3 the
// property details will come from the `hotels` table, and the recent questions
// from the user's history.

export const DEFAULT_QUESTION = 'Why is my hotel revenue below target this month?';

export const CURRENT_PROPERTY = {
  hotelId: 'sablon-bru',
  name: 'Hotel Sablon',
  city: 'Brussels',
  roomCount: 111,
  currency: 'EUR',
};

export const REPORTING_PERIOD_LABEL = '1–17 Nov 2026 · month to date';

export interface SuggestedQuestion {
  topic: string;
  question: string;
}

export const SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  { topic: 'Revenue', question: DEFAULT_QUESTION },
  { topic: 'Channels', question: 'What are OTA commissions costing us this month?' },
  { topic: 'Pace', question: 'Are we on pace for the last 10 days of November?' },
  { topic: 'Segments', question: 'Which segment moved most vs last year?' },
];

export interface RecentQuestion {
  question: string;
  askedOnLabel: string;
}

export const RECENT_QUESTIONS: RecentQuestion[] = [
  { question: DEFAULT_QUESTION, askedOnLabel: 'Today' },
  { question: 'How is corporate pace vs last year?', askedOnLabel: 'Yesterday' },
  { question: 'Weekend ADR by channel', askedOnLabel: '12 Nov' },
];

export const MCP_TOOL_COUNT = 4;
