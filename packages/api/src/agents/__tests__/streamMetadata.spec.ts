import { concat } from '@langchain/core/utils/stream';
import { AIMessageChunk } from '@langchain/core/messages';
import { normalizeLangChainResponseMetadata } from '../metadata';

describe('agent stream response metadata aggregation', () => {
  it('does not leave duplicate scalar response metadata from merged chunks', () => {
    const chunkA = new AIMessageChunk({
      content: 'Hi',
      response_metadata: {
        model_name: 'openai/gpt-chat-latest-20260505',
        finish_reason: 'stop',
        model_provider: 'openai',
      },
    });
    const chunkB = new AIMessageChunk({
      content: '',
      response_metadata: {
        model_name: 'openai/gpt-chat-latest-20260505',
        finish_reason: 'stop',
        model_provider: 'openai',
      },
    });

    const merged = concat(chunkA, chunkB);
    expect(merged.response_metadata).toMatchObject({
      model_name: 'openai/gpt-chat-latest-20260505openai/gpt-chat-latest-20260505',
      finish_reason: 'stopstop',
      model_provider: 'openai',
    });

    normalizeLangChainResponseMetadata({
      generations: [[{ message: merged }]],
    });

    expect(merged.response_metadata).toEqual({
      model_name: 'openai/gpt-chat-latest-20260505',
      finish_reason: 'stop',
      model_provider: 'openai',
    });
  });

  it('collapses scalar response metadata repeated across more than two chunks', () => {
    const chunkA = new AIMessageChunk({
      content: 'Hi',
      response_metadata: {
        model_name: 'openai/gpt-chat-latest-20260505',
        finish_reason: 'stop',
      },
    });
    const chunkB = new AIMessageChunk({
      content: '',
      response_metadata: {
        model_name: 'openai/gpt-chat-latest-20260505',
        finish_reason: 'stop',
      },
    });
    const chunkC = new AIMessageChunk({
      content: '',
      response_metadata: {
        model_name: 'openai/gpt-chat-latest-20260505',
        finish_reason: 'stop',
      },
    });

    const merged = concat(concat(chunkA, chunkB), chunkC);

    normalizeLangChainResponseMetadata({
      generations: [[{ message: merged }]],
    });

    expect(merged.response_metadata).toMatchObject({
      model_name: 'openai/gpt-chat-latest-20260505',
      finish_reason: 'stop',
    });
  });
});
