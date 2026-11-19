import { streamEventSchema, type StreamEvent } from '@aurora/shared';

// ---------------------------------------------------------------------------
// Server-Sent Events writer for POST /api/chat.
//
// Each event goes out as:
//   id: 7
//   event: kpi
//   data: {"type":"kpi","runId":"run_…","sequence":7,…}
//
// The client reads it with fetch + ReadableStream (not EventSource, which can
// only do GET and cannot be aborted cleanly).
// ---------------------------------------------------------------------------

/** Omit that works on each member of a union separately. */
type DistributiveOmit<Union, Keys extends PropertyKey> = Union extends unknown ? Omit<Union, Keys> : never;

/** An event as the orchestrator writes it: the stream adds runId and sequence. */
export type StreamEventPayload = DistributiveOmit<StreamEvent, 'runId' | 'sequence'>;

export type EmitStreamEvent = (payload: StreamEventPayload) => Promise<void>;

/** A comment line. Proxies see traffic and keep the connection open while the model is thinking. */
export const SSE_HEARTBEAT_COMMENT = ': ping\n\n';
const HEARTBEAT_INTERVAL_MS = 15_000;

export function formatSseMessage(event: StreamEvent): string {
  return `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export const SSE_RESPONSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
} as const;

export class SseEventStream {
  /** Hand this to `new Response(...)`. */
  readonly readable: ReadableStream<Uint8Array>;

  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private readonly textEncoder = new TextEncoder();
  private readonly abortController = new AbortController();
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;
  private nextSequence = 0;
  private isClosed = false;

  /** `onEvent` sees every event exactly as it was sent, so the answer can be stored afterwards. */
  constructor(
    private readonly runId: string,
    private readonly onEvent?: (event: StreamEvent) => void,
  ) {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    this.readable = readable;
    this.writer = writable.getWriter();
    this.heartbeatTimer = setInterval(() => void this.writeText(SSE_HEARTBEAT_COMMENT), HEARTBEAT_INTERVAL_MS);
  }

  /** Aborted when the client goes away or the request is cancelled. The orchestrator stops its work then. */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Validates and sends one event. A schema failure is a bug in our code, so it
   * throws instead of sending something the client would reject.
   */
  readonly emit: EmitStreamEvent = async (payload) => {
    if (this.isClosed) return;
    const event = streamEventSchema.parse({ ...payload, runId: this.runId, sequence: this.nextSequence });
    this.nextSequence += 1;
    this.onEvent?.(event);
    await this.writeText(formatSseMessage(event));
  };

  /** Stops the run, e.g. when the client disconnected. */
  abort(): void {
    this.abortController.abort();
  }

  async close(): Promise<void> {
    clearInterval(this.heartbeatTimer);
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      await this.writer.close();
    } catch {
      // Already closed by the client.
    }
  }

  private async writeText(text: string): Promise<void> {
    if (this.isClosed) return;
    try {
      await this.writer.write(this.textEncoder.encode(text));
    } catch {
      // Writing fails once the client has disconnected: stop the run so we do not waste work.
      this.isClosed = true;
      clearInterval(this.heartbeatTimer);
      this.abort();
    }
  }
}
