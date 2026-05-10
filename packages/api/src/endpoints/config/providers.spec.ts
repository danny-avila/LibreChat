import { Providers } from '@librechat/agents';
import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { getProviderConfig, providerConfigMap } from './providers';

const buildAppConfig = (
  customEndpoints: Array<{ name: string; baseURL?: string; apiKey?: string }>,
): AppConfig =>
  ({
    endpoints: {
      [EModelEndpoint.custom]: customEndpoints,
    },
  }) as unknown as AppConfig;

describe('getProviderConfig', () => {
  it('resolves the existing google (API key) path to initializeGoogle', () => {
    // Regression guard: the API-key path uses `Providers.GOOGLE === 'google'`,
    // which has always mapped via `EModelEndpoint.google`. Adding the
    // `Providers.VERTEXAI` entry must not perturb this.
    const result = getProviderConfig({
      provider: Providers.GOOGLE,
      appConfig: buildAppConfig([]),
    });

    expect(result.overrideProvider).toBe(Providers.GOOGLE);
    expect(result.getOptions).toBe(providerConfigMap[EModelEndpoint.google]);
    expect(result.customEndpointConfig).toBeUndefined();
  });

  it('vertexai resolves to the same initializer as google (issue #13006 follow-up)', () => {
    const result = getProviderConfig({
      provider: Providers.VERTEXAI,
      appConfig: buildAppConfig([]),
    });

    expect(result.overrideProvider).toBe(Providers.VERTEXAI);
    expect(result.getOptions).toBe(providerConfigMap[EModelEndpoint.google]);
    expect(result.customEndpointConfig).toBeUndefined();
  });

  it('falls back case-insensitively when only a CamelCase match exists', () => {
    // Agent runtime resolved provider to lowercase `"openrouter"`, but the
    // user's `librechat.yaml` declared `name: "OpenRouter"`.
    const appConfig = buildAppConfig([
      { name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-test' },
    ]);

    const result = getProviderConfig({ provider: 'openrouter', appConfig });

    expect(result.overrideProvider).toBe(Providers.OPENROUTER);
    expect(result.customEndpointConfig?.name).toBe('OpenRouter');
  });

  it('prefers the exact-case match when both casings exist (preserves case-sensitive identity)', () => {
    // Two distinct custom endpoints differing only in case is supported by
    // `loadCustomEndpointsConfig` (the keys are case-preserving). Direct
    // exact-case lookup should win — case-insensitive fallback must not
    // shadow the user's intent.
    const appConfig = buildAppConfig([
      { name: 'OpenRouter', baseURL: 'https://prod.example/v1', apiKey: 'prod' },
      { name: 'openrouter', baseURL: 'https://staging.example/v1', apiKey: 'staging' },
    ]);

    const result = getProviderConfig({ provider: 'openrouter', appConfig });

    expect(result.customEndpointConfig?.baseURL).toBe('https://staging.example/v1');
  });

  it('resolves an exact-case lowercase entry', () => {
    const appConfig = buildAppConfig([
      { name: 'openrouter', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-test' },
    ]);

    const result = getProviderConfig({ provider: 'openrouter', appConfig });

    expect(result.customEndpointConfig?.name).toBe('openrouter');
  });

  it('throws on ambiguous case-insensitive matches when no exact-case entry exists (codex review)', () => {
    // User has two distinct entries differing only in case, both
    // non-lowercase. The agent runtime resolves provider to lowercase
    // "openrouter" — neither matches case-sensitively, and silently
    // picking array-first could route requests to the wrong baseURL/apiKey.
    const appConfig = buildAppConfig([
      { name: 'OpenRouter', baseURL: 'https://prod.example/v1', apiKey: 'prod' },
      { name: 'OPENROUTER', baseURL: 'https://canary.example/v1', apiKey: 'canary' },
    ]);

    expect(() => getProviderConfig({ provider: 'openrouter', appConfig })).toThrow(
      /ambiguous.*OpenRouter.*OPENROUTER/i,
    );
  });

  it('throws when openrouter has no matching custom endpoint at all', () => {
    expect(() =>
      getProviderConfig({ provider: 'openrouter', appConfig: buildAppConfig([]) }),
    ).toThrow('Provider openrouter not supported');
  });
});
