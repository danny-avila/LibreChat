import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { CodeEnvironmentValidationError } from './environments';
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
  test('returns 400 when registration has no request body', async () => {
    const register = jest.fn();
    const handlers = createCodeEnvironmentHttpHandlers({
      getAppConfig: jest.fn(),
      registry: { register, listAccessible: jest.fn() },
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
      registry: { register, listAccessible: jest.fn() },
      createEnvironmentId: () => 'code-generated',
      readSecret: jest.fn(() => 'administrator-token'),
      resolveTenantId: jest.fn(() => 'tenant-1'),
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
      environment: {
        id: 'code-generated',
        name: 'Personal VM',
        type: 'attached',
        baseURL: 'https://code.librechat.example/v1',
        workerId: 'code-generated',
        workerPrincipal: { type: 'user', id: '68b2f0c498f24c1e78fa0001' },
      },
    });
    expect(res.body).toEqual({
      environment: expect.objectContaining({ id: 'code-generated' }),
      pairing: expect.objectContaining({ workerId: 'code-generated', code: 'a'.repeat(32) }),
    });
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
      registry: { register, listAccessible: jest.fn() },
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
      registry: { register, listAccessible: jest.fn() },
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
      registry: { register: jest.fn(), listAccessible: jest.fn() },
      readSecret: jest.fn(() => 'administrator-token'),
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
      registry: { register: jest.fn().mockRejectedValue(error), listAccessible: jest.fn() },
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
