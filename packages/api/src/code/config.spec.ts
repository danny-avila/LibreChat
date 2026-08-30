import type { AppConfig } from '@librechat/data-schemas';
import { EModelEndpoint } from 'librechat-data-provider';
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
              },
            ],
          },
        },
      },
    } as AppConfig;
    const listAccessibleConfigurations = jest.fn().mockResolvedValue([
      {
        id: 'personal-vm',
        name: 'Personal VM',
        type: 'attached',
        baseURL: 'https://personal.example',
      },
      {
        id: 'deployment-vm',
        name: 'Shadow Attempt',
        type: 'attached',
        baseURL: 'https://shadow.example',
      },
    ]);

    const result = await mergeAccessibleCodeEnvironments({
      appConfig,
      actor: { userId: '68b2f0c498f24c1e78fa0001', role: 'USER', idOnTheSource: null },
      registry: { listAccessibleConfigurations },
    });

    expect(result).not.toBe(appConfig);
    expect(result.endpoints?.agents?.statefulCodeSessions?.environments).toEqual([
      expect.objectContaining({ id: 'deployment-vm', baseURL: 'https://deployment.example' }),
      expect.objectContaining({ id: 'personal-vm', baseURL: 'https://personal.example' }),
    ]);
    expect(appConfig.endpoints?.agents?.statefulCodeSessions?.environments).toHaveLength(1);
  });
});
