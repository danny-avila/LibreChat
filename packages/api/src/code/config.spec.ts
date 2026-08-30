import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { mergeAccessibleCodeEnvironments } from './config';

describe('mergeAccessibleCodeEnvironments', () => {
  test('adds principal environments without allowing them to shadow deployment entries', async () => {
    const appConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            allowedEnvironments: ['conversation'],
            environments: [
              {
                id: 'deployment-vm',
                name: 'Deployment VM',
                type: 'attached',
                baseURL: 'https://deployment.example',
                owner: 'deployment',
                pairing: { workerId: 'deployment-worker', tokenEnv: 'CODE_ADMIN_TOKEN' },
              },
            ],
          },
        },
      },
    } as unknown as AppConfig;
    const listAccessibleConfigurations = jest.fn().mockResolvedValue([
      {
        id: 'personal-vm',
        name: 'Personal VM',
        type: 'attached',
        baseURL: 'https://retired.example',
        controlPlaneId: 'deployment-vm',
        owner: 'principal',
      },
      {
        id: 'deployment-vm',
        name: 'Shadow Attempt',
        type: 'attached',
        baseURL: 'https://shadow.example',
        controlPlaneId: 'deployment-vm',
        owner: 'principal',
      },
    ]);

    const result = await mergeAccessibleCodeEnvironments({
      appConfig,
      deploymentConfig: appConfig,
      actor: { userId: '68b2f0c498f24c1e78fa0001', role: 'USER', idOnTheSource: null },
      registry: {
        listAccessibleConfigurations,
        listRegisteredIds: jest.fn().mockResolvedValue(['personal-vm', 'deployment-vm']),
      },
    });

    expect(result).not.toBe(appConfig);
    expect(result.endpoints?.agents?.statefulCodeSessions?.environments).toEqual([
      expect.objectContaining({ id: 'deployment-vm', baseURL: 'https://deployment.example' }),
      expect.objectContaining({ id: 'personal-vm', baseURL: 'https://deployment.example' }),
    ]);
    expect(appConfig.endpoints?.agents?.statefulCodeSessions?.environments).toHaveLength(1);
  });

  test('fails closed when a principal environment references a retired control plane', async () => {
    const appConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            allowedEnvironments: ['conversation'],
            environments: [],
          },
        },
      },
    } as unknown as AppConfig;
    const listAccessibleConfigurations = jest.fn().mockResolvedValue([
      {
        id: 'personal-vm',
        name: 'Personal VM',
        type: 'attached',
        baseURL: 'https://retired.example',
        controlPlaneId: 'retired-plane',
        owner: 'principal',
      },
    ]);

    const result = await mergeAccessibleCodeEnvironments({
      appConfig,
      deploymentConfig: appConfig,
      actor: { userId: '68b2f0c498f24c1e78fa0001', role: 'USER', idOnTheSource: null },
      registry: {
        listAccessibleConfigurations,
        listRegisteredIds: jest.fn().mockResolvedValue(['personal-vm']),
      },
    });

    expect(result).toBe(appConfig);
  });

  test('resolves principal aliases only against the YAML deployment config', async () => {
    const deploymentConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            environments: [
              {
                id: 'approved-plane',
                name: 'Approved Plane',
                type: 'attached',
                baseURL: 'https://approved.example',
                owner: 'deployment',
                pairing: { workerId: 'approved-worker', tokenEnv: 'CODE_ADMIN_TOKEN' },
              },
            ],
          },
        },
      },
    } as unknown as AppConfig;
    const appConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            environments: [
              {
                id: 'approved-plane',
                name: 'Override Plane',
                type: 'attached',
                baseURL: 'https://override.example',
                owner: 'deployment',
                pairing: { workerId: 'override-worker', tokenEnv: 'OVERRIDE_TOKEN' },
              },
            ],
          },
        },
      },
    } as unknown as AppConfig;
    const input = {
      appConfig,
      deploymentConfig,
      actor: { userId: '68b2f0c498f24c1e78fa0001', role: 'USER', idOnTheSource: null },
      registry: {
        listRegisteredIds: jest.fn().mockResolvedValue(['personal-vm']),
        listAccessibleConfigurations: jest.fn().mockResolvedValue([
          {
            id: 'personal-vm',
            name: 'Personal VM',
            type: 'attached',
            baseURL: 'https://persisted.example',
            controlPlaneId: 'approved-plane',
            owner: 'principal',
          },
        ]),
      },
    };

    const result = await mergeAccessibleCodeEnvironments(input);
    const environments = result.endpoints?.agents?.statefulCodeSessions?.environments;

    expect(environments?.find((environment) => environment.id === 'personal-vm')?.baseURL).toBe(
      'https://approved.example',
    );
  });

  test('replaces a merged override that shadows an accessible principal environment', async () => {
    const deploymentConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            environments: [
              {
                id: 'approved-plane',
                name: 'Approved Plane',
                type: 'attached',
                baseURL: 'https://approved.example',
                owner: 'deployment',
                pairing: { workerId: 'approved-worker', tokenEnv: 'CODE_ADMIN_TOKEN' },
              },
            ],
          },
        },
      },
    } as unknown as AppConfig;
    const appConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            environments: [
              {
                id: 'personal-vm',
                name: 'Shadow Override',
                type: 'attached',
                baseURL: 'https://shadow.example',
                owner: 'deployment',
                default: true,
                pairing: { workerId: 'shadow-worker', tokenEnv: 'SHADOW_TOKEN' },
              },
            ],
          },
        },
      },
    } as unknown as AppConfig;

    const result = await mergeAccessibleCodeEnvironments({
      appConfig,
      deploymentConfig,
      actor: { userId: '68b2f0c498f24c1e78fa0001', role: 'USER', idOnTheSource: null },
      registry: {
        listRegisteredIds: jest.fn().mockResolvedValue(['personal-vm']),
        listAccessibleConfigurations: jest.fn().mockResolvedValue([
          {
            id: 'personal-vm',
            name: 'Personal VM',
            type: 'attached',
            baseURL: 'https://persisted.example',
            controlPlaneId: 'approved-plane',
            owner: 'principal',
          },
        ]),
      },
    });
    const environments = result.endpoints?.agents?.statefulCodeSessions?.environments;

    expect(environments).toEqual([
      expect.objectContaining({
        id: 'personal-vm',
        name: 'Personal VM',
        baseURL: 'https://approved.example',
        owner: 'principal',
        default: true,
      }),
    ]);
  });

  test('suppresses a registered environment shadow after its ACL is revoked', async () => {
    const appConfig = {
      endpoints: {
        [EModelEndpoint.agents]: {
          statefulCodeSessions: {
            environments: [
              {
                id: 'revoked-vm',
                name: 'Revoked Shadow',
                type: 'attached',
                baseURL: 'https://shadow.example',
                owner: 'deployment',
                default: true,
                pairing: { workerId: 'shadow-worker', tokenEnv: 'SHADOW_TOKEN' },
              },
              {
                id: 'unrelated-override',
                name: 'Unrelated Override',
                type: 'attached',
                baseURL: 'https://unrelated.example',
                owner: 'deployment',
                pairing: { workerId: 'other-worker', tokenEnv: 'OTHER_TOKEN' },
              },
            ],
          },
        },
      },
    } as unknown as AppConfig;

    const result = await mergeAccessibleCodeEnvironments({
      appConfig,
      deploymentConfig: {
        endpoints: {
          [EModelEndpoint.agents]: { statefulCodeSessions: { environments: [] } },
        },
      } as unknown as AppConfig,
      actor: { userId: '68b2f0c498f24c1e78fa0001', role: 'USER', idOnTheSource: null },
      registry: {
        listAccessibleConfigurations: jest.fn().mockResolvedValue([]),
        listRegisteredIds: jest.fn().mockResolvedValue(['revoked-vm']),
      },
    });

    expect(result.endpoints?.agents?.statefulCodeSessions?.environments).toEqual([
      expect.objectContaining({ id: 'unrelated-override', default: true }),
    ]);
  });
});
