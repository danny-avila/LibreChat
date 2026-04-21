import { Providers } from '@librechat/agents';
import { EModelEndpoint } from 'librechat-data-provider';
import type { Agent } from 'librechat-data-provider';
import type { ServerRequest, InitializeResultBase, EndpointTokenConfig } from '~/types';
import type { InitializeAgentDbMethods } from '../initialize';
import { DEFAULT_MAX_CONTEXT_TOKENS } from '../initialize';

// Mock logger
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
  format: {
    combine: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}));

const mockExtractLibreChatParams = jest.fn();
const mockGetModelMaxTokens = jest.fn();
const mockOptionalChainWithEmptyCheck = jest.fn();
const mockGetThreadData = jest.fn();

jest.mock('~/utils', () => ({
  extractLibreChatParams: (...args: unknown[]) => mockExtractLibreChatParams(...args),
  getModelMaxTokens: (...args: unknown[]) => mockGetModelMaxTokens(...args),
  optionalChainWithEmptyCheck: (...args: unknown[]) => mockOptionalChainWithEmptyCheck(...args),
  getThreadData: (...args: unknown[]) => mockGetThreadData(...args),
}));

const mockGetProviderConfig = jest.fn();
jest.mock('~/endpoints', () => ({
  getProviderConfig: (...args: unknown[]) => mockGetProviderConfig(...args),
}));

jest.mock('~/files', () => ({
  filterFilesByEndpointConfig: jest.fn(() => []),
}));

jest.mock('~/prompts', () => ({
  generateArtifactsPrompt: jest.fn(() => null),
}));

jest.mock('../resources', () => ({
  primeResources: jest.fn().mockResolvedValue({
    attachments: [],
    tool_resources: undefined,
  }),
}));

import { initializeAgent } from '../initialize';

const realUtils = jest.requireActual<typeof import('~/utils')>('~/utils');

/**
 * Creates minimal mock objects for initializeAgent tests.
 *
 * @param overrides.overrideProvider - Simulates the value returned by `getProviderConfig`.
 *   Defaults to `provider` (native endpoint where no remapping occurs). Set to a different
 *   value (e.g. `Providers.OPENAI`) alongside a custom `provider` to simulate a custom
 *   endpoint whose provider is resolved to a built-in.
 * @param overrides.useRealTokenLookup - When true, `getModelMaxTokens` delegates to the real
 *   implementation so tests exercise actual token-map resolution. Otherwise a controlled
 *   `modelDefault` is returned.
 */
function createMocks(overrides?: {
  provider?: string;
  overrideProvider?: string;
  model?: string;
  maxContextTokens?: number;
  modelDefault?: number;
  maxOutputTokens?: number;
  endpointTokenConfig?: EndpointTokenConfig;
  useRealTokenLookup?: boolean;
}) {
  const {
    provider = Providers.OPENAI,
    overrideProvider,
    model = 'test-model',
    maxContextTokens,
    modelDefault = 200000,
    maxOutputTokens = 4096,
    endpointTokenConfig,
    useRealTokenLookup = false,
  } = overrides ?? {};

  const resolvedOverrideProvider = overrideProvider ?? provider;

  const agent = {
    id: 'agent-1',
    model,
    provider,
    tools: [],
    model_parameters: { model },
  } as unknown as Agent;

  const req = {
    user: { id: 'user-1' },
    config: {},
  } as unknown as ServerRequest;

  const res = {} as unknown as import('express').Response;

  const mockGetOptions = jest.fn().mockResolvedValue({
    llmConfig: { model, maxTokens: maxOutputTokens },
    endpointTokenConfig,
  } satisfies InitializeResultBase);

  mockGetProviderConfig.mockReturnValue({
    getOptions: mockGetOptions,
    overrideProvider: resolvedOverrideProvider,
  });

  mockExtractLibreChatParams.mockReturnValue({
    resendFiles: false,
    maxContextTokens,
    modelOptions: { model },
  });

  if (useRealTokenLookup) {
    mockGetModelMaxTokens.mockImplementation(realUtils.getModelMaxTokens);
  } else {
    mockGetModelMaxTokens.mockReturnValue(modelDefault);
  }

  // Real implementation: treats 0 as a valid (non-empty) value — load-bearing for the maxContextTokens=0 test
  mockOptionalChainWithEmptyCheck.mockImplementation(realUtils.optionalChainWithEmptyCheck);

  const loadTools = jest.fn().mockResolvedValue({
    tools: [],
    toolContextMap: {},
    userMCPAuthMap: undefined,
    toolRegistry: undefined,
    toolDefinitions: [],
    hasDeferredTools: false,
  });

  const db: InitializeAgentDbMethods = {
    getFiles: jest.fn().mockResolvedValue([]),
    getConvoFiles: jest.fn().mockResolvedValue([]),
    updateFilesUsage: jest.fn().mockResolvedValue([]),
    getUserKey: jest.fn().mockResolvedValue('user-1'),
    getUserKeyValues: jest.fn().mockResolvedValue([]),
    getToolFilesByIds: jest.fn().mockResolvedValue([]),
  };

  return { agent, req, res, loadTools, db };
}

