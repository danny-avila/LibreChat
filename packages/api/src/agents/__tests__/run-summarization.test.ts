import type { AppConfig } from '@librechat/data-schemas';
import type { SummarizationConfig } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';
import { createRun } from '~/agents/run';

// Mock winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  })),
  format: { combine: jest.fn(), colorize: jest.fn(), simple: jest.fn() },
  transports: { Console: jest.fn() },
}));

// Mock env utilities so header resolution doesn't fail
jest.mock('~/utils/env', () => ({
  resolveHeaders: jest.fn((opts: { headers: unknown }) => opts?.headers ?? {}),
  createSafeUser: jest.fn(() => ({})),
}));

// Mock Run.create to capture the graphConfig it receives
jest.mock('@librechat/agents', () => {
  const actual = jest.requireActual('@librechat/agents');
  return {
    ...actual,
    Run: {
      create: jest.fn().mockResolvedValue({
        processStream: jest.fn().mockResolvedValue(undefined),
      }),
    },
  };
});

import { Run } from '@librechat/agents';

/** Minimal RunAgent factory */
function makeAgent(
  overrides?: Record<string, unknown>,
): Record<string, unknown> & { id: string; provider: string; model: string } {
  return {
    id: 'agent_1',
    provider: 'openAI',
    endpoint: 'openAI',
    model: 'gpt-4o',
    tools: [],
    model_parameters: { model: 'gpt-4o' },
    maxContextTokens: 100_000,
    toolContextMap: {},
    ...overrides,
  };
}

/** Helper: call createRun and return the captured agentInputs array */
async function callAndCapture(
  opts: {
    agents?: ReturnType<typeof makeAgent>[];
    summarizationConfig?: SummarizationConfig;
    initialSummary?: { text: string; tokenCount: number };
    appConfig?: AppConfig;
  } = {},
) {
  const agents = opts.agents ?? [makeAgent()];
  const signal = new AbortController().signal;

  await createRun({
    agents: agents as never,
    signal,
    summarizationConfig: opts.summarizationConfig,
    initialSummary: opts.initialSummary,
    appConfig: opts.appConfig,
    streaming: true,
    streamUsage: true,
  });

  const createMock = Run.create as jest.Mock;
  expect(createMock).toHaveBeenCalledTimes(1);
  const callArgs = createMock.mock.calls[0][0];
  return callArgs.graphConfig.agents as Array<Record<string, unknown>>;
}

/** Minimal AppConfig with a single custom endpoint for testing provider resolution. */
function makeAppConfig(
  customEndpoints: Array<{ name: string; baseURL: string; apiKey: string }>,
): AppConfig {
  return {
    endpoints: {
      [EModelEndpoint.custom]: customEndpoints,
    },
  } as unknown as AppConfig;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Suite 1: reserveRatio
// ---------------------------------------------------------------------------
describe('reserveRatio', () => {
  it('applies ratio from config using baseContextTokens, capped at maxContextTokens', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ baseContextTokens: 200_000, maxContextTokens: 200_000 })],
      summarizationConfig: { reserveRatio: 0.03, provider: 'anthropic', model: 'claude' },
    });
    // Math.round(200000 * 0.97) = 194000, min(200000, 194000) = 194000
    expect(agents[0].maxContextTokens).toBe(194_000);
  });

  it('never exceeds user-configured maxContextTokens even when ratio computes higher', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ baseContextTokens: 200_000, maxContextTokens: 50_000 })],
      summarizationConfig: { reserveRatio: 0.03, provider: 'anthropic', model: 'claude' },
    });
    // Math.round(200000 * 0.97) = 194000, but min(50000, 194000) = 50000
    expect(agents[0].maxContextTokens).toBe(50_000);
  });

  it('falls back to maxContextTokens when ratio is not set', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ maxContextTokens: 100_000, baseContextTokens: 200_000 })],
      summarizationConfig: { provider: 'anthropic', model: 'claude' },
    });
    expect(agents[0].maxContextTokens).toBe(100_000);
  });

  it('falls back to maxContextTokens when ratio is 0', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ maxContextTokens: 100_000, baseContextTokens: 200_000 })],
      summarizationConfig: { reserveRatio: 0, provider: 'anthropic', model: 'claude' },
    });
    expect(agents[0].maxContextTokens).toBe(100_000);
  });

  it('falls back to maxContextTokens when ratio is 1', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ maxContextTokens: 100_000, baseContextTokens: 200_000 })],
      summarizationConfig: { reserveRatio: 1, provider: 'anthropic', model: 'claude' },
    });
    expect(agents[0].maxContextTokens).toBe(100_000);
  });

  it('falls back to maxContextTokens when baseContextTokens is undefined', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ maxContextTokens: 100_000 })],
      summarizationConfig: { reserveRatio: 0.05, provider: 'anthropic', model: 'claude' },
    });
    expect(agents[0].maxContextTokens).toBe(100_000);
  });

  it('clamps to 1024 minimum but still capped at maxContextTokens', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ baseContextTokens: 500, maxContextTokens: 2000 })],
      summarizationConfig: { reserveRatio: 0.99, provider: 'anthropic', model: 'claude' },
    });
    // Math.round(500 * 0.01) = 5 → clamped to 1024, min(2000, 1024) = 1024
    expect(agents[0].maxContextTokens).toBe(1024);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: maxSummaryTokens passthrough
