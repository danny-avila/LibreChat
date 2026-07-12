import type { TCustomConfig } from 'librechat-data-provider';
import { azureConfigSetup } from './azure';

describe('azureConfigSetup priority pricing validation', () => {
  const baseGroup = {
    group: 'primary',
    apiKey: 'key',
    instanceName: 'instance',
    deploymentName: 'deployment',
    version: 'v1',
  };

  it('allows priority routing without local rates when local accounting is disabled', () => {
    const result = azureConfigSetup({
      endpoints: {
        azureOpenAI: {
          groups: [
            {
              ...baseGroup,
              models: {
                'gpt-5.6': {
                  priority: true,
                },
              },
            },
          ],
        },
      },
    } as Partial<TCustomConfig>);

    expect(result.priorityModels).toEqual(['gpt-5.6']);
  });

  it('requires priority token rates when local balance accounting is enabled', () => {
    expect(() =>
      azureConfigSetup({
        balance: { enabled: true },
        endpoints: {
          azureOpenAI: {
            groups: [
              {
                ...baseGroup,
                models: {
                  'gpt-5.6': {
                    priority: true,
                  },
                },
              },
            ],
          },
        },
      } as Partial<TCustomConfig>),
    ).toThrow('priority.tokenConfig');
  });

  it('accepts priority token rates when local accounting is enabled', () => {
    const result = azureConfigSetup({
      balance: { enabled: true },
      endpoints: {
        azureOpenAI: {
          groups: [
            {
              ...baseGroup,
              models: {
                'gpt-5.6': {
                  priority: {
                    tokenConfig: {
                      prompt: 10,
                      completion: 60,
                      context: 1050000,
                      cacheRead: 1,
                      cacheWrite: 12.5,
                    },
                  },
                },
              },
            },
          ],
        },
      },
    } as Partial<TCustomConfig>);

    expect(result.priorityModels).toEqual(['gpt-5.6']);
  });
});