describe('initializeAgent — custom provider token lookup', () => {
  const CUSTOM_PROVIDER = 'EduGPT';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the resolved provider endpoint to getModelMaxTokens, not the custom name', async () => {
    const { agent, req, res, loadTools, db } = createMocks({
      provider: CUSTOM_PROVIDER,
      overrideProvider: Providers.OPENAI,
      model: 'qwen3-235b-a22b',
      useRealTokenLookup: true,
    });

    await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([CUSTOM_PROVIDER]),
        isInitialAgent: true,
      },
      db,
    );

    // providerEndpointMap["openAI"] = "openAI" (valid), not providerEndpointMap["EduGPT"] = undefined
    expect(mockGetModelMaxTokens).toHaveBeenCalledWith(
      'qwen3-235b-a22b',
      EModelEndpoint.openAI,
      undefined,
    );
  });

  it('uses endpointTokenConfig from the custom endpoint for unrecognized models', async () => {
    const customTokenConfig: EndpointTokenConfig = {
      'my-custom-model-v1': { context: 65536, prompt: 1, completion: 1 },
    };
    const { agent, req, res, loadTools, db } = createMocks({
      provider: CUSTOM_PROVIDER,
      overrideProvider: Providers.OPENAI,
      model: 'my-custom-model-v1',
      endpointTokenConfig: customTokenConfig,
      useRealTokenLookup: true,
    });

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([CUSTOM_PROVIDER]),
        isInitialAgent: true,
      },
      db,
    );

    expect(mockGetModelMaxTokens).toHaveBeenCalledWith(
      'my-custom-model-v1',
      EModelEndpoint.openAI,
      customTokenConfig,
    );

    // Pipeline check: verifies endpointTokenConfig.context flows through the full
    // optionalChainWithEmptyCheck → Math.max formula. The toHaveBeenCalledWith
    // assertion above catches the actual provider-resolution regression.
    expect(result.maxContextTokens).toBe(Math.round((65536 - 4096) * 0.95));
  });
});

