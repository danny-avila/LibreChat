jest.unmock('winston');

const { formatConsoleMeta, redactMessage, debugTraverse } = jest.requireActual('../parsers');
const SPLAT_SYMBOL = Symbol.for('splat');

describe('formatConsoleMeta', () => {
  it('returns empty string when there is no user metadata', () => {
    expect(
      formatConsoleMeta({
        level: 'error',
        message: 'oops',
        timestamp: '2026-04-18 02:25:22',
      }),
    ).toBe('');
  });

  it('serializes user-supplied metadata keys', () => {
    const meta = formatConsoleMeta({
      level: 'error',
      message: '[agents:summarize] Summarization LLM call failed',
      timestamp: '2026-04-18 02:25:22',
      provider: 'azureOpenAI',
      model: 'gpt-5.4-mini',
      messagesToRefineCount: 42,
    });

    expect(meta).toContain('"provider":"azureOpenAI"');
    expect(meta).toContain('"model":"gpt-5.4-mini"');
    expect(meta).toContain('"messagesToRefineCount":42');
  });

  it('ignores reserved winston keys and underscore-prefixed internals', () => {
    const meta = formatConsoleMeta({
      level: 'error',
      message: 'boom',
      timestamp: 'ts',
      splat: [1, 2],
      _internal: 'skip',
      userField: 'keep',
    });

    expect(meta).toBe('{"userField":"keep"}');
  });

  it('drops empty, null, undefined, function, and symbol values', () => {
    const meta = formatConsoleMeta({
      level: 'warn',
      message: 'noise',
      timestamp: 'ts',
      empty: '',
      nullish: null,
      undef: undefined,
      fn: () => 1,
      sym: Symbol('x'),
      kept: 'yes',
    });

    expect(meta).toBe('{"kept":"yes"}');
  });

  it('truncates very long string values to avoid console spam', () => {
    const longString = 'x'.repeat(5000);
    const meta = formatConsoleMeta({
      level: 'error',
      message: 'long',
      timestamp: 'ts',
      errorStack: longString,
    });

    expect(meta.length).toBeLessThan(longString.length);
    expect(meta).toContain('...');
  });

  it('gracefully handles circular objects', () => {
    const circular = {};
    circular.self = circular;
    const meta = formatConsoleMeta({
      level: 'error',
      message: 'circular',
      timestamp: 'ts',
      circular,
    });

    expect(meta).toBe('');
  });

  it('redacts sensitive patterns inside string metadata values', () => {
    const meta = formatConsoleMeta({
      level: 'error',
      message: 'leak test',
      timestamp: 'ts',
      openaiKey: 'sk-abc123def456',
      auth: 'Bearer eyJhbGciOi...tokenvalue',
      google: 'https://example.com/?key=AIzaSyXX',
    });

    expect(meta).not.toContain('sk-abc123def456');
    expect(meta).not.toContain('eyJhbGciOi...tokenvalue');
    expect(meta).not.toContain('AIzaSyXX');
    expect(meta).toContain('sk-[REDACTED]');
    expect(meta).toContain('Bearer [REDACTED]');
    expect(meta).toContain('key=[REDACTED]');
  });

  it('redacts multiple occurrences of the same pattern in one value', () => {
    const meta = formatConsoleMeta({
      level: 'error',
      message: 'two keys',
      timestamp: 'ts',
      combined: 'first sk-aaa and then sk-bbb',
    });

    expect(meta).not.toContain('sk-aaa');
    expect(meta).not.toContain('sk-bbb');
    expect(meta.match(/sk-\[REDACTED\]/g)?.length).toBe(2);
  });
});

describe('redactMessage', () => {
  it('redacts sk- keys that are not at line start (inside JSON-like text)', () => {
    const input = '{"apiKey":"sk-abc123"}';
    expect(redactMessage(input)).toBe('{"apiKey":"sk-[REDACTED]"}');
  });

  it('redacts all sk- occurrences in a single pass', () => {
    const input = 'sk-one sk-two sk-three';
    expect(redactMessage(input)).toBe('sk-[REDACTED] sk-[REDACTED] sk-[REDACTED]');
  });

  it('trims redacted output when trimLength is provided', () => {
    const input = 'Bearer supersecretvalue';
    expect(redactMessage(input, 10)).toBe('Bearer [RE...');
  });

  it('returns empty string for falsy input', () => {
    expect(redactMessage('')).toBe('');
    expect(redactMessage(undefined)).toBe('');
  });
});

describe('debugTraverse', () => {
  const runFormatter = (info) => {
    const transformed = debugTraverse.transform(info);
    const MESSAGE = Symbol.for('message');
    if (transformed && typeof transformed === 'object') {
      return transformed[MESSAGE] ?? String(transformed);
    }
    return String(transformed);
  };

  const buildInfo = (level, meta) => {
    const info = {
      level,
      message: 'test',
      timestamp: 'ts',
      ...meta,
    };
    info[SPLAT_SYMBOL] = [meta];
    return info;
  };

  it('redacts sensitive strings in metadata for error level', () => {
    const out = runFormatter(buildInfo('error', { auth: 'Bearer eyJabc123', openai: 'sk-abc123' }));
    expect(out).not.toContain('eyJabc123');
    expect(out).not.toContain('sk-abc123');
    expect(out).toContain('Bearer [REDACTED]');
    expect(out).toContain('sk-[REDACTED]');
  });

  it('redacts sensitive strings in metadata for warn level', () => {
    const out = runFormatter(buildInfo('warn', { header: 'Bearer supersecrettoken' }));
    expect(out).not.toContain('supersecrettoken');
    expect(out).toContain('Bearer [REDACTED]');
  });

  it('preserves debug-level metadata unmodified (existing behavior)', () => {
    const out = runFormatter(buildInfo('debug', { someField: 'not-sensitive' }));
    expect(out).toContain('not-sensitive');
  });
});
