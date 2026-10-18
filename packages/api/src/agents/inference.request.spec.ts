import { ChatOpenAI } from '@librechat/agents/llm/openai';
import { resolveAgentInferenceParameters } from './inference';
import { getOpenAILLMConfig } from '~/endpoints/openai/llm';

const buildRequest = (parameters: Record<string, unknown>) => {
  const { parameters: inference } = resolveAgentInferenceParameters({
    parameters,
    provider: 'openAI',
    model: 'gpt-4o-mini',
  });
  const { llmConfig } = getOpenAILLMConfig({
    apiKey: 'synthetic-server-key',
    streaming: true,
    endpoint: 'openAI',
    modelOptions: { ...inference, model: 'gpt-4o-mini' },
  });
  const client = new ChatOpenAI(llmConfig as ConstructorParameters<typeof ChatOpenAI>[0]);
  return { request: client.invocationParams({}), client };
};

describe('inference parameters at the SDK request boundary', () => {
  it('cannot replace the authorized model, transport, tools, or identity', () => {
    const { request, client } = buildRequest({
      temperature: 0.3,
      model: 'gpt-4o',
      modelName: 'gpt-4o',
      modelKwargs: { model: 'gpt-4o', messages: ['untrusted'], tools: ['untrusted'] },
      apiKey: 'untrusted-key',
      configuration: { apiKey: 'untrusted-key', baseURL: 'https://unchecked.invalid' },
      fallbacks: [{ provider: 'openAI', clientOptions: { model: 'gpt-4o' } }],
      tools: ['untrusted'],
      user: 'untrusted-user',
      futureConstructorControl: { arbitrary: true },
    });
    expect(request.model).toBe('gpt-4o-mini');
    expect(request.temperature).toBe(0.3);
    expect(request.tools).toBeUndefined();
    expect(request).not.toHaveProperty('messages');
    expect(request.user).not.toBe('untrusted-user');
    expect(client.apiKey).toBe('synthetic-server-key');
    expect(JSON.stringify(request)).not.toContain('untrusted');
  });

  it('retains supported inference settings in the final wire payload', () => {
    const { request } = buildRequest({
      temperature: '0.4',
      top_p: 0.8,
      max_tokens: '256',
      stop: ['END'],
    });
    expect(request).toMatchObject({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      top_p: 0.8,
      max_tokens: 256,
      stop: ['END'],
    });
  });
});
