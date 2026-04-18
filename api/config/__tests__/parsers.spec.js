const { formatConsoleMeta } = jest.requireActual('../parsers');

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
});
