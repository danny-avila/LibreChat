import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { TokenomicsDeps } from './pricing';

const mockCacheGet = jest.fn();
jest.mock('~/cache', () => ({
  tokenConfigCache: jest.fn(() => ({ get: (key: string) => mockCacheGet(key) })),
}));

import { resolveTokenConfigMap } from './tokenConfig';

const deps: TokenomicsDeps = {
  getValueKey: () => 'value-key',
  getMultiplier: ({ tokenType }) => (tokenType === 'prompt' ? 5 : 15),
  getCacheMultiplier: () => null,
};

function appConfigWith(custom: unknown[], contextCost = true): AppConfig {
  return {
    interfaceConfig: { contextCost },
    endpoints: { [EModelEndpoint.custom]: custom },
  } as unknown as AppConfig;
}

describe('resolveTokenConfigMap', () => {
  beforeEach(() => mockCacheGet.mockReset().mockResolvedValue(null));

  it('uses a static tokenConfig override without consulting the cache', async () => {
    const appConfig = appConfigWith([
      {
        name: 'MyProxy',
        tokenConfig: { 'custom-model': { prompt: 1.5, completion: 4.5, context: 32000 } },
      },
    ]);

    const map = await resolveTokenConfigMap(
      { appConfig, modelsConfig: { MyProxy: ['custom-model'] }, userId: 'user-1' },
      deps,
    );

    expect(map.MyProxy['custom-model']).toEqual({ context: 32000, prompt: 1.5, completion: 4.5 });
    expect(mockCacheGet).not.toHaveBeenCalled();
  });

  it('falls back to the cached fetched config when no static override exists', async () => {
    mockCacheGet.mockResolvedValue({ 'custom-model': { prompt: 2, completion: 6, context: 8000 } });
    const appConfig = appConfigWith([{ name: 'MyProxy', models: { fetch: true } }]);

    const map = await resolveTokenConfigMap(
      { appConfig, modelsConfig: { MyProxy: ['custom-model'] }, userId: 'user-1' },
      deps,
    );

    expect(mockCacheGet).toHaveBeenCalled();
    expect(map.MyProxy['custom-model'].context).toBe(8000);
    expect(map.MyProxy['custom-model'].prompt).toBe(2);
  });

  it('omits pricing when contextCost is disabled', async () => {
    const appConfig = appConfigWith(
      [
        {
          name: 'MyProxy',
          tokenConfig: { 'custom-model': { prompt: 1.5, completion: 4.5, context: 32000 } },
        },
      ],
      false,
    );

    const map = await resolveTokenConfigMap(
      { appConfig, modelsConfig: { MyProxy: ['custom-model'] }, userId: 'user-1' },
      deps,
    );

    expect(map.MyProxy['custom-model'].context).toBe(32000);
    expect(map.MyProxy['custom-model'].prompt).toBeUndefined();
    expect(map.MyProxy['custom-model'].completion).toBeUndefined();
  });
});
