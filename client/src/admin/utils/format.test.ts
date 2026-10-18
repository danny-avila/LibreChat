import { serializeKVPairs, deepSerializeKVPairs } from './format';

describe('serializeKVPairs', () => {
  it('converts KV pairs to a record', () => {
    const pairs = [
      { key: 'name', value: 'test', valueType: 'string' as const },
      { key: 'count', value: '42', valueType: 'number' as const },
      { key: 'active', value: 'true', valueType: 'boolean' as const },
    ];
    expect(serializeKVPairs(pairs)).toEqual({ name: 'test', count: 42, active: true });
  });

  it('handles json valueType by parsing JSON string', () => {
    const pairs = [{ key: 'config', value: '{"nested": true}', valueType: 'json' as const }];
    expect(serializeKVPairs(pairs)).toEqual({ config: { nested: true } });
  });

  it('falls back to string for invalid json', () => {
    const pairs = [{ key: 'bad', value: '{not json', valueType: 'json' as const }];
    expect(serializeKVPairs(pairs)).toEqual({ bad: '{not json' });
  });

  it('returns non-KV arrays unchanged', () => {
    const arr = ['a', 'b', 'c'];
    expect(serializeKVPairs(arr)).toBe(arr);
  });

  it('returns empty arrays unchanged', () => {
    expect(serializeKVPairs([])).toEqual([]);
  });

  it('returns primitives unchanged', () => {
    expect(serializeKVPairs('hello')).toBe('hello');
    expect(serializeKVPairs(42)).toBe(42);
    expect(serializeKVPairs(true)).toBe(true);
  });

  it('skips dangerous keys', () => {
    const pairs = [
      { key: '__proto__', value: 'bad', valueType: 'string' as const },
      { key: 'safe', value: 'good', valueType: 'string' as const },
    ];
    const result = serializeKVPairs(pairs) as Record<string, unknown>;
    expect(result.safe).toBe('good');
    expect('__proto__' in result).toBe(false);
  });

  it('skips pairs with empty keys', () => {
    const pairs = [
      { key: '', value: 'orphan', valueType: 'string' as const },
      { key: 'valid', value: 'ok', valueType: 'string' as const },
    ];
    expect(serializeKVPairs(pairs)).toEqual({ valid: 'ok' });
  });
});

describe('deepSerializeKVPairs', () => {
  it('serializes nested KV pairs inside an object', () => {
    const value = {
      name: 'Moonshot',
      apiKey: '${KEY}',
      addParams: [
        { key: 'stream', value: 'true', valueType: 'boolean' },
        { key: 'temp', value: '0.7', valueType: 'number' },
      ],
    };
    const result = deepSerializeKVPairs(value) as Record<string, unknown>;
    expect(result.name).toBe('Moonshot');
    expect(result.addParams).toEqual({ stream: true, temp: 0.7 });
  });

  it('serializes KV pairs with json type in nested objects', () => {
    const value = {
      name: 'Test',
      addParams: [{ key: 'config', value: '{"nested": {"deep": true}}', valueType: 'json' }],
    };
    const result = deepSerializeKVPairs(value) as Record<string, unknown>;
    expect(result.addParams).toEqual({ config: { nested: { deep: true } } });
  });

  it('preserves non-KV arrays', () => {
    const value = {
      models: { default: ['model-1', 'model-2'], fetch: true },
    };
    const result = deepSerializeKVPairs(value) as Record<string, unknown>;
    const models = result.models as Record<string, unknown>;
    expect(models.default).toEqual(['model-1', 'model-2']);
    expect(models.fetch).toBe(true);
  });

  it('serializes KV pairs inside array object entries', () => {
    const value = [
      {
        name: 'TestAPI',
        headers: [{ key: 'Authorization', value: 'Bearer ${TOKEN}', valueType: 'string' }],
      },
    ];
    expect(deepSerializeKVPairs(value)).toEqual([
      {
        name: 'TestAPI',
        headers: { Authorization: 'Bearer ${TOKEN}' },
      },
    ]);
  });

  it('handles headers (string-only record) correctly', () => {
    const value = {
      headers: [{ key: 'x-api-key', value: '${KEY}', valueType: 'string' }],
    };
    const result = deepSerializeKVPairs(value) as Record<string, unknown>;
    expect(result.headers).toEqual({ 'x-api-key': '${KEY}' });
  });

  it('returns primitives unchanged', () => {
    expect(deepSerializeKVPairs('hello')).toBe('hello');
    expect(deepSerializeKVPairs(42)).toBe(42);
    expect(deepSerializeKVPairs(null)).toBe(null);
    expect(deepSerializeKVPairs(undefined)).toBe(undefined);
  });

  it('handles a full custom endpoint object', () => {
    const endpoint = {
      name: 'TestAPI',
      apiKey: '${API_KEY}',
      baseURL: 'https://api.test.com/v1',
      models: { default: ['gpt-4'], fetch: true },
      titleConvo: true,
      titleModel: 'current_model',
      headers: [{ key: 'Authorization', value: 'Bearer ${TOKEN}', valueType: 'string' }],
      addParams: [
        { key: 'stream', value: 'true', valueType: 'boolean' },
        { key: 'config', value: '{"key": "value"}', valueType: 'json' },
      ],
      dropParams: ['stop', 'presence_penalty'],
    };

    const result = deepSerializeKVPairs(endpoint) as Record<string, unknown>;
    expect(result.name).toBe('TestAPI');
    expect(result.models).toEqual({ default: ['gpt-4'], fetch: true });
    expect(result.headers).toEqual({ Authorization: 'Bearer ${TOKEN}' });
    expect(result.addParams).toEqual({ stream: true, config: { key: 'value' } });
    expect(result.dropParams).toEqual(['stop', 'presence_penalty']);
  });
});
