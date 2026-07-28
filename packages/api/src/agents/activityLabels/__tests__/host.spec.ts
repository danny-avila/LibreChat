import type { AppConfig } from '@librechat/data-schemas';
import type { EndpointDbMethods, ServerRequest } from '~/types';
import {
  mapCollectedMetadataToUsage,
  resolveActivityConfig,
  resolveActivityLabelModel,
} from '../host';

const mockGetOptions = jest.fn(async (_params: unknown) => ({
  llmConfig: { model: 'resolved' },
}));
jest.mock('~/endpoints/config/providers', () => ({
  getProviderConfig: jest.fn(() => ({
    getOptions: (params: unknown) => mockGetOptions(params),
    customEndpointConfig: undefined,
  })),
}));
jest.mock('~/utils/headers', () => ({ resolveConfigHeaders: jest.fn() }));
jest.mock('~/utils/env', () => ({ createSafeUser: jest.fn(() => undefined) }));

const appConfig = (endpoints: Record<string, unknown>): AppConfig =>
  ({ endpoints }) as unknown as AppConfig;

describe('resolveActivityConfig', () => {
  it('is disabled when nothing is configured', () => {
    expect(resolveActivityConfig(undefined, 'openAI').enabled).toBe(false);
    expect(resolveActivityConfig(appConfig({}), 'openAI').enabled).toBe(false);
  });

  it('reads the named endpoint block', () => {
    const config = resolveActivityConfig(
      appConfig({
        openAI: {
          activityLabel: true,
          activityModel: 'gpt-4o-mini',
          activityPrompt: 'custom',
          activityMaxPerRun: 5,
          activityCharLimit: 200,
        },
      }),
      'openAI',
    );
    expect(config).toMatchObject({
      enabled: true,
      model: 'gpt-4o-mini',
      prompt: 'custom',
      maxPerRun: 5,
      charLimit: 200,
    });
  });

  it('lets endpoints.all win over the named endpoint, like the title options', () => {
    const config = resolveActivityConfig(
      appConfig({
        all: { activityLabel: true, activityModel: 'shared-model' },
        openAI: { activityLabel: false, activityModel: 'ignored' },
      }),
      'openAI',
    );
    expect(config.enabled).toBe(true);
    expect(config.model).toBe('shared-model');
  });

  it('falls back to a custom endpoint config when the name is absent', () => {
    const config = resolveActivityConfig(appConfig({}), 'MyProxy', {
      activityLabel: true,
      activityModel: 'proxy-mini',
    });
    expect(config.enabled).toBe(true);
    expect(config.model).toBe('proxy-mini');
  });

  it('treats a missing activityLabel flag as opt-out even with other fields set', () => {
    const config = resolveActivityConfig(
      appConfig({ openAI: { activityModel: 'gpt-4o-mini' } }),
      'openAI',
    );
    expect(config.enabled).toBe(false);
    expect(config.model).toBe('gpt-4o-mini');
  });

  /** `initializeAgent` rewrites `agent.endpoint` to the backing provider, so
   *  the PUBLIC endpoint's block (`endpoints.agents`) must still be honored
   *  — it inherits every activity field via `agentsEndpointSchema`. */
  it('honors the public agents endpoint when the agent endpoint was rewritten', () => {
    const config = resolveActivityConfig(
      appConfig({ agents: { activityLabel: true, activityModel: 'agents-mini' } }),
      'openAI',
      undefined,
      'agents',
    );
    expect(config.enabled).toBe(true);
    expect(config.model).toBe('agents-mini');
  });

  it('lets the public endpoint win per field over the backing provider', () => {
    const config = resolveActivityConfig(
      appConfig({
        agents: { activityModel: 'agents-mini' },
        openAI: { activityLabel: true, activityModel: 'provider-mini', activityMaxPerRun: 3 },
      }),
      'openAI',
      undefined,
      'agents',
    );
    /** Field-wise: model from `agents`, the rest falls through to `openAI`. */
    expect(config.enabled).toBe(true);
    expect(config.model).toBe('agents-mini');
    expect(config.maxPerRun).toBe(3);
  });

  it('keeps endpoints.all above the public endpoint', () => {
    const config = resolveActivityConfig(
      appConfig({
        all: { activityModel: 'shared-model' },
        agents: { activityLabel: true, activityModel: 'agents-mini' },
      }),
      'openAI',
      undefined,
      'agents',
    );
    expect(config.model).toBe('shared-model');
  });
});