// ---------------------------------------------------------------------------
describe('maxSummaryTokens passthrough', () => {
  it('forwards global maxSummaryTokens value', async () => {
    const agents = await callAndCapture({
      summarizationConfig: {
        provider: 'anthropic',
        model: 'claude',
        maxSummaryTokens: 4096,
      },
    });
    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.maxSummaryTokens).toBe(4096);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: summarizationEnabled resolution
// ---------------------------------------------------------------------------
describe('summarizationEnabled resolution', () => {
  it('true with provider + model + enabled', async () => {
    const agents = await callAndCapture({
      summarizationConfig: {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-haiku',
      },
    });
    expect(agents[0].summarizationEnabled).toBe(true);
  });

  it('false when provider is empty string', async () => {
    const agents = await callAndCapture({
      summarizationConfig: {
        enabled: true,
        provider: '',
        model: 'claude-3-haiku',
      },
    });
    expect(agents[0].summarizationEnabled).toBe(false);
  });

  it('false when enabled is explicitly false', async () => {
    const agents = await callAndCapture({
      summarizationConfig: {
        enabled: false,
        provider: 'anthropic',
        model: 'claude-3-haiku',
      },
    });
    expect(agents[0].summarizationEnabled).toBe(false);
  });

  it('true with self-summarize default when summarizationConfig is undefined', async () => {
    const agents = await callAndCapture({
      summarizationConfig: undefined,
    });
    expect(agents[0].summarizationEnabled).toBe(true);
    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.provider).toBe('openAI');
    expect(config.model).toBe('gpt-4o');
  });
});

// ---------------------------------------------------------------------------
// Suite 4: summarizationConfig field passthrough
// ---------------------------------------------------------------------------
describe('summarizationConfig field passthrough', () => {
  it('all fields pass through to agentInputs', async () => {
    const agents = await callAndCapture({
      summarizationConfig: {
        enabled: true,
        trigger: { type: 'token_count', value: 8000 },
        provider: 'anthropic',
        model: 'claude-3-haiku',
        parameters: { temperature: 0.2 },
        prompt: 'Summarize this conversation',
        updatePrompt: 'Update the existing summary with new messages',
        reserveRatio: 0.1,
        maxSummaryTokens: 4096,
      },
    });
    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config).toBeDefined();
    // `enabled` is not forwarded to the agent-level config — it is resolved
    // into the separate `summarizationEnabled` boolean on the agent input.
    expect(agents[0].summarizationEnabled).toBe(true);
    expect(config.trigger).toEqual({ type: 'token_count', value: 8000 });
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('claude-3-haiku');
    expect(config.parameters).toEqual({ temperature: 0.2 });
    expect(config.prompt).toBe('Summarize this conversation');
    expect(config.updatePrompt).toBe('Update the existing summary with new messages');
    expect(config.reserveRatio).toBe(0.1);
    expect(config.maxSummaryTokens).toBe(4096);
  });

  it('uses self-summarize default when no config provided', async () => {
    const agents = await callAndCapture({
      summarizationConfig: undefined,
    });
    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config).toBeDefined();
    // `enabled` is resolved into `summarizationEnabled`, not forwarded on config
    expect(agents[0].summarizationEnabled).toBe(true);
    expect(config.provider).toBe('openAI');
    expect(config.model).toBe('gpt-4o');
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Multi-agent + per-agent overrides
// ---------------------------------------------------------------------------
describe('multi-agent + per-agent overrides', () => {
  it('different agents get different effectiveMaxContextTokens', async () => {
    const agents = await callAndCapture({
      agents: [
        makeAgent({ id: 'agent_1', baseContextTokens: 200_000, maxContextTokens: 100_000 }),
        makeAgent({ id: 'agent_2', baseContextTokens: 100_000, maxContextTokens: 50_000 }),
      ],
      summarizationConfig: {
        reserveRatio: 0.1,
        provider: 'anthropic',
        model: 'claude',
      },
    });
    // agent_1: Math.round(200000 * 0.9) = 180000, but capped at user's maxContextTokens (100000)
    expect(agents[0].maxContextTokens).toBe(100_000);
    // agent_2: Math.round(100000 * 0.9) = 90000, but capped at user's maxContextTokens (50000)
    expect(agents[1].maxContextTokens).toBe(50_000);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: initialSummary passthrough
// ---------------------------------------------------------------------------
describe('initialSummary passthrough', () => {
  it('forwarded to agent inputs', async () => {
    const summary = { text: 'Previous conversation summary', tokenCount: 500 };
    const agents = await callAndCapture({
      initialSummary: summary,
      summarizationConfig: { provider: 'anthropic', model: 'claude' },
    });
    expect(agents[0].initialSummary).toEqual(summary);
  });

  it('undefined when not provided', async () => {
    const agents = await callAndCapture({});
    expect(agents[0].initialSummary).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 7: custom-endpoint provider resolution
// ---------------------------------------------------------------------------
describe('custom-endpoint provider resolution', () => {
  it('remaps a custom endpoint name to openAI and injects baseURL/apiKey', async () => {
    const appConfig = makeAppConfig([
      { name: 'Ollama', baseURL: 'http://localhost:11434/v1', apiKey: 'ollama-key' },
    ]);
    const agents = await callAndCapture({
      summarizationConfig: { provider: 'Ollama', model: 'llama3' },
      appConfig,
    });

    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.provider).toBe('openAI');
    expect(config.model).toBe('llama3');

    const parameters = config.parameters as Record<string, unknown>;
    expect(parameters).toMatchObject({
      configuration: { baseURL: 'http://localhost:11434/v1' },
      apiKey: 'ollama-key',
    });
  });

  it('matches Ollama case-insensitively (via normalizeEndpointName)', async () => {
    const appConfig = makeAppConfig([
      { name: 'Ollama', baseURL: 'http://localhost:11434/v1', apiKey: 'ollama-key' },
    ]);
    const agents = await callAndCapture({
      summarizationConfig: { provider: 'ollama', model: 'llama3' },
      appConfig,
    });

    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.provider).toBe('openAI');
    expect((config.parameters as Record<string, unknown>).apiKey).toBe('ollama-key');
  });

  it('resolves non-Ollama endpoints on exact-case match', async () => {
    const appConfig = makeAppConfig([
      { name: 'Together', baseURL: 'https://api.together.ai/v1', apiKey: 'together-key' },
    ]);
    const agents = await callAndCapture({
      summarizationConfig: { provider: 'Together', model: 'mixtral' },
      appConfig,
    });
    expect((agents[0].summarizationConfig as Record<string, unknown>).provider).toBe('openAI');
  });

  it('does not match non-Ollama endpoints with different casing', async () => {
    const appConfig = makeAppConfig([
      { name: 'Together', baseURL: 'https://api.together.ai/v1', apiKey: 'together-key' },
    ]);
    const agents = await callAndCapture({
      summarizationConfig: { provider: 'together', model: 'mixtral' },
      appConfig,
    });
    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.provider).toBe('together');
    expect(config.parameters).toBeUndefined();
  });

  it('leaves known SDK providers untouched', async () => {
    const appConfig = makeAppConfig([]);
    const agents = await callAndCapture({
      summarizationConfig: { provider: 'anthropic', model: 'claude' },
      appConfig,
    });

    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.provider).toBe('anthropic');
    expect(config.parameters).toBeUndefined();
  });

  it('preserves unknown provider names when appConfig is missing', async () => {
    const agents = await callAndCapture({
      summarizationConfig: { provider: 'Ollama', model: 'llama3' },
    });

    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.provider).toBe('Ollama');
    expect(config.parameters).toBeUndefined();
  });

  it('leaves unrecognized names untouched when no matching custom endpoint exists', async () => {
    const appConfig = makeAppConfig([
      { name: 'Ollama', baseURL: 'http://localhost:11434/v1', apiKey: 'ollama-key' },
    ]);
    const agents = await callAndCapture({
      summarizationConfig: { provider: 'nonexistent', model: 'foo' },
      appConfig,
    });

    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.provider).toBe('nonexistent');
    expect(config.parameters).toBeUndefined();
  });

  it('extracts ${ENV_VAR} references in custom endpoint credentials', async () => {
    process.env.TEST_OLLAMA_KEY = 'resolved-key-value';
    const appConfig = makeAppConfig([
      {
        name: 'Ollama',
        baseURL: 'http://localhost:11434/v1',
        apiKey: '${TEST_OLLAMA_KEY}',
      },
    ]);
    const agents = await callAndCapture({
      summarizationConfig: { provider: 'Ollama', model: 'llama3' },
      appConfig,
    });

    const config = agents[0].summarizationConfig as Record<string, unknown>;
    const parameters = config.parameters as Record<string, unknown>;
    expect(parameters.apiKey).toBe('resolved-key-value');
    delete process.env.TEST_OLLAMA_KEY;
  });

  it('skips override when apiKey is marked user_provided', async () => {
    const appConfig = makeAppConfig([
      { name: 'Ollama', baseURL: 'http://localhost:11434/v1', apiKey: 'user_provided' },
    ]);
    const agents = await callAndCapture({
      summarizationConfig: { provider: 'Ollama', model: 'llama3' },
      appConfig,
    });

    const config = agents[0].summarizationConfig as Record<string, unknown>;
    // Provider still remapped to the SDK-recognized name...
    expect(config.provider).toBe('openAI');
    // ...but credentials are not forwarded (async user lookup not supported here;
    // SDK's self-summarize path will reuse the agent's clientOptions).
    expect(config.parameters).toBeUndefined();
  });

  it('skips override when env var reference cannot be resolved', async () => {
    delete process.env.UNSET_TEST_KEY;
    const appConfig = makeAppConfig([
      {
        name: 'Ollama',
        baseURL: 'http://localhost:11434/v1',
        apiKey: '${UNSET_TEST_KEY}',
      },
    ]);
    const agents = await callAndCapture({
      summarizationConfig: { provider: 'Ollama', model: 'llama3' },
      appConfig,
    });

    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.provider).toBe('openAI');
    expect(config.parameters).toBeUndefined();
  });

  it('skips override when partial env var reference (prefix/suffix) stays unresolved', async () => {
    delete process.env.UNSET_TEST_SEGMENT;
    const appConfig = makeAppConfig([
      {
        name: 'Ollama',
        baseURL: 'https://${UNSET_TEST_SEGMENT}.example.com/v1',
        apiKey: 'ollama-key',
      },
    ]);
    const agents = await callAndCapture({
      summarizationConfig: { provider: 'Ollama', model: 'llama3' },
      appConfig,
    });

    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.provider).toBe('openAI');
    /** Even though the baseURL is a partial-match pattern, it must not be forwarded. */
    expect(config.parameters).toBeUndefined();
  });

  it('merges overrides alongside user-supplied parameters', async () => {
    const appConfig = makeAppConfig([
      { name: 'Ollama', baseURL: 'http://localhost:11434/v1', apiKey: 'ollama-key' },
    ]);
    const agents = await callAndCapture({
      summarizationConfig: {
        provider: 'Ollama',
        model: 'llama3',
        parameters: { temperature: 0.2 },
      },
      appConfig,
    });

    const config = agents[0].summarizationConfig as Record<string, unknown>;
    const parameters = config.parameters as Record<string, unknown>;
    expect(parameters).toMatchObject({
      temperature: 0.2,
      configuration: { baseURL: 'http://localhost:11434/v1' },
      apiKey: 'ollama-key',
    });
  });
});
