import { describe, expect, it } from 'vitest';

import { parseSseStream } from './sse.js';

const streamOf = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

const collect = async (chunks: string[]): Promise<Record<string, unknown>[]> => {
  const events: Record<string, unknown>[] = [];
  for await (const event of parseSseStream(streamOf(chunks))) {
    events.push(event);
  }
  return events;
};

describe('parseSseStream', () => {
  it('parses discrete events', async () => {
    const events = await collect(['data: {"event":"a"}\n\n', 'data: {"event":"b"}\n\n']);

    expect(events).toEqual([{ event: 'a' }, { event: 'b' }]);
  });

  it('reassembles an event split across chunk boundaries', async () => {
    const events = await collect(['data: {"eve', 'nt":"split","n":1}', '\n\n']);

    expect(events).toEqual([{ event: 'split', n: 1 }]);
  });

  it('handles several events arriving in one chunk', async () => {
    const events = await collect(['data: {"n":1}\n\ndata: {"n":2}\n\ndata: {"n":3}\n\n']);

    expect(events.map((event) => event.n)).toEqual([1, 2, 3]);
  });

  it('joins multi-line data payloads', async () => {
    const events = await collect(['data: {"a":\ndata: 1}\n\n']);

    expect(events).toEqual([{ a: 1 }]);
  });

  it('ignores comments, [DONE], and malformed json rather than throwing', async () => {
    const events = await collect([
      ': keep-alive\n\n',
      'data: [DONE]\n\n',
      'data: not json\n\n',
      'data: {"event":"survivor"}\n\n',
    ]);

    expect(events).toEqual([{ event: 'survivor' }]);
  });

  it('drops a trailing event with no terminating blank line', async () => {
    const events = await collect(['data: {"n":1}\n\ndata: {"n":2}']);

    expect(events).toEqual([{ n: 1 }]);
  });

  it('decodes multi-byte characters split across chunks', async () => {
    const encoded = new TextEncoder().encode('data: {"t":"café"}\n\n');
    const events: Record<string, unknown>[] = [];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 15));
        controller.enqueue(encoded.slice(15));
        controller.close();
      },
    });

    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }

    expect(events).toEqual([{ t: 'café' }]);
  });
});
