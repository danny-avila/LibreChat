/**
 * Minimal SSE reader for LibreChat's generation stream.
 *
 * Only `data:` lines carry payloads here, and every payload is JSON. Events are separated
 * by a blank line and a single event may span several `data:` lines, so lines are joined
 * rather than parsed individually. Chunk boundaries fall anywhere, including mid-line.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);

        const parsed = parseBlock(block);
        if (parsed) {
          yield parsed;
        }
        separator = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const parseBlock = (block: string): Record<string, unknown> | null => {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');

  if (data.length === 0 || data === '[DONE]') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};
