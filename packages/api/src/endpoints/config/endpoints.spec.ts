import { EModelEndpoint } from 'librechat-data-provider';
import { createEndpointsConfigService } from './endpoints';
import type { AppConfig } from '@librechat/data-schemas';
import type { EndpointsConfigDeps } from './endpoints';
import type { ServerRequest } from '~/types';

function createMockDeps(overrides: Partial<EndpointsConfigDeps> = {}): EndpointsConfigDeps {
  return {
    getAppConfig: jest.fn().mockResolvedValue({
      endpoints: {},
    } as Partial<AppConfig>),
    loadDefaultEndpointsConfig: jest.fn().mockResolvedValue({
      [EModelEndpoint.openAI]: { userProvide: false, order: 0 },
    }),
    loadCustomEndpointsConfig: jest.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

function fakeReq(overrides: Partial<ServerRequest> = {}): ServerRequest {
  return {
    user: { id: 'u1', role: 'USER' },
    ...overrides,
  } as ServerRequest;
}

describe('createEndpointsConfigService', () => {
  describe('getEndpointsConfig', () => {
    it('merges default and custom endpoints', async () => {
      const deps = createMockDeps({
        loadDefaultEndpointsConfig: jest.fn().mockResolvedValue({
          [EModelEndpoint.openAI]: { userProvide: false, order: 0 },
        }),
        loadCustomEndpointsConfig: jest.fn().mockReturnValue({
          myCustom: { userProvide: true },
        }),
      });
      const { getEndpointsConfig } = createEndpointsConfigService(deps);

      const result = await getEndpointsConfig(fakeReq());

      expect(result?.[EModelEndpoint.openAI]).toBeDefined();
      expect(result?.myCustom).toBeDefined();
    });

    it('adds azureOpenAI when configured', async () => {
      const deps = createMockDeps({
        getAppConfig: jest.fn().mockResolvedValue({
          endpoints: {
            [EModelEndpoint.azureOpenAI]: { modelNames: ['gpt-4'] },
          },
        } as Partial<AppConfig>),
      });
      const { getEndpointsConfig } = createEndpointsConfigService(deps);

      const result = await getEndpointsConfig(fakeReq());

      expect(result?.[EModelEndpoint.azureOpenAI]).toEqual(
        expect.objectContaining({ userProvide: false }),
      );
    });

    it('adds azureAssistants when azure has assistants config', async () => {
      const deps = createMockDeps({
        getAppConfig: jest.fn().mockResolvedValue({
          endpoints: {
            [EModelEndpoint.azureOpenAI]: { assistants: true },
          },
        } as Partial<AppConfig>),
      });
      const { getEndpointsConfig } = createEndpointsConfigService(deps);

      const result = await getEndpointsConfig(fakeReq());

      expect(result?.[EModelEndpoint.azureAssistants]).toEqual(
        expect.objectContaining({ userProvide: false }),
      );
    });

    it('enables anthropic when vertex AI is configured', async () => {
      const deps = createMockDeps({
        getAppConfig: jest.fn().mockResolvedValue({
          endpoints: {
            [EModelEndpoint.anthropic]: { vertexConfig: { enabled: true } },
          },
        } as Partial<AppConfig>),
      });
      const { getEndpointsConfig } = createEndpointsConfigService(deps);

      const result = await getEndpointsConfig(fakeReq());

      expect(result?.[EModelEndpoint.anthropic]).toEqual(
        expect.objectContaining({ userProvide: false }),
      );
    });

    it('merges assistants config with version coercion', async () => {
      const deps = createMockDeps({
        loadDefaultEndpointsConfig: jest.fn().mockResolvedValue({
          [EModelEndpoint.assistants]: { userProvide: false, order: 0 },
        }),
        getAppConfig: jest.fn().mockResolvedValue({
          endpoints: {
            [EModelEndpoint.assistants]: {
              disableBuilder: true,
              capabilities: ['code_interpreter'],
              version: 2,
            },
          },
        } as Partial<AppConfig>),
      });
      const { getEndpointsConfig } = createEndpointsConfigService(deps);

      const result = await getEndpointsConfig(fakeReq());

      const assistants = result?.[EModelEndpoint.assistants];
      expect(assistants?.version).toBe('2');
      expect(assistants?.disableBuilder).toBe(true);
      expect(assistants?.capabilities).toEqual(['code_interpreter']);
    });

    it('merges agents config with allowedProviders', async () => {
      const deps = createMockDeps({
        loadDefaultEndpointsConfig: jest.fn().mockResolvedValue({
          [EModelEndpoint.agents]: { userProvide: false, order: 0 },
        }),
        getAppConfig: jest.fn().mockResolvedValue({
          endpoints: {
            [EModelEndpoint.agents]: {
              allowedProviders: ['openAI', 'anthropic'],
              capabilities: ['code_interpreter'],
            },
          },
        } as Partial<AppConfig>),
      });
      const { getEndpointsConfig } = createEndpointsConfigService(deps);

      const result = await getEndpointsConfig(fakeReq());

      expect(result?.[EModelEndpoint.agents]?.allowedProviders).toEqual(['openAI', 'anthropic']);
    });

    it('merges bedrock availableRegions', async () => {
      const deps = createMockDeps({
        loadDefaultEndpointsConfig: jest.fn().mockResolvedValue({
          [EModelEndpoint.bedrock]: { userProvide: false, order: 0 },
        }),
        getAppConfig: jest.fn().mockResolvedValue({
          endpoints: {
            [EModelEndpoint.bedrock]: { availableRegions: ['us-east-1', 'eu-west-1'] },
          },
        } as Partial<AppConfig>),
      });
      const { getEndpointsConfig } = createEndpointsConfigService(deps);

      const result = await getEndpointsConfig(fakeReq());

      expect(result?.[EModelEndpoint.bedrock]?.availableRegions).toEqual([
        'us-east-1',
        'eu-west-1',
      ]);
    });

    it('uses req.config when available instead of calling getAppConfig', async () => {
      const mockGetAppConfig = jest.fn();
      const deps = createMockDeps({ getAppConfig: mockGetAppConfig });
      const { getEndpointsConfig } = createEndpointsConfigService(deps);

      await getEndpointsConfig(fakeReq({ config: { endpoints: {} } as AppConfig }));

      expect(mockGetAppConfig).not.toHaveBeenCalled();
    });
  });
});
