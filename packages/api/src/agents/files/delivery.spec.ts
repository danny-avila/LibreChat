import { EModelEndpoint } from 'librechat-data-provider';
import type { TurnDeliveryConfig } from './delivery';
import { resolveTurnDeliveryRouting } from './delivery';

const config = {
  fileConfig: {
    endpoints: {
      MyClaude: { supportedMimeTypes: ['video/mp4'] },
      [EModelEndpoint.openAI]: { fileLimit: 3 },
    },
  },
  endpoints: { custom: [{ name: 'MyClaude', provider: 'anthropic' }] },
  speech: { stt: { openai: { apiKey: 'key', model: 'whisper-1' } } },
} as unknown as TurnDeliveryConfig;

describe('resolveTurnDeliveryRouting', () => {
  it('reads the file policy under the endpoint name, before and after the provider swap', () => {
    /* Initialization first stores the endpoint name in both fields and only later replaces
     * the provider with the backing client, so neither the policy nor the dialect may move. */
    const before = resolveTurnDeliveryRouting({
      agent: { provider: 'MyClaude', endpoint: 'MyClaude' },
      config,
    });
    const after = resolveTurnDeliveryRouting({
      agent: { provider: 'anthropic', endpoint: 'MyClaude' },
      config,
    });

    expect(after).toEqual(before);
    expect(before.endpoint).toBe('MyClaude');
    expect(before.endpointConfig.supportedMimeTypes).toEqual([/video\/mp4/]);
    expect(before.endpointProvider).toBe('anthropic');
  });

  it('leaves the dialect undefined for a built-in or OpenAI-compatible endpoint', () => {
    expect(
      resolveTurnDeliveryRouting({
        agent: { provider: EModelEndpoint.openAI, endpoint: EModelEndpoint.openAI },
        config,
      }).endpointProvider,
    ).toBeUndefined();
    expect(
      resolveTurnDeliveryRouting({ agent: { provider: 'MyGateway' }, config }).endpointProvider,
    ).toBeUndefined();
  });

  it('routes an agent loaded without an endpoint name by its provider', () => {
    const routing = resolveTurnDeliveryRouting({
      agent: { provider: EModelEndpoint.openAI },
      config,
    });

    expect(routing.endpoint).toBe(EModelEndpoint.openAI);
    expect(routing.endpointConfig.fileLimit).toBe(3);
  });

  it('carries the Responses API decision and the transcription setting', () => {
    const routing = resolveTurnDeliveryRouting({
      agent: { provider: EModelEndpoint.azureOpenAI, model_parameters: { useResponsesApi: true } },
      config,
    });

    expect(routing.useResponsesApi).toBe(true);
    expect(routing.sttConfigured).toBe(true);
    expect(
      resolveTurnDeliveryRouting({ agent: { provider: EModelEndpoint.openAI }, config: {} }),
    ).toMatchObject({ useResponsesApi: undefined, sttConfigured: false });
  });
});
