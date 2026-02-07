import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { SummarizeResult } from '@librechat/agents';
import {
  buildSummarizationPrompt,
  createSummarizeHandler,
  type SummarizationStatus,
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
