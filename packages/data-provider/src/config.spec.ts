import type { TEndpointsConfig } from './types';
import { EModelEndpoint, isDocumentSupportedProvider } from './schemas';
import { getEndpointFileConfig, mergeFileConfig } from './file-config';
import {
  allowedAddressesSchema,
  configSchema,
  excludedKeys,
  resolveEndpointType,
  webSearchSchema,
} from './config';

const endpointsConfig: TEndpointsConfig = {
  [EModelEndpoint.openAI]: { userProvide: false, order: 0 },
  [EModelEndpoint.agents]: { userProvide: false, order: 1 },
  [EModelEndpoint.anthropic]: { userProvide: false, order: 6 },
  [EModelEndpoint.bedrock]: { userProvide: false, order: 7 },
  Moonshot: { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
  'Some Endpoint': { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
  Gemini: { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
};

describe('excludedKeys', () => {
  it.each(['_id', 'user', 'conversationId', '__v'])('excludes system field "%s"', (field) => {
    expect(excludedKeys.has(field)).toBe(true);
  });

  it('does not exclude tenantId (plugin-level guard owns this)', () => {
    expect(excludedKeys.has('tenantId')).toBe(false);
  });
});

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

describe('allowedAddressesSchema', () => {
  describe('accepts valid entries', () => {
    it.each([
      ['localhost', 'lowercase hostname'],
      ['LOCALHOST', 'uppercase hostname (preserved as-is by Zod)'],
      ['ollama.internal', 'private-tld hostname'],
      ['host.docker.internal', 'multi-segment hostname'],
      ['10.0.0.5', 'RFC 1918 10.x'],
      ['192.168.1.1', 'RFC 1918 192.168.x'],
      ['172.16.0.1', 'RFC 1918 172.16.x'],
      ['127.0.0.1', 'loopback IPv4'],
      ['169.254.169.254', 'link-local / cloud metadata'],
      ['192.0.0.1', 'RFC 5736 IETF protocol assignments'],
      ['100.64.0.1', 'CGNAT'],
      ['::1', 'IPv6 loopback'],
      ['[::1]', 'bracketed IPv6 loopback'],
      ['fc00::1', 'IPv6 unique-local'],
      ['fd00::1', 'IPv6 unique-local'],
      ['fe80::1', 'IPv6 link-local'],
    ])('accepts "%s" (%s)', (entry) => {
      expect(allowedAddressesSchema.parse([entry])).toEqual([entry]);
    });

    it('accepts an empty / omitted list', () => {
      expect(allowedAddressesSchema.parse(undefined)).toBeUndefined();
      expect(allowedAddressesSchema.parse([])).toEqual([]);
    });
  });

  describe('rejects invalid shapes', () => {
    it.each([
      ['', 'empty string'],
      ['   ', 'whitespace-only'],
      ['10.0.0.5\t', 'embedded tab'],
      ['10.0.0.5\n', 'embedded newline'],
      ['10.0.0.5 ', 'trailing space'],
      ['http://10.0.0.5', 'http URL'],
      ['https://internal.example', 'https URL'],
      ['ws://10.0.0.5', 'ws URL'],
      ['10.0.0.0/24', 'CIDR range'],
      ['/path', 'leading slash / path'],
      ['10.0.0.5/api', 'embedded path'],
    ])('rejects "%s" (%s)', (entry) => {
      expect(() => allowedAddressesSchema.parse([entry])).toThrow();
    });

    it.each([['localhost:8080'], ['10.0.0.5:11434'], ['ollama.internal:443'], ['[::1]:8080']])(
      'rejects host:port shape "%s"',
      (entry) => {
        const result = allowedAddressesSchema.safeParse([entry]);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toMatch(/must not include a port/);
        }
      },
    );
  });

  describe('private-IP scoping', () => {
    it.each([
      ['8.8.8.8', 'public DNS'],
      ['1.1.1.1', 'public DNS'],
      ['93.184.216.34', 'public web (example.com)'],
      ['172.32.0.1', 'just outside RFC 1918'],
      ['172.15.255.255', 'just outside RFC 1918 lower'],
      ['169.253.255.255', 'just outside link-local'],
      ['100.63.255.255', 'just outside CGNAT'],
      ['100.128.0.1', 'just outside CGNAT upper'],
      ['198.20.0.1', 'just outside benchmarking range'],
      ['2001:4860:4860::8888', 'public IPv6 (Google DNS)'],
      ['2606:4700:4700::1111', 'public IPv6 (Cloudflare DNS)'],
    ])('rejects public IP literal "%s" (%s)', (entry) => {
      const result = allowedAddressesSchema.safeParse([entry]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/scoped to private IP space/);
      }
    });
  });

  describe('integration with configSchema', () => {
    it('accepts the field on endpoints', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        endpoints: { allowedAddresses: ['10.0.0.5', 'ollama.internal'] },
      });
      expect(result.success).toBe(true);
    });

    it('accepts the field on mcpSettings', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        mcpSettings: { allowedAddresses: ['127.0.0.1'] },
      });
      expect(result.success).toBe(true);
    });

    it('accepts the field on actions', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        actions: { allowedAddresses: ['host.docker.internal'] },
      });
      expect(result.success).toBe(true);
    });

    it('rejects a public IP at the endpoints location', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        endpoints: { allowedAddresses: ['8.8.8.8'] },
      });
      expect(result.success).toBe(false);
    });

    it('rejects a CIDR range at the mcpSettings location', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        mcpSettings: { allowedAddresses: ['10.0.0.0/24'] },
      });
      expect(result.success).toBe(false);
    });

    it('rejects a host:port at the actions location', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        actions: { allowedAddresses: ['localhost:8080'] },
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('webSearchSchema', () => {
  it('accepts Tavily string modes for answer and raw content options', () => {
    const result = webSearchSchema.parse({
      tavilySearchOptions: {
        includeAnswer: 'advanced',
        includeRawContent: 'markdown',
        safeSearch: false,
      },
    });

    expect(result.tavilySearchOptions?.includeAnswer).toBe('advanced');
    expect(result.tavilySearchOptions?.includeRawContent).toBe('markdown');
    expect(result.tavilySearchOptions?.safeSearch).toBe(false);
  });
});