describe('initializeAgent — maxContextTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses user-configured maxContextTokens when provided via model_parameters', async () => {
    const userValue = 50000;
    const { agent, req, res, loadTools, db } = createMocks({
      maxContextTokens: userValue,
      modelDefault: 200000,
      maxOutputTokens: 4096,
    });

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: {
          endpoint: EModelEndpoint.agents,
          model_parameters: { maxContextTokens: userValue },
        },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
      },
      db,
    );

    expect(result.maxContextTokens).toBe(userValue);
  });

  it('falls back to formula when maxContextTokens is NOT provided', async () => {
    const modelDefault = 200000;
    const maxOutputTokens = 4096;
    const { agent, req, res, loadTools, db } = createMocks({
      maxContextTokens: undefined,
      modelDefault,
      maxOutputTokens,
    });

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
      },
      db,
    );

    const expected = Math.round((modelDefault - maxOutputTokens) * 0.95);
    expect(result.maxContextTokens).toBe(expected);
  });

  it('falls back to formula when maxContextTokens is 0', async () => {
    const maxOutputTokens = 4096;
    const { agent, req, res, loadTools, db } = createMocks({
      maxContextTokens: 0,
      modelDefault: 200000,
      maxOutputTokens,
    });

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: {
          endpoint: EModelEndpoint.agents,
          model_parameters: { maxContextTokens: 0 },
        },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
      },
      db,
    );

    expect(result.maxContextTokens).not.toBe(0);
    const expected = Math.round((DEFAULT_MAX_CONTEXT_TOKENS - maxOutputTokens) * 0.95);
    expect(result.maxContextTokens).toBe(expected);
  });

  it('falls back to formula when maxContextTokens is negative', async () => {
    const maxOutputTokens = 4096;
    const { agent, req, res, loadTools, db } = createMocks({
      maxContextTokens: -1,
      modelDefault: 200000,
      maxOutputTokens,
    });

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: {
          endpoint: EModelEndpoint.agents,
          model_parameters: { maxContextTokens: -1 },
        },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
      },
      db,
    );

    // -1 is not used as-is; the formula kicks in
    expect(result.maxContextTokens).not.toBe(-1);
  });

  it('preserves small user-configured value (e.g. 1000 from modelSpec)', async () => {
    const userValue = 1000;
    const { agent, req, res, loadTools, db } = createMocks({
      maxContextTokens: userValue,
      modelDefault: 128000,
      maxOutputTokens: 4096,
    });

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: {
          endpoint: EModelEndpoint.agents,
          model_parameters: { maxContextTokens: userValue },
        },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
      },
      db,
    );

    // Should NOT be overridden to Math.round((128000 - 4096) * 0.95) = 117,709
    expect(result.maxContextTokens).toBe(userValue);
  });

  it('sets baseContextTokens to agentMaxContextNum minus maxOutputTokensNum', async () => {
    const modelDefault = 200000;
    const maxOutputTokens = 4096;
    const { agent, req, res, loadTools, db } = createMocks({
      maxContextTokens: undefined,
      modelDefault,
      maxOutputTokens,
    });

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
      },
      db,
    );

    expect(result.baseContextTokens).toBe(modelDefault - maxOutputTokens);
  });

  it('clamps maxContextTokens to at least 1024 for tiny models', async () => {
    const modelDefault = 1100;
    const maxOutputTokens = 1050;
    const { agent, req, res, loadTools, db } = createMocks({
      maxContextTokens: undefined,
      modelDefault,
      maxOutputTokens,
    });

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
      },
      db,
    );

    // baseContextTokens = 1100 - 1050 = 50, formula would give ~47.5 rounded
    // but Math.max(1024, ...) clamps it
    expect(result.maxContextTokens).toBe(1024);
  });
});

