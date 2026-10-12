import { FileSources, EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { resolveMCPToolProvider } from './provider';

describe('resolveMCPToolProvider', () => {
  it('resolves a custom endpoint before its tool instance captures the provider', () => {
    const appConfig: AppConfig = {
      config: {},
      fileStrategy: FileSources.local,
      imageOutputType: 'png',
      endpoints: { custom: [{ name: 'Custom Gateway', baseURL: 'https://example.com/v1' }] },
    };
    expect(resolveMCPToolProvider(undefined, 'Custom Gateway', appConfig)).toBe('openai');
    expect(
      resolveMCPToolProvider(undefined, 'Custom Gateway', {
        ...appConfig,
        endpoints: { custom: [{ name: 'Custom Gateway', provider: EModelEndpoint.anthropic }] },
      }),
    ).toBe('anthropic');
  });

  it('keeps the resolved SDK provider when metadata contains a custom endpoint label', () => {
    expect(resolveMCPToolProvider('Custom Gateway', 'openAI')).toBe('openai');
    expect(resolveMCPToolProvider('Custom Gateway', 'anthropic')).toBe('anthropic');
  });

  it('honors a recognized runtime provider for a shared tool instance', () => {
    expect(resolveMCPToolProvider('azureOpenAI', 'anthropic')).toBe('azureopenai');
    expect(resolveMCPToolProvider('google', 'openAI')).toBe('google');
  });

  it('preserves the text-only fallback for unresolved providers', () => {
    expect(resolveMCPToolProvider('Unknown', 'Other')).toBe('unknown');
    expect(resolveMCPToolProvider(undefined, 'openAI')).toBe('openai');
    expect(resolveMCPToolProvider()).toBeUndefined();
  });
});
