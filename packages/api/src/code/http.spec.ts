import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
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
        workerId: 'deployment-worker',
      },
    });
  });
});
