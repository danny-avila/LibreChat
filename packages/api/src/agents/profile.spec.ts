import yaml from 'js-yaml';
import { Providers, initializeModel } from '@librechat/agents';
import {
  endpointSchema,
  extractEnvVariable,
  EModelEndpoint,
  ReasoningParameterFormat,
} from 'librechat-data-provider';
import type { TEndpoint } from 'librechat-data-provider';
import { getAgentInferencePolicy, parseAgentInferenceInput } from './input';
import { loadCustomEndpointsConfig } from '../endpoints/custom/config';
import { resolveAgentInferenceParameters } from './inference';
import { getOpenAIConfig } from '../endpoints/openai/config';
import { createCustomConfigLoader } from '../app/loader';

const variable = 'TEST_INFERENCE_GATEWAY_URL';
const original = process.env[variable];
const endpoint = (options: Partial<TEndpoint> = {}) => ({
  name: 'Gateway',
  apiKey: 'synthetic-key',
  baseURL: '${TEST_INFERENCE_GATEWAY_URL}',
  models: { default: ['permitted'], fetch: false },
  ...options,
});

afterEach(() => {
  if (original === undefined) delete process.env[variable];
  else process.env[variable] = original;
});

describe('trusted inference profile consistency', () => {
  it.each([undefined, { defaultParamsEndpoint: 'custom' }])(
    'resolves the configured URL before discovery, write validation, and runtime projection',
    async (customParams) => {
      process.env[variable] = 'https://openrouter.ai/api/v1';
      const text = yaml.dump({
        version: '1.3.17',
        endpoints: { custom: [endpoint({ customParams })] },
      });
      const config = await createCustomConfigLoader({
        defaultConfigPath: 'inference-profile.yaml',
        loadLocal: () => text,
        redactConfig: (value) => value,
      })(false);
      const loaded = endpointSchema.parse(config?.endpoints?.custom?.[0]);
      const appConfig = { endpoints: { custom: [loaded] } };
      const advertised = loadCustomEndpointsConfig([loaded])?.Gateway;
      const policy = getAgentInferencePolicy('Gateway', appConfig);
      expect(policy.customParams).toEqual(advertised?.customParams);
      expect(policy.customParams?.defaultParamsEndpoint).toBe('openrouter');
      const values = { promptCache: false, promptCacheTtl: '1h' };
      const parameters = parseAgentInferenceInput({
        provider: 'Gateway',
        model: 'permitted',
        parameters: values,
        appConfig,
      });
      expect(parameters).toEqual(values);
      const runtime = resolveAgentInferenceParameters({
        ...getAgentInferencePolicy('Gateway', appConfig, loaded),
        model: 'permitted',
        parameters: values,
      });
      expect(runtime.parameters).toEqual(values);
      const { llmConfig, configOptions, provider } = getOpenAIConfig(
        'synthetic-key',
        {
          reverseProxyUrl: extractEnvVariable(loaded.baseURL),
          customParams: loaded.customParams,
          modelOptions: { ...runtime.parameters, model: 'permitted' },
        },
        'Gateway',
      );
      expect(llmConfig.promptCache).not.toBe(true);
      const bodies: Record<string, unknown>[] = [];
      const client = initializeModel({
        provider: provider ?? Providers.OPENAI,
        clientOptions: {
          ...llmConfig,
          streaming: false,
          configuration: {
            ...configOptions,
            fetch: async (_url: unknown, init: { body?: unknown } | undefined) => {
              bodies.push(JSON.parse(String(init?.body)));
              return Response.json({
                id: 'chatcmpl-cache',
                object: 'chat.completion',
                created: 1,
                model: 'permitted',
                choices: [
                  {
                    index: 0,
                    message: { role: 'assistant', content: 'ok' },
                    finish_reason: 'stop',
                  },
                ],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
              });
            },
          },
        },
      });
      await client.invoke('hello');
      expect(bodies).toHaveLength(1);
      expect(JSON.stringify(bodies[0])).not.toContain('cache_control');
      expect(llmConfig).not.toHaveProperty('promptCacheTtl');
      expect(loaded.baseURL).toBe('${TEST_INFERENCE_GATEWAY_URL}');
      expect(loaded.customParams?.defaultParamsEndpoint).not.toBe('openrouter');
    },
  );

  it.each([
    { customParams: { defaultParamsEndpoint: EModelEndpoint.google } },
    { provider: EModelEndpoint.anthropic as const },
    {
      customParams: {
        defaultParamsEndpoint: 'custom',
        reasoningFormat: ReasoningParameterFormat.disabled,
      },
    },
    { dropParams: ['reasoning'] },
  ])('preserves explicit profile and capability decisions: %j', (overrides) => {
    process.env[variable] = 'https://openrouter.ai/api/v1';
    const loaded = endpointSchema.parse(endpoint(overrides));
    const policy = getAgentInferencePolicy('Gateway', { endpoints: { custom: [loaded] } });
    expect(policy.customParams).toEqual(loadCustomEndpointsConfig([loaded])?.Gateway?.customParams);
    expect(policy.customParams?.defaultParamsEndpoint).not.toBe('openrouter');
  });

  it.each([
    'https://openrouter.ai.untrusted.invalid/v1',
    'user_provided',
    'https://gateway.invalid/v1',
  ])('does not infer a profile from untrusted or unrelated destinations: %s', (url) => {
    process.env[variable] = url;
    const loaded = endpointSchema.parse(endpoint());
    const appConfig = { endpoints: { custom: [loaded] } };
    expect(getAgentInferencePolicy('Gateway', appConfig).customParams).toBeUndefined();
    expect(() =>
      parseAgentInferenceInput({
        provider: 'Gateway',
        model: 'permitted',
        parameters: { promptCache: false, baseURL: 'https://openrouter.ai' },
        appConfig,
      }),
    ).toThrow();
  });
});
