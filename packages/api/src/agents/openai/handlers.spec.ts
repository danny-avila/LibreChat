import type { Response as ServerResponse } from 'express';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import type { OpenAIResponseContext } from './types';
import {
  sendFinalChunk,
  buildCompletionUsage,
  OpenAIModelEndHandler,
  createOpenAIStreamTracker,
} from './handlers';

describe('OpenAI-compatible agent stream handlers', () => {
  const context: OpenAIResponseContext = {
    requestId: 'chatcmpl-test',
    created: 1778317637,
    model: 'anthropic/claude-sonnet-4.6',
  };

  it('preserves reasoning token usage from model end metadata', () => {
    const tracker = createOpenAIStreamTracker();
    const write = jest.fn();
    const handler = new OpenAIModelEndHandler({
      context,
      tracker,
      res: { write } as unknown as ServerResponse,
    });

    handler.handle('on_chat_model_end', {
      output: {
        usage_metadata: {
          input_tokens: 64,
          output_tokens: 3315,
          output_token_details: {
            reasoning: 641,
          },
        },
      },
    });

    expect(tracker.usage).toEqual({
      promptTokens: 64,
      completionTokens: 3315,
      reasoningTokens: 641,
    });
  });

  it('includes reasoning token details in the final streamed usage chunk', () => {
    const tracker = createOpenAIStreamTracker();
    tracker.usage.promptTokens = 64;
    tracker.usage.completionTokens = 3315;
    tracker.usage.reasoningTokens = 641;

    const writes: string[] = [];
    const res = {
      write: (chunk: string) => {
        writes.push(chunk);
      },
    } as unknown as ServerResponse;

    sendFinalChunk({ context, tracker, res });

    const finalChunk = JSON.parse(writes[0].replace(/^data: /, '').trim());
    expect(finalChunk.usage).toEqual({
      prompt_tokens: 64,
      completion_tokens: 3315,
      total_tokens: 3379,
      completion_tokens_details: {
        reasoning_tokens: 641,
      },
    });
  });

  it('finishes as tool_calls even when the model also streamed text', () => {
    const tracker = createOpenAIStreamTracker();
    tracker.addText();
    tracker.toolCalls.set(0, {
      id: 'tooluse_1',
      type: 'function',
      function: { name: 'get_time', arguments: '{"city":"Madrid"}' },
    });

    const writes: string[] = [];
    const res = {
      write: (chunk: string) => {
        writes.push(chunk);
      },
    } as unknown as ServerResponse;

    sendFinalChunk({ context, tracker, res });

    const finalChunk = JSON.parse(writes[0].replace(/^data: /, '').trim());
    expect(finalChunk.choices[0].finish_reason).toBe('tool_calls');
  });

  it('streams the collected primary and subagent usage override', () => {
    const tracker = createOpenAIStreamTracker();
    const writes: string[] = [];
    const res = {
      write: (chunk: string) => {
        writes.push(chunk);
      },
    } as unknown as ServerResponse;
    const usage = buildCompletionUsage([
      { input_tokens: 100, output_tokens: 40, provider: 'openai' },
      {
        input_tokens: 25,
        output_tokens: 10,
        provider: 'openai',
        usage_type: 'subagent',
      },
    ]);

    sendFinalChunk({ context, tracker, res }, 'stop', usage);

    const finalChunk = JSON.parse(writes[0].replace(/^data: /, '').trim());
    expect(finalChunk.usage).toEqual({
      prompt_tokens: 125,
      completion_tokens: 50,
      total_tokens: 175,
      primary: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
      subagent: { prompt_tokens: 25, completion_tokens: 10, total_tokens: 35 },
    });
  });

  it('snapshots completed response usage before later detached calls arrive', () => {
    const collectedUsage: UsageMetadata[] = [
      { input_tokens: 100, output_tokens: 40, provider: 'openAI' },
    ];
    const completedUsage = buildCompletionUsage(collectedUsage);

    collectedUsage.push({
      input_tokens: 25,
      output_tokens: 10,
      provider: 'openAI',
      usage_type: 'subagent',
    });

    expect(completedUsage).toEqual({
      prompt_tokens: 100,
      completion_tokens: 40,
      total_tokens: 140,
      primary: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
      subagent: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  });
});
