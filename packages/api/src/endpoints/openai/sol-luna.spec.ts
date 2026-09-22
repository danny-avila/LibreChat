import { createTxMethods } from '@librechat/data-schemas';
import { HumanMessage } from '@librechat/agents/langchain';
import { Providers, initializeModel } from '@librechat/agents';
import { EModelEndpoint, ReasoningEffort, ReasoningParameterFormat } from 'librechat-data-provider';
import type { AIMessageChunk } from '@librechat/agents/langchain';
import type { OpenAIConfiguration } from '~/types';
import { computeUsageCostUSD, recordCollectedUsage } from '~/agents/usage';
import { matchModelName, findMatchingPattern } from '~/utils/tokens';
import { getOpenAIConfig } from './config';
import { getOpenAILLMConfig } from './llm';

const pricing = createTxMethods({} as typeof import('mongoose'), {
  matchModelName: (model, endpoint) => matchModelName(model, endpoint as EModelEndpoint),
  findMatchingPattern: (model, values) => findMatchingPattern(model, values) ?? undefined,
});
const tool = {
  type: 'function' as const,
  function: {
    name: 'lookup',
    description: 'Look up a value',
    parameters: { type: 'object', properties: {} },
  },
};
const azure = {
  azureOpenAIApiKey: 'test-key',
  azureOpenAIApiInstanceName: 'test-instance',
  azureOpenAIApiDeploymentName: 'production-deployment',
  azureOpenAIApiVersion: '2025-04-01-preview',
};

