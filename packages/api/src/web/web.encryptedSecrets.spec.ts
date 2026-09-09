process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import { SafeSearchTypes, SearchProviders } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';

// Loaded via dynamic import in beforeAll so encryption initializes after
// CREDS_KEY is set above (encryptV3 reads the key at module load) — matches
// the pattern in admin/secrets.spec.ts, required here because this file's
// subject (./web) transitively imports the admin secrets module.
let loadWebSearchAuth: typeof import('./web').loadWebSearchAuth;
let encryptV3: typeof import('@librechat/data-schemas').encryptV3;

beforeAll(async () => {
  ({ loadWebSearchAuth } = await import('./web'));
  ({ encryptV3 } = await import('@librechat/data-schemas'));
});

/**
 * `webSearch.*ApiKey` fields are encrypted at rest by the admin config write
 * path (packages/api/src/admin/secrets.ts). The runtime resolver here
 * (`extractWebSearchEnvVars`) only ever understood `${ENV_VAR}` placeholders,
 * so a stored literal — plaintext or, now, ciphertext — was silently treated
 * as "not configured" and the whole service (or, for `keenableApiKey`
 * specifically, the admin's own secret) never reached `authResult`. These
 * tests exercise `loadWebSearchAuth`'s own decrypt-and-resolve path.
 */
describe('loadWebSearchAuth decrypts admin-encrypted config secrets', () => {
  const userId = 'test-user-id';
  let mockLoadAuthValues: jest.Mock;

  beforeEach(() => {
    mockLoadAuthValues = jest.fn().mockResolvedValue({});
  });

  it('authenticates a required provider key stored as ciphertext, without any loadAuthValues lookup for it', async () => {
    const encrypted = encryptV3('sk-serper-admin-secret');
    const webSearchConfig: TCustomConfig['webSearch'] = {
      serperApiKey: encrypted,
      safeSearch: SafeSearchTypes.MODERATE,
    };

    const result = await loadWebSearchAuth({
      userId,
      webSearchConfig,
      loadAuthValues: mockLoadAuthValues,
    });

    expect(result.authResult.serperApiKey).toBe('sk-serper-admin-secret');
    expect(result.authResult.searchProvider).toBe('serper');
    for (const call of mockLoadAuthValues.mock.calls) {
      expect(call[0].authFields).not.toContain('SERPER_API_KEY');
    }
  });

  it('resolves an optional key stored as ciphertext alongside a required env-var key', async () => {
    const encrypted = encryptV3('sk-searxng-admin-secret');
    mockLoadAuthValues.mockImplementation(({ authFields }: { authFields: string[] }) => {
      const result: Record<string, string> = {};
      authFields.forEach((field) => {
        if (field === 'SEARXNG_INSTANCE_URL') {
          result[field] = 'https://searxng.example.com';
        }
      });
      return Promise.resolve(result);
    });
    const webSearchConfig: TCustomConfig['webSearch'] = {
      searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
      searxngApiKey: encrypted,
      searchProvider: SearchProviders.SEARXNG,
      safeSearch: SafeSearchTypes.MODERATE,
    };

    const result = await loadWebSearchAuth({
      userId,
      webSearchConfig,
      loadAuthValues: mockLoadAuthValues,
    });

    expect(result.authResult.searxngInstanceUrl).toBe('https://searxng.example.com');
    expect(result.authResult.searxngApiKey).toBe('sk-searxng-admin-secret');
    expect(result.authResult.searchProvider).toBe('searxng');
  });

  it('resolves an encrypted keenableApiKey and marks it admin-provided, not user-provided', async () => {
    const encrypted = encryptV3('sk-keenable-admin-secret');
    const webSearchConfig: TCustomConfig['webSearch'] = {
      keenableApiKey: encrypted,
      searchProvider: SearchProviders.KEENABLE,
      safeSearch: SafeSearchTypes.MODERATE,
    };

    const result = await loadWebSearchAuth({
      userId,
      webSearchConfig,
      loadAuthValues: mockLoadAuthValues,
    });

    expect(result.authResult.keenableApiKey).toBe('sk-keenable-admin-secret');
    // isUserProvided (per-category authType) must reflect the admin-set key,
    // not treat the decrypted secret as if the user had supplied it.
    const providerAuthType = result.authTypes.find(([category]) => category === 'providers');
    expect(providerAuthType?.[1]).toBe('system_defined');
  });

  it('decrypts Firecrawl custom headers before passing its options to the scraper', async () => {
    const encryptedApiKey = encryptV3('sk-serper-admin-secret');
    const encryptedHeader = encryptV3('Bearer target-secret');
    const webSearchConfig: TCustomConfig['webSearch'] = {
      serperApiKey: encryptedApiKey,
      safeSearch: SafeSearchTypes.MODERATE,
      firecrawlOptions: {
        headers: {
          Authorization: encryptedHeader,
          'X-Plain': 'plain-value',
        },
      },
    };

    const result = await loadWebSearchAuth({
      userId,
      webSearchConfig,
      loadAuthValues: mockLoadAuthValues,
    });

    expect(result.authResult.firecrawlOptions?.headers).toEqual({
      Authorization: 'Bearer target-secret',
      'X-Plain': 'plain-value',
    });
    expect(webSearchConfig.firecrawlOptions?.headers?.Authorization).toBe(encryptedHeader);
  });

  it('never forwards an encrypted admin keenableApiKey to a user-controlled keenableApiUrl', async () => {
    const encrypted = encryptV3('sk-keenable-admin-secret');
    mockLoadAuthValues.mockImplementation(({ authFields }: { authFields: string[] }) => {
      const result: Record<string, string> = {};
      authFields.forEach((field) => {
        if (field === 'KEENABLE_API_URL') {
          result[field] = 'https://user-controlled.example.com';
        }
      });
      return Promise.resolve(result);
    });
    const webSearchConfig: TCustomConfig['webSearch'] = {
      keenableApiKey: encrypted,
      keenableApiUrl: '${KEENABLE_API_URL}',
      searchProvider: SearchProviders.KEENABLE,
      safeSearch: SafeSearchTypes.MODERATE,
    };

    const result = await loadWebSearchAuth({
      userId,
      webSearchConfig,
      loadAuthValues: mockLoadAuthValues,
    });

    expect(result.authResult.keenableApiKey).toBeUndefined();
    expect(result.authResult.keenableApiUrl).toBe('https://user-controlled.example.com');
  });
});
