import { EModelEndpoint, TEndpointsConfig, TStartupConfig } from 'librechat-data-provider';
import getDefaultEndpoint, { getDefaultAgentFromConfig } from './getDefaultEndpoint';

// Mock localStorage
const mockGetLocalStorageItems = jest.fn();
jest.mock('./localStorage', () => ({
  getLocalStorageItems: () => mockGetLocalStorageItems(),
}));

// Mock endpoints
jest.mock('./endpoints', () => ({
  mapEndpoints: (config: Record<string, unknown>) => Object.keys(config),
}));

describe('getDefaultEndpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLocalStorageItems.mockReturnValue({
      lastConversationSetup: null,
    });
  });

  describe('with default_agent in startupConfig', () => {
    it('should return agents endpoint when defaultAgent is configured and agents endpoint exists', () => {
      const endpointsConfig = {
        agents: {},
        openAI: {},
      } as unknown as TEndpointsConfig;

      const startupConfig = {
        defaultAgent: 'agent_test123',
      } as TStartupConfig;

      const result = getDefaultEndpoint({
        convoSetup: {},
        endpointsConfig,
        startupConfig,
      });

      expect(result).toBe(EModelEndpoint.agents);
    });

    it('should return agents endpoint even if other endpoints are configured', () => {
      const endpointsConfig = {
        openAI: {},
        anthropic: {},
        agents: {},
        google: {},
      } as unknown as TEndpointsConfig;

      const startupConfig = {
        defaultAgent: 'agent_xyz789',
      } as TStartupConfig;

      const result = getDefaultEndpoint({
        convoSetup: {},
        endpointsConfig,
        startupConfig,
      });

      expect(result).toBe(EModelEndpoint.agents);
    });

    it('should fall back to normal behavior when agents endpoint is not configured', () => {
      const endpointsConfig = {
        openAI: {},
        anthropic: {},
      } as unknown as TEndpointsConfig;

      const startupConfig = {
        defaultAgent: 'agent_test123',
      } as TStartupConfig;

      const result = getDefaultEndpoint({
        convoSetup: {},
        endpointsConfig,
        startupConfig,
      });

      // Should return the first defined endpoint
      expect(result).toBe('openAI');
    });

    it('should prioritize defaultAgent over localStorage', () => {
      mockGetLocalStorageItems.mockReturnValue({
        lastConversationSetup: { endpoint: 'openAI' },
      });

      const endpointsConfig = {
        openAI: {},
        agents: {},
      } as unknown as TEndpointsConfig;

      const startupConfig = {
        defaultAgent: 'agent_test123',
      } as TStartupConfig;

      const result = getDefaultEndpoint({
        convoSetup: {},
        endpointsConfig,
        startupConfig,
      });

      expect(result).toBe(EModelEndpoint.agents);
    });

    it('should prioritize defaultAgent over convoSetup endpoint', () => {
      const endpointsConfig = {
        openAI: {},
        agents: {},
      } as unknown as TEndpointsConfig;

      const startupConfig = {
        defaultAgent: 'agent_test123',
      } as TStartupConfig;

      const result = getDefaultEndpoint({
        convoSetup: { endpoint: 'openAI' },
        endpointsConfig,
        startupConfig,
      });

      expect(result).toBe(EModelEndpoint.agents);
    });
  });

  describe('without default_agent in startupConfig', () => {
    it('should use convoSetup endpoint when provided', () => {
      const endpointsConfig = {
        openAI: {},
        agents: {},
      } as unknown as TEndpointsConfig;

      const result = getDefaultEndpoint({
        convoSetup: { endpoint: 'openAI' },
        endpointsConfig,
      });

      expect(result).toBe('openAI');
    });

    it('should use localStorage endpoint when no convoSetup', () => {
      mockGetLocalStorageItems.mockReturnValue({
        lastConversationSetup: { endpoint: 'anthropic' },
      });

      const endpointsConfig = {
        openAI: {},
        anthropic: {},
        agents: {},
      } as unknown as TEndpointsConfig;

      const result = getDefaultEndpoint({
        convoSetup: {},
        endpointsConfig,
      });

      expect(result).toBe('anthropic');
    });

    it('should use first defined endpoint when no other source', () => {
      const endpointsConfig = {
        openAI: {},
        anthropic: {},
      } as unknown as TEndpointsConfig;

      const result = getDefaultEndpoint({
        convoSetup: {},
        endpointsConfig,
      });

      expect(result).toBe('openAI');
    });

    it('should handle undefined startupConfig', () => {
      const endpointsConfig = {
        agents: {},
        openAI: {},
      } as unknown as TEndpointsConfig;

      const result = getDefaultEndpoint({
        convoSetup: {},
        endpointsConfig,
        startupConfig: undefined,
      });

      // Without startupConfig, should use first defined endpoint
      expect(result).toBe('agents');
    });
  });
});

describe('getDefaultAgentFromConfig', () => {
  it('should return agent ID when on agents endpoint with defaultAgent configured', () => {
    const testAgentId = 'agent_abc123';
    const startupConfig = {
      defaultAgent: testAgentId,
    } as TStartupConfig;

    const result = getDefaultAgentFromConfig({
      startupConfig,
      endpoint: 'agents',
    });

    expect(result).toBe(testAgentId);
  });

  it('should return null when endpoint is not agents', () => {
    const startupConfig = {
      defaultAgent: 'agent_abc123',
    } as TStartupConfig;

    const result = getDefaultAgentFromConfig({
      startupConfig,
      endpoint: 'openAI',
    });

    expect(result).toBeNull();
  });

  it('should return null when endpoint is null', () => {
    const startupConfig = {
      defaultAgent: 'agent_abc123',
    } as TStartupConfig;

    const result = getDefaultAgentFromConfig({
      startupConfig,
      endpoint: null,
    });

    expect(result).toBeNull();
  });

  it('should return null when defaultAgent is not configured', () => {
    const startupConfig = {} as TStartupConfig;

    const result = getDefaultAgentFromConfig({
      startupConfig,
      endpoint: 'agents',
    });

    expect(result).toBeNull();
  });

  it('should return null when startupConfig is undefined', () => {
    const result = getDefaultAgentFromConfig({
      startupConfig: undefined,
      endpoint: 'agents',
    });

    expect(result).toBeNull();
  });
});
