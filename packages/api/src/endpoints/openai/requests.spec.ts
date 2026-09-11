import { Providers, initializeModel } from '@librechat/agents';
import { EModelEndpoint, ReasoningEffort } from 'librechat-data-provider';
import type { OpenAI } from 'openai';
import type { OpenAIConfiguration } from '~/types';
import { getOpenAIConfig } from './config';

describe('Azure Astra requests', () => {
  it.each(['gpt-6-astra', 'production-deployment'])(
    'sends tool requests to Responses with deployment %s and Astra constraints',
    async (deploymentName) => {
      const requests: {
        url: URL;
        headers: Headers;
        body: OpenAI.Responses.ResponseCreateParams;
      }[] = [];
      const fetch: NonNullable<NonNullable<OpenAIConfiguration>['fetch']> = async (url, init) => {
        requests.push({
          url: new URL(String(url)),
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({
          id: 'resp_test',
          object: 'response',
          status: 'completed',
          model: deploymentName,
          output: [
            {
              type: 'function_call',
              id: 'fc_test',
              call_id: 'call_test',
              name: 'calculator',
              arguments: '{"input":"2 + 2"}',
              status: 'completed',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        });
      };
      const { llmConfig, configOptions } = getOpenAIConfig(
        'test-azure-key',
        {
          streaming: false,
          azure: {
            azureOpenAIApiInstanceName: 'test-instance',
            azureOpenAIApiDeploymentName: deploymentName,
            azureOpenAIApiVersion: '2025-04-01-preview',
            azureOpenAIApiKey: 'test-azure-key',
          },
          modelOptions: {
            model: 'gpt-6-astra',
            reasoning_effort: ReasoningEffort.none,
            max_tokens: 2048,
            temperature: 0.7,
            top_p: 0.9,
          },
          addParams: { logprobs: true, topLogprobs: 5, store: false },
        },
        EModelEndpoint.azureOpenAI,
      );
      expect(llmConfig).not.toHaveProperty('azureOpenAIApiInstanceName');
      const model = initializeModel({
        provider: Providers.OPENAI,
        clientOptions: {
          ...llmConfig,
          verbosity: undefined,
          configuration: { ...configOptions, fetch },
        },
        tools: [
          {
            type: 'function',
            function: {
              name: 'calculator',
              description: 'Compute arithmetic',
              parameters: {
                type: 'object',
                properties: { input: { type: 'string' } },
                required: ['input'],
              },
            },
          },
        ],
      });

      const result = await model.invoke('Use the calculator to compute 2 + 2.');

      expect(result.tool_calls).toEqual([
        expect.objectContaining({ name: 'calculator', args: { input: '2 + 2' } }),
      ]);
      expect(requests).toHaveLength(1);
      const { url, headers, body } = requests[0];
      expect(url.origin + url.pathname).toBe(
        'https://test-instance.openai.azure.com/openai/v1/responses',
      );
      expect(headers.get('api-key')).toBe('test-azure-key');
      expect(body).toMatchObject({
        model: deploymentName,
        max_output_tokens: 2048,
        reasoning: { effort: 'low' },
        tools: [expect.objectContaining({ type: 'function', name: 'calculator' })],
        include: expect.arrayContaining(['reasoning.encrypted_content']),
      });
      for (const key of [
        'max_tokens',
        'max_completion_tokens',
        'temperature',
        'top_p',
        'logprobs',
        'top_logprobs',
      ]) {
        expect(body).not.toHaveProperty(key);
      }
      expect(body.include).not.toContain('message.output_text.logprobs');
    },
  );
});
