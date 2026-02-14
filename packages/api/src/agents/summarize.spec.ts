import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { SummarizeResult, Providers } from '@librechat/agents';

const mockInvoke = jest.fn();
const mockChatModelClass = jest.fn().mockImplementation(() => ({
  invoke: mockInvoke,
}));
jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  getChatModelClass: () => mockChatModelClass,
}));

import {
  buildSummarizationPrompt,
  createSummarizeHandler,
  createSummarizeFn,
  resolveSummarizationLLMConfig,
  type SummarizationStatus,
  type SummarizationUsage,
  type GetProviderOptionsFn,
} from './summarize';

describe('buildSummarizationPrompt', () => {
  it('includes custom prompt and conversation transcript', () => {
    const prompt = buildSummarizationPrompt(
      [new HumanMessage('Hello'), new AIMessage('Hi there')],
      'Custom summary prompt',
    );

    expect(prompt).toContain('Custom summary prompt');
    expect(prompt).toContain('Human: Hello');
    expect(prompt).toContain('AI: Hi there');
  });

  it('throws when prompt is not configured', () => {
    expect(() => buildSummarizationPrompt([new HumanMessage('Hello')])).toThrow(
      'Summarization prompt must be configured',
    );
  });
});

describe('resolveSummarizationLLMConfig', () => {
  it('returns disabled when no config is provided', () => {
    const resolved = resolveSummarizationLLMConfig({ agentId: 'agent_1' });
    expect(resolved.provider).toBeUndefined();
    expect(resolved.model).toBeUndefined();
    expect(resolved.parameters).toEqual({});
    expect(resolved.enabled).toBe(false);
  });

  it('uses global config directly', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_1',
      globalConfig: {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        parameters: { temperature: 0.2 },
        prompt: 'Custom global',
      },
    });
    expect(resolved.provider).toBe('anthropic');
    expect(resolved.model).toBe('claude-sonnet-4-5');
    expect(resolved.parameters.temperature).toBe(0.2);
    expect(resolved.prompt).toBe('Custom global');
  });

  it('uses agent runtime config as fallback for provider/model', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_1',
      globalConfig: { enabled: true, prompt: 'Configured prompt' },
      agentRuntimeConfig: { provider: 'google', model: 'gemini-2.5-flash' },
    });
    expect(resolved.provider).toBe('google');
    expect(resolved.model).toBe('gemini-2.5-flash');
    expect(resolved.enabled).toBe(true);
  });

  it('per-agent override takes highest precedence', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_special',
      globalConfig: {
        enabled: true,
        provider: 'openAI',
        model: 'gpt-4.1-mini',
        prompt: 'Global prompt',
        agents: {
          agent_special: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            prompt: 'Agent-specific prompt',
          },
        },
      },
      agentRuntimeConfig: { provider: 'google', model: 'gemini-2.5-flash' },
    });
    expect(resolved.provider).toBe('anthropic');
    expect(resolved.model).toBe('claude-sonnet-4-5');
    expect(resolved.prompt).toBe('Agent-specific prompt');
  });

  it('per-agent override can disable summarization', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_disabled',
      globalConfig: {
        enabled: true,
        provider: 'openAI',
        model: 'gpt-4.1-mini',
        prompt: 'Global prompt',
        agents: {
          agent_disabled: { enabled: false },
        },
      },
    });
    expect(resolved.enabled).toBe(false);
  });
});

