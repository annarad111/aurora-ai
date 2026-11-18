import { describe, expect, it } from 'vitest';
import { parseSseBlock, readStreamEvents } from './parse-sse';

/** A ReadableStream that delivers the given text in the given chunks, like a slow network. */
function streamOfChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const textEncoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(textEncoder.encode(chunk)));
      controller.close();
    },
  });
}

const followupsMessage = 'id: 4\nevent: followups\ndata: {"type":"followups","runId":"run_1","sequence":4,"questions":["Why?"]}\n\n';

describe('parseSseBlock', () => {
  it('reads the event name and the data', () => {
    expect(parseSseBlock('id: 4\nevent: followups\ndata: {"a":1}')).toEqual({ eventName: 'followups', data: '{"a":1}' });
  });

  it('ignores heartbeat comments', () => {
    expect(parseSseBlock(': ping')).toBeNull();
  });
});

describe('readStreamEvents', () => {
  it('reassembles a message split across network chunks', async () => {
    const events = [];
    for await (const event of readStreamEvents(streamOfChunks([followupsMessage.slice(0, 20), followupsMessage.slice(20)]))) {
      events.push(event);
    }
    expect(events).toEqual([{ type: 'followups', runId: 'run_1', sequence: 4, questions: ['Why?'] }]);
  });

  it('skips heartbeats and events that break the contract', async () => {
    const invalidMessage = 'data: {"type":"surprise"}\n\n';
    const events = [];
    for await (const event of readStreamEvents(streamOfChunks([': ping\n\n', invalidMessage, followupsMessage]))) {
      events.push(event);
    }
    expect(events.map((event) => event.type)).toEqual(['followups']);
  });

  it('handles Windows line endings', async () => {
    const events = [];
    for await (const event of readStreamEvents(streamOfChunks([followupsMessage.replace(/\n/g, '\r\n')]))) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
  });
});
