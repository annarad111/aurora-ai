import { streamEventSchema, type StreamEventOfType } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { createDemoToolContext } from '../src/demo-context';
import { runInsight } from '../src/orchestrator/run-insight';

describe('contextual notes on provenance events', async () => {
  const provenanceEvents: StreamEventOfType<'provenance'>[] = [];
  let sequence = 0;
  await runInsight({
    question: 'Why is my hotel revenue below target this month?',
    hotelId: 'sablon-bru',
    toolContext: createDemoToolContext(),
    signal: new AbortController().signal,
    pacing: { stepDelayMs: 0, textTokenDelayMs: 0 },
    emit: async (payload) => {
      const event = streamEventSchema.parse({ ...payload, runId: 'run_test', sequence });
      sequence += 1;
      if (event.type === 'provenance') provenanceEvents.push(event);
    },
  });
  const noteFor = (factId: string) => provenanceEvents.find((event) => event.factId === factId);

  it('gives every fact a label and a sentence', () => {
    expect(provenanceEvents.length).toBeGreaterThan(10);
    provenanceEvents.forEach((event) => {
      expect(event.contextLabel.length).toBeGreaterThan(3);
      expect(event.contextText.length).toBeGreaterThan(20);
    });
  });

  it('explains the cancelled block from the nightly data', () => {
    expect(noteFor('volume_mice')?.contextLabel).toBe('204 lost room nights');
    expect(noteFor('volume_mice')?.contextText).toMatch(
      /^The MICE shortfall sits on 10–12 November: 204 room nights were cancelled for those nights and never resold\. Occupancy on those nights fell to 38–41% against a/,
    );
  });

  it('quotes the same cancellation count in the provenance and in the note', () => {
    expect(noteFor('volume_mice')?.inputs).toContainEqual({ label: 'Cancelled, 10–12 November', value: '204 room nights' });
  });

  it('shows occupancy without the congress nights', () => {
    expect(noteFor('occupancy')?.contextText).toMatch(/^Occupancy is 13\.0 pp below target\. Without 10–12 November it would be \d+\.\d%/);
  });

  it('adds up the bridge in the revenue gap note', () => {
    expect(noteFor('revenue_gap')?.contextText).toBe('Volume −€41,932, mix −€6,240 and price +€14,255 add up to the full gap.');
  });
});
