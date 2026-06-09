import { AuthType, EModelEndpoint } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';
import { createLoadConfigModels } from './models';

jest.mock('~/utils', () => {
  const original = jest.requireActual('~/utils');
  return {
    ...original,
    // Inline literal — jest.mock() factory may not reference imports.
    isUserProvided: (val: string) => val === 'user_provided',
  };
});

describe('createLoadConfigModels – user-provided baseURL header guard', () => {
  const fetchModels = jest.fn().mockResolvedValue([]);

  const buildAppConfig = (endpointOverrides: Record<string, unknown>) => ({
    endpoints: {
      [EModelEndpoint.custom]: [
        {
          name: 'TestProxy',
          baseURL: AuthType.USER_PROVIDED,
          apiKey: AuthType.USER_PROVIDED,
          models: { fetch: true },
          ...endpointOverrides,
        },
      ],
    },
  });

  beforeEach(() => {
    fetchModels.mockReset().mockResolvedValue([]);
  });

  it('does NOT forward configured headers when baseURL is user-provided', async () => {
    const headers = {
      Authorization: 'Bearer {{LIBRECHAT_OPENID_ID_TOKEN}}',
      'X-User-Email': '{{LIBRECHAT_USER_EMAIL}}',
    };

    const loadConfigModels = createLoadConfigModels({
      getAppConfig: jest.fn().mockResolvedValue(buildAppConfig({ headers })),
      getUserKeyValues: jest.fn().mockResolvedValue({
        apiKey: 'sk-user-key',
        baseURL: 'https://user-controlled.example.com/v1',
      }),
      fetchModels,
    });

    const req = {
      user: { id: 'user-1', email: 'user@example.com' },
      config: undefined,
    } as unknown as ServerRequest;

    await loadConfigModels(req);

    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'TestProxy',
        baseURL: 'https://user-controlled.example.com/v1',
        headers: undefined,
      }),
    );
  });

  it('DOES forward configured headers when baseURL is admin-trusted (only apiKey is user-provided)', async () => {
    const headers = {
      Authorization: 'Bearer {{LIBRECHAT_OPENID_ID_TOKEN}}',
    };

    const loadConfigModels = createLoadConfigModels({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.custom]: [
            {
              name: 'TrustedProxy',
              baseURL: 'https://admin-trusted.example.com/v1',
              apiKey: AuthType.USER_PROVIDED,
              models: { fetch: true },
              headers,
            },
          ],
        },
      }),
      getUserKeyValues: jest.fn().mockResolvedValue({
        apiKey: 'sk-user-key',
        baseURL: undefined,
      }),
      fetchModels,
    });

    const req = {
      user: { id: 'user-1' },
      config: undefined,
    } as unknown as ServerRequest;

    await loadConfigModels(req);

    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'TrustedProxy',
        baseURL: 'https://admin-trusted.example.com/v1',
        headers,
      }),
    );
  });
});
