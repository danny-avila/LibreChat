jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));
jest.mock('node:dns', () => {
  const actual = jest.requireActual('node:dns');
  return {
    ...actual,
    lookup: jest.fn(),
  };
});

import dns from 'node:dns';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import {
  createAzureSoraRequestConfig,
  resolveAzureSoraCredentials,
  validateAzureSoraEndpoint,
} from './azureSora';

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

const mockedLookup = lookup as jest.MockedFunction<typeof lookup>;
const mockedDnsLookup = dns.lookup as jest.MockedFunction<typeof dns.lookup>;
const httpsAgentPrototype = https.Agent.prototype as unknown as {
  createConnection: (options: Record<string, unknown>) => unknown;
};

function mockDnsAddresses(addresses: dns.LookupAddress[]): void {
  mockedLookup.mockResolvedValue(addresses as never);
}

function mockConnectDns(address: string): void {
  mockedDnsLookup.mockImplementation(((
    _hostname: string,
    _options: unknown,
    callback: LookupCallback,
  ) => {
    callback(null, address, 4);
  }) as never);
}

describe('resolveAzureSoraCredentials', () => {
  it('never combines a global key with a custom endpoint', () => {
    expect(
      resolveAzureSoraCredentials(
        {
          AZURE_SORA_API_KEY: 'server-key',
          AZURE_SORA_ENDPOINT: 'https://custom-resource.openai.azure.com',
        },
        {
          AZURE_SORA_API_KEY: 'server-key',
          AZURE_SORA_ENDPOINT: 'https://admin-resource.openai.azure.com',
        },
      ),
    ).toEqual({
      apiKey: 'server-key',
      endpoint: 'https://admin-resource.openai.azure.com',
    });
  });

  it('does not attach a global key to a custom endpoint when no admin endpoint exists', () => {
    expect(
      resolveAzureSoraCredentials(
        {
          AZURE_SORA_API_KEY: 'server-key',
          AZURE_SORA_ENDPOINT: 'https://custom-resource.openai.azure.com',
        },
        { AZURE_SORA_API_KEY: 'server-key' },
      ),
    ).toEqual({ apiKey: 'server-key', endpoint: '' });
  });

  it('keeps a user key with its user endpoint when a different global key exists', () => {
    expect(
      resolveAzureSoraCredentials(
        {
          AZURE_SORA_API_KEY: 'user-key',
          AZURE_SORA_ENDPOINT: 'https://custom-resource.openai.azure.com',
        },
        {
          AZURE_SORA_API_KEY: 'server-key',
          AZURE_SORA_ENDPOINT: 'https://admin-resource.openai.azure.com',
        },
      ),
    ).toEqual({
      apiKey: 'user-key',
      endpoint: 'https://custom-resource.openai.azure.com',
    });
  });

  it('supports the general Azure server variables as one configured pair', () => {
    expect(
      resolveAzureSoraCredentials(
        {},
        {
          AZURE_API_KEY: 'server-key',
          AZURE_OPENAI_ENDPOINT: 'https://admin-resource.openai.azure.com',
        },
      ),
    ).toEqual({
      apiKey: 'server-key',
      endpoint: 'https://admin-resource.openai.azure.com',
    });
  });
});

describe('validateAzureSoraEndpoint', () => {
  beforeEach(() => {
    mockedLookup.mockReset();
    mockDnsAddresses([{ address: '20.190.128.1', family: 4 }]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    'https://resource.openai.azure.com',
    'https://resource.openai.azure.us',
    'https://resource.openai.azure.cn',
  ])('accepts an approved Azure OpenAI endpoint: %s', async (endpoint) => {
    await expect(validateAzureSoraEndpoint(endpoint)).resolves.toBe(endpoint);
  });

  it.each([
    'http://resource.openai.azure.com',
    'https://resource.openai.azure.com.evil.example',
    'https://resource.openai.azure.com@127.0.0.1',
    'https://127.0.0.1',
    'https://resource.openai.azure.com:444',
    'https://resource.openai.azure.com/custom',
    'https://resource.openai.azure.com?target=evil.example',
    'not a URL',
  ])('rejects an unsafe endpoint: %s', async (endpoint) => {
    await expect(validateAzureSoraEndpoint(endpoint)).rejects.toThrow(
      'Invalid Azure Sora endpoint',
    );
  });

  it('rejects an approved hostname that resolves to a private address', async () => {
    mockDnsAddresses([{ address: '169.254.169.254', family: 4 }]);

    await expect(validateAzureSoraEndpoint('https://resource.openai.azure.com')).rejects.toThrow(
      'resolves to a restricted address',
    );
  });

  it('rejects a mixed public and private DNS answer', async () => {
    mockDnsAddresses([
      { address: '20.190.128.1', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);

    await expect(validateAzureSoraEndpoint('https://resource.openai.azure.com')).rejects.toThrow(
      'resolves to a restricted address',
    );
  });
});

describe('createAzureSoraRequestConfig', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('blocks redirects and proxies before attaching connect-time DNS guards', () => {
    const config = createAzureSoraRequestConfig(
      'https://resource.openai.azure.com/openai/v1/video/generations/jobs',
      { headers: { 'api-key': 'server-key' } },
    );

    expect(config.maxRedirects).toBe(0);
    expect(config.proxy).toBe(false);
    expect(config.httpsAgent).toBeDefined();
    expect(config.httpAgent).toBeDefined();
  });

  it('blocks a hostname that rebinds to private space at connect time', () => {
    mockConnectDns('10.0.0.5');
    let lookupError: NodeJS.ErrnoException | null = null;
    jest.spyOn(httpsAgentPrototype, 'createConnection').mockImplementation(((
      options: Record<string, unknown>,
    ) => {
      const lookup = options.lookup as LookupFunction;
      lookup('resource.openai.azure.com', {}, (error) => {
        lookupError = error;
      });
      return {};
    }) as never);

    const config = createAzureSoraRequestConfig(
      'https://resource.openai.azure.com/openai/v1/video/generations/jobs',
      {},
    );
    const httpsAgent = config.httpsAgent as unknown as {
      createConnection: (options: Record<string, unknown>) => unknown;
    };
    httpsAgent.createConnection({
      host: 'resource.openai.azure.com',
      port: 443,
    });

    expect(lookupError).toMatchObject({ code: 'ESSRF' });
    config.httpsAgent?.destroy();
    config.httpAgent?.destroy();
  });
});