describe('initializeAgent — manual skill priming (Phase 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Minimal listSkillsByAccess that satisfies `injectSkillCatalog` so the
   * manualSkills resolver branch runs. Returns an empty page — we don't care
   * about the catalog here, only that `accessibleSkillIds` is non-empty so
   * the manual-invocation block gets reached.
   */
  const emptyListSkillsByAccess: InitializeAgentDbMethods['listSkillsByAccess'] = async () => ({
    skills: [],
    has_more: false,
    after: null,
  });

  it('attaches resolved manual skill primes to the initialized agent', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    const { Types } = await import('mongoose');
    const skillId = new Types.ObjectId();
    /**
     * Ownership-based active-state default only kicks in when
     * `skill.author.toString() === userId`. The default mock user id is a
     * literal string, not an ObjectId, so align the skill author with it so
     * `resolveSkillActive` treats the skill as owned and active.
     */
    const ownerAuthor = {
      toString: () => req.user?.id,
    } as unknown as import('mongoose').Types.ObjectId;

    const getSkillByName: InitializeAgentDbMethods['getSkillByName'] = jest.fn().mockResolvedValue({
      _id: skillId,
      name: 'brand-guidelines',
      body: '# Brand guidelines\nUse blue.',
      author: ownerAuthor,
    });

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [skillId],
        manualSkills: ['brand-guidelines'],
      },
      { ...db, listSkillsByAccess: emptyListSkillsByAccess, getSkillByName },
    );

    expect(result.manualSkillPrimes).toEqual([
      { _id: skillId, name: 'brand-guidelines', body: '# Brand guidelines\nUse blue.' },
    ]);
    /* `preferUserInvocable` keeps name-collision lookups consistent with
       the popover for manual paths — model-only (`userInvocable: false`)
       duplicates can't shadow the user-invocable doc the user picked. */
    expect(getSkillByName).toHaveBeenCalledWith('brand-guidelines', [skillId], {
      preferUserInvocable: true,
    });
  });

  it('leaves manualSkillPrimes undefined when no manualSkills are provided', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    const { Types } = await import('mongoose');
    const skillId = new Types.ObjectId();

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [skillId],
      },
      { ...db, listSkillsByAccess: emptyListSkillsByAccess },
    );

    expect(result.manualSkillPrimes).toBeUndefined();
  });

  it('returns empty array when every manual skill is unresolvable (no primes, no throw)', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    const { Types } = await import('mongoose');
    const skillId = new Types.ObjectId();

    const getSkillByName: InitializeAgentDbMethods['getSkillByName'] = jest
      .fn()
      .mockResolvedValue(null);

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [skillId],
        manualSkills: ['does-not-exist'],
      },
      { ...db, listSkillsByAccess: emptyListSkillsByAccess, getSkillByName },
    );

    expect(result.manualSkillPrimes).toEqual([]);
  });

  it('skips resolution entirely when accessibleSkillIds is empty (user has no skill access)', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    const getSkillByName: InitializeAgentDbMethods['getSkillByName'] = jest.fn();

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [],
        manualSkills: ['anything'],
      },
      { ...db, getSkillByName },
    );

    expect(result.manualSkillPrimes).toBeUndefined();
    expect(getSkillByName).not.toHaveBeenCalled();
  });

  it('silently no-ops when getSkillByName is not provided in db methods', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    const { Types } = await import('mongoose');
    const skillId = new Types.ObjectId();

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [skillId],
        manualSkills: ['foo'],
      },
      { ...db, listSkillsByAccess: emptyListSkillsByAccess },
    );

    expect(result.manualSkillPrimes).toBeUndefined();
  });
});

