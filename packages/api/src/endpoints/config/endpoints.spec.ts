import {
  AgentCapabilities,
  EModelEndpoint,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import { createEndpointsConfigService } from './endpoints';
import type { AppConfig } from '@librechat/data-schemas';
import type { EndpointsConfigDeps } from './endpoints';
import type { ServerRequest } from '~/types';

function appConfig(partial: Record<string, unknown>): AppConfig {
  return partial as unknown as AppConfig;
}

function createMockDeps(overrides: Partial<EndpointsConfigDeps> = {}): EndpointsConfigDeps {
  return {
    getAppConfig: jest.fn().mockResolvedValue(appConfig({ endpoints: {} })),
    loadDefaultEndpointsConfig: jest.fn().mockResolvedValue({
      [EModelEndpoint.openAI]: { userProvide: false, order: 0 },
    }),
    loadCustomEndpointsConfig: jest.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

function fakeReq(overrides: Partial<ServerRequest> = {}): ServerRequest {
  return { user: { id: 'u1', role: 'USER' }, ...overrides } as ServerRequest;
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
        getAppConfig: jest.fn().mockResolvedValue(
          appConfig({
            endpoints: { [EModelEndpoint.azureOpenAI]: { modelNames: ['gpt-4'] } },
          }),
        ),
      });
      const { getEndpointsConfig } = createEndpointsConfigService(deps);
      const result = await getEndpointsConfig(fakeReq());

      expect(result?.[EModelEndpoint.azureOpenAI]).toEqual(
        expect.objectContaining({ userProvide: false }),
      );
    });

    it('adds azureAssistants when azure has assistants config', async () => {
      const deps = createMockDeps({
        getAppConfig: jest.fn().mockResolvedValue(
          appConfig({
            endpoints: { [EModelEndpoint.azureOpenAI]: { assistants: true } },
          }),
        ),
      });
      const { getEndpointsConfig } = createEndpointsConfigService(deps);
      const result = await getEndpointsConfig(fakeReq());

      expect(result?.[EModelEndpoint.azureAssistants]).toEqual(
        expect.objectContaining({ userProvide: false }),
      );
    });

    it('enables anthropic when vertex AI is configured', async () => {
      const deps = createMockDeps({
        getAppConfig: jest.fn().mockResolvedValue(
          appConfig({
            endpoints: { [EModelEndpoint.anthropic]: { vertexConfig: { enabled: true } } },
          }),
        ),
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
        getAppConfig: jest.fn().mockResolvedValue(
          appConfig({
            endpoints: {
              [EModelEndpoint.assistants]: {
                disableBuilder: true,
                capabilities: [AgentCapabilities.execute_code],
                version: 2,
              },
            },
          }),
        ),
      });
      const { getEndpointsConfig } = createEndpointsConfigService(deps);
      const result = await getEndpointsConfig(fakeReq());
      const assistants = result?.[EModelEndpoint.assistants];

      expect(assistants?.version).toBe('2');
      expect(assistants?.disableBuilder).toBe(true);
      expect(assistants?.capabilities).toEqual([AgentCapabilities.execute_code]);
    });

    it('merges agents config with allowedProviders', async () => {
      const deps = createMockDeps({
        loadDefaultEndpointsConfig: jest.fn().mockResolvedValue({
          [EModelEndpoint.agents]: { userProvide: false, order: 0 },
        }),
        getAppConfig: jest.fn().mockResolvedValue(
          appConfig({
            endpoints: {
              [EModelEndpoint.agents]: {
                allowedProviders: ['openAI', 'anthropic'],
                capabilities: [AgentCapabilities.execute_code],
              },
            },
          }),
        ),
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
        getAppConfig: jest.fn().mockResolvedValue(
          appConfig({
            endpoints: {
              [EModelEndpoint.bedrock]: { availableRegions: ['us-east-1', 'eu-west-1'] },
            },
          }),
        ),
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

      await getEndpointsConfig(fakeReq({ config: appConfig({ endpoints: {} }) }));

      expect(mockGetAppConfig).not.toHaveBeenCalled();
    });
  });

  describe('checkCapability', () => {
    it('returns true when agents endpoint has the requested capability', async () => {
      const deps = createMockDeps({
        loadDefaultEndpointsConfig: jest.fn().mockResolvedValue({
          [EModelEndpoint.agents]: { userProvide: false, order: 0 },
        }),
        getAppConfig: jest.fn().mockResolvedValue(
          appConfig({
            endpoints: {
              [EModelEndpoint.agents]: {
                capabilities: [AgentCapabilities.execute_code],
              },
            },
          }),
        ),
      });
      const { checkCapability } = createEndpointsConfigService(deps);

      const result = await checkCapability(
        fakeReq({ body: { endpoint: EModelEndpoint.agents } }),
        AgentCapabilities.execute_code,
      );

      expect(result).toBe(true);
    });

    it('returns false when agents endpoint lacks the requested capability', async () => {
      const deps = createMockDeps({
        loadDefaultEndpointsConfig: jest.fn().mockResolvedValue({
          [EModelEndpoint.agents]: { userProvide: false, order: 0 },
        }),
        getAppConfig: jest.fn().mockResolvedValue(
          appConfig({
            endpoints: {
              [EModelEndpoint.agents]: {
                capabilities: [AgentCapabilities.execute_code],
              },
            },
          }),
        ),
      });
      const { checkCapability } = createEndpointsConfigService(deps);

      const result = await checkCapability(
        fakeReq({ body: { endpoint: EModelEndpoint.agents } }),
        AgentCapabilities.file_search,
      );

      expect(result).toBe(false);
    });

    it('falls back to defaultAgentCapabilities for non-agents endpoints', async () => {
      const deps = createMockDeps();
      const { checkCapability } = createEndpointsConfigService(deps);

      const result = await checkCapability(
        fakeReq({ body: { endpoint: EModelEndpoint.openAI } }),
        defaultAgentCapabilities[0],
      );

      expect(result).toBe(true);
    });
  });
});
