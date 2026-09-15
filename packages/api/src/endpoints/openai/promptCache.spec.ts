import { buildPromptCacheKey, supportsExplicitPromptCache } from './promptCache';

describe('supportsExplicitPromptCache', () => {
  it.each([
    ['gpt-5.6', true],
    ['gpt-5.6-terra', true],
    ['gpt-5.6-luna', true],
    ['gpt-6-astra', true],
    ['gpt-5.5', false],
    ['gpt-5.1', false],
    ['gpt-5', false],
    ['gpt-4o', false],
    ['gpt-5.61', false],
    [undefined, false],
  ])('reports %s as %s', (model, supported) => {
    expect(supportsExplicitPromptCache(model)).toBe(supported);
  });
});

describe('buildPromptCacheKey', () => {
  const searchTool = {
    type: 'function',
    function: { name: 'search', parameters: { type: 'object', properties: {} } },
  };
  const calculatorTool = {
    type: 'function',
    function: { name: 'calculator', parameters: { type: 'object', properties: {} } },
  };
  const base = {
    model: 'gpt-5.6',
    instructions: 'You are a helpful assistant.',
    toolDefinitions: [searchTool, calculatorTool],
  };

  it('ignores the key order tool schemas happen to be serialized in', () => {
    const reordered = {
      ...base,
      toolDefinitions: [
        {
          function: { parameters: { properties: {}, type: 'object' }, name: 'search' },
          type: 'function',
        },
        calculatorTool,
      ],
    };

    expect(buildPromptCacheKey(reordered)).toBe(buildPromptCacheKey(base));
  });

  it('separates toolsets that reach the model in a different order', () => {
    const swapped = { ...base, toolDefinitions: [calculatorTool, searchTool] };

    expect(buildPromptCacheKey(swapped)).not.toBe(buildPromptCacheKey(base));
  });

  it.each([
    ['instructions', { instructions: 'You are a terse assistant.' }],
    ['model', { model: 'gpt-5.6-terra' }],
    ['tool schemas', { toolDefinitions: [searchTool] }],
    ['output schema', { responseSchema: { type: 'json_schema', name: 'answer' } }],
  ])('retires the cache identity when the %s changes', (_label, change) => {
    expect(buildPromptCacheKey({ ...base, ...change })).not.toBe(buildPromptCacheKey(base));
  });

  it('omits an absent tool schema rather than treating it as an empty toolset', () => {
    expect(buildPromptCacheKey({ model: 'gpt-5.6' })).toBe(
      buildPromptCacheKey({ model: 'gpt-5.6', toolDefinitions: [], instructions: '' }),
    );
  });
});