describe('initializeAgent — skill `allowed-tools` union (Phase 6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Same minimal pager used in the Phase 3 suite — the catalog isn't what
   * we're exercising; we just need accessibleSkillIds to be non-empty so the
   * resolver path runs.
   */
  const emptyListSkillsByAccess: InitializeAgentDbMethods['listSkillsByAccess'] = async () => ({
    skills: [],
    has_more: false,
    after: null,
  });

  /** Helper: build a getSkillByName that returns a single skill with allowedTools. */
  const buildGetSkillByName = (
    name: string,
    allowedTools: string[] | undefined,
    skillId: import('mongoose').Types.ObjectId,
    userId: string,
  ): InitializeAgentDbMethods['getSkillByName'] =>
    jest.fn().mockResolvedValue({
      _id: skillId,
      name,
      body: `body of ${name}`,
      author: { toString: () => userId } as unknown as import('mongoose').Types.ObjectId,
      ...(allowedTools !== undefined ? { allowedTools } : {}),
    });

  it('passes the union of agent.tools + allowed-tools to loadTools and merges resulting toolDefinitions', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    agent.tools = ['web_search'];
    const { Types } = await import('mongoose');
    const skillId = new Types.ObjectId();

    /* Mock loadTools to echo back what was requested as toolDefinitions —
       lets the test assert both the input list and the output merge. */
    loadTools.mockImplementation(async ({ tools }: { tools: string[] }) => ({
      tools: [],
      toolContextMap: {},
      userMCPAuthMap: undefined,
      toolRegistry: undefined,
      toolDefinitions: tools.map((name: string) => ({ name, description: '', parameters: {} })),
      hasDeferredTools: false,
      actionsEnabled: undefined,
    }));

    const getSkillByName = buildGetSkillByName(
      'tool-skill',
      ['execute_code', 'read_file'],
      skillId,
      req.user!.id,
    );

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [skillId],
        manualSkills: ['tool-skill'],
      },
      { ...db, listSkillsByAccess: emptyListSkillsByAccess, getSkillByName },
    );

    /* Single loadTools call with the union — agent.tools + extras, dedup
       not needed because unionPrimeAllowedTools already excluded
       agent-baseline names. Order: agent first, then extras. */
    expect(loadTools).toHaveBeenCalledTimes(1);
    expect(loadTools.mock.calls[0][0].tools).toEqual(['web_search', 'execute_code', 'read_file']);

    /* All three tools should appear in the merged toolDefinitions. */
    const definedNames = result.toolDefinitions?.map((d) => d.name) ?? [];
    expect(definedNames).toEqual(
      expect.arrayContaining(['web_search', 'execute_code', 'read_file']),
    );
  });

  it('does not call loadTools twice when the skill declares no allowed-tools', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    agent.tools = ['web_search'];
    const { Types } = await import('mongoose');
    const skillId = new Types.ObjectId();

    const getSkillByName = buildGetSkillByName('plain', undefined, skillId, req.user!.id);

    await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [skillId],
        manualSkills: ['plain'],
      },
      { ...db, listSkillsByAccess: emptyListSkillsByAccess, getSkillByName },
    );

    expect(loadTools).toHaveBeenCalledTimes(1);
    expect(loadTools.mock.calls[0][0].tools).toEqual(['web_search']);
  });

  it('skips extras already on the agent (agent baseline wins; no double-loading)', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    agent.tools = ['web_search', 'execute_code'];
    const { Types } = await import('mongoose');
    const skillId = new Types.ObjectId();

    const getSkillByName = buildGetSkillByName(
      'overlap',
      ['web_search', 'read_file'], // web_search overlaps; read_file is new
      skillId,
      req.user!.id,
    );

    await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [skillId],
        manualSkills: ['overlap'],
      },
      { ...db, listSkillsByAccess: emptyListSkillsByAccess, getSkillByName },
    );

    /* web_search is on the agent — not duplicated; only read_file is "extra". */
    expect(loadTools.mock.calls[0][0].tools).toEqual(['web_search', 'execute_code', 'read_file']);
  });

  it('retries loadTools without extras when the union call returns undefined (production loaders swallow errors)', async () => {
    /* Production loaders (`createToolLoader` in `initialize.js`,
       `openai.js`, `responses.js`) wrap `loadAgentTools` in try/catch
       and return `undefined` on failure. Without explicit handling we'd
       fall through to the empty fallback and silently drop the agent's
       baseline tools. This test pins the retry-on-undefined behavior. */
    const { agent, req, res, loadTools, db } = createMocks();
    agent.tools = ['web_search'];
    const { Types } = await import('mongoose');
    const skillId = new Types.ObjectId();

    let call = 0;
    loadTools.mockImplementation(async ({ tools }: { tools: string[] }) => {
      call += 1;
      if (call === 1) {
        return undefined; // simulate swallowed error in createToolLoader
      }
      return {
        tools: [],
        toolContextMap: {},
        userMCPAuthMap: undefined,
        toolRegistry: undefined,
        toolDefinitions: tools.map((name) => ({ name, description: '', parameters: {} })),
        hasDeferredTools: false,
        actionsEnabled: undefined,
      };
    });

    const getSkillByName = buildGetSkillByName(
      'silent-fail-skill',
      ['mcp__broken__tool'],
      skillId,
      req.user!.id,
    );

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [skillId],
        manualSkills: ['silent-fail-skill'],
      },
      { ...db, listSkillsByAccess: emptyListSkillsByAccess, getSkillByName },
    );

    /* Two calls: union first (returned undefined → silent fail), then
       base-only retry (succeeded). Agent's web_search survives. */
    expect(loadTools).toHaveBeenCalledTimes(2);
    expect(loadTools.mock.calls[0][0].tools).toEqual(['web_search', 'mcp__broken__tool']);
    expect(loadTools.mock.calls[1][0].tools).toEqual(['web_search']);

    const definedNames = result.toolDefinitions?.map((d) => d.name) ?? [];
    expect(definedNames).toContain('web_search');
    expect(definedNames).not.toContain('mcp__broken__tool');
  });

  it('retries loadTools without extras when the union call throws (agent tools must still load)', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    agent.tools = ['web_search'];
    const { Types } = await import('mongoose');
    const skillId = new Types.ObjectId();

    /* First call (with extras) fails; second call (without extras) succeeds. */
    let call = 0;
    loadTools.mockImplementation(async ({ tools }: { tools: string[] }) => {
      call += 1;
      if (call === 1) {
        throw new Error('MCP connection failed for skill-added tool');
      }
      return {
        tools: [],
        toolContextMap: {},
        userMCPAuthMap: undefined,
        toolRegistry: undefined,
        toolDefinitions: tools.map((name) => ({ name, description: '', parameters: {} })),
        hasDeferredTools: false,
        actionsEnabled: undefined,
      };
    });

    const getSkillByName = buildGetSkillByName(
      'bad-tool-skill',
      ['mcp__broken__tool'],
      skillId,
      req.user!.id,
    );

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [skillId],
        manualSkills: ['bad-tool-skill'],
      },
      { ...db, listSkillsByAccess: emptyListSkillsByAccess, getSkillByName },
    );

    /* Two calls: union first (threw), then base-only retry (succeeded). */
    expect(loadTools).toHaveBeenCalledTimes(2);
    expect(loadTools.mock.calls[0][0].tools).toEqual(['web_search', 'mcp__broken__tool']);
    expect(loadTools.mock.calls[1][0].tools).toEqual(['web_search']);

    /* Agent's own tool survives; the broken extra is silently dropped. */
    const definedNames = result.toolDefinitions?.map((d) => d.name) ?? [];
    expect(definedNames).toContain('web_search');
    expect(definedNames).not.toContain('mcp__broken__tool');
  });

  it('falls through to empty toolDefinitions when BOTH the union and base-only loadTools calls return undefined', async () => {
    /* Worst-case silent-failure path: production loaders catch errors
       and return undefined. If the agent's own tools fail to load AND
       the retry without extras also fails, we have nothing to give the
       LLM. The current behavior is to fall through to the `?? {}`
       fallback rather than throw — pinning that contract here so the
       turn doesn't crash hard but the agent simply has no tools. */
    const { agent, req, res, loadTools, db } = createMocks();
    agent.tools = ['web_search'];
    const { Types } = await import('mongoose');
    const skillId = new Types.ObjectId();

    /* Both calls (with extras + without extras) silently return undefined. */
    loadTools.mockResolvedValue(undefined);

    const getSkillByName = buildGetSkillByName(
      'broken-skill',
      ['some-tool'],
      skillId,
      req.user!.id,
    );

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [skillId],
        manualSkills: ['broken-skill'],
      },
      { ...db, listSkillsByAccess: emptyListSkillsByAccess, getSkillByName },
    );

    /* Two attempts (initial + retry), both undefined → empty fallback.
       The agent gets no tool definitions for the turn but does NOT
       crash; downstream code handles the empty case. */
    expect(loadTools).toHaveBeenCalledTimes(2);
    expect(result.toolDefinitions).toEqual([]);
  });

  it('propagates the error when loadTools fails AND there are no skill-added extras to drop', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    agent.tools = ['web_search'];
    /* No skills, no extras — a thrown loadTools is the agent's own problem,
       not ours to absorb. */
    loadTools.mockRejectedValueOnce(new Error('agent tool registry corrupted'));

    await expect(
      initializeAgent(
        {
          req,
          res,
          agent,
          loadTools,
          endpointOption: { endpoint: EModelEndpoint.agents },
          allowedProviders: new Set([Providers.OPENAI]),
          isInitialAgent: true,
          accessibleSkillIds: undefined,
        },
        db,
      ),
    ).rejects.toThrow('agent tool registry corrupted');
    expect(loadTools).toHaveBeenCalledTimes(1);
  });

  it('does not invoke loadTools twice when the agent has no tools and the skill adds none', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    agent.tools = [];
    const { Types } = await import('mongoose');
    const skillId = new Types.ObjectId();

    const getSkillByName = buildGetSkillByName('plain', [], skillId, req.user!.id);

    await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        accessibleSkillIds: [skillId],
        manualSkills: ['plain'],
      },
      { ...db, listSkillsByAccess: emptyListSkillsByAccess, getSkillByName },
    );

    expect(loadTools).toHaveBeenCalledTimes(1);
    expect(loadTools.mock.calls[0][0].tools).toEqual([]);
  });
});

