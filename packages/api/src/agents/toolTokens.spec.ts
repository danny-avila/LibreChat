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
  it('returns empty map when no tools provided', () => {
    expect(collectToolSchemas().size).toBe(0);
    expect(collectToolSchemas([], []).size).toBe(0);
  });

  it('collects schemas from GenericTool array keyed by name', () => {
    const tools = [makeTool('alpha'), makeTool('beta')];
    const schemas = collectToolSchemas(tools);
    expect(schemas.size).toBe(2);
    expect(schemas.has('alpha')).toBe(true);
    expect(schemas.has('beta')).toBe(true);
  });

  it('collects schemas from LCTool definitions', () => {
    const defs = [makeToolDef('x'), makeToolDef('y')];
    const schemas = collectToolSchemas(undefined, defs);
    expect(schemas.size).toBe(2);
    expect(schemas.has('x')).toBe(true);
    expect(schemas.has('y')).toBe(true);
  });

  it('deduplicates: GenericTool takes precedence over matching toolDefinition', () => {
    const tools = [makeTool('shared')];
    const defs = [makeToolDef('shared'), makeToolDef('only_def')];
    const schemas = collectToolSchemas(tools, defs);
    expect(schemas.size).toBe(2);
    expect(schemas.has('shared')).toBe(true);
    expect(schemas.has('only_def')).toBe(true);
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

  it('computes and caches each tool individually on first call', async () => {
    const defs = [makeToolDef('tool_a'), makeToolDef('tool_b')];
    const result = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(result).toBeGreaterThan(0);
    expect(mockCacheStore.has('tool_a')).toBe(true);
    expect(mockCacheStore.has('tool_b')).toBe(true);
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
    // Only one cache entry — raw count is provider-agnostic
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

    // Only one new tokenCounter call for tool_b
    expect(counter.mock.calls.length).toBe(callsAfterFirst + 1);
    expect(mockCacheStore.size).toBe(2);
  });

  it('falls back to compute when cache read throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Redis down'));

    const defs = [makeToolDef('tool')];
    const result = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(result).toBeGreaterThan(0);
    expect(mockGet).toHaveBeenCalled();
  });

  it('does not throw when cache write fails', async () => {
    mockSet.mockRejectedValueOnce(new Error('Redis write error'));

    const defs = [makeToolDef('tool_write_fail')];
    const result = await getOrComputeToolTokens({
      toolDefinitions: defs,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(result).toBeGreaterThan(0);
    expect(mockSet).toHaveBeenCalled();
  });

  it('uses GenericTool tools for per-tool caching', async () => {
    const tools = [makeTool('alpha'), makeTool('beta')];

    const result = await getOrComputeToolTokens({
      tools,
      provider: Providers.OPENAI,
      tokenCounter: fakeTokenCounter,
    });

    expect(result).toBeGreaterThan(0);
    expect(mockCacheStore.has('alpha')).toBe(true);
    expect(mockCacheStore.has('beta')).toBe(true);
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
