import type { TEndpointsConfig } from './types';
import { EModelEndpoint, isDocumentSupportedProvider } from './schemas';
import { getEndpointFileConfig, mergeFileConfig } from './file-config';
import { resolveEndpointType } from './config';

const endpointsConfig: TEndpointsConfig = {
  [EModelEndpoint.openAI]: { userProvide: false, order: 0 },
  [EModelEndpoint.agents]: { userProvide: false, order: 1 },
  [EModelEndpoint.anthropic]: { userProvide: false, order: 6 },
  [EModelEndpoint.bedrock]: { userProvide: false, order: 7 },
  Moonshot: { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
  'Some Endpoint': { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
  Gemini: { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
};

describe('resolveEndpointType', () => {
  describe('non-agents endpoints', () => {
    it('returns the config type for a custom endpoint', () => {
      expect(resolveEndpointType(endpointsConfig, 'Moonshot')).toBe(EModelEndpoint.custom);
    });

    it('returns the config type for a custom endpoint with spaces', () => {
      expect(resolveEndpointType(endpointsConfig, 'Some Endpoint')).toBe(EModelEndpoint.custom);
    });

    it('returns the endpoint itself for a standard endpoint without a type field', () => {
      expect(resolveEndpointType(endpointsConfig, EModelEndpoint.openAI)).toBe(
        EModelEndpoint.openAI,
      );
    });

    it('returns the endpoint itself for anthropic', () => {
      expect(resolveEndpointType(endpointsConfig, EModelEndpoint.anthropic)).toBe(
        EModelEndpoint.anthropic,
      );
    });

    it('ignores agentProvider when endpoint is not agents', () => {
      expect(resolveEndpointType(endpointsConfig, EModelEndpoint.openAI, 'Moonshot')).toBe(
        EModelEndpoint.openAI,
      );
    });
  });

  describe('agents endpoint with provider', () => {
    it('resolves to custom for a custom agent provider', () => {
      expect(resolveEndpointType(endpointsConfig, EModelEndpoint.agents, 'Moonshot')).toBe(
        EModelEndpoint.custom,
      );
    });

    it('resolves to custom for a custom agent provider with spaces', () => {
      expect(resolveEndpointType(endpointsConfig, EModelEndpoint.agents, 'Some Endpoint')).toBe(
        EModelEndpoint.custom,
      );
    });

    it('returns the provider itself for a standard agent provider (no type field)', () => {
      expect(
        resolveEndpointType(endpointsConfig, EModelEndpoint.agents, EModelEndpoint.openAI),
      ).toBe(EModelEndpoint.openAI);
    });

    it('returns bedrock for a bedrock agent provider', () => {
      expect(
        resolveEndpointType(endpointsConfig, EModelEndpoint.agents, EModelEndpoint.bedrock),
      ).toBe(EModelEndpoint.bedrock);
    });

    it('returns the provider name when provider is not in endpointsConfig', () => {
      expect(resolveEndpointType(endpointsConfig, EModelEndpoint.agents, 'UnknownProvider')).toBe(
        'UnknownProvider',
      );
    });
  });

  describe('agents endpoint without provider', () => {
    it('falls back to agents when no provider', () => {
      expect(resolveEndpointType(endpointsConfig, EModelEndpoint.agents)).toBe(
        EModelEndpoint.agents,
      );
    });

    it('falls back to agents when provider is null', () => {
      expect(resolveEndpointType(endpointsConfig, EModelEndpoint.agents, null)).toBe(
        EModelEndpoint.agents,
      );
    });

    it('falls back to agents when provider is undefined', () => {
      expect(resolveEndpointType(endpointsConfig, EModelEndpoint.agents, undefined)).toBe(
        EModelEndpoint.agents,
      );
    });
  });

  describe('edge cases', () => {
    it('returns undefined for null endpoint', () => {
      expect(resolveEndpointType(endpointsConfig, null)).toBeUndefined();
    });

    it('returns undefined for undefined endpoint', () => {
      expect(resolveEndpointType(endpointsConfig, undefined)).toBeUndefined();
    });

    it('handles null endpointsConfig', () => {
      expect(resolveEndpointType(null, EModelEndpoint.agents, 'Moonshot')).toBe('Moonshot');
    });

    it('handles undefined endpointsConfig', () => {
      expect(resolveEndpointType(undefined, 'Moonshot')).toBe('Moonshot');
    });
  });
});

describe('resolveEndpointType + getEndpointFileConfig integration', () => {
  const fileConfig = mergeFileConfig({
    endpoints: {
      Moonshot: { fileLimit: 5 },
      [EModelEndpoint.agents]: { fileLimit: 20 },
      default: { fileLimit: 10 },
    },
  });

  it('agent with Moonshot provider uses Moonshot-specific config', () => {
    const endpointType = resolveEndpointType(endpointsConfig, EModelEndpoint.agents, 'Moonshot');
    const config = getEndpointFileConfig({
      fileConfig,
      endpointType,
      endpoint: 'Moonshot',
    });
    expect(config.fileLimit).toBe(5);
  });

  it('agent with provider not in fileConfig falls back through custom → agents', () => {
    const endpointType = resolveEndpointType(endpointsConfig, EModelEndpoint.agents, 'Gemini');
    const config = getEndpointFileConfig({
      fileConfig,
      endpointType,
      endpoint: 'Gemini',
    });
    expect(config.fileLimit).toBe(20);
  });

  it('agent without provider falls back to agents config', () => {
    const endpointType = resolveEndpointType(endpointsConfig, EModelEndpoint.agents);
    const config = getEndpointFileConfig({
      fileConfig,
      endpointType,
      endpoint: EModelEndpoint.agents,
    });
    expect(config.fileLimit).toBe(20);
  });

  it('custom fallback is used when present and provider has no specific config', () => {
    const fileConfigWithCustom = mergeFileConfig({
      endpoints: {
        custom: { fileLimit: 15 },
        [EModelEndpoint.agents]: { fileLimit: 20 },
        default: { fileLimit: 10 },
      },
    });
    const endpointType = resolveEndpointType(endpointsConfig, EModelEndpoint.agents, 'Gemini');
    const config = getEndpointFileConfig({
      fileConfig: fileConfigWithCustom,
      endpointType,
      endpoint: 'Gemini',
    });
    expect(config.fileLimit).toBe(15);
  });

  it('non-agents custom endpoint uses its specific config directly', () => {
    const endpointType = resolveEndpointType(endpointsConfig, 'Moonshot');
    const config = getEndpointFileConfig({
      fileConfig,
      endpointType,
      endpoint: 'Moonshot',
    });
    expect(config.fileLimit).toBe(5);
  });

  it('non-agents standard endpoint falls back to default when no specific config', () => {
    const endpointType = resolveEndpointType(endpointsConfig, EModelEndpoint.openAI);
    const config = getEndpointFileConfig({
      fileConfig,
      endpointType,
      endpoint: EModelEndpoint.openAI,
    });
    expect(config.fileLimit).toBe(10);
  });
});

describe('resolveEndpointType + isDocumentSupportedProvider (upload menu)', () => {
  it('agent with custom provider shows "Upload to Provider" (custom is document-supported)', () => {
    const endpointType = resolveEndpointType(endpointsConfig, EModelEndpoint.agents, 'Moonshot');
    expect(isDocumentSupportedProvider(endpointType)).toBe(true);
  });

  it('agent with custom provider with spaces shows "Upload to Provider"', () => {
    const endpointType = resolveEndpointType(
      endpointsConfig,
      EModelEndpoint.agents,
      'Some Endpoint',
    );
    expect(isDocumentSupportedProvider(endpointType)).toBe(true);
  });

  it('agent without provider falls back to agents (not document-supported)', () => {
    const endpointType = resolveEndpointType(endpointsConfig, EModelEndpoint.agents);
    expect(isDocumentSupportedProvider(endpointType)).toBe(false);
  });

  it('agent with openAI provider is document-supported', () => {
    const endpointType = resolveEndpointType(
      endpointsConfig,
      EModelEndpoint.agents,
      EModelEndpoint.openAI,
    );
    expect(isDocumentSupportedProvider(endpointType)).toBe(true);
  });

  it('agent with anthropic provider is document-supported', () => {
    const endpointType = resolveEndpointType(
      endpointsConfig,
      EModelEndpoint.agents,
      EModelEndpoint.anthropic,
    );
    expect(isDocumentSupportedProvider(endpointType)).toBe(true);
  });

  it('agent with bedrock provider is document-supported', () => {
    const endpointType = resolveEndpointType(
      endpointsConfig,
      EModelEndpoint.agents,
      EModelEndpoint.bedrock,
    );
    expect(isDocumentSupportedProvider(endpointType)).toBe(true);
  });

  it('direct custom endpoint (not agents) is document-supported', () => {
    const endpointType = resolveEndpointType(endpointsConfig, 'Moonshot');
    expect(isDocumentSupportedProvider(endpointType)).toBe(true);
  });

  it('direct standard endpoint is document-supported', () => {
    const endpointType = resolveEndpointType(endpointsConfig, EModelEndpoint.openAI);
    expect(isDocumentSupportedProvider(endpointType)).toBe(true);
  });

  it('agent with unknown provider not in endpointsConfig is not document-supported', () => {
    const endpointType = resolveEndpointType(
      endpointsConfig,
      EModelEndpoint.agents,
      'UnknownProvider',
    );
    expect(isDocumentSupportedProvider(endpointType)).toBe(false);
  });

  it('same custom endpoint shows same result whether used directly or through agents', () => {
    const directType = resolveEndpointType(endpointsConfig, 'Moonshot');
    const agentType = resolveEndpointType(endpointsConfig, EModelEndpoint.agents, 'Moonshot');
    expect(isDocumentSupportedProvider(directType)).toBe(isDocumentSupportedProvider(agentType));
  });
});

describe('any custom endpoint is document-supported regardless of name', () => {
  const arbitraryNames = [
    'My LLM Gateway',
    'company-internal-api',
    'LiteLLM Proxy',
    'test_endpoint_123',
    'AI Studio',
    'ACME Corp',
    'localhost:8080',
  ];

  const configWithArbitraryEndpoints: TEndpointsConfig = {
    [EModelEndpoint.agents]: { userProvide: false, order: 1 },
    ...Object.fromEntries(
      arbitraryNames.map((name) => [
        name,
        { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
      ]),
    ),
  };

  it.each(arbitraryNames)('direct custom endpoint "%s" is document-supported', (name) => {
    const endpointType = resolveEndpointType(configWithArbitraryEndpoints, name);
    expect(endpointType).toBe(EModelEndpoint.custom);
    expect(isDocumentSupportedProvider(endpointType)).toBe(true);
  });

  it.each(arbitraryNames)('agent with custom provider "%s" is document-supported', (name) => {
    const endpointType = resolveEndpointType(
      configWithArbitraryEndpoints,
      EModelEndpoint.agents,
      name,
    );
    expect(endpointType).toBe(EModelEndpoint.custom);
    expect(isDocumentSupportedProvider(endpointType)).toBe(true);
  });

  it.each(arbitraryNames)(
    '"%s" resolves the same whether used directly or through an agent',
    (name) => {
      const directType = resolveEndpointType(configWithArbitraryEndpoints, name);
      const agentType = resolveEndpointType(
        configWithArbitraryEndpoints,
        EModelEndpoint.agents,
        name,
      );
      expect(directType).toBe(agentType);
    },
  );
});