describe('createSummarizeFn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvoke.mockResolvedValue({
      content: 'Summary of the conversation',
      usage_metadata: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    });
  });

  it('invokes model and returns response with usage metadata', async () => {
    const usages: SummarizationUsage[] = [];
    const resolveConfig = () => ({
      enabled: true,
      provider: 'openAI',
      model: 'gpt-4.1-mini',
      parameters: { temperature: 0.3 },
      prompt: 'Config-driven prompt',
    });
    const getProviderOptions: GetProviderOptionsFn = async (resolved) => ({
      provider: resolved.provider as Providers,
      clientOptions: { model: resolved.model },
      model: resolved.model,
    });

    const fn = createSummarizeFn({
      resolveConfig,
      getProviderOptions,
      onUsage: (u) => {
        usages.push(u);
      },
    });

    const result = await fn({
      agentId: 'agent_1',
      context: [new HumanMessage('Recent')],
      messagesToRefine: [new HumanMessage('Old')],
      remainingContextTokens: 100,
    });

    expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining('Config-driven prompt'));
    expect(result.text).toBe('Summary of the conversation');
    expect(result.tokenCount).toBe(50);
    expect(result.model).toBe('gpt-4.1-mini');
    expect(result.provider).toBe('openAI');
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({
      type: 'summarization',
      input_tokens: 100,
      output_tokens: 50,
    });
  });

  it('falls back to character estimate when no usage metadata', async () => {
    mockInvoke.mockResolvedValue({ content: 'Short summary' });
    const resolveConfig = () => ({
      enabled: true,
      provider: 'openAI',
      model: 'gpt-4.1-mini',
      parameters: {},
      prompt: 'Config-driven prompt',
    });
    const getProviderOptions: GetProviderOptionsFn = async (resolved) => ({
      provider: resolved.provider as Providers,
      clientOptions: { model: resolved.model },
      model: resolved.model,
    });

    const fn = createSummarizeFn({ resolveConfig, getProviderOptions });
    const result = await fn({
      agentId: 'agent_1',
      context: [],
      messagesToRefine: [],
      remainingContextTokens: 100,
    });

    expect(result.tokenCount).toBe(Math.ceil('Short summary'.length / 3.5));
  });

  it('caches model per agentId/provider/model key', async () => {
    const resolveConfig = () => ({
      enabled: true,
      provider: 'openAI',
      model: 'gpt-4.1-mini',
      parameters: {},
      prompt: 'Configured prompt',
    });
    const getProviderOptions: GetProviderOptionsFn = async (resolved) => ({
      provider: resolved.provider as Providers,
      clientOptions: { model: resolved.model },
      model: resolved.model,
    });

    const fn = createSummarizeFn({ resolveConfig, getProviderOptions });
    const params = {
      agentId: 'agent_1',
      context: [],
      messagesToRefine: [],
      remainingContextTokens: 100,
    };

    await fn(params);
    await fn(params);

    expect(mockChatModelClass).toHaveBeenCalledTimes(1);
  });

  it('throws when agent summarization is disabled', async () => {
    const resolveConfig = () => ({
      enabled: false,
      provider: 'openAI',
      model: 'gpt-4.1-mini',
      parameters: {},
      prompt: 'Configured prompt',
    });
    const getProviderOptions: GetProviderOptionsFn = async (resolved) => ({
      provider: resolved.provider as Providers,
      clientOptions: { model: resolved.model },
      model: resolved.model,
    });

    const fn = createSummarizeFn({ resolveConfig, getProviderOptions });
    await expect(
      fn({
        agentId: 'agent_disabled',
        context: [],
        messagesToRefine: [],
        remainingContextTokens: 100,
      }),
    ).rejects.toThrow('disabled');
  });

  it('uses staged chunk-and-merge summarization for oversized refine sets', async () => {
    const usages: SummarizationUsage[] = [];
    const resolveConfig = () => ({
      enabled: true,
      provider: 'openAI',
      model: 'gpt-4.1-mini',
      parameters: {
        parts: 2,
        minMessagesForSplit: 2,
        maxInputTokensForSinglePass: 1,
      },
      prompt: 'Configured prompt',
    });
    const getProviderOptions: GetProviderOptionsFn = async (resolved) => ({
      provider: resolved.provider as Providers,
      clientOptions: { model: resolved.model },
      model: resolved.model,
    });

    mockInvoke
      .mockResolvedValueOnce({
        content: 'Chunk summary 1',
        usage_metadata: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
      })
      .mockResolvedValueOnce({
        content: 'Chunk summary 2',
        usage_metadata: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
      })
      .mockResolvedValueOnce({
        content: 'Merged summary',
        usage_metadata: { input_tokens: 15, output_tokens: 8, total_tokens: 23 },
      });

    const fn = createSummarizeFn({
      resolveConfig,
      getProviderOptions,
      onUsage: (u) => usages.push(u),
    });

    const result = await fn({
      agentId: 'agent_1',
      context: [],
      messagesToRefine: [new HumanMessage('Older message 1'), new HumanMessage('Older message 2')],
      remainingContextTokens: 100,
    });

    expect(result.text).toBe('Merged summary');
    expect(result.tokenCount).toBe(8);
    expect(mockInvoke).toHaveBeenCalledTimes(3);
    expect(usages.map((u) => u.phase)).toEqual(['chunk', 'chunk', 'merge']);
  });

  it('falls back to staged summarization when single-pass invocation fails', async () => {
    const resolveConfig = () => ({
      enabled: true,
      provider: 'openAI',
      model: 'gpt-4.1-mini',
      parameters: {
        parts: 2,
        minMessagesForSplit: 2,
        maxInputTokensForSinglePass: 999999,
      },
      prompt: 'Configured prompt',
    });
    const getProviderOptions: GetProviderOptionsFn = async (resolved) => ({
      provider: resolved.provider as Providers,
      clientOptions: { model: resolved.model },
      model: resolved.model,
    });

    mockInvoke
      .mockRejectedValueOnce(new Error('single-pass failed'))
      .mockResolvedValueOnce({
        content: 'Chunk fallback 1',
        usage_metadata: { input_tokens: 12, output_tokens: 6, total_tokens: 18 },
      })
      .mockResolvedValueOnce({
        content: 'Chunk fallback 2',
        usage_metadata: { input_tokens: 12, output_tokens: 6, total_tokens: 18 },
      })
      .mockResolvedValueOnce({
        content: 'Merged fallback',
        usage_metadata: { input_tokens: 8, output_tokens: 5, total_tokens: 13 },
      });

    const fn = createSummarizeFn({ resolveConfig, getProviderOptions });
    const result = await fn({
      agentId: 'agent_1',
      context: [],
      messagesToRefine: [new HumanMessage('Older message 1'), new HumanMessage('Older message 2')],
      remainingContextTokens: 100,
    });

    expect(result.text).toBe('Merged fallback');
    expect(result.tokenCount).toBe(5);
    expect(mockInvoke).toHaveBeenCalledTimes(4);
  });
});

