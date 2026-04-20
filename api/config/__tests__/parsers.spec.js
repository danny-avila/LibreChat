jest.unmock('winston');

const { formatConsoleMeta, redactMessage, redactFormat, debugTraverse } =
  jest.requireActual('../parsers');
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

  it('ignores reserved winston keys but preserves legitimate fields like _id', () => {
    const meta = formatConsoleMeta({
      level: 'error',
      message: 'boom',
      timestamp: 'ts',
      splat: [1, 2],
      _id: '507f191e810c19729de860ea',
      userField: 'keep',
    });

    expect(meta).toContain('"_id":"507f191e810c19729de860ea"');
    expect(meta).toContain('"userField":"keep"');
    expect(meta).not.toContain('"splat"');
  });

  it('drops numeric-index-like keys (splat artifacts from primitive args)', () => {
    const meta = formatConsoleMeta({
      level: 'warn',
      message: 'Unhandled step:',
      timestamp: 'ts',
      0: 'f',
      1: 'o',
      2: 'o',
      realField: 'real',
    });

    expect(meta).toBe('{"realField":"real"}');
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

  it('preserves non-circular fields when one value is circular', () => {
    const circular = {};
    circular.self = circular;
    const meta = formatConsoleMeta({
      level: 'error',
      message: 'circular',
      timestamp: 'ts',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      circular,
    });

    expect(meta).toContain('"provider":"openai"');
    expect(meta).toContain('"model":"gpt-5.4-mini"');
    expect(meta).toContain('[Circular]');
  });

  it('falls back to per-field serialization when a value toJSON throws', () => {
    const meta = formatConsoleMeta({
      level: 'error',
      message: 'crash',
      timestamp: 'ts',
      provider: 'azure',
      model: 'gpt-5.4-mini',
      broken: {
        toJSON() {
          throw new Error('nope');
        },
      },
    });

    expect(meta).toContain('"provider":"azure"');
    expect(meta).toContain('"model":"gpt-5.4-mini"');
    expect(meta).toContain('[Unserializable]');
  });

  it('redacts sensitive strings nested inside metadata objects', () => {
    const meta = formatConsoleMeta({
      level: 'error',
      message: 'nested leak',
      timestamp: 'ts',
      config: {
        headers: {
          authorization: 'Bearer eyJhbGciOi.nestedTokenValue',
        },
        query: 'https://example.com/?key=AIzaNested',
      },
      openaiKey: 'sk-outerKey123',
    });

    expect(meta).not.toContain('eyJhbGciOi.nestedTokenValue');
    expect(meta).not.toContain('AIzaNested');
    expect(meta).not.toContain('sk-outerKey123');
    expect(meta).toContain('Bearer [REDACTED]');
    expect(meta).toContain('key=[REDACTED]');
    expect(meta).toContain('sk-[REDACTED]');
  });

  it('redacts the Azure-style mixed-case Api-Key header', () => {
    const meta = formatConsoleMeta({
      level: 'error',
      message: 'azure call',
      timestamp: 'ts',
      headers: 'Api-Key: 0123456789abcdef',
    });

    expect(meta).not.toContain('0123456789abcdef');
    expect(meta).toContain('Api-Key: [REDACTED]');
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

  it('does not redact ordinary words that contain "sk-" inside them', () => {
    expect(redactMessage('task-runner failed')).toBe('task-runner failed');
    expect(redactMessage('mask-value computed')).toBe('mask-value computed');
    expect(redactMessage('desk-lamp is on')).toBe('desk-lamp is on');
  });

  it('does not redact words that contain "key=" inside them', () => {
    expect(redactMessage('monkey=10 bananas')).toBe('monkey=10 bananas');
  });

  it('still redacts standalone sk- keys at word boundaries', () => {
    expect(redactMessage('token: sk-abc123def')).toBe('token: sk-[REDACTED]');
    expect(redactMessage('"sk-abc123def"')).toBe('"sk-[REDACTED]"');
  });
});

describe('redactFormat', () => {
  const runFormat = (info) => redactFormat().transform(info) || info;

  it('redacts info.message for error level before any colorize step runs', () => {
    const info = runFormat({ level: 'error', message: 'Bearer secretvalue' });
    expect(info.message).toBe('Bearer [REDACTED]');
  });

  it('redacts info.message for warn level too (avoids ANSI boundary issues later)', () => {
    const info = runFormat({ level: 'warn', message: 'apiKey=sk-abc123def' });
    expect(info.message).toContain('sk-[REDACTED]');
  });

  it('leaves info.message untouched for info and debug levels', () => {
    const infoInfo = runFormat({ level: 'info', message: 'Bearer looksSensitive' });
    expect(infoInfo.message).toBe('Bearer looksSensitive');

    const infoDebug = runFormat({ level: 'debug', message: 'Bearer looksSensitive' });
    expect(infoDebug.message).toBe('Bearer looksSensitive');
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

  it('prefers structured metadata over a consumed printf arg in SPLAT[0]', () => {
    const info = {
      level: 'warn',
      message: 'failed for tenant-7',
      timestamp: 'ts',
      provider: 'openai',
      [SPLAT_SYMBOL]: ['tenant-7', { provider: 'openai' }],
    };
    const out = runFormatter(info);
    expect(out).toContain('openai');
    const tenantMatches = out.match(/tenant-7/g) ?? [];
    expect(tenantMatches.length).toBeLessThanOrEqual(1);
  });

  it('does not duplicate a consumed %s arg when there is no structured metadata', () => {
    const info = {
      level: 'warn',
      message: 'failed for tenant-7',
      timestamp: 'ts',
      [SPLAT_SYMBOL]: ['tenant-7'],
    };
    const out = runFormatter(info);
    const tenantMatches = out.match(/tenant-7/g) ?? [];
    expect(tenantMatches.length).toBe(1);
  });

  it('omits numeric splat-artifact keys from the traversed output', () => {
    const info = {
      level: 'error',
      message: 'boom',
      timestamp: 'ts',
      0: 'x',
      1: 'y',
      realField: 'keep',
      [SPLAT_SYMBOL]: [{ realField: 'keep' }],
    };
    const out = runFormatter(info);
    expect(out).toContain('realField');
    expect(out).toContain('keep');
    expect(out).not.toMatch(/^\s*0:/m);
    expect(out).not.toMatch(/^\s*1:/m);
  });

  it('surfaces unconsumed primitive SPLAT[0] (no %s in message) for debug level', () => {
    const info = {
      level: 'debug',
      message: 'prefix:',
      timestamp: 'ts',
      [SPLAT_SYMBOL]: ['detailValueXYZ'],
    };
    const out = runFormatter(info);
    expect(out).toContain('detailValueXYZ');
  });

  it('still surfaces array metadata in SPLAT[0] when no object is extracted', () => {
    const info = {
      level: 'debug',
      message: 'list',
      timestamp: 'ts',
      [SPLAT_SYMBOL]: [['alpha', 'beta', 'gamma']],
    };
    const out = runFormatter(info);
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
    expect(out).toContain('gamma');
  });
});