describe('initializeAgent — execute_code capability expansion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('expands execute_code into bash_tool + read_file when codeEnvAvailable=true', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    agent.tools = ['execute_code'];

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        codeEnvAvailable: true,
      },
      db,
    );

    const names = (result.toolDefinitions ?? []).map((d) => d.name);
    expect(names).toContain('bash_tool');
    expect(names).toContain('read_file');
    /* The legacy `execute_code` tool def is no longer registered by this
       path — the string stays in `agent.tools` as the capability trigger
       but never appears in the tool definitions the LLM sees. */
    expect(names).not.toContain('execute_code');
  });

  it('does not register bash_tool + read_file when codeEnvAvailable=false', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    agent.tools = ['execute_code'];

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        codeEnvAvailable: false,
      },
      db,
    );

    const names = (result.toolDefinitions ?? []).map((d) => d.name);
    expect(names).not.toContain('bash_tool');
    expect(names).not.toContain('read_file');
  });

  it('does not register bash_tool + read_file when agent does not request execute_code', async () => {
    const { agent, req, res, loadTools, db } = createMocks();
    agent.tools = ['web_search'];

    const result = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        endpointOption: { endpoint: EModelEndpoint.agents },
        allowedProviders: new Set([Providers.OPENAI]),
        isInitialAgent: true,
        codeEnvAvailable: true,
      },
      db,
    );

    const names = (result.toolDefinitions ?? []).map((d) => d.name);
    expect(names).not.toContain('bash_tool');
    expect(names).not.toContain('read_file');
  });

  it('trips GOOGLE_TOOL_CONFLICT on Google/Vertex when execute_code expands alongside provider tools', async () => {
    /* Pre-Phase 8, an `execute_code`-only agent on Google/Vertex with
       `options.tools` populated would throw GOOGLE_TOOL_CONFLICT because
       `CodeExecutionToolDefinition` populated `toolDefinitions` and
       `hasAgentTools` was true. After dropping that registry entry, the
       check is now gated on the runtime-expanded `bash_tool` + `read_file`
       pair — so the expansion MUST happen before `hasAgentTools` is
       computed or the guard silently goes away for this scenario. */
    const { agent, req, res, loadTools, db } = createMocks({
      provider: Providers.GOOGLE,
      overrideProvider: Providers.GOOGLE,
    });
    agent.tools = ['execute_code'];

    /* Surface an options.tools array from the provider config — this is
       the `google_search` / `url_context` built-in LLM tooling that
       Google/Vertex exposes via provider options. */
    mockGetProviderConfig.mockReturnValue({
      getOptions: jest.fn().mockResolvedValue({
        llmConfig: { model: 'test-model', maxTokens: 4096 },
        tools: [{ google_search: {} }],
      } satisfies InitializeResultBase),
      overrideProvider: Providers.GOOGLE,
    });

    await expect(
      initializeAgent(
        {
          req,
          res,
          agent,
          loadTools,
          endpointOption: { endpoint: EModelEndpoint.agents },
          allowedProviders: new Set([Providers.GOOGLE]),
          isInitialAgent: true,
          codeEnvAvailable: true,
        },
        db,
      ),
    ).rejects.toThrow(/google_tool_conflict/);
  });
});