describe.each(['gpt-6-sol', 'gpt-6-luna'])('%s requests', (model) => {
  const config = (overrides: Partial<Parameters<typeof getOpenAILLMConfig>[0]> = {}) =>
    getOpenAILLMConfig({
      apiKey: 'test-key',
      streaming: false,
      endpoint: EModelEndpoint.openAI,
      modelOptions: { model },
      ...overrides,
    }).llmConfig;

  it.each([undefined, '', 'none', 'low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'defaults to Responses with effort %s before tools are bound',
    (effort) => {
      expect(
        config({
          modelOptions: { model, reasoning_effort: effort as ReasoningEffort, max_tokens: 2048 },
        }),
      ).toMatchObject({
        useResponsesApi: true,
        modelKwargs: { max_output_tokens: 2048 },
      });
    },
  );
  it.each([
    { modelOptions: { model, useResponsesApi: false, reasoning_effort: ReasoningEffort.none } },
    { addParams: { useResponsesApi: false } },
    { dropParams: ['useResponsesApi'] },
    { endpoint: EModelEndpoint.custom },
    { baseURL: 'https://gateway.example/v1' },
    { useOpenRouter: true },
  ])('respects explicit routes and compatible providers: %j', (overrides) => {
    expect(config(overrides).useResponsesApi).not.toBe(true);
  });
  it.each([
    { dropParams: ['reasoning_effort'] },
    { reasoningFormat: ReasoningParameterFormat.disabled },
  ])('still routes unset provider reasoning to Responses: %j', (overrides) => {
    expect(config(overrides).useResponsesApi).toBe(true);
  });
  it('routes using the final model override, not the stale selected model', () => {
    expect(
      config({ modelOptions: { model: 'gpt-4.1' }, addParams: { model } }).useResponsesApi,
    ).toBe(true);
    expect(config({ addParams: { model: 'gpt-4.1' } }).useResponsesApi).not.toBe(true);
    expect(config({ modelOptions: { model: `${model}-2026-09-22` } }).useResponsesApi).toBe(true);
  });
  it('normalizes restored minimal effort without mutating saved settings or bypassing drops', () => {
    const saved = { model, reasoning_effort: ReasoningEffort.minimal };
    expect(config({ modelOptions: saved }).reasoning).toEqual({ effort: 'low' });
    expect(saved.reasoning_effort).toBe('minimal');
    expect(
      config({ modelOptions: saved, dropParams: ['reasoning_effort'] }).reasoning,
    ).toBeUndefined();
    expect(
      (
        config({ modelOptions: saved, baseURL: 'https://gateway.example/v1' }) as Record<
          string,
          unknown
        >
      ).reasoning_effort,
    ).toBe('minimal');
    expect(
      config({ modelOptions: saved, azure, endpoint: EModelEndpoint.azureOpenAI }).reasoning,
    ).toEqual({ effort: 'low' });
  });

  it.each([
    [false, false, undefined],
    [false, true, undefined],
    [true, false, undefined],
    [true, true, 'max'],
    [false, true, 'none'],
    [false, false, 'none', true],
    [true, false, 'none', true],
    [false, false, 'max', true, false],
    [true, false, 'max', true, false],
    [false, true, 'low', false, false],
    [true, true, 'low', false, false],
    [false, false, undefined, false, false],
    [false, true, undefined, false, false],
  ] as const)(
    'serializes tools with Azure=%s streaming=%s effort=%s and preserves cache usage',
    async (
      isAzure,
      streaming,
      effort,
      chatCompletions: boolean = false,
      withTools: boolean = true,
    ) => {
      const bodies: Record<string, unknown>[] = [];
      const urls: string[] = [];
      const response = {
        id: 'resp_test',
        object: 'response',
        status: 'completed',
        model,
        choices: [
          { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
        ],
        output: [
          {
            type: 'message',
            id: 'msg_test',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'OK', annotations: [] }],
          },
        ],
        usage: {
          prompt_tokens: 300000,
          completion_tokens: 100,
          prompt_tokens_details: { cached_tokens: 100000, cache_write_tokens: 50000 },
          input_tokens: 300000,
          output_tokens: 100,
          total_tokens: 300100,
          input_tokens_details: { cached_tokens: 100000, cache_write_tokens: 50000 },
          output_tokens_details: { reasoning_tokens: 10 },
        },
      };
      const fetch: NonNullable<NonNullable<OpenAIConfiguration>['fetch']> = async (url, init) => {
        urls.push(String(url));
        bodies.push(JSON.parse(String(init?.body)));
        if (!streaming) return Response.json(response);
        const events = [
          {
            type: 'response.created',
            response: { ...response, output: [], status: 'in_progress' },
          },
          {
            type: 'response.output_text.delta',
            item_id: 'msg_test',
            output_index: 0,
            content_index: 0,
            delta: 'OK',
          },
          { type: 'response.completed', response },
        ];
        return new Response(
          events
            .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
            .join(''),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      };
      const { llmConfig, configOptions } = getOpenAIConfig(
        'test-key',
        {
          streaming,
          modelOptions: {
            model,
            max_tokens: 2048,
            reasoning_effort: effort as ReasoningEffort,
            temperature: 0.7,
            top_p: 0.9,
            ...(chatCompletions ? { useResponsesApi: false } : {}),
          },
          addParams: { logprobs: true, topLogprobs: 3 },
          ...(isAzure ? { azure } : {}),
        },
        isAzure ? EModelEndpoint.azureOpenAI : EModelEndpoint.openAI,
      );
      const bound = initializeModel({
        provider: isAzure && chatCompletions ? Providers.AZURE : Providers.OPENAI,
        clientOptions: {
          ...llmConfig,
          verbosity: undefined,
          configuration: { ...configOptions, fetch },
          streamUsage: true,
        },
        tools: withTools ? [tool] : [],
      });
      const messages = [
        new HumanMessage({
          content: [
            { type: 'text', text: 'Look up the value' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,dGVzdA==' } },
          ],
        }),
      ];
      let message: AIMessageChunk;
      if (streaming) {
        let aggregate: AIMessageChunk | undefined;
        for await (const chunk of await bound.stream(messages)) {
          aggregate = aggregate ? aggregate.concat(chunk) : chunk;
        }
        message = aggregate!;
      } else {
        message = await bound.invoke(messages);
      }
      expect(urls[0]).toContain(chatCompletions ? '/chat/completions' : '/responses');
      expect(new URL(urls[0]).hostname).toBe(
        isAzure ? 'test-instance.openai.azure.com' : 'api.openai.com',
      );
      expect(bodies[0].model).toBe(isAzure ? 'production-deployment' : model);
      expect(bodies[0]).toHaveProperty(
        chatCompletions ? 'max_completion_tokens' : 'max_output_tokens',
        2048,
      );
      expect(bodies[0]).not.toHaveProperty(
        chatCompletions ? 'max_output_tokens' : 'max_completion_tokens',
      );
      if (withTools) expect(bodies[0].tools).toHaveLength(1);
      else expect(bodies[0].tools ?? []).toHaveLength(0);
      if (effort)
        expect(bodies[0]).toHaveProperty(
          chatCompletions ? 'reasoning_effort' : 'reasoning.effort',
          effort,
        );
      expect(JSON.stringify(bodies[0][chatCompletions ? 'messages' : 'input'])).toContain(
        'data:image/png;base64,dGVzdA==',
      );
      const reasoningEnabledResponses = !chatCompletions && effort !== ReasoningEffort.none;
      if (reasoningEnabledResponses) {
        for (const param of ['temperature', 'top_p', 'logprobs', 'top_logprobs']) {
          expect(bodies[0]).not.toHaveProperty(param);
        }
      } else {
        expect(bodies[0]).toHaveProperty('temperature', 0.7);
      }
      expect(message.usage_metadata).toMatchObject({
        input_tokens: 300000,
        output_tokens: 100,
        input_token_details: chatCompletions
          ? { cache_read: 100000 }
          : { cache_read: 100000, cache_creation: 50000 },
      });

      if (!chatCompletions) {
        const usage = { ...message.usage_metadata!, provider: Providers.OPENAI, model };
        // Full prompt crosses 272K: all reported categories use premium rates.
        const expected = model === 'gpt-6-sol' ? 0.8915 : 0.044575;
        expect(computeUsageCostUSD(usage, pricing)).toBeCloseTo(expected, 8);
        const spendTokens = jest.fn().mockResolvedValue(undefined);
        const spendStructuredTokens = jest.fn().mockResolvedValue(undefined);
        await recordCollectedUsage(
          { spendTokens, spendStructuredTokens, pricing },
          {
            user: 'test-user',
            conversationId: 'test-conversation',
            model,
            context: 'message',
            collectedUsage: [usage],
            transactions: { enabled: true },
          },
        );
        expect(spendTokens).not.toHaveBeenCalled();
        expect(spendStructuredTokens).toHaveBeenCalledWith(expect.objectContaining({ model }), {
          promptTokens: { input: 150000, write: 50000, read: 100000 },
          completionTokens: 100,
        });
      }
    },
  );
});
