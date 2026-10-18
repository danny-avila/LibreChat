import {
  findBlankText,
  findUnsafeKeys,
  isUnsafeConfigKey,
  isWhitespaceSignificantPath,
} from './keys';

describe('isUnsafeConfigKey', () => {
  it('flags keys with a dot or a leading $', () => {
    expect(isUnsafeConfigKey('us.anthropic.claude-sonnet-4-6')).toBe(true);
    expect(isUnsafeConfigKey('$where')).toBe(true);
    expect(isUnsafeConfigKey('X-Thread-ID')).toBe(false);
    expect(isUnsafeConfigKey('price$')).toBe(false);
  });
});

describe('findUnsafeKeys', () => {
  it('finds dotted keys at any depth with the path of the holding object', () => {
    expect(
      findUnsafeKeys(
        {
          inferenceProfiles: { 'us.anthropic.x': 'arn', plain: 'arn' },
          nested: { deeper: { $set: 1 } },
        },
        'endpoints.bedrock',
      ),
    ).toEqual([
      { path: 'endpoints.bedrock.inferenceProfiles', key: 'us.anthropic.x' },
      { path: 'endpoints.bedrock.nested.deeper', key: '$set' },
    ]);
  });

  it('checks keys inside arrays of objects and key/value pair lists', () => {
    expect(
      findUnsafeKeys([{ name: 'a', headers: { 'x.thread.id': '1' } }], 'endpoints.custom'),
    ).toEqual([{ path: 'endpoints.custom.0.headers', key: 'x.thread.id' }]);
    expect(
      findUnsafeKeys(
        [
          { key: 'x.thread.id', value: '1', valueType: 'string' },
          { key: 'ok', value: '2', valueType: 'string' },
        ],
        'endpoints.custom.11.headers',
      ),
    ).toEqual([{ path: 'endpoints.custom.11.headers', key: 'x.thread.id' }]);
  });

  it('ignores dots in values and returns nothing for safe input', () => {
    expect(findUnsafeKeys({ url: 'https://a.b.c', models: ['gpt-4.1'] }, 'x')).toEqual([]);
    expect(findUnsafeKeys('a.b', 'x')).toEqual([]);
  });
});

describe('findBlankText', () => {
  it('finds whitespace-only strings and keys, not empty or non-blank text', () => {
    expect(
      findBlankText(
        { a: '   ', b: '', c: ' x ', headers: { '  ': 'v', ok: '\t' }, list: ['ok', ' '] },
        'root',
      ),
    ).toEqual([
      { path: 'root.a' },
      { path: 'root.headers', key: '  ' },
      { path: 'root.headers.ok' },
      { path: 'root.list.1' },
    ]);
  });

  it('finds blank keys and values in key/value pairs', () => {
    expect(
      findBlankText(
        [
          { key: ' ', value: 'v' },
          { key: 'X', value: '  ' },
        ],
        'h',
      ),
    ).toEqual([{ path: 'h', key: ' ' }, { path: 'h.X' }]);
  });

  it('lets stop sequences keep their whitespace', () => {
    expect(findBlankText({ addParams: { stop: ['\n', '\n\n'] } }, 'endpoints.custom.0')).toEqual(
      [],
    );
    expect(findBlankText({ stop: '\n' }, 'x.addParams')).toEqual([]);
    expect(isWhitespaceSignificantPath('modelSpecs.list.2.preset.stop.0')).toBe(true);
    expect(isWhitespaceSignificantPath('modelSpecs.list.2.preset.stop')).toBe(true);
    expect(isWhitespaceSignificantPath('endpoints.openAI.titleModel')).toBe(false);
  });
});
