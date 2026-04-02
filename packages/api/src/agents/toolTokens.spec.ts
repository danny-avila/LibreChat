import { z } from 'zod';
import { SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import {
  Providers,
  ANTHROPIC_TOOL_TOKEN_MULTIPLIER,
  DEFAULT_TOOL_TOKEN_MULTIPLIER,
} from '@librechat/agents';
import type { GenericTool, LCTool, TokenCounter } from '@librechat/agents';
import { getToolFingerprint, computeToolSchemaTokens, getOrComputeToolTokens } from './toolTokens';

/* ---------- Mock standardCache to use a plain Map (no Redis) ---------- */
const mockCacheStore = new Map<string, unknown>();
jest.mock('~/cache', () => ({
  standardCache: jest.fn(() => ({
    get: jest.fn((key: string) => Promise.resolve(mockCacheStore.get(key))),
    set: jest.fn((key: string, value: unknown) => {
      mockCacheStore.set(key, value);
      return Promise.resolve(true);
    }),
  })),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

/* ---------- Helpers ---------- */

function makeTool(name: string, description = `${name} description`): GenericTool {
  return new DynamicStructuredTool({
    name,
    description,
    schema: z.object({ input: z.string().optional() }),
    func: async () => 'ok',
  }) as unknown as GenericTool;
}

function makeToolDef(name: string, description?: string): LCTool {
  return {
    name,
    description: description ?? `${name} description`,
    parameters: { type: 'object', properties: { input: { type: 'string' } } },
  };
}

/** Token counter that returns the string length of message content (deterministic). */
const fakeTokenCounter: TokenCounter = (msg) => {
  const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
  return content.length;
};

beforeEach(() => {
  mockCacheStore.clear();
});

/* ========================================================================= */
/*  getToolFingerprint                                                       */
/* ========================================================================= */

describe('getToolFingerprint', () => {
  it('returns empty string when no tools or definitions provided', () => {
    expect(getToolFingerprint()).toBe('');
    expect(getToolFingerprint([], [])).toBe('');
  });

  it('returns sorted names with count from GenericTool array', () => {
    const tools = [makeTool('beta'), makeTool('alpha')];
    expect(getToolFingerprint(tools)).toBe('alpha,beta|2');
  });

  it('returns sorted names with count from LCTool definitions', () => {
    const defs = [makeToolDef('zulu'), makeToolDef('alpha')];
    expect(getToolFingerprint(undefined, defs)).toBe('alpha,zulu|2');
  });

  it('deduplicates names across tools and toolDefinitions', () => {
    const tools = [makeTool('shared'), makeTool('only_tool')];
    const defs = [makeToolDef('shared'), makeToolDef('only_def')];
    expect(getToolFingerprint(tools, defs)).toBe('only_def,only_tool,shared|3');
  });

  it('is stable regardless of input ordering', () => {
    const a = getToolFingerprint([makeTool('x'), makeTool('a'), makeTool('m')]);
    const b = getToolFingerprint([makeTool('m'), makeTool('x'), makeTool('a')]);
    expect(a).toBe(b);
    expect(a).toBe('a,m,x|3');
  });
});

/* ========================================================================= */
/*  computeToolSchemaTokens                                                  */
/* ========================================================================= */

describe('computeToolSchemaTokens', () => {
  it('returns 0 when no tools provided', () => {
    expect(
      computeToolSchemaTokens(undefined, undefined, Providers.OPENAI, undefined, fakeTokenCounter),
    ).toBe(0);
    expect(computeToolSchemaTokens([], [], Providers.OPENAI, undefined, fakeTokenCounter)).toBe(0);
  });

  it('counts tokens from GenericTool schemas', () => {
    const tools = [makeTool('test_tool')];
    const result = computeToolSchemaTokens(
      tools,
      undefined,
      Providers.OPENAI,
      undefined,
      fakeTokenCounter,
    );
    expect(result).toBeGreaterThan(0);
  });

  it('counts tokens from LCTool definitions', () => {
    const defs = [makeToolDef('test_def')];
    const result = computeToolSchemaTokens(
      undefined,
      defs,
      Providers.OPENAI,
      undefined,
      fakeTokenCounter,
    );
    expect(result).toBeGreaterThan(0);
  });

  it('deduplicates: tool counted from tools array is skipped in toolDefinitions', () => {
    const tools = [makeTool('shared')];
    const defs = [makeToolDef('shared')];

    const toolsOnly = computeToolSchemaTokens(
      tools,
      undefined,
      Providers.OPENAI,
      undefined,
      fakeTokenCounter,
    );
    const both = computeToolSchemaTokens(
      tools,
      defs,
      Providers.OPENAI,
      undefined,
      fakeTokenCounter,
    );

    expect(both).toBe(toolsOnly);
  });

  it('applies Anthropic multiplier for Anthropic provider', () => {
    const defs = [makeToolDef('tool')];
    const openai = computeToolSchemaTokens(
      undefined,
      defs,
      Providers.OPENAI,
      undefined,
      fakeTokenCounter,
    );
    const anthropic = computeToolSchemaTokens(
      undefined,
      defs,
      Providers.ANTHROPIC,
      undefined,
      fakeTokenCounter,
    );

    const expectedRatio = ANTHROPIC_TOOL_TOKEN_MULTIPLIER / DEFAULT_TOOL_TOKEN_MULTIPLIER;
    expect(anthropic / openai).toBeCloseTo(expectedRatio, 1);
  });

  it('applies Anthropic multiplier when model name contains "claude"', () => {
    const defs = [makeToolDef('tool')];
    const clientOptions = { model: 'claude-3-opus' };
    const result = computeToolSchemaTokens(
      undefined,
      defs,
      Providers.OPENAI,
      clientOptions,
      fakeTokenCounter,
    );

    const defaultResult = computeToolSchemaTokens(
      undefined,
      defs,
      Providers.OPENAI,
      undefined,
      fakeTokenCounter,
    );
    expect(result).toBeGreaterThan(defaultResult);
  });

  it('does not apply Anthropic multiplier for Bedrock even with claude model', () => {
    const defs = [makeToolDef('tool')];
    const clientOptions = { model: 'claude-3-opus' };
    const bedrock = computeToolSchemaTokens(
      undefined,
      defs,
      Providers.BEDROCK,
      clientOptions,
      fakeTokenCounter,
    );
    const defaultResult = computeToolSchemaTokens(
      undefined,
      defs,
      Providers.OPENAI,
      undefined,
      fakeTokenCounter,
    );

    expect(bedrock).toBe(defaultResult);
  });
});

/* ========================================================================= */
/*  getOrComputeToolTokens                                                   */
/* ========================================================================= */

describe('getOrComputeToolTokens', () => {
  it('returns 0 when no tools provided', async () => {
    const result = await getOrComputeToolTokens({
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });
    expect(result).toBe(0);
  });

  it('computes and caches tokens on first call', async () => {
    const defs = [makeToolDef('tool_a'), makeToolDef('tool_b')];
    const result = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(result).toBeGreaterThan(0);
    expect(mockCacheStore.size).toBe(1);

    const cachedValue = Array.from(mockCacheStore.values())[0];
    expect(cachedValue).toBe(result);
  });

  it('returns cached value on second call without recomputing', async () => {
    const defs = [makeToolDef('tool_a')];
    const counter = jest.fn(fakeTokenCounter);

    const first = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: counter,
    });

    const callCountAfterFirst = counter.mock.calls.length;

    const second = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: counter,
    });

    expect(second).toBe(first);
    expect(counter.mock.calls.length).toBe(callCountAfterFirst);
  });

  it('caches separately for different providers with different multipliers', async () => {
    const defs = [makeToolDef('tool')];

    const openai = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    const anthropic = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.ANTHROPIC,
      tokenCounter: fakeTokenCounter,
    });

    expect(openai).not.toBe(anthropic);
    expect(mockCacheStore.size).toBe(2);
  });

  it('shares cache for same provider+tools across calls with different agents', async () => {
    const defs = [makeToolDef('shared_tool')];

    const first = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    const second = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(first).toBe(second);
    expect(mockCacheStore.size).toBe(1);
  });

  it('recomputes when tool set changes', async () => {
    const first = await getOrComputeToolTokens({
      toolDefinitions: [makeToolDef('tool_a')],
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    const second = await getOrComputeToolTokens({
      toolDefinitions: [makeToolDef('tool_a'), makeToolDef('tool_b')],
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(second).not.toBe(first);
    expect(second).toBeGreaterThan(first);
    expect(mockCacheStore.size).toBe(2);
  });

  it('falls back to compute when cache read throws', async () => {
    const { standardCache } = jest.requireMock('~/cache') as { standardCache: jest.Mock };
    const failingCache = {
      get: jest.fn(() => Promise.reject(new Error('Redis down'))),
      set: jest.fn(() => Promise.resolve(true)),
    };
    standardCache.mockReturnValueOnce(failingCache);

    /** Reset the module-level cache so it picks up the failing mock */
    jest.resetModules();
    const { getOrComputeToolTokens: freshGetOrCompute } = await import('./toolTokens');

    const defs = [makeToolDef('tool')];
    const result = await freshGetOrCompute({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(result).toBeGreaterThan(0);
  });

  it('does not throw when cache write fails', async () => {
    const { standardCache } = jest.requireMock('~/cache') as { standardCache: jest.Mock };
    const writeFailCache = {
      get: jest.fn(() => Promise.resolve(undefined)),
      set: jest.fn(() => Promise.reject(new Error('Redis write error'))),
    };
    standardCache.mockReturnValueOnce(writeFailCache);

    jest.resetModules();
    const { getOrComputeToolTokens: freshGetOrCompute } = await import('./toolTokens');

    const defs = [makeToolDef('tool')];
    const result = await freshGetOrCompute({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(result).toBeGreaterThan(0);
  });

  it('uses GenericTool tools for fingerprint and token counting', async () => {
    const tools = [makeTool('alpha'), makeTool('beta')];

    const result = await getOrComputeToolTokens({
      tools,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(result).toBeGreaterThan(0);
    expect(mockCacheStore.size).toBe(1);

    const key = Array.from(mockCacheStore.keys())[0];
    expect(key).toContain('alpha,beta|2');
  });
});
