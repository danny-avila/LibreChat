import { Providers } from '@librechat/agents';
import { EModelEndpoint } from 'librechat-data-provider';
import type { BamlFunctionSet } from '@librechat/agents/baml';
import type { TEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';

const mockCreateBamlFunctions = jest.fn();
jest.mock('~/baml/loader', () => ({
  createBamlFunctions: (clientName: string) => mockCreateBamlFunctions(clientName),
}));

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
jest.mock('~/cache', () => ({
  tokenConfigCache: jest.fn(() => ({
    get: (key: string) => mockCacheGet(key),
    set: (key: string, value: unknown) => mockCacheSet(key, value),
  })),
}));

const mockGetOpenAIConfig = jest.fn();
jest.mock('~/endpoints/openai/config', () => ({
  getOpenAIConfig: (...args: unknown[]) => mockGetOpenAIConfig(...args),
}));

const mockFetchModels = jest.fn();
jest.mock('~/endpoints/models', () => ({
  fetchModels: (...args: unknown[]) => mockFetchModels(...args),
}));

const mockValidateEndpointURL = jest.fn().mockResolvedValue(undefined);
jest.mock('~/auth', () => ({
  validateEndpointURL: (...args: unknown[]) => mockValidateEndpointURL(...args),
}));

import { initializeCustom, shouldReadFetchedTokenConfig } from '~/endpoints/custom/initialize';
import { getProviderConfig } from '~/endpoints/config/providers';
import { isBamlInitializeResult } from '~/types';

/**
 * Behaviors 1.3 and 1.4 — BAML initialization runs before every generic custom
 * side effect, and cost/context lookup keys off the exact logical client name.
 */

const functionSet = { version: 1, declaredTools: [] } as unknown as BamlFunctionSet;

const bamlEndpointConfig = (overrides: Partial<TEndpoint> = {}) =>
  ({
    name: 'Team-BAML',
    provider: Providers.BAML,
    models: { default: ['OpenRouter', 'OpenRouterFast'], fetch: false },
    ...overrides,
  }) as unknown as TEndpoint;

const appConfigWith = (custom: TEndpoint[]) =>
  ({ endpoints: { [EModelEndpoint.custom]: custom } }) as unknown as AppConfig;

const initParams = (appConfig: AppConfig, endpoint: string, model: string) => ({
  req: { user: { id: 'user-1' }, body: {}, config: appConfig } as unknown as ServerRequest,
  endpoint,
  model_parameters: { model },
  db: { getUserKey: jest.fn(), getUserKeyValues: jest.fn() },
});

const staticTokenConfig = {
  OpenRouter: { context: 131072, prompt: 0.03, completion: 0.17 },
  OpenRouterFast: { context: 131072, prompt: 0.03, completion: 0.13 },
};

describe('BAML custom initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateBamlFunctions.mockResolvedValue(functionSet);
  });

  it('calls the lazy BAML initializer and returns the BAML provider', async () => {
    const appConfig = appConfigWith([bamlEndpointConfig()]);

    const result = await initializeCustom(initParams(appConfig, 'Team-BAML', 'OpenRouterFast'));

    expect(mockCreateBamlFunctions).toHaveBeenCalledWith('OpenRouterFast');
    expect(result.provider).toBe(Providers.BAML);
    expect(isBamlInitializeResult(result)).toBe(true);
  });

  it('separates the executable port from the declarative config', async () => {
    const appConfig = appConfigWith([bamlEndpointConfig()]);

    const result = await initializeCustom(initParams(appConfig, 'Team-BAML', 'OpenRouter'));

    expect(result.llmConfig).toEqual({ model: 'OpenRouter' });
    expect(result.llmConfig).not.toHaveProperty('functions');
    expect(isBamlInitializeResult(result) && result.runtimeOptions.functions).toBe(functionSet);
  });

  it('never calls generic credential, URL, fetch, or OpenAI construction', async () => {
    const appConfig = appConfigWith([bamlEndpointConfig()]);
    const params = initParams(appConfig, 'Team-BAML', 'OpenRouter');

    await initializeCustom(params);

    expect(params.db.getUserKeyValues).not.toHaveBeenCalled();
    expect(mockValidateEndpointURL).not.toHaveBeenCalled();
    expect(mockFetchModels).not.toHaveBeenCalled();
    expect(mockGetOpenAIConfig).not.toHaveBeenCalled();
  });

  it('rejects when no model was selected', async () => {
    const appConfig = appConfigWith([bamlEndpointConfig()]);
    const params = initParams(appConfig, 'Team-BAML', '');

    await expect(initializeCustom(params)).rejects.toThrow(/A BAML model must be selected/);
    expect(mockCreateBamlFunctions).not.toHaveBeenCalled();
  });

  it('initializes an allow-listed but uncompiled client normally', async () => {
    const appConfig = appConfigWith([
      bamlEndpointConfig({ models: { default: ['NotCompiled'] } } as Partial<TEndpoint>),
    ]);

    const result = await initializeCustom(initParams(appConfig, 'Team-BAML', 'NotCompiled'));

    expect(mockCreateBamlFunctions).toHaveBeenCalledWith('NotCompiled');
    expect(result.llmConfig).toEqual({ model: 'NotCompiled' });
  });

  describe('token configuration', () => {
    it('propagates the exact logical-client token map', async () => {
      const appConfig = appConfigWith([bamlEndpointConfig({ tokenConfig: staticTokenConfig })]);

      const result = await initializeCustom(initParams(appConfig, 'Team-BAML', 'OpenRouterFast'));

      expect(result.endpointTokenConfig).toEqual(staticTokenConfig);
      expect(result.endpointTokenConfig?.OpenRouter.prompt).toBe(0.03);
      expect(result.endpointTokenConfig?.OpenRouterFast.prompt).toBe(0.03);
    });

    it('has no entry for a case-mismatched key', async () => {
      const appConfig = appConfigWith([bamlEndpointConfig({ tokenConfig: staticTokenConfig })]);

      const result = await initializeCustom(initParams(appConfig, 'Team-BAML', 'openrouter'));

      expect(result.endpointTokenConfig?.openrouter).toBeUndefined();
    });

    it('returns no map and performs zero cache reads or writes without tokenConfig', async () => {
      const appConfig = appConfigWith([bamlEndpointConfig()]);

      const result = await initializeCustom(initParams(appConfig, 'Team-BAML', 'OpenRouter'));

      expect(result.endpointTokenConfig).toBeUndefined();
      expect(mockCacheGet).not.toHaveBeenCalled();
      expect(mockCacheSet).not.toHaveBeenCalled();
    });

    it('gates fetched-token-config reads off for BAML and for static config', () => {
      expect(shouldReadFetchedTokenConfig(bamlEndpointConfig(), 'Team-BAML')).toBe(false);
      expect(
        shouldReadFetchedTokenConfig(
          bamlEndpointConfig({ tokenConfig: staticTokenConfig }),
          'Team-BAML',
        ),
      ).toBe(false);
      expect(
        shouldReadFetchedTokenConfig(
          { name: 'OpenRouter', tokenConfig: staticTokenConfig } as unknown as TEndpoint,
          'openrouter',
        ),
      ).toBe(false);
    });

    it('still allows a fetched read for a known fetch-token endpoint without static config', () => {
      expect(
        shouldReadFetchedTokenConfig({ name: 'OpenRouter' } as unknown as TEndpoint, 'openrouter'),
      ).toBe(true);
    });
  });

  describe('provider re-entry', () => {
    const appConfig = appConfigWith([bamlEndpointConfig()]);

    it('resolves the BAML provider when reached by endpoint name', () => {
      const config = getProviderConfig({ provider: 'Team-BAML', appConfig });

      expect(config.overrideProvider).toBe(Providers.BAML);
      expect(config.customEndpointConfig?.name).toBe('Team-BAML');
    });

    it('retains the BAML initializer on re-entry with runtime provider plus endpoint', () => {
      const config = getProviderConfig({
        provider: Providers.BAML,
        endpoint: 'Team-BAML',
        appConfig,
      });

      expect(config.overrideProvider).toBe(Providers.BAML);
      expect(config.customEndpointConfig?.name).toBe('Team-BAML');
    });

    it('fails explicitly on literal baml without endpoint identity, with no OpenAI fallback', () => {
      expect(() => getProviderConfig({ provider: Providers.BAML, appConfig })).toThrow(
        /requires the original custom endpoint name/,
      );
    });

    it('fails explicitly when the named endpoint is not a BAML endpoint', () => {
      const mixed = appConfigWith([
        bamlEndpointConfig(),
        {
          name: 'Proxy',
          apiKey: 'sk-x',
          baseURL: 'https://x/v1',
          models: { default: ['gpt-4o'] },
        } as unknown as TEndpoint,
      ]);

      expect(() =>
        getProviderConfig({ provider: Providers.BAML, endpoint: 'Proxy', appConfig: mixed }),
      ).toThrow(/is not a BAML endpoint/);
    });
  });
});