describe('createSummarizeHandler', () => {
  it('resolves summary result and persistence metadata', async () => {
    const statuses: SummarizationStatus[] = [];
    const summarize = jest.fn().mockResolvedValue({
      text: 'Summarized context',
      tokenCount: 42,
      model: 'gpt-test',
      provider: 'openAI',
    });
    const persistSummary = jest.fn().mockResolvedValue({
      status: 'persisted',
      targetMessageId: 'msg_1',
      targetContentIndex: 3,
    });

    const handler = createSummarizeHandler({
      summarize,
      persistSummary,
      onStatusChange: (status) => {
        statuses.push(status);
      },
    });

    const result = await new Promise<SummarizeResult>((resolve, reject) =>
      handler.handle('on_summarize', {
        context: [new HumanMessage('Recent context')],
        agentId: 'agent_1',
        configurable: { thread_id: 'thread_1' },
        metadata: { run_id: 'run_1' },
        messagesToRefine: [new HumanMessage('Older context')],
        remainingContextTokens: 100,
        resolve,
        reject,
      }),
    );

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(persistSummary).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      text: 'Summarized context',
      tokenCount: 42,
      model: 'gpt-test',
      provider: 'openAI',
      targetMessageId: 'msg_1',
      targetContentIndex: 3,
    });
    expect(statuses[0]).toMatchObject({ status: 'started', agentId: 'agent_1' });
    expect(statuses[1]).toMatchObject({
      status: 'completed',
      persistence: 'persisted',
      agentId: 'agent_1',
    });
  });

  it('rejects and emits failed status when summarize throws', async () => {
    const statuses: SummarizationStatus[] = [];
    const handler = createSummarizeHandler({
      summarize: async () => {
        throw new Error('summarization failed');
      },
      onStatusChange: (status) => {
        statuses.push(status);
      },
    });

    await expect(
      new Promise<SummarizeResult>((resolve, reject) =>
        handler.handle('on_summarize', {
          context: [new HumanMessage('Recent context')],
          agentId: 'agent_1',
          messagesToRefine: [new HumanMessage('Older context')],
          remainingContextTokens: 100,
          resolve,
          reject,
        }),
      ),
    ).rejects.toThrow('summarization failed');

    expect(statuses[0]).toMatchObject({ status: 'started', agentId: 'agent_1' });
    expect(statuses[1]).toMatchObject({
      status: 'failed',
      agentId: 'agent_1',
      error: 'summarization failed',
    });
  });
});
