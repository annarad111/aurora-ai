import { describe, expect, it } from 'vitest';
import { acceptModelReply, classifyConversation } from '../src/orchestrator/conversation';

const TODAY = '2026-11-17';

describe('classifyConversation', () => {
  it.each([
    ['hello', 'greeting'],
    ['Hi Aurora!', 'greeting'],
    ['good morning', 'greeting'],
    ['How are you?', 'small_talk'],
    ['thanks!', 'thanks'],
    ['What can you do?', 'capabilities'],
    ['What is the capital of France?', 'off_topic'],
    ['Write me a poem about cats', 'off_topic'],
  ])('"%s" → %s', (message, reason) => {
    expect(classifyConversation(message, TODAY)).toBe(reason);
  });

  it.each([
    'Why is my hotel revenue below target this month?',
    'What are OTA commissions costing us this month?',
    'Are we on pace for the last 10 days of November?',
    'Which segments replaced the lost MICE nights?',
    'What was occupancy on 5 November?',
    'Show Net RevPAR by channel',
    'Compare weekday and weekend occupancy',
    'How was last week?',
    'and October?',
    'Only OTA',
    'by segment?',
    'Thanks, now show ADR by channel',
    'How are we doing this month?',
    'What should we do about pricing?',
  ])('a question about the hotel is not small talk: "%s"', (question) => {
    expect(classifyConversation(question, TODAY)).toBeNull();
  });
});

describe('acceptModelReply', () => {
  it('keeps a short reply in words', () => {
    expect(acceptModelReply('  **I only help with Hotel Sablon.** What would you like to look at?  ')).toBe(
      'I only help with Hotel Sablon. What would you like to look at?',
    );
  });

  it('refuses a reply with a figure: numbers only come from the tools', () => {
    expect(acceptModelReply('Occupancy was 62% this month.')).toBeNull();
  });
});
