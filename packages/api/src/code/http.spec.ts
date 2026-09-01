import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { CodeEnvironmentLimitError, CodeEnvironmentValidationError } from './environments';
import { createCodeEnvironmentHttpHandlers } from './http';

function response() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

describe('code environment HTTP handlers', () => {
  test('does not advertise principal pairing when Code API principal auth is disabled', async () => {
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.agents]: {
            statefulCodeSessions: {
              environments: [
                {
                  id: 'principal-workers',
                  name: 'Principal workers',
                  type: 'attached',
                  baseURL: 'https://code.example.com/v1',
                  owner: 'deployment',
                  pairing: { allowPrincipalWorkers: true },
                },
              ],
            },
          },
        },
      } as AppConfig),
      registry: {
        register: jest.fn(),
        listAccessible: jest.fn().mockResolvedValue([]),
        remove: jest.fn(),
      },
      principalAuthEnabled: () => false,
    });
    const res = response();

    await handlers.list(
      { user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ environments: [], controlPlanes: [] });
  });

  test('lists only principal control planes present in the caller effective policy', async () => {
    const getAppConfig = jest.fn().mockResolvedValue({
      endpoints: { [EModelEndpoint.agents]: { statefulCodeSessions: { environments: [] } } },
    } as unknown as AppConfig);
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig,
      registry: {
        register: jest.fn(),
        listAccessible: jest.fn().mockResolvedValue([]),
        remove: jest.fn(),
      },
      principalAuthEnabled: () => true,
    });
    const res = response();

    await handlers.list(
      {
        user: {
          id: '68b2f0c498f24c1e78fa0001',
          role: 'USER',
          tenantId: 'tenant-1',
        },
      } as never,
      res as never,
    );

    expect(res.body).toEqual({ environments: [], controlPlanes: [] });
    expect(getAppConfig).toHaveBeenCalledWith({
      role: 'USER',
      userId: '68b2f0c498f24c1e78fa0001',
      idOnTheSource: undefined,
      tenantId: 'tenant-1',
      failClosed: true,
    });
  });

  test('returns 400 when registration has no request body', async () => {
    const register = jest.fn();
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn(),
      registry: { register, listAccessible: jest.fn(), remove: jest.fn() },
    });
    const res = response();

    await handlers.register(
      { user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' }, body: null } as never,
      res as never,
    );

    expect(res.statusCode).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });

  test('pairs a generated worker to the authenticated user and persists its private route', async () => {
    const register = jest.fn().mockResolvedValue({
      resourceId: '68b2f0c498f24c1e78fa0111',
      id: 'code-generated',
      name: 'Personal VM',
      type: 'attached',
    });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        protocolVersion: 1,
        workerId: 'code-generated',
        code: 'a'.repeat(32),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    const appConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            allowedEnvironments: ['user'],
            environments: [
              {
                id: 'shared-code-api',
                name: 'Shared Code API',
                type: 'attached',
                baseURL: 'https://code.librechat.example/v1',
                owner: 'deployment',
                pairing: {
                  allowPrincipalWorkers: true,
                  tokenEnv: 'CODE_ADMIN_TOKEN',
                },
              },
            ],
          },
        },
      },
    } as AppConfig;
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn().mockResolvedValue(appConfig),
      registry: { register, listAccessible: jest.fn(), remove: jest.fn() },
      createEnvironmentId: () => 'code-generated',
      readSecret: jest.fn(() => 'administrator-token'),
      resolveTenantId: jest.fn(() => 'tenant-1'),
      principalAuthEnabled: jest.fn(() => true),
      principalAuthReady: jest.fn(),
      fetchImpl,
    });
    const req = {
      user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
      body: {
        name: 'Personal VM',
        controlPlaneId: 'shared-code-api',
        workerId: 'attacker-worker',
        baseURL: 'https://attacker.example',
      },
    };
    const res = response();

    await handlers.pair(req as never, res as never);

    expect(res.statusCode).toBe(201);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://code.librechat.example/v1/bridge/pairings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer administrator-token' }),
        body: JSON.stringify({
          workerId: 'code-generated',
          binding: {
            tenantId: 'tenant-1',
            principal: { type: 'user', id: '68b2f0c498f24c1e78fa0001' },
          },
        }),
      }),
    );
    expect(register).toHaveBeenCalledWith({
      actor: {
        userId: '68b2f0c498f24c1e78fa0001',
        role: 'USER',
        idOnTheSource: null,
      },
      maxOwned: 5,
      environment: {
        id: 'code-generated',
        name: 'Personal VM',
        type: 'attached' as const,
        baseURL: 'https://code.librechat.example/v1',
        workerId: 'code-generated',
        controlPlaneId: 'shared-code-api',
        revocationTokenEnv: 'CODE_ADMIN_TOKEN',
        workerPrincipal: { type: 'user', id: '68b2f0c498f24c1e78fa0001' },
      },
    });
    expect(res.body).toEqual({
      environment: expect.objectContaining({ id: 'code-generated' }),
      pairing: expect.objectContaining({
        workerId: 'code-generated',
        code: 'a'.repeat(32),
        endpoint: 'https://code.librechat.example/v1',
      }),
    });
  });

  test('revokes an upstream pairing when the atomic owner quota is exhausted', async () => {
    const fetchImpl = jest.fn(
      async (input: string | URL | Request) =>
        ({
          ok: true,
          json: async () =>
            String(input).endsWith('/bridge/pairings')
              ? {
                  protocolVersion: 1,
                  workerId: 'code-generated',
                  code: 'a'.repeat(32),
                  expiresAt: new Date(Date.now() + 60_000).toISOString(),
                }
              : { protocolVersion: 1, revoked: true },
        }) as Response,
    );
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.agents]: {
            statefulCodeSessions: {
              allowedEnvironments: ['user'],
              environments: [
                {
                  id: 'shared-code-api',
                  name: 'Shared Code API',
                  type: 'attached',
                  baseURL: 'https://code.librechat.example/v1',
                  owner: 'deployment',
                  pairing: {
                    allowPrincipalWorkers: true,
                    tokenEnv: 'CODE_ADMIN_TOKEN',
                  },
                },
              ],
            },
          },
        },
      } as AppConfig),
      registry: {
        register: jest.fn().mockRejectedValue(new CodeEnvironmentLimitError()),
        listAccessible: jest.fn(),
        remove: jest.fn(),
      },
      createEnvironmentId: () => 'code-generated',
      readSecret: () => 'administrator-token',
      principalAuthEnabled: () => true,
      principalAuthReady: jest.fn().mockResolvedValue(undefined),
      fetchImpl,
    });
    const res = response();

    await handlers.pair(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
        body: { name: 'Personal VM', controlPlaneId: 'shared-code-api' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Personal code environment limit reached' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://code.librechat.example/v1/bridge/workers/code-generated/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('returns 503 without issuing a pairing when the initial principal check is unavailable', async () => {
    const fetchImpl = jest.fn();
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.agents]: {
            statefulCodeSessions: {
              allowedEnvironments: ['user'],
              environments: [
                {
                  id: 'shared-code-api',
                  name: 'Shared Code API',
                  type: 'attached',
                  baseURL: 'https://code.librechat.example/v1',
                  owner: 'deployment',
                  pairing: { allowPrincipalWorkers: true, tokenEnv: 'CODE_ADMIN_TOKEN' },
                },
              ],
            },
          },
        },
      } as AppConfig),
      registry: { register: jest.fn(), listAccessible: jest.fn(), remove: jest.fn() },
      createEnvironmentId: () => 'code-generated',
      readSecret: () => 'administrator-token',
      principalAuthEnabled: () => true,
      principalAuthReady: jest.fn(),
      principalIsActive: jest.fn().mockRejectedValue(new Error('user store unavailable')),
      fetchImpl,
    });
    const res = response();

    await handlers.pair(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
        body: { name: 'Personal VM', controlPlaneId: 'shared-code-api' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Account status could not be confirmed' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('revokes through the registry fence when the principal becomes inactive after registration', async () => {
    const remove = jest.fn(
      async ({ beforeDelete }: { beforeDelete?: (target: never) => Promise<void> }) => {
        await beforeDelete?.({} as never);
        return { id: 'code-generated' } as never;
      },
    );
    const principalIsActive = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const fetchImpl = jest.fn(
      async (input: string | URL | Request) =>
        ({
          ok: true,
          json: async () =>
            String(input).endsWith('/bridge/pairings')
              ? {
                  protocolVersion: 1,
                  workerId: 'code-generated',
                  code: 'a'.repeat(32),
                  expiresAt: new Date(Date.now() + 60_000).toISOString(),
                }
              : { protocolVersion: 1, revoked: true },
        }) as Response,
    );
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.agents]: {
            statefulCodeSessions: {
              allowedEnvironments: ['user'],
              environments: [
                {
                  id: 'shared-code-api',
                  name: 'Shared Code API',
                  type: 'attached',
                  baseURL: 'https://code.librechat.example/v1',
                  owner: 'deployment',
                  pairing: { allowPrincipalWorkers: true, tokenEnv: 'CODE_ADMIN_TOKEN' },
                },
              ],
            },
          },
        },
      } as AppConfig),
      registry: {
        register: jest.fn().mockResolvedValue({ id: 'code-generated' }),
        listAccessible: jest.fn(),
        remove,
      },
      createEnvironmentId: () => 'code-generated',
      readSecret: () => 'administrator-token',
      principalAuthEnabled: () => true,
      principalAuthReady: jest.fn(),
      principalIsActive,
      fetchImpl,
    });
    const res = response();

    await handlers.pair(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
        body: { name: 'Personal VM', controlPlaneId: 'shared-code-api' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(409);
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentId: 'code-generated',
        beforeDelete: expect.any(Function),
      }),
    );
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'https://code.librechat.example/v1/bridge/workers/code-generated/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('revokes an issued pairing when the post-issue principal check is unavailable', async () => {
    const register = jest.fn();
    const principalIsActive = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('user store unavailable'));
    const fetchImpl = jest.fn(
      async (input: string | URL | Request) =>
        ({
          ok: true,
          json: async () =>
            String(input).endsWith('/bridge/pairings')
              ? {
                  protocolVersion: 1,
                  workerId: 'code-generated',
                  code: 'a'.repeat(32),
                  expiresAt: new Date(Date.now() + 60_000).toISOString(),
                }
              : { protocolVersion: 1, revoked: true },
        }) as Response,
    );
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.agents]: {
            statefulCodeSessions: {
              allowedEnvironments: ['user'],
              environments: [
                {
                  id: 'shared-code-api',
                  name: 'Shared Code API',
                  type: 'attached',
                  baseURL: 'https://code.librechat.example/v1',
                  owner: 'deployment',
                  pairing: { allowPrincipalWorkers: true, tokenEnv: 'CODE_ADMIN_TOKEN' },
                },
              ],
            },
          },
        },
      } as AppConfig),
      registry: { register, listAccessible: jest.fn(), remove: jest.fn() },
      createEnvironmentId: () => 'code-generated',
      readSecret: () => 'administrator-token',
      principalAuthEnabled: () => true,
      principalAuthReady: jest.fn(),
      principalIsActive,
      fetchImpl,
    });
    const res = response();

    await handlers.pair(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
        body: { name: 'Personal VM', controlPlaneId: 'shared-code-api' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(503);
    expect(register).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'https://code.librechat.example/v1/bridge/workers/code-generated/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('rejects self-service pairing without principal-aware Code API auth', async () => {
    const fetchImpl = jest.fn();
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn(),
      registry: { register: jest.fn(), listAccessible: jest.fn(), remove: jest.fn() },
      principalAuthEnabled: jest.fn(() => false),
      fetchImpl,
    });
    const res = response();

    await handlers.pair(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
        body: { name: 'Personal VM', controlPlaneId: 'self-service' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(409);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('does not pair through a control plane removed from the caller effective config', async () => {
    const fetchImpl = jest.fn();
    const baseConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            environments: [
              {
                id: 'self-service',
                name: 'Self-service',
                type: 'attached',
                baseURL: 'https://code.librechat.example',
                owner: 'deployment',
                pairing: { allowPrincipalWorkers: true, tokenEnv: 'CODE_ADMIN_TOKEN' },
              },
            ],
          },
        },
      },
    } as AppConfig;
    const effectiveConfig = {
      endpoints: { [EModelEndpoint.agents]: { statefulCodeSessions: { environments: [] } } },
    } as unknown as AppConfig;
    const getAppConfig = jest.fn(async (options) =>
      options.baseOnly === true ? baseConfig : effectiveConfig,
    );
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig,
      registry: { register: jest.fn(), listAccessible: jest.fn(), remove: jest.fn() },
      readSecret: jest.fn(() => 'administrator-token'),
      principalAuthEnabled: jest.fn(() => true),
      principalAuthReady: jest.fn(),
      fetchImpl,
    });
    const res = response();

    await handlers.pair(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER', tenantId: 'tenant-1' },
        body: { name: 'Personal VM', controlPlaneId: 'self-service' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(404);
    expect(getAppConfig).toHaveBeenCalledWith({
      role: 'USER',
      userId: '68b2f0c498f24c1e78fa0001',
      idOnTheSource: undefined,
      tenantId: 'tenant-1',
      failClosed: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('fails closed when effective pairing policy cannot be loaded', async () => {
    const fetchImpl = jest.fn();
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn(async (options) => {
        if (options.baseOnly === true) return {} as AppConfig;
        throw new Error('authorization unavailable');
      }),
      registry: { register: jest.fn(), listAccessible: jest.fn(), remove: jest.fn() },
      principalAuthEnabled: jest.fn(() => true),
      principalAuthReady: jest.fn(),
      fetchImpl,
    });
    const res = response();

    await handlers.pair(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
        body: { name: 'Personal VM', controlPlaneId: 'self-service' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('authorizes pairing effectively but resolves destinations and secrets from deployment config', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        protocolVersion: 1,
        workerId: 'code-generated',
        code: 'a'.repeat(32),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    const deploymentConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            environments: [
              {
                id: 'self-service',
                name: 'Self-service',
                type: 'attached',
                baseURL: 'https://code.librechat.example',
                owner: 'deployment',
                pairing: { allowPrincipalWorkers: true, tokenEnv: 'CODE_ADMIN_TOKEN' },
              },
            ],
          },
        },
      },
    } as AppConfig;
    const effectiveConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            environments: [
              {
                id: 'self-service',
                name: 'Override attempt',
                type: 'attached',
                baseURL: 'https://attacker.example',
                owner: 'deployment',
                pairing: { allowPrincipalWorkers: true, tokenEnv: 'DATABASE_URL' },
              },
            ],
          },
        },
      },
    } as AppConfig;
    const readSecret = jest.fn((name) =>
      name === 'CODE_ADMIN_TOKEN' ? 'administrator-token' : 'database-secret',
    );
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn(async (options) =>
        options.baseOnly === true ? deploymentConfig : effectiveConfig,
      ),
      registry: {
        register: jest.fn().mockResolvedValue({ id: 'code-generated' }),
        listAccessible: jest.fn(),
        remove: jest.fn(),
      },
      createEnvironmentId: () => 'code-generated',
      readSecret,
      resolveTenantId: jest.fn(() => 'tenant-1'),
      principalAuthEnabled: jest.fn(() => true),
      principalAuthReady: jest.fn(),
      fetchImpl,
    });
    const res = response();

    await handlers.pair(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
        body: { name: 'Personal VM', controlPlaneId: 'self-service' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(201);
    expect(readSecret).toHaveBeenCalledWith('CODE_ADMIN_TOKEN');
    expect(readSecret).not.toHaveBeenCalledWith('DATABASE_URL');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://code.librechat.example/bridge/pairings',
      expect.any(Object),
    );
  });

  test('validates JWT signing before creating upstream pairing state', async () => {
    const fetchImpl = jest.fn();
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn(),
      registry: { register: jest.fn(), listAccessible: jest.fn(), remove: jest.fn() },
      principalAuthEnabled: jest.fn(() => true),
      principalAuthReady: jest.fn(() => {
        throw new Error('invalid signing key');
      }),
      fetchImpl,
    });
    const res = response();

    await handlers.pair(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
        body: { name: 'Personal VM', controlPlaneId: 'self-service' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('registers against an operator-configured control plane and ignores client URLs', async () => {
    const register = jest.fn().mockResolvedValue({
      resourceId: '68b2f0c498f24c1e78fa0111',
      id: 'personal-vm',
      name: 'Personal VM',
      type: 'attached',
    });
    const appConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            allowedEnvironments: ['user'],
            environments: [
              {
                id: 'shared-code-api',
                name: 'Shared Code API',
                type: 'attached',
                baseURL: 'https://code.librechat.example',
                owner: 'deployment',
                pairing: { workerId: 'deployment-worker', tokenEnv: 'CODE_ADMIN_TOKEN' },
              },
            ],
          },
        },
      },
    } as AppConfig;
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn().mockResolvedValue(appConfig),
      registry: { register, listAccessible: jest.fn(), remove: jest.fn() },
      createEnvironmentId: () => 'personal-vm',
    });
    const req = {
      user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
      body: {
        name: 'Personal VM',
        controlPlaneId: 'shared-code-api',
        workerId: 'attacker-worker',
        baseURL: 'https://attacker.example',
      },
    };
    const res = response();

    await handlers.register(req as never, res as never);

    expect(res.statusCode).toBe(201);
    expect(register).toHaveBeenCalledWith({
      actor: {
        userId: '68b2f0c498f24c1e78fa0001',
        role: 'USER',
        idOnTheSource: null,
      },
      environment: {
        id: 'personal-vm',
        name: 'Personal VM',
        type: 'attached',
        baseURL: 'https://code.librechat.example',
        controlPlaneId: 'shared-code-api',
        workerId: 'deployment-worker',
        workerPrincipal: { type: 'deployment', id: 'shared-code-api' },
      },
    });
  });

  test('does not register a fixed environment on a self-service-only control plane', async () => {
    const register = jest.fn();
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.agents]: {
            statefulCodeSessions: {
              allowedEnvironments: ['user'],
              environments: [
                {
                  id: 'self-service',
                  name: 'Self-service',
                  type: 'attached',
                  baseURL: 'https://code.librechat.example',
                  owner: 'deployment',
                  pairing: {
                    allowPrincipalWorkers: true,
                    tokenEnv: 'CODE_ADMIN_TOKEN',
                  },
                },
              ],
            },
          },
        },
      } as AppConfig),
      registry: { register, listAccessible: jest.fn(), remove: jest.fn() },
    });
    const res = response();

    await handlers.register(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'ADMIN' },
        body: { name: 'Invalid fixed route', controlPlaneId: 'self-service' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(404);
    expect(register).not.toHaveBeenCalled();
  });

  test('validates a pairing name before creating upstream state', async () => {
    const fetchImpl = jest.fn();
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.agents]: {
            statefulCodeSessions: {
              allowedEnvironments: ['user'],
              environments: [
                {
                  id: 'self-service',
                  name: 'Self-service',
                  type: 'attached',
                  baseURL: 'https://code.librechat.example',
                  owner: 'deployment',
                  pairing: {
                    allowPrincipalWorkers: true,
                    tokenEnv: 'CODE_ADMIN_TOKEN',
                  },
                },
              ],
            },
          },
        },
      } as AppConfig),
      registry: { register: jest.fn(), listAccessible: jest.fn(), remove: jest.fn() },
      readSecret: jest.fn(() => 'administrator-token'),
      principalAuthEnabled: jest.fn(() => true),
      principalAuthReady: jest.fn(),
      fetchImpl,
    });
    const res = response();

    await handlers.pair(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
        body: { name: 'x'.repeat(101), controlPlaneId: 'self-service' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('revokes a user-bound worker before deleting its registry entry', async () => {
    const remove = jest.fn(async ({ beforeDelete }) => {
      await beforeDelete({
        resourceId: '68b2f0c498f24c1e78fa0111',
        id: 'code-generated',
        name: 'Personal VM',
        type: 'attached',
        baseURL: 'https://code.librechat.example/v1',
        workerId: 'code-generated',
        controlPlaneId: 'self-service',
        revocationTokenEnv: 'CODE_ADMIN_TOKEN',
        workerPrincipal: { type: 'user', id: '68b2f0c498f24c1e78fa0001' },
      });
      return {
        resourceId: '68b2f0c498f24c1e78fa0111',
        id: 'code-generated',
        name: 'Personal VM',
        type: 'attached' as const,
        canDelete: true,
      };
    });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ protocolVersion: 1, revoked: true }),
    });
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.agents]: {
            statefulCodeSessions: {
              allowedEnvironments: ['user'],
              environments: [
                {
                  id: 'self-service',
                  name: 'Self-service',
                  type: 'attached',
                  baseURL: 'https://code.librechat.example/v1',
                  owner: 'deployment',
                  pairing: {
                    allowPrincipalWorkers: true,
                    tokenEnv: 'CODE_ADMIN_TOKEN',
                  },
                },
              ],
            },
          },
        },
      } as AppConfig),
      registry: { register: jest.fn(), listAccessible: jest.fn(), remove },
      readSecret: jest.fn(() => 'administrator-token'),
      fetchImpl,
    });
    const res = response();

    await handlers.remove(
      {
        user: { id: '68b2f0c498f24c1e78fa0001', role: 'USER' },
        params: { environmentId: 'code-generated' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://code.librechat.example/v1/bridge/workers/code-generated/revoke',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer administrator-token' },
      }),
    );
    expect(remove).toHaveBeenCalled();
  });

  test.each([
    {
      error: new Error('mongo connection details'),
      status: 500,
      body: { error: 'Code environment registration failed' },
    },
    {
      error: new CodeEnvironmentValidationError('Code environment id is invalid'),
      status: 400,
      body: { error: 'Code environment id is invalid' },
    },
  ])('classifies registration failure with status $status', async ({ error, status, body }) => {
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        endpoints: {
          [EModelEndpoint.agents]: {
            statefulCodeSessions: {
              environments: [
                {
                  id: 'shared-code-api',
                  name: 'Shared Code API',
                  type: 'attached',
                  baseURL: 'https://code.librechat.example',
                  owner: 'deployment',
                  pairing: { workerId: 'deployment-worker' },
                },
              ],
            },
          },
        },
      } as AppConfig),
      registry: {
        register: jest.fn().mockRejectedValue(error),
        listAccessible: jest.fn(),
        remove: jest.fn(),
      },
    });
    const res = response();

    await handlers.register(
      {
        user: { id: '68b2f0c498f24c1e78fa0001' },
        body: { name: 'Personal VM', controlPlaneId: 'shared-code-api' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual(body);
  });
});
