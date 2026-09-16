import { buildPromptCacheKey, supportsExplicitPromptCache } from './promptCache';

describe('supportsExplicitPromptCache', () => {
  it.each([
    ['gpt-5.6', true],
    ['gpt-5.6-terra', true],
    ['gpt-5.6-luna', true],
    ['gpt-6-astra', true],
    /** Azure deployment names cannot contain a dot. */
    ['gpt-5-6', true],
    ['gpt-5-6-prod', true],
    ['gpt-5-5', false],
    ['production-chat', false],
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
    name: 'search',
    description: 'Search the web',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
  };
  const calculatorTool = {
    name: 'calculator',
    description: 'Compute arithmetic',
    parameters: { type: 'object', properties: { input: { type: 'string' } } },
  };
  const base = {
    model: 'gpt-5.6',
    instructions: 'You are a helpful assistant.',
    boundTools: [searchTool, calculatorTool],
  };

  it('ignores the key order tool schemas happen to be serialized in', () => {
    const reordered = {
      ...base,
      boundTools: [
        {
          parameters: { properties: { query: { type: 'string' } }, type: 'object' },
          description: 'Search the web',
          name: 'search',
        },
        calculatorTool,
      ],
    };

    expect(buildPromptCacheKey(reordered)).toBe(buildPromptCacheKey(base));
  });

  it('separates toolsets that reach the model in a different order', () => {
    const swapped = { ...base, boundTools: [calculatorTool, searchTool] };

    expect(buildPromptCacheKey(swapped)).not.toBe(buildPromptCacheKey(base));
  });

  it.each([
    ['instructions', { instructions: 'You are a terse assistant.' }],
    ['model', { model: 'gpt-5.6-terra' }],
    ['tool schemas', { boundTools: [searchTool] }],
    ['output schema', { responseSchema: { type: 'json_schema', name: 'answer' } }],
    ['Responses output format', { responsesTextFormat: { type: 'json_schema', name: 'answer' } }],
  ])('retires the cache identity when the %s changes', (_label, change) => {
    expect(buildPromptCacheKey({ ...base, ...change })).not.toBe(buildPromptCacheKey(base));
  });

  it('separates a provider-native tool that carries no schema of its own', () => {
    const withWebSearch = { ...base, boundTools: [...base.boundTools, { type: 'web_search' }] };

    expect(buildPromptCacheKey(withWebSearch)).not.toBe(buildPromptCacheKey(base));
  });

  it('distinguishes runtime tool instances whose schemas cannot be serialized', () => {
    /** A Zod schema is a class instance with internal back-references. */
    const zodLike: Record<string, unknown> = { _def: { typeName: 'ZodObject' } };
    zodLike.self = zodLike;
    const instance = (name: string) => ({
      name,
      description: 'Ask the operator a question',
      schema: zodLike,
      invoke: () => undefined,
    });

    const withAsk = { ...base, boundTools: [...base.boundTools, instance('ask_user_question')] };
    const withOther = { ...base, boundTools: [...base.boundTools, instance('list_run_files')] };

    expect(buildPromptCacheKey(withAsk)).not.toBe(buildPromptCacheKey(base));
    expect(buildPromptCacheKey(withAsk)).not.toBe(buildPromptCacheKey(withOther));
  });

  it('omits an absent tool schema rather than treating it as an empty toolset', () => {
    expect(buildPromptCacheKey({ model: 'gpt-5.6' })).toBe(
      buildPromptCacheKey({ model: 'gpt-5.6', boundTools: [], instructions: '' }),
    );
  });

  it.each([
    ['defer_loading', { defer_loading: true }],
    ['allowed_callers', { allowed_callers: ['code_execution'] }],
  ])('retires the key when a definition\u2019s %s changes', (_label, classification) => {
    const reclassified = {
      ...base,
      boundTools: [{ ...searchTool, ...classification }, calculatorTool],
    };

    expect(buildPromptCacheKey(reclassified)).not.toBe(buildPromptCacheKey(base));
  });

  describe('handoff edges', () => {
    const edge = { from: 'supervisor', to: 'researcher', description: 'Hand off research' };

    it('separates an agent that can hand off from one that cannot', () => {
      expect(buildPromptCacheKey({ ...base, handoffEdges: [edge] })).not.toBe(
        buildPromptCacheKey(base),
      );
    });

    it.each([
      ['target', { to: 'writer' }],
      ['description', { description: 'Hand off drafting' }],
      ['input parameter name', { promptKey: 'brief' }],
    ])('retires the key when an edge\u2019s %s changes', (_label, change) => {
      expect(buildPromptCacheKey({ ...base, handoffEdges: [{ ...edge, ...change }] })).not.toBe(
        buildPromptCacheKey({ ...base, handoffEdges: [edge] }),
      );
    });
  });

  describe('cache-accounting scope', () => {
    it('separates two users running the same agent', () => {
      expect(buildPromptCacheKey({ ...base, scopeId: 'user-a' })).not.toBe(
        buildPromptCacheKey({ ...base, scopeId: 'user-b' }),
      );
    });

    it('keeps one user stable across their conversations', () => {
      expect(buildPromptCacheKey({ ...base, scopeId: 'user-a' })).toBe(
        buildPromptCacheKey({ ...base, scopeId: 'user-a' }),
      );
    });

    it('collapses users onto one entry once the scope is dropped', () => {
      expect(buildPromptCacheKey({ ...base, scopeId: null })).toBe(
        buildPromptCacheKey({ ...base, scopeId: undefined }),
      );
    });

    it('still retires a shared key when the prefix changes', () => {
      expect(buildPromptCacheKey({ ...base, scopeId: null, instructions: 'Other.' })).not.toBe(
        buildPromptCacheKey({ ...base, scopeId: null }),
      );
    });
  });
});
