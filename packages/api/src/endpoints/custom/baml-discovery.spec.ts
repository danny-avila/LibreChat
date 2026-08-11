import { EModelEndpoint, Providers } from 'librechat-data-provider';
import type { TCustomEndpoints, TEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
jest.mock('~/cache', () => ({
  tokenConfigCache: jest.fn(() => ({
    get: (key: string) => mockCacheGet(key),
    set: (key: string, value: unknown) => mockCacheSet(key, value),
  })),
}));

const mockValidateEndpointURL = jest.fn().mockResolvedValue(undefined);
jest.mock('~/auth', () => ({
  validateEndpointURL: (...args: unknown[]) => mockValidateEndpointURL(...args),
}));

import { loadCustomEndpointsConfig } from '~/endpoints/custom/config';
import { createLoadConfigModels } from '~/endpoints/config/models';

/**
 * Behavior 1.2 — discovery is provider-aware and side-effect free.
 *
 * Two ARBITRARILY named endpoints, because nothing downstream may key off a
 * magic display name: the endpoint name is admin-chosen and the only identity
 * that gets persisted.
 */

const bamlEndpoint = (name: string, models: TEndpoint['models']['default']) =>
  ({
    name,
    provider: Providers.BAML,
    models: { default: models, fetch: false },
  }) as unknown as TEndpoint;

const appConfigWith = (custom: TEndpoint[]) =>
  ({ endpoints: { [EModelEndpoint.custom]: custom } }) as unknown as AppConfig;

const requestFor = (config: AppConfig, userId = 'user-1') =>
  ({ user: { id: userId }, config }) as unknown as ServerRequest;

describe('BAML endpoint discovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes credential-free BAML endpoints under their arbitrary names', () => {
    const config = loadCustomEndpointsConfig([
      bamlEndpoint('Team-BAML', ['OpenRouter', 'OpenRouterFast']),
      bamlEndpoint('Skunkworks [v2]', [{ name: 'OpenRouter' }]),
    ] as unknown as TCustomEndpoints);

    for (const name of ['Team-BAML', 'Skunkworks [v2]']) {
      expect(config?.[name]).toEqual({
        type: EModelEndpoint.custom,
        userProvide: false,
        userProvideURL: false,
        customParams: { defaultParamsEndpoint: Providers.BAML },
        modelDisplayLabel: undefined,
        iconURL: undefined,
      });
    }
  });

  it('normalizes an explicit custom defaultParamsEndpoint to baml', () => {
    const endpoint = bamlEndpoint('Team-BAML', ['OpenRouter']);
    (endpoint as unknown as Record<string, unknown>).customParams = {
      defaultParamsEndpoint: EModelEndpoint.custom,
    };

    const config = loadCustomEndpointsConfig([endpoint] as unknown as TCustomEndpoints);

    expect(config?.['Team-BAML']?.customParams?.defaultParamsEndpoint).toBe(Providers.BAML);
  });

  it('still drops an OpenAI-compatible endpoint that has no baseURL or apiKey', () => {
    const config = loadCustomEndpointsConfig([
      { name: 'Broken', models: { default: ['gpt-4o'] } },
    ] as unknown as TCustomEndpoints);

    expect(config).toEqual({});
  });

  it('keeps publishing ordinary custom endpoints unchanged', () => {
    const config = loadCustomEndpointsConfig([
      {
        name: 'Proxy',
        apiKey: 'sk-test',
        baseURL: 'https://proxy.example.com/v1',
        models: { default: ['gpt-4o'] },
      },
    ] as unknown as TCustomEndpoints);

    expect(config?.Proxy).toMatchObject({ type: EModelEndpoint.custom, userProvide: false });
  });

  it('publishes exact client names, case preserved, from string and object forms', async () => {
    const fetchModels = jest.fn();
    const loadConfigModels = createLoadConfigModels({
      getAppConfig: jest.fn(),
      getUserKeyValues: jest.fn(),
      fetchModels,
    });

    const config = appConfigWith([
      bamlEndpoint('Team-BAML', ['OpenRouter', { name: 'OpenRouterFast' }]),
      bamlEndpoint('Second BAML', ['OpenRouter']),
    ]);

    const models = await loadConfigModels(requestFor(config));

    expect(models['Team-BAML']).toEqual(['OpenRouter', 'OpenRouterFast']);
    expect(models['Second BAML']).toEqual(['OpenRouter']);
  });

  it('performs no fetch, user-key, URL, or token-config work for BAML', async () => {
    const fetchModels = jest.fn();
    const getUserKeyValues = jest.fn();
    const loadConfigModels = createLoadConfigModels({
      getAppConfig: jest.fn(),
      getUserKeyValues,
      fetchModels,
    });

    await loadConfigModels(requestFor(appConfigWith([bamlEndpoint('Team-BAML', ['OpenRouter'])])));

    expect(fetchModels).not.toHaveBeenCalled();
    expect(getUserKeyValues).not.toHaveBeenCalled();
    expect(mockValidateEndpointURL).not.toHaveBeenCalled();
    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('publishes an allow-listed name even when it is not compiled', async () => {
    const loadConfigModels = createLoadConfigModels({
      getAppConfig: jest.fn(),
      getUserKeyValues: jest.fn(),
      fetchModels: jest.fn(),
    });

    const models = await loadConfigModels(
      requestFor(appConfigWith([bamlEndpoint('Team-BAML', ['NotCompiled'])])),
    );

    expect(models['Team-BAML']).toEqual(['NotCompiled']);
  });

  it('does not publish a BAML endpoint whose client list is empty', async () => {
    const loadConfigModels = createLoadConfigModels({
      getAppConfig: jest.fn(),
      getUserKeyValues: jest.fn(),
      fetchModels: jest.fn(),
    });

    const models = await loadConfigModels(
      requestFor(appConfigWith([bamlEndpoint('Team-BAML', [])])),
    );

    expect(models['Team-BAML']).toBeUndefined();
  });

  it('scopes discovery to the requesting tenant config', async () => {
    const loadConfigModels = createLoadConfigModels({
      getAppConfig: jest.fn(),
      getUserKeyValues: jest.fn(),
      fetchModels: jest.fn(),
    });

    const otherTenant = await loadConfigModels(requestFor(appConfigWith([]), 'user-2'));

    expect(otherTenant['Team-BAML']).toBeUndefined();
  });
});
