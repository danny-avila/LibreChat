import type { Response as ServerResponse } from 'express';
import type { OpenAIResponseContext } from './types';
import { sendFinalChunk, OpenAIModelEndHandler, createOpenAIStreamTracker } from './handlers';

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
});
