import { ProviderId } from 'librechat-data-provider';
import { resolveEndpointProviderId } from './providers';

describe('resolveEndpointProviderId', () => {
  it('prefers an iconURL that names a provider', () => {
    expect(
      resolveEndpointProviderId({
        name: 'Internal Gateway',
        baseURL: 'https://gateway.internal/v1',
        iconURL: 'openrouter',
      }),
    ).toBe(ProviderId.openrouter);
  });

  it('ignores an iconURL that is an image address', () => {
    expect(
      resolveEndpointProviderId({
        name: 'OpenRouter',
        baseURL: 'https://openrouter.ai/api/v1',
        iconURL: 'https://example.com/logo.png',
      }),
    ).toBe(ProviderId.openrouter);
  });

  it('resolves a renamed endpoint from its baseURL host', () => {
    expect(
      resolveEndpointProviderId({
        name: 'My OpenRouter',
        baseURL: 'https://openrouter.ai/api/v1',
      }),
    ).toBe(ProviderId.openrouter);
  });

  it('matches a host on a subdomain', () => {
    expect(
      resolveEndpointProviderId({
        name: 'Groq Proxy',
        baseURL: 'https://eu.api.groq.com/openai/v1',
      }),
    ).toBe(ProviderId.groq);
  });

  it('resolves the Helicone gateway host documented in librechat.example.yaml', () => {
    expect(
      resolveEndpointProviderId({
        name: 'Team Gateway',
        baseURL: 'https://ai-gateway.helicone.ai',
      }),
    ).toBe(ProviderId.helicone);
  });

  it('recognizes the supported Cohere API host', () => {
    expect(
      resolveEndpointProviderId({
        name: 'My Cohere',
        baseURL: 'https://api.cohere.ai/v1',
      }),
    ).toBe(ProviderId.cohere);
  });

  it('honors an explicit native provider when the host is unknown', () => {
    expect(
      resolveEndpointProviderId({
        name: 'My Claude Proxy',
        baseURL: 'https://gateway.internal/v1',
        provider: 'anthropic',
      }),
    ).toBe(ProviderId.anthropic);
  });

  it('falls back to the endpoint name', () => {
    expect(resolveEndpointProviderId({ name: 'Mistral' })).toBe(ProviderId.mistral);
  });

  it('returns undefined for a self-hosted gateway with no signal', () => {
    expect(
      resolveEndpointProviderId({
        name: 'LiteLLM',
        baseURL: 'http://localhost:4000/v1',
      }),
    ).toBeUndefined();
  });

  it('survives a malformed baseURL', () => {
    expect(resolveEndpointProviderId({ name: 'Cohere', baseURL: 'not a url' })).toBe(
      ProviderId.cohere,
    );
  });
});
