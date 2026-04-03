import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import {
  Providers,
  ANTHROPIC_TOOL_TOKEN_MULTIPLIER,
  DEFAULT_TOOL_TOKEN_MULTIPLIER,
} from '@librechat/agents';

import type { GenericTool, LCTool, TokenCounter } from '@librechat/agents';

import { collectToolSchemas, computeToolSchemaTokens, getOrComputeToolTokens } from './toolTokens';

/* ---------- Mock standardCache with hoisted get/set for per-test overrides ---------- */
const mockCacheStore = new Map<string, unknown>();
const mockGet = jest.fn((key: string) => Promise.resolve(mockCacheStore.get(key)));
const mockSet = jest.fn((key: string, value: unknown) => {
  mockCacheStore.set(key, value);
  return Promise.resolve(true);
});

jest.mock('~/cache', () => ({
  standardCache: jest.fn(() => ({ get: mockGet, set: mockSet })),
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

function makeMcpTool(name: string): GenericTool {
  const tool = makeTool(name) as unknown as Record<string, unknown>;
  tool.mcp = true;
  return tool as unknown as GenericTool;
}

function makeToolDef(name: string, opts?: Partial<LCTool>): LCTool {
  return {
    name,
    description: opts?.description ?? `${name} description`,
    parameters: opts?.parameters ?? { type: 'object', properties: { input: { type: 'string' } } },
    ...opts,
  };
}

/** Token counter that returns the string length of message content (deterministic). */
const fakeTokenCounter: TokenCounter = (msg) => {
  const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
  return content.length;
};

beforeEach(() => {
  mockCacheStore.clear();
  mockGet.mockImplementation((key: string) => Promise.resolve(mockCacheStore.get(key)));
  mockSet.mockImplementation((key: string, value: unknown) => {
    mockCacheStore.set(key, value);
    return Promise.resolve(true);
  });
});

/* ========================================================================= */
/*  collectToolSchemas                                                       */
/* ========================================================================= */

describe('collectToolSchemas', () => {
  it('returns empty array when no tools provided', () => {
    expect(collectToolSchemas()).toHaveLength(0);
    expect(collectToolSchemas([], [])).toHaveLength(0);
  });

  it('collects entries from GenericTool array', () => {
    const entries = collectToolSchemas([makeTool('alpha'), makeTool('beta')]);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.cacheKey)).toEqual(
      expect.arrayContaining(['alpha:builtin', 'beta:builtin']),
    );
  });

  it('collects entries from LCTool definitions with toolType', () => {
    const defs = [makeToolDef('x', { toolType: 'mcp' }), makeToolDef('y', { toolType: 'action' })];
    const entries = collectToolSchemas(undefined, defs);
    expect(entries).toHaveLength(2);
    expect(entries[0].cacheKey).toBe('x:mcp');
    expect(entries[1].cacheKey).toBe('y:action');
  });

  it('defaults toolType to builtin for LCTool without toolType', () => {
    const entries = collectToolSchemas(undefined, [makeToolDef('z')]);
    expect(entries[0].cacheKey).toBe('z:builtin');
  });

  it('uses mcp type for GenericTool with mcp flag', () => {
    const entries = collectToolSchemas([makeMcpTool('search')]);
    expect(entries[0].cacheKey).toBe('search:mcp');
  });

  it('deduplicates: GenericTool takes precedence over matching toolDefinition', () => {
    const tools = [makeTool('shared')];
    const defs = [makeToolDef('shared'), makeToolDef('only_def')];
    const entries = collectToolSchemas(tools, defs);
    expect(entries).toHaveLength(2);
    const keys = entries.map((e) => e.cacheKey);
    expect(keys).toContain('shared:builtin');
    expect(keys).toContain('only_def:builtin');
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
    const result = computeToolSchemaTokens(
      [makeTool('test_tool')],
      undefined,
      Providers.OPENAI,
      undefined,
      fakeTokenCounter,
    );
    expect(result).toBeGreaterThan(0);
  });

  it('counts tokens from LCTool definitions', () => {
    const result = computeToolSchemaTokens(
      undefined,
      [makeToolDef('test_def')],
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
    const result = computeToolSchemaTokens(
      undefined,
      defs,
      Providers.OPENAI,
      { model: 'claude-3-opus' },
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
    const bedrock = computeToolSchemaTokens(
      undefined,
      defs,
      Providers.BEDROCK,
      { model: 'claude-3-opus' },
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

  it('computes and caches each tool individually on first call', async () => {
    const defs = [makeToolDef('tool_a'), makeToolDef('tool_b')];
    const result = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(result).toBeGreaterThan(0);
    expect(mockCacheStore.has('tool_a:builtin')).toBe(true);
    expect(mockCacheStore.has('tool_b:builtin')).toBe(true);
    expect(mockCacheStore.size).toBe(2);
  });

  it('uses cached per-tool values on second call without recomputing', async () => {
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

  it('applies different multipliers for different providers on same cached raw counts', async () => {
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
    expect(mockCacheStore.size).toBe(1);
  });

  it('only computes new tools when tool set grows', async () => {
    const counter = jest.fn(fakeTokenCounter);

    await getOrComputeToolTokens({
      toolDefinitions: [makeToolDef('tool_a')],
      provider: Providers.OPENAI,
      tokenCounter: counter,
    });
    const callsAfterFirst = counter.mock.calls.length;

    await getOrComputeToolTokens({
      toolDefinitions: [makeToolDef('tool_a'), makeToolDef('tool_b')],
      provider: Providers.OPENAI,
      tokenCounter: counter,
    });

    expect(counter.mock.calls.length).toBe(callsAfterFirst + 1);
    expect(mockCacheStore.size).toBe(2);
  });

  it('scopes cache keys by tenantId when provided', async () => {
    const defs = [makeToolDef('tool')];

    await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
      tenantId: 'tenant_123',
    });

    expect(mockCacheStore.has('tenant_123:tool:builtin')).toBe(true);
  });

  it('separates cache entries for different tenants', async () => {
    const defs = [makeToolDef('tool')];

    const t1 = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
      tenantId: 'tenant_1',
    });

    const t2 = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
      tenantId: 'tenant_2',
    });

    expect(t1).toBe(t2);
    expect(mockCacheStore.has('tenant_1:tool:builtin')).toBe(true);
    expect(mockCacheStore.has('tenant_2:tool:builtin')).toBe(true);
    expect(mockCacheStore.size).toBe(2);
  });

  it('caches mcp tools with mcp type in key', async () => {
    const defs = [makeToolDef('search', { toolType: 'mcp' })];

    await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(mockCacheStore.has('search:mcp')).toBe(true);
  });

  it('falls back to compute when cache read throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Redis down'));

    const result = await getOrComputeToolTokens({
      toolDefinitions: [makeToolDef('tool')],
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(result).toBeGreaterThan(0);
    expect(mockGet).toHaveBeenCalled();
  });

  it('does not throw when cache write fails', async () => {
    mockSet.mockRejectedValueOnce(new Error('Redis write error'));

    const result = await getOrComputeToolTokens({
      toolDefinitions: [makeToolDef('tool_write_fail')],
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(result).toBeGreaterThan(0);
    expect(mockSet).toHaveBeenCalled();
  });

  it('matches computeToolSchemaTokens output for same inputs', async () => {
    const defs = [makeToolDef('a'), makeToolDef('b'), makeToolDef('c')];

    const cached = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    const direct = computeToolSchemaTokens(
      undefined,
      defs,
      Providers.OPENAI,
      undefined,
      fakeTokenCounter,
    );

    expect(cached).toBe(direct);
  });
});