describe('resolveActivityLabelModel model precedence', () => {
  const db = {} as EndpointDbMethods;
  const resolve = (endpointConfig: Record<string, unknown>) =>
    resolveActivityLabelModel({
      req: { config: appConfig({ openAI: endpointConfig }) } as unknown as ServerRequest,
      agent: { endpoint: 'openAI', model_parameters: { model: 'run-model' } },
      ids: {},
      db,
    });

  beforeEach(() => {
    mockGetOptions.mockClear();
  });

  /** An EXPLICIT `activityModel: current_model` names the run model — a
   *  configured `titleModel` must not shadow it via the fallback chain. */
  it('resolves an explicit current_model sentinel to the run model over titleModel', async () => {
    await resolve({ activityLabel: true, activityModel: 'current_model', titleModel: 'haiku' });
    expect(mockGetOptions).toHaveBeenCalledWith(
      expect.objectContaining({ model_parameters: { model: 'run-model' } }),
    );
  });

  it('falls back to titleModel only when activityModel is absent', async () => {
    await resolve({ activityLabel: true, titleModel: 'haiku' });
    expect(mockGetOptions).toHaveBeenCalledWith(
      expect.objectContaining({ model_parameters: { model: 'haiku' } }),
    );
  });

  it('prefers an explicit activityModel over everything', async () => {
    await resolve({ activityLabel: true, activityModel: 'label-model', titleModel: 'haiku' });
    expect(mockGetOptions).toHaveBeenCalledWith(
      expect.objectContaining({ model_parameters: { model: 'label-model' } }),
    );
  });
});

describe('mapCollectedMetadataToUsage cache tokens', () => {
  it('carries Anthropic raw cache fields as normalized details', () => {
    const [usage] = mapCollectedMetadataToUsage([
      {
        usage: {
          input_tokens: 100,
          output_tokens: 9,
          cache_read_input_tokens: 80,
          cache_creation_input_tokens: 10,
        },
      },
    ]);
    expect(usage).toEqual({
      input_tokens: 100,
      output_tokens: 9,
      input_token_details: { cache_read: 80, cache_creation: 10 },
    });
  });

  it('maps OpenAI cached_tokens to cache_read', () => {
    const [usage] = mapCollectedMetadataToUsage([
      {
        usage: {
          prompt_tokens: 50,
          completion_tokens: 7,
          prompt_tokens_details: { cached_tokens: 40 },
        },
      },
    ]);
    expect(usage.input_token_details).toEqual({ cache_read: 40, cache_creation: undefined });
  });

  it('passes through LangChain-standard input_token_details', () => {
    const [usage] = mapCollectedMetadataToUsage([
      {
        usage_metadata: {
          input_tokens: 30,
          output_tokens: 5,
          input_token_details: { cache_read: 20, cache_creation: 4 },
        },
      },
    ]);
    expect(usage.input_token_details).toEqual({ cache_read: 20, cache_creation: 4 });
  });

  it('omits the details object entirely when no cache tokens are reported', () => {
    const [usage] = mapCollectedMetadataToUsage([
      { usage: { input_tokens: 10, output_tokens: 2 } },
    ]);
    expect(usage).toEqual({ input_tokens: 10, output_tokens: 2 });
    expect('input_token_details' in usage).toBe(false);
  });
});
