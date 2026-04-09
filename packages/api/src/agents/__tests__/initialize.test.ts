import { Providers } from '@librechat/agents';
import { EModelEndpoint } from 'librechat-data-provider';
import type { Agent } from 'librechat-data-provider';
import type { ServerRequest, InitializeResultBase, EndpointTokenConfig } from '~/types';
import type { InitializeAgentDbMethods } from '../initialize';

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

    // 0 is not used as-is; the formula kicks in.
    // optionalChainWithEmptyCheck(0, 200000, 18000) returns 0 (not null/undefined),
    // then Number(0) || 18000 = 18000 (the fallback default).
    expect(result.maxContextTokens).not.toBe(0);
    const expected = Math.round((18000 - maxOutputTokens) * 0.95);
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
