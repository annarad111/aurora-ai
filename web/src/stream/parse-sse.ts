import { streamEventSchema, type StreamEvent } from '@aurora/shared';

// ---------------------------------------------------------------------------
// Reads the Server-Sent Events of POST /api/chat from a fetch response body.
//
// We use fetch + ReadableStream instead of EventSource, because EventSource
// can only send GET requests (no body) and cannot be stopped with AbortController.
//
// An SSE message is a block of lines ending with a blank line:
//   id: 7
//   event: kpi
//   data: {"type":"kpi",…}
// Lines starting with ":" are comments (our heartbeat) and are ignored.
// ---------------------------------------------------------------------------

export interface SseMessage {
  eventName: string | null;
  data: string;
}

/** Parses one message block. Returns null for comment-only blocks (heartbeats). */
export function parseSseBlock(block: string): SseMessage | null {
  let eventName: string | null = null;
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colonIndex = line.indexOf(':');
    const fieldName = colonIndex === -1 ? line : line.slice(0, colonIndex);
    // The spec allows one optional space after the colon.
    const fieldValue = colonIndex === -1 ? '' : line.slice(colonIndex + 1).replace(/^ /, '');
    if (fieldName === 'event') eventName = fieldValue;
    if (fieldName === 'data') dataLines.push(fieldValue);
  }

  return dataLines.length === 0 ? null : { eventName, data: dataLines.join('\n') };
}

/**
 * Turns a response body into validated stream events, one at a time.
 * Events that fail the schema are skipped with a warning instead of breaking
 * the whole answer.
 */
export async function* readStreamEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const textDecoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += textDecoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let blockEnd = buffer.indexOf('\n\n');
      while (blockEnd !== -1) {
        const block = buffer.slice(0, blockEnd);
        buffer = buffer.slice(blockEnd + 2);
        const event = toStreamEvent(parseSseBlock(block));
        if (event) yield event;
        blockEnd = buffer.indexOf('\n\n');
      }
    }
    // A last message without the closing blank line.
    const lastEvent = toStreamEvent(parseSseBlock(buffer));
    if (lastEvent) yield lastEvent;
  } finally {
    reader.releaseLock();
  }
}

function toStreamEvent(message: SseMessage | null): StreamEvent | null {
  if (!message) return null;
  try {
    const parsed = streamEventSchema.safeParse(JSON.parse(message.data));
    if (parsed.success) return parsed.data;
    console.warn('[Aurora] Skipped a stream event that does not match the contract', parsed.error.issues);
  } catch {
    console.warn('[Aurora] Skipped a stream event that is not valid JSON', message.data);
  }
  return null;
}
