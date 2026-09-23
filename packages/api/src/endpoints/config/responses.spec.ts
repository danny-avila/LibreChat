import {
  EModelEndpoint,
  resolveEffectiveUseResponsesApi,
  validateAzureGroups,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { createEndpointsConfigService } from './endpoints';
import { getResponsesApiRouting } from './responses';

const makeConfig = (endpoints: Record<string, unknown>): AppConfig => ({ endpoints }) as AppConfig;
const native = { default: true, on: true, off: false };
const disabled = { default: false, on: false, off: false };
const optIn = { default: false, on: true, off: false };

describe('server-effective Responses upload policy', () => {
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env.OPENAI_REVERSE_PROXY;
    delete process.env.AZURE_OPENAI_BASEURL;
    delete process.env.AZURE_OPENAI_DEFAULT_MODEL;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it.each(['gpt-6-sol', 'gpt-6-luna', 'gpt-6-astra'])(
    'computes native %s defaults and preserves explicit false',
    (model) => {
      const routing = getResponsesApiRouting(makeConfig({}), EModelEndpoint.openAI);
      expect(routing[model]).toEqual(native);
      expect(
        resolveEffectiveUseResponsesApi({ endpoint: EModelEndpoint.openAI, model, routing }),
      ).toBe(true);
      expect(
        resolveEffectiveUseResponsesApi({
          endpoint: EModelEndpoint.openAI,
          model,
          routing,
          value: false,
        }),
      ).toBe(false);
    },
  );

  it.each(['openAI', 'all'])('honors %s global route drops even over explicit true', (scope) => {
    const routing = getResponsesApiRouting(
      makeConfig({ [scope]: { dropParams: ['useResponsesApi'] } }),
      EModelEndpoint.openAI,
    );
    expect(routing['gpt-6-sol']).toEqual(disabled);
    expect(
      resolveEffectiveUseResponsesApi({
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-6-sol',
        value: true,
        routing,
      }),
    ).toBe(false);
  });

  it('publishes only booleans for a reverse proxy and never its URL or configuration', () => {
    process.env.OPENAI_REVERSE_PROXY = 'https://gateway.example/v1';
    const routing = getResponsesApiRouting(
      makeConfig({ openAI: { addParams: { user: 'private' } } }),
      EModelEndpoint.openAI,
    );
    expect(routing['gpt-6-sol']).toEqual(optIn);
    expect(JSON.stringify(routing)).not.toMatch(/gateway|private|https/);
  });

  it.each([false, true])('honors configured addParams route %s over stored settings', (value) => {
    const routing = getResponsesApiRouting(
      makeConfig({ openAI: { addParams: { useResponsesApi: value } } }),
      EModelEndpoint.openAI,
    );
    expect(routing['gpt-6-sol']).toEqual({ default: value, on: value, off: value });
  });

  it.each([undefined, 'https://azure-gateway.example/v1'])(
    'uses per-model Azure routing, including gateway %s',
    (baseURL) => {
      const validation = validateAzureGroups([
        {
          group: 'native',
          apiKey: 'test',
          instanceName: 'test-instance',
          deploymentName: 'production',
          version: '2025-04-01-preview',
          baseURL,
          models: { 'gpt-6-sol': true },
        },
        {
          group: 'off',
          apiKey: 'test',
          instanceName: 'test-instance',
          deploymentName: 'production',
          version: '2025-04-01-preview',
          models: { 'gpt-6-luna': true },
          dropParams: ['useResponsesApi'],
        },
      ]);
      expect(validation.isValid).toBe(true);
      const routing = getResponsesApiRouting(
        makeConfig({ azureOpenAI: validation }),
        EModelEndpoint.azureOpenAI,
      );
      expect(routing['gpt-6-sol']).toEqual(baseURL ? optIn : native);
      expect(routing['gpt-6-luna']).toEqual(disabled);
      expect(
        resolveEffectiveUseResponsesApi({
          endpoint: EModelEndpoint.azureOpenAI,
          model: 'not-deployed',
          routing,
        }),
      ).toBe(false);
    },
  );

  it('does not mutate cached endpoint entries across user configurations', async () => {
    const defaults = { openAI: { order: 0, userProvide: false } };
    const service = createEndpointsConfigService({
      getAppConfig: async () => makeConfig({}),
      loadDefaultEndpointsConfig: async () => defaults,
    });
    const a = await service.getEndpointsConfig({
      config: makeConfig({ openAI: { dropParams: ['useResponsesApi'] } }),
    } as never);
    const b = await service.getEndpointsConfig({ config: makeConfig({}) } as never);
    expect(a?.openAI?.responsesApiRouting?.['gpt-6-sol']).toEqual(disabled);
    expect(b?.openAI?.responsesApiRouting?.['gpt-6-sol']).toEqual(native);
    expect(defaults.openAI).not.toHaveProperty('responsesApiRouting');
  });

  it.each([false, true])('advertises Azure serverless defaults with global opt-out %s', (drop) => {
    const validation = validateAzureGroups([
      {
        group: 'serverless',
        apiKey: 'test',
        baseURL: 'https://inference.example/v1',
        serverless: true,
        models: { 'gpt-6-sol': true },
      },
    ]);
    expect(validation.isValid).toBe(true);
    const config = makeConfig({
      azureOpenAI: validation,
      all: { dropParams: drop ? ['useResponsesApi'] : [] },
    });
    const policy = getResponsesApiRouting(config, EModelEndpoint.azureOpenAI)['gpt-6-sol'];
    expect(policy).toEqual(drop ? disabled : { default: true, on: true, off: true });
  });

  it('honors model overrides and unknown transport policy conservatively', () => {
    expect(
      getResponsesApiRouting(
        makeConfig({ openAI: { addParams: { model: 'gpt-4.1' } } }),
        EModelEndpoint.openAI,
      )['gpt-6-sol'],
    ).toEqual(optIn);
    expect(
      resolveEffectiveUseResponsesApi({ endpoint: EModelEndpoint.azureOpenAI, model: 'gpt-6-sol' }),
    ).toBeUndefined();
    expect(
      resolveEffectiveUseResponsesApi({
        endpoint: EModelEndpoint.custom,
        model: 'gpt-6-sol',
        routing: { 'gpt-6-sol': native },
      }),
    ).toBeUndefined();
  });

  it('serves the sanitized policy through the real endpoint configuration response', async () => {
    const config = makeConfig({ openAI: { dropParams: ['useResponsesApi'] } });
    const service = createEndpointsConfigService({
      getAppConfig: async () => config,
      loadDefaultEndpointsConfig: async () => ({ openAI: { order: 0, userProvide: false } }),
    });
    const response = await service.getEndpointsConfig({ appConfig: config } as never);
    expect(response?.openAI?.responsesApiRouting?.['gpt-6-sol']).toEqual(disabled);
  });
});
