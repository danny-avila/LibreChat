import type { AgentInputs } from '@librechat/agents';
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

  type InputOverrides = Record<string, unknown> & { clientOptions?: Record<string, unknown> };

  /** A finished input as `createRun` hands it to the key: first-party, per-user scope. */
  const input = (overrides: InputOverrides = {}): AgentInputs => {
    const { clientOptions, ...rest } = overrides;
    return {
      agentId: 'agent-1',
      provider: 'openAI',
      instructions: 'You are a helpful assistant.',
      toolDefinitions: [searchTool, calculatorTool],
      ...rest,
      clientOptions: {
        model: 'gpt-5.6',
        promptCacheScopeId: 'user-a',
        ...(clientOptions ?? {}),
      },
    } as unknown as AgentInputs;
  };

  const key = (overrides: InputOverrides = {}, handoffEdges?: readonly unknown[]) =>
    buildPromptCacheKey(input(overrides), handoffEdges != null ? { handoffEdges } : {});

  it('ignores the key order tool schemas happen to be serialized in', () => {
    expect(
      key({
        toolDefinitions: [
          {
            parameters: { properties: { query: { type: 'string' } }, type: 'object' },
            description: 'Search the web',
            name: 'search',
          },
          calculatorTool,
        ],
      }),
    ).toBe(key());
  });

  it('separates toolsets that reach the model in a different order', () => {
    expect(key({ toolDefinitions: [calculatorTool, searchTool] })).not.toBe(key());
  });

  it.each([
    ['instructions', { instructions: 'You are a terse assistant.' }],
    ['wire model', { clientOptions: { model: 'gpt-5.6-terra' } }],
    ['tool schemas', { toolDefinitions: [searchTool] }],
    ['agent name the handoff context carries', { name: 'Researcher' }],
    ['Chat Completions output schema', { clientOptions: { response_format: { type: 'json' } } }],
    ['Responses output format', { clientOptions: { text: { format: { type: 'json' } } } }],
    ['API mode', { clientOptions: { useResponsesApi: true } }],
  ])('retires the cache identity when the %s changes', (_label, change) => {
    expect(key(change)).not.toBe(key());
  });

  it('keys on the deployment Azure Astra actually addresses, not its visible name', () => {
    const astra = { model: 'gpt-6-astra', modelKwargs: { model: 'astra-prod' } };

    expect(key({ clientOptions: astra })).not.toBe(
      key({ clientOptions: { ...astra, modelKwargs: { model: 'astra-canary' } } }),
    );
  });

  it('separates a provider-native tool that carries no schema of its own', () => {
    expect(key({ tools: [{ type: 'web_search' }] })).not.toBe(key());
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

    expect(key({ graphTools: [instance('ask_user_question')] })).not.toBe(key());
    expect(key({ graphTools: [instance('ask_user_question')] })).not.toBe(
      key({ graphTools: [instance('list_run_files')] }),
    );
  });

  it('keeps definitions this conversation added out of the identity', () => {
    const deferred = {
      name: 'deferred_search',
      description: 'Discovered through tool_search',
      parameters: { type: 'object', properties: {} },
    };

    expect(
      key({
        toolDefinitions: [searchTool, calculatorTool, deferred],
        clientOptions: {
          promptCacheDiscoveredToolNames: ['deferred_search'],
          promptCacheAppendedToolNames: ['deferred_search'],
        },
      }),
    ).toBe(key());
  });

  it('still keys on the schema of a configured tool this conversation discovered', () => {
    const discovered = (parameters: unknown) => ({
      toolDefinitions: [searchTool, { ...calculatorTool, parameters, defer_loading: false }],
      clientOptions: { promptCacheDiscoveredToolNames: ['calculator'] },
    });

    expect(
      key(discovered({ type: 'object', properties: { expression: { type: 'string' } } })),
    ).not.toBe(key(discovered({ type: 'object', properties: { input: { type: 'string' } } })));
  });

  it('ignores the flag discovery flips on a definition that was already bound', () => {
    /** Discovery flips `defer_loading` on a definition the agent already sends. */
    expect(
      key({
        toolDefinitions: [searchTool, { ...calculatorTool, defer_loading: false }],
        clientOptions: { promptCacheDiscoveredToolNames: ['calculator'] },
      }),
    ).toBe(
      key({
        toolDefinitions: [searchTool, { ...calculatorTool, defer_loading: true }],
        clientOptions: { promptCacheDiscoveredToolNames: ['calculator'] },
      }),
    );
  });

  it('reads an absent, empty and empty-array surface as the same absent surface', () => {
    expect(key({ toolDefinitions: [], tools: [], instructions: '' })).toBe(
      key({ toolDefinitions: undefined, instructions: undefined }),
    );
  });

  it.each([
    ['defer_loading', { defer_loading: true }],
    ['allowed_callers', { allowed_callers: ['code_execution'] }],
  ])('retires the key when a definition\u2019s %s changes', (_label, classification) => {
    expect(
      key({ toolDefinitions: [{ ...searchTool, ...classification }, calculatorTool] }),
    ).not.toBe(key());
  });

  describe('generated delegation tool', () => {
    const child = { type: 'child-agent-id', name: 'Researcher', description: 'Researches things' };

    it('separates an agent that can delegate from one that cannot', () => {
      expect(key({ subagentConfigs: [child] })).not.toBe(key());
    });

    it.each([
      ['the enum value the tool accepts', { type: 'other-agent-id' }],
      ['its display name', { name: 'Analyst' }],
      ['its description', { description: 'Analyzes things' }],
    ])('retires the key when a target changes %s', (_label, change) => {
      expect(key({ subagentConfigs: [{ ...child, ...change }] })).not.toBe(
        key({ subagentConfigs: [child] }),
      );
    });

    it('ignores the child inputs an entry carries, which hold the child\u2019s own key', () => {
      expect(
        key({
          subagentConfigs: [
            { ...child, agentInputs: { clientOptions: { promptCacheKey: 'child-key' } } },
          ],
        }),
      ).toBe(key({ subagentConfigs: [child] }));
    });
  });

  describe('handoff edges', () => {
    const edge = { to: 'researcher', description: 'Hand off research' };

    it('separates an agent that can hand off from one that cannot', () => {
      expect(key({}, [edge])).not.toBe(key());
    });

    it.each([
      ['target', { to: 'writer' }],
      ['description', { description: 'Hand off drafting' }],
      ['input parameter name', { promptKey: 'brief' }],
    ])('retires the key when an edge\u2019s %s changes', (_label, change) => {
      expect(key({}, [{ ...edge, ...change }])).not.toBe(key({}, [edge]));
    });
  });

  describe('cache-accounting scope', () => {
    it('separates two users running the same agent', () => {
      expect(key({ clientOptions: { promptCacheScopeId: 'user-a' } })).not.toBe(
        key({ clientOptions: { promptCacheScopeId: 'user-b' } }),
      );
    });

    it('keeps one user stable across their conversations', () => {
      expect(key({ clientOptions: { promptCacheScopeId: 'user-a' } })).toBe(
        key({ clientOptions: { promptCacheScopeId: 'user-a' } }),
      );
    });

    it('serves every user one entry once an administrator opts into sharing', () => {
      expect(
        key({ clientOptions: { promptCacheScope: 'shared', promptCacheScopeId: 'user-a' } }),
      ).toBe(key({ clientOptions: { promptCacheScope: 'shared', promptCacheScopeId: 'user-b' } }));
    });

    it('still retires a shared key when the prefix changes', () => {
      expect(
        key({ clientOptions: { promptCacheScope: 'shared' }, instructions: 'Other.' }),
      ).not.toBe(key({ clientOptions: { promptCacheScope: 'shared' } }));
    });
  });

  describe('stable instruction sources folded into the dynamic tail', () => {
    it('retires the key when a skill the agent always applies is edited', () => {
      expect(
        key({ clientOptions: { promptCacheStableInstructions: '# Always-apply skill: a\nfirst' } }),
      ).not.toBe(
        key({
          clientOptions: { promptCacheStableInstructions: '# Always-apply skill: a\nrewritten' },
        }),
      );
    });
  });

  /**
   * The exclusions are the claims this module has to keep being right about: a
   * key that followed any of these would give every conversation, every turn
   * or every slider position its own entry, and there would be nothing left to
   * reuse.
   */
  describe('what the identity deliberately ignores', () => {
    it.each([
      [
        'the dynamic system tail of memory and file context',
        { additional_instructions: 'Memory: the user prefers brevity.\nFile: report.pdf' },
      ],
      ['tools this conversation discovered through tool_search', { discoveredTools: ['search'] }],
      ['the tool-search corpus behind the binding', { toolRegistry: new Map([['deferred', {}]]) }],
      [
        'a cross-run summary of an earlier conversation',
        { initialSummary: { text: 'a', tokenCount: 1 } },
      ],
      ['the context budget', { maxContextTokens: 4096 }],
      ['sampling parameters', { clientOptions: { temperature: 0.2, topP: 0.5, maxTokens: 900 } }],
      [
        'reasoning effort and verbosity',
        { clientOptions: { modelKwargs: { verbosity: 'low', reasoning: { effort: 'high' } } } },
      ],
      [
        'per-request transport resolved from the conversation',
        { clientOptions: { configuration: { defaultHeaders: { 'X-Conversation': 'abc-123' } } } },
      ],
      ['credentials', { clientOptions: { apiKey: 'sk-rotated' } }],
    ])('ignores %s', (_label, change) => {
      expect(key(change)).toBe(key());
    });

    it('ignores the key it is about to write', () => {
      expect(key({ clientOptions: { promptCacheKey: 'librechat:3:stale' } })).toBe(key());
    });
  });

  /**
   * A field this module has never seen is hashed rather than dropped, so a
   * newer SDK than these types partitions the cache (a miss) instead of
   * pointing two different prefixes at one entry (a wrong identity).
   */
  it('partitions on an input field it does not know', () => {
    expect(key({ someFutureModelFacingField: 'value' })).not.toBe(key());
  });
});
