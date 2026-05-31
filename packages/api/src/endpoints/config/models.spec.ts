import type { AppConfig } from '@librechat/data-schemas';
import { EModelEndpoint } from 'librechat-data-provider';

import { createLoadConfigModels } from './models';
import type { ServerRequest } from '~/types';

describe('createLoadConfigModels', () => {
  const originalEnv = process.env;
  const getUserKeyValues = jest.fn();
  const fetchModels = jest.fn();

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MULTIPLE_MODELS: 'gpt-4o-mini, gpt-4o',
      SINGLE_MODEL: 'gpt-4.1',
    };

    getUserKeyValues.mockReset();
    fetchModels.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function buildAppConfig(includeFetch = false): AppConfig {
    return {
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'custom',
            apiKey: 'test-api-key',
            baseURL: 'https://example.com',
            models: {
              default: ['${MULTIPLE_MODELS}', { name: '${SINGLE_MODEL}' }, 'claude-3-5-sonnet'],
              ...(includeFetch ? { fetch: true } : {}),
            },
          },
        ],
      },
    } as AppConfig;
  }

  function buildLoader(includeFetch = false) {
    return createLoadConfigModels({
      getAppConfig: async () => buildAppConfig(includeFetch),
      getUserKeyValues,
      fetchModels,
    });
  }

  it('expands comma-separated env vars in default model lists', async () => {
    const loadConfigModels = buildLoader(false);

    const result = await loadConfigModels({} as ServerRequest);

    expect(result.custom).toEqual(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'claude-3-5-sonnet']);
    expect(fetchModels).not.toHaveBeenCalled();
  });

  it('uses the same expansion when falling back after a fetch miss', async () => {
    const loadConfigModels = buildLoader(true);

    const result = await loadConfigModels({} as ServerRequest);

    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(result.custom).toEqual(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'claude-3-5-sonnet']);
  });
});
