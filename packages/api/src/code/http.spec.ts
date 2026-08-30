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
      },
    });
  });

  test('returns a generic 500 for operational registration failures', async () => {
    const register = jest.fn().mockRejectedValue(new Error('mongo connection details'));
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
      registry: { register, listAccessible: jest.fn() },
    });
    const res = response();

    await handlers.register(
      {
        user: { id: '68b2f0c498f24c1e78fa0001' },
        body: { name: 'Personal VM', controlPlaneId: 'shared-code-api' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Code environment registration failed' });
  });

  test('returns 400 for validated registration input failures', async () => {
    const register = jest
      .fn()
      .mockRejectedValue(new CodeEnvironmentValidationError('Code environment id is invalid'));
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
      registry: { register, listAccessible: jest.fn() },
    });
    const res = response();

    await handlers.register(
      {
        user: { id: '68b2f0c498f24c1e78fa0001' },
        body: { name: 'Personal VM', controlPlaneId: 'shared-code-api' },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Code environment id is invalid' });
  });
});
