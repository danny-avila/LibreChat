import type { TEndpointsConfig } from './types';
import {
  allowedAddressesSchema,
  bedrockModels,
  configSchema,
  excludedKeys,
  resolveEndpointType,
  webSearchSchema,
} from './config';
import { EModelEndpoint, isDocumentSupportedProvider } from './schemas';
import { getEndpointFileConfig, mergeFileConfig } from './file-config';

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
  it.each([
    '_id',
    'user',
    'conversationId',
    'agentEventBinding',
    'agentEventActor',
    'agentEventActorReconciliations',
    '__v',
  ])('excludes system field "%s"', (field) => {
    expect(excludedKeys.has(field)).toBe(true);
  });

  it('does not exclude tenantId (plugin-level guard owns this)', () => {
    expect(excludedKeys.has('tenantId')).toBe(false);
  });
});

describe('bedrockEndpointSchema', () => {
  it('preserves guardrailConfig from configSchema parsing', () => {
    const guardrailConfig = {
      guardrailIdentifier: '${BEDROCK_GUARDRAIL_ID}',
      guardrailVersion: '${BEDROCK_GUARDRAIL_VERSION}',
      trace: 'enabled_full',
      streamProcessingMode: 'sync',
    };

    const result = configSchema.safeParse({
      version: '1.0',
      endpoints: {
        bedrock: {
          streamRate: 25,
          availableRegions: ['us-west-2'],
          guardrailConfig,
        },
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.endpoints?.bedrock?.guardrailConfig).toEqual(guardrailConfig);
  });
});

describe('agent event runtime config', () => {
  it('accepts the routing choice and ignores removed rollout fields', () => {
    const result = configSchema.safeParse({
      version: '1.0',
      endpoints: {
        agents: {
          eventDriven: {
            childTurns: true,
            completionWakeups: false,
            coalescing: true,
            actorMailbox: true,
            checkpointForks: true,
            durableReceipts: true,
            selfUrl: 'https://triggers.internal',
          },
        },
      },
      rateLimits: {
        agentEvents: { userMax: 80, userWindowInMinutes: 2 },
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.endpoints?.agents?.eventDriven).toEqual({
      selfUrl: 'https://triggers.internal',
    });
    expect(result.data.rateLimits?.agentEvents).toEqual({
      userMax: 80,
      userWindowInMinutes: 2,
    });
  });

  it('does not let removed checkpoint fields control memory-checkpointer validation', () => {
    const result = configSchema.safeParse({
      version: '1.0',
      endpoints: {
        agents: {
          eventDriven: { checkpointForks: true },
          checkpointer: { type: 'memory' },
        },
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.endpoints?.agents?.eventDriven).toEqual({});
    expect(result.data.endpoints?.agents?.checkpointer).toEqual({ type: 'memory' });
  });
});

describe('agent background task config', () => {
  it('enables completion wakeups by default when the policy block is present', () => {
    const result = configSchema.safeParse({
      version: '1.0',
      endpoints: { agents: { backgroundTasks: {} } },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.endpoints?.agents?.backgroundTasks).toEqual({ completionWakeups: true });
  });

  it('accepts an administrator poll-only policy', () => {
    const result = configSchema.safeParse({
      version: '1.0',
      endpoints: { agents: { backgroundTasks: { completionWakeups: false } } },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.endpoints?.agents?.backgroundTasks).toEqual({ completionWakeups: false });
  });
});

describe('speechTab schema', () => {
  it.each(['browser', 'external', 'openai', 'azureOpenAI'])(
    'accepts the speech-to-text engine "%s"',
    (engineSTT) => {
      const result = configSchema.safeParse({
        version: '1.0',
        speech: { speechTab: { speechToText: { engineSTT } } },
      });

      expect(result.success).toBe(true);
    },
  );

  it('rejects an unknown speech-to-text engine', () => {
    const result = configSchema.safeParse({
      version: '1.0',
      speech: { speechTab: { speechToText: { engineSTT: 'unknown' } } },
    });

    expect(result.success).toBe(false);
  });

  it.each(['browser', 'external', 'openai', 'azureOpenAI', 'elevenlabs', 'localai'])(
    'accepts the text-to-speech engine "%s"',
    (engineTTS) => {
      const result = configSchema.safeParse({
        version: '1.0',
        speech: { speechTab: { textToSpeech: { engineTTS } } },
      });

      expect(result.success).toBe(true);
    },
  );

  it('rejects an unknown text-to-speech engine', () => {
    const result = configSchema.safeParse({
      version: '1.0',
      speech: { speechTab: { textToSpeech: { engineTTS: 'unknown' } } },
    });

    expect(result.success).toBe(false);
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
      ['localhost:11434', 'lowercase hostname with port'],
      ['LOCALHOST:11434', 'uppercase hostname with port (preserved as-is by Zod)'],
      ['ollama.internal:11434', 'private-tld hostname with port'],
      ['host.docker.internal:11434', 'multi-segment hostname with port'],
      ['10.0.0.5:11434', 'RFC 1918 10.x with port'],
      ['192.168.1.1:8080', 'RFC 1918 192.168.x with port'],
      ['172.16.0.1:443', 'RFC 1918 172.16.x with port'],
      ['127.0.0.1:11434', 'loopback IPv4 with port'],
      ['169.254.169.254:80', 'link-local / cloud metadata with port'],
      ['192.0.0.1:80', 'RFC 5736 IETF protocol assignments with port'],
      ['100.64.0.1:8080', 'CGNAT with port'],
      ['[::1]:11434', 'bracketed IPv6 loopback with port'],
      ['[fc00::1]:8080', 'IPv6 unique-local with port'],
      ['[fd00::1]:8080', 'IPv6 unique-local with port'],
      ['[fe80::1]:8080', 'IPv6 link-local with port'],
      ['[::ffff:10.0.0.5]:8080', 'IPv4-mapped IPv6 of a private address'],
      ['[64:ff9b::a00:1]:8080', 'NAT64 embedding private 10.0.0.1'],
      ['[2002:a00:1::]:8080', '6to4 embedding private 10.0.0.1'],
      ['[2001::ffff:f5ff:fffe]:8080', 'Teredo embedding a private address'],
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
      ['[64:ff9b::808:808]:8080', 'NAT64 embedding public 8.8.8.8'],
      ['[2002:808:808::]:8080', '6to4 embedding public 8.8.8.8'],
      ['/path', 'leading slash / path'],
      ['10.0.0.5/api', 'embedded path'],
      ['localhost', 'bare hostname'],
      ['10.0.0.5', 'bare IPv4'],
      ['::1', 'bare IPv6'],
      ['[::1]', 'bracketed IPv6 without port'],
      ['localhost:0', 'port 0'],
      ['localhost:65536', 'port above range'],
      ['localhost:http', 'non-numeric port'],
      [':11434', 'missing host'],
    ])('rejects "%s" (%s)', (entry) => {
      expect(() => allowedAddressesSchema.parse([entry])).toThrow();
    });

    it.each([['localhost:8080'], ['10.0.0.5:11434'], ['ollama.internal:443'], ['[::1]:8080']])(
      'accepts host:port shape "%s"',
      (entry) => {
        expect(allowedAddressesSchema.parse([entry])).toEqual([entry]);
      },
    );
  });

  describe('private-IP scoping', () => {
    it.each([
      ['8.8.8.8:53', 'public DNS'],
      ['1.1.1.1:53', 'public DNS'],
      ['93.184.216.34:443', 'public web (example.com)'],
      ['172.32.0.1:8080', 'just outside RFC 1918'],
      ['172.15.255.255:8080', 'just outside RFC 1918 lower'],
      ['169.253.255.255:8080', 'just outside link-local'],
      ['100.63.255.255:8080', 'just outside CGNAT'],
      ['100.128.0.1:8080', 'just outside CGNAT upper'],
      ['198.20.0.1:8080', 'just outside benchmarking range'],
      ['[2001:4860:4860::8888]:443', 'public IPv6 (Google DNS)'],
      ['[2606:4700:4700::1111]:443', 'public IPv6 (Cloudflare DNS)'],
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
        endpoints: {
          allowedAddresses: ['10.0.0.5:11434', 'ollama.internal:11434'],
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts the field on mcpSettings', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        mcpSettings: { allowedAddresses: ['127.0.0.1:8080'] },
      });
      expect(result.success).toBe(true);
    });

    it('accepts the field on actions', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        actions: { allowedAddresses: ['host.docker.internal:8080'] },
      });
      expect(result.success).toBe(true);
    });

    it('rejects a public IP at the endpoints location', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        endpoints: { allowedAddresses: ['8.8.8.8:53'] },
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

    it('rejects a bare host at the actions location', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        actions: { allowedAddresses: ['localhost'] },
      });
      expect(result.success).toBe(false);
    });

    it('accepts the field on speech.stt', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        speech: { stt: { allowedAddresses: ['127.0.0.1:8080'] } },
      });
      expect(result.success).toBe(true);
    });

    it('accepts the field on speech.tts', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        speech: { tts: { allowedAddresses: ['localhost:11434', 'ollama.internal:11434'] } },
      });
      expect(result.success).toBe(true);
    });

    it('accepts the field on ocr', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        ocr: { allowedAddresses: ['10.0.0.5:443'] },
      });
      expect(result.success).toBe(true);
    });

    it('omitting the field on ocr leaves it undefined', () => {
      const result = configSchema.safeParse({ version: '1.0', ocr: {} });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ocr?.allowedAddresses).toBeUndefined();
      }
    });

    it('rejects a public IP at the speech.stt location', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        speech: { stt: { allowedAddresses: ['8.8.8.8:53'] } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects a bare host at the speech.tts location', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        speech: { tts: { allowedAddresses: ['localhost'] } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects a CIDR range at the ocr location', () => {
      const result = configSchema.safeParse({
        version: '1.0',
        ocr: { allowedAddresses: ['10.0.0.0/24'] },
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

  it('accepts Tavily scraper options', () => {
    const result = webSearchSchema.parse({
      tavilyScraperOptions: {
        extractDepth: 'advanced',
        format: 'text',
        includeFavicon: true,
        timeout: 15000,
      },
    });

    expect(result.tavilyScraperOptions?.extractDepth).toBe('advanced');
    expect(result.tavilyScraperOptions?.format).toBe('text');
    expect(result.tavilyScraperOptions?.includeFavicon).toBe(true);
    expect(result.tavilyScraperOptions?.timeout).toBe(15000);
  });

  it('rejects invalid Tavily search options', () => {
    expect(() =>
      webSearchSchema.parse({
        tavilySearchOptions: {
          searchDepth: 'invalid',
        },
      }),
    ).toThrow();

    expect(() =>
      webSearchSchema.parse({
        tavilySearchOptions: {
          maxResults: 0,
        },
      }),
    ).toThrow();

    expect(() =>
      webSearchSchema.parse({
        tavilySearchOptions: {
          timeout: 120001,
        },
      }),
    ).toThrow();

    expect(() =>
      webSearchSchema.parse({
        tavilyScraperOptions: {
          timeout: 120001,
        },
      }),
    ).toThrow();
  });

  it('accepts Keenable search options', () => {
    const result = webSearchSchema.parse({
      keenableSearchOptions: {
        maxResults: 7,
        site: 'example.com',
        attributionTitle: 'LibreChat',
        timeout: 15000,
      },
    });

    expect(result.keenableSearchOptions?.maxResults).toBe(7);
    expect(result.keenableSearchOptions?.site).toBe('example.com');
    expect(result.keenableSearchOptions?.attributionTitle).toBe('LibreChat');
    expect(result.keenableSearchOptions?.timeout).toBe(15000);
  });

  it('rejects invalid Keenable search options', () => {
    expect(() =>
      webSearchSchema.parse({
        keenableSearchOptions: {
          maxResults: 0,
        },
      }),
    ).toThrow();

    expect(() =>
      webSearchSchema.parse({
        keenableSearchOptions: {
          timeout: 120001,
        },
      }),
    ).toThrow();
  });

  it('accepts Keenable as a scraper provider with its options', () => {
    const result = webSearchSchema.parse({
      searchProvider: 'keenable',
      scraperProvider: 'keenable',
      rerankerType: 'none',
      keenableScraperOptions: {
        attributionTitle: 'LibreChat',
        timeout: 15000,
      },
    });

    expect(result.scraperProvider).toBe('keenable');
    expect(result.keenableScraperOptions?.attributionTitle).toBe('LibreChat');
    expect(result.keenableScraperOptions?.timeout).toBe(15000);
  });

  it('rejects invalid Keenable scraper options', () => {
    expect(() =>
      webSearchSchema.parse({
        keenableScraperOptions: {
          timeout: 120001,
        },
      }),
    ).toThrow();
  });

  it('accepts SearXNG search options', () => {
    const result = webSearchSchema.parse({
      searxngSearchOptions: {
        engines: 'google,bing,startpage,qwant',
        language: 'en',
        timeRange: 'month',
        timeout: 15000,
      },
    });

    expect(result.searxngSearchOptions?.engines).toBe('google,bing,startpage,qwant');
    expect(result.searxngSearchOptions?.language).toBe('en');
    expect(result.searxngSearchOptions?.timeRange).toBe('month');
    expect(result.searxngSearchOptions?.timeout).toBe(15000);
  });

  it('normalizes a SearXNG engine list into a comma-separated string', () => {
    const result = webSearchSchema.parse({
      searxngSearchOptions: {
        engines: ['google', 'bing', 'startpage', 'qwant'],
      },
    });

    expect(result.searxngSearchOptions?.engines).toBe('google,bing,startpage,qwant');
  });

  it('trims whitespace and empty entries from SearXNG engines', () => {
    const result = webSearchSchema.parse({
      searxngSearchOptions: {
        engines: 'google, bing , , startpage',
      },
    });

    expect(result.searxngSearchOptions?.engines).toBe('google,bing,startpage');
  });

  it('treats a blank SearXNG engines value as unset', () => {
    const result = webSearchSchema.parse({
      searxngSearchOptions: {
        engines: '  ,  ',
      },
    });

    expect(result.searxngSearchOptions?.engines).toBeUndefined();
  });

  it('rejects invalid SearXNG search options', () => {
    expect(() =>
      webSearchSchema.parse({
        searxngSearchOptions: {
          timeRange: 'week',
        },
      }),
    ).toThrow();

    expect(() =>
      webSearchSchema.parse({
        searxngSearchOptions: {
          timeout: 120001,
        },
      }),
    ).toThrow();

    expect(() =>
      webSearchSchema.parse({
        searxngSearchOptions: {
          engines: 42,
        },
      }),
    ).toThrow();
  });

  it('rejects a zero SearXNG timeout, which axios reads as no timeout at all', () => {
    expect(() =>
      webSearchSchema.parse({
        searxngSearchOptions: {
          timeout: 0,
        },
      }),
    ).toThrow();
  });
});

describe('bedrockModels defaults', () => {
  /**
   * Bedrock rejects on-demand Converse invocation of Claude 4+ foundation-model
   * IDs ("Retry your request with the ID or ARN of an inference profile"), so
   * every Claude 4+ default must ship as a cross-region profile ID or the model
   * fails on first use.
   */
  const claude4Plus =
    /claude-(?:[4-9](?:-\d+)?-(?:sonnet|opus|haiku)|(?:sonnet|opus|haiku|fable)-[4-9])/;

  it('uses a cross-region inference profile for every Claude 4+ entry', () => {
    const bare = bedrockModels.filter(
      (model) => claude4Plus.test(model) && !/^(?:global|us)\./.test(model),
    );

    expect(bare).toEqual([]);
  });

  it.each([
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'anthropic.claude-3-5-sonnet-20240620-v1:0',
    'anthropic.claude-3-5-haiku-20241022-v1:0',
  ])('does not offer retired model %s', (model) => {
    /** These reached end of life at AWS and return ResourceNotFoundException in
     * every prefix form, so selecting one is a hard error for the user. */
    expect(bedrockModels).not.toContain(model);
  });

  it('offers no Claude 3.x model at all', () => {
    const claude3 = bedrockModels.filter((model) => /claude-3[-.]/.test(model));

    expect(claude3).toEqual([]);
  });

  it('keeps Opus 5 available as a global profile', () => {
    expect(bedrockModels).toContain('global.anthropic.claude-opus-5');
    expect(bedrockModels).not.toContain('anthropic.claude-opus-5');
  });
});
