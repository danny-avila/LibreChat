import type { SummarizationConfig } from 'librechat-data-provider';
import { createRun } from '../run';

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
  } = {},
) {
  const agents = opts.agents ?? [makeAgent()];
  const signal = new AbortController().signal;

  await createRun({
    agents: agents as never,
    signal,
    summarizationConfig: opts.summarizationConfig,
    initialSummary: opts.initialSummary,
    streaming: true,
    streamUsage: true,
  });

  const createMock = Run.create as jest.Mock;
  expect(createMock).toHaveBeenCalledTimes(1);
  const callArgs = createMock.mock.calls[0][0];
  return callArgs.graphConfig.agents as Array<Record<string, unknown>>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Suite 1: reserveTokensRatio
// ---------------------------------------------------------------------------
describe('reserveTokensRatio', () => {
  it('applies ratio from config using baseContextTokens', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ baseContextTokens: 200_000, maxContextTokens: 100_000 })],
      summarizationConfig: { reserveTokensRatio: 0.03, provider: 'anthropic', model: 'claude' },
    });
    // Math.max(1024, Math.round(200000 * 0.97)) = 194000
    expect(agents[0].maxContextTokens).toBe(194_000);
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
      summarizationConfig: { reserveTokensRatio: 0, provider: 'anthropic', model: 'claude' },
    });
    expect(agents[0].maxContextTokens).toBe(100_000);
  });

  it('falls back to maxContextTokens when ratio is 1', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ maxContextTokens: 100_000, baseContextTokens: 200_000 })],
      summarizationConfig: { reserveTokensRatio: 1, provider: 'anthropic', model: 'claude' },
    });
    expect(agents[0].maxContextTokens).toBe(100_000);
  });

  it('falls back to maxContextTokens when baseContextTokens is undefined', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ maxContextTokens: 100_000 })],
      summarizationConfig: { reserveTokensRatio: 0.05, provider: 'anthropic', model: 'claude' },
    });
    expect(agents[0].maxContextTokens).toBe(100_000);
  });

  it('clamps to 1024 minimum', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ baseContextTokens: 500, maxContextTokens: 500 })],
      summarizationConfig: { reserveTokensRatio: 0.99, provider: 'anthropic', model: 'claude' },
    });
    // Math.round(500 * 0.01) = 5 → clamped to 1024
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

  it('per-agent override wins over global', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ id: 'agent_1' })],
      summarizationConfig: {
        provider: 'anthropic',
        model: 'claude',
        maxSummaryTokens: 2048,
        agents: {
          agent_1: { maxSummaryTokens: 512 },
        },
      },
    });
    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.maxSummaryTokens).toBe(512);
  });

  it('uses global when per-agent override has no maxSummaryTokens', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ id: 'agent_1' })],
      summarizationConfig: {
        provider: 'anthropic',
        model: 'claude',
        maxSummaryTokens: 2048,
        agents: {
          agent_1: { enabled: true },
        },
      },
    });
    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config.maxSummaryTokens).toBe(2048);
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

  it('false when summarizationConfig is undefined', async () => {
    const agents = await callAndCapture({
      summarizationConfig: undefined,
    });
    expect(agents[0].summarizationEnabled).toBe(false);
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
        stream: false,
        maxSummaryTokens: 4096,
      },
    });
    const config = agents[0].summarizationConfig as Record<string, unknown>;
    expect(config).toBeDefined();
    expect(config.enabled).toBe(true);
    expect(config.trigger).toEqual({ type: 'token_count', value: 8000 });
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('claude-3-haiku');
    expect(config.parameters).toEqual({ temperature: 0.2 });
    expect(config.prompt).toBe('Summarize this conversation');
    expect(config.updatePrompt).toBe('Update the existing summary with new messages');
    expect(config.stream).toBe(false);
    expect(config.maxSummaryTokens).toBe(4096);
  });

  it('undefined when no config provided', async () => {
    const agents = await callAndCapture({
      summarizationConfig: undefined,
    });
    expect(agents[0].summarizationConfig).toBeUndefined();
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
        reserveTokensRatio: 0.1,
        provider: 'anthropic',
        model: 'claude',
      },
    });
    // agent_1: Math.round(200000 * 0.9) = 180000
    expect(agents[0].maxContextTokens).toBe(180_000);
    // agent_2: Math.round(100000 * 0.9) = 90000
    expect(agents[1].maxContextTokens).toBe(90_000);
  });

  it('per-agent summarization override applies to correct agent only', async () => {
    const agents = await callAndCapture({
      agents: [makeAgent({ id: 'agent_1' }), makeAgent({ id: 'agent_2' })],
      summarizationConfig: {
        provider: 'anthropic',
        model: 'claude',
        maxSummaryTokens: 2048,
        agents: {
          agent_2: { maxSummaryTokens: 768 },
        },
      },
    });
    const config1 = agents[0].summarizationConfig as Record<string, unknown>;
    const config2 = agents[1].summarizationConfig as Record<string, unknown>;
    expect(config1.maxSummaryTokens).toBe(2048);
    expect(config2.maxSummaryTokens).toBe(768);
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
