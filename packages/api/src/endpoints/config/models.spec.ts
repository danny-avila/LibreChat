import { AuthType, EModelEndpoint } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';
import { SCOPED_TOKEN_CONFIG_KEY_PREFIX } from '../keys';
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

  it('tenant-scopes the fetched token config cache key for system-defined endpoints', async () => {
    const loadConfigModels = createLoadConfigModels({
      getAppConfig: jest.fn().mockResolvedValue(
        buildAppConfig({
          baseURL: 'https://admin-trusted.example.com/v1',
          apiKey: 'sk-system-key',
        }),
      ),
      getUserKeyValues: jest.fn(),
      fetchModels,
    });

    const req = {
      user: { id: 'user-1', tenantId: 'tenant-a' },
      config: undefined,
    } as unknown as ServerRequest;

    await loadConfigModels(req);

    expect(fetchModels).toHaveBeenCalledTimes(1);
    const tokenKey = fetchModels.mock.calls[0][0].tokenKey;
    expect(fetchModels.mock.calls[0][0].name).toBe('TestProxy');
    expect(tokenKey.startsWith(SCOPED_TOKEN_CONFIG_KEY_PREFIX)).toBe(true);
    expect(tokenKey).not.toBe('tenant:tenant-a:TestProxy');
    expect(tokenKey).not.toContain('tenant-a');
    expect(tokenKey).not.toContain('TestProxy');
  });
});

describe('createLoadConfigModels – in-request fetch coalescing', () => {
  const fetchModels = jest.fn().mockResolvedValue([]);

  beforeEach(() => {
    fetchModels.mockReset().mockResolvedValue([]);
  });

  it('does NOT coalesce two endpoints with the same baseURL+apiKey but different headers', async () => {
    const loadConfigModels = createLoadConfigModels({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.custom]: [
            {
              name: 'TenantA',
              baseURL: 'https://shared-proxy.example.com/v1',
              apiKey: 'sk-shared',
              models: { fetch: true },
              headers: { 'X-Tenant': 'a' },
            },
            {
              name: 'TenantB',
              baseURL: 'https://shared-proxy.example.com/v1',
              apiKey: 'sk-shared',
              models: { fetch: true },
              headers: { 'X-Tenant': 'b' },
            },
          ],
        },
      }),
      getUserKeyValues: jest.fn(),
      fetchModels,
    });

    const req = {
      user: { id: 'user-1' },
      config: undefined,
    } as unknown as ServerRequest;

    await loadConfigModels(req);

    expect(fetchModels).toHaveBeenCalledTimes(2);
    const headersByName = new Map<string, Record<string, string> | undefined>();
    for (const call of fetchModels.mock.calls) {
      headersByName.set(call[0].name, call[0].headers);
    }
    expect(headersByName.get('TenantA')).toEqual({ 'X-Tenant': 'a' });
    expect(headersByName.get('TenantB')).toEqual({ 'X-Tenant': 'b' });
  });

  it('still coalesces two endpoints that share baseURL+apiKey AND identical headers', async () => {
    const sharedHeaders = { Authorization: 'Bearer {{LIBRECHAT_OPENID_ID_TOKEN}}' };
    const loadConfigModels = createLoadConfigModels({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.custom]: [
            {
              name: 'AliasOne',
              baseURL: 'https://shared-proxy.example.com/v1',
              apiKey: 'sk-shared',
              models: { fetch: true },
              headers: sharedHeaders,
            },
            {
              name: 'AliasTwo',
              baseURL: 'https://shared-proxy.example.com/v1',
              apiKey: 'sk-shared',
              models: { fetch: true },
              headers: sharedHeaders,
            },
          ],
        },
      }),
      getUserKeyValues: jest.fn(),
      fetchModels,
    });

    const req = {
      user: { id: 'user-1' },
      config: undefined,
    } as unknown as ServerRequest;

    await loadConfigModels(req);

    // Same baseURL + apiKey + headers → one fetch shared across both endpoints.
    expect(fetchModels).toHaveBeenCalledTimes(1);
  });
});
