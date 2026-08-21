import { ContentTypes } from 'librechat-data-provider';
import type { SubagentThreadView, TMessageContentParts } from 'librechat-data-provider';
import { initSubagentAggregatorState, initSubagentTickerState } from '~/utils/subagentContent';
import { adaptDurableThreadActivity, adaptLivePersistedActivity } from './adapters';

describe('child activity adapters', () => {
  it('prefers authoritative parent persistence over a partial live foreground trace', () => {
    const activity = adaptLivePersistedActivity({
      title: 'researcher',
      progress: {
        subagentRunId: 'run',
        subagentType: 'researcher',
        status: 'message_delta',
        contentParts: [{ type: ContentTypes.TEXT, text: 'Partial live text.' }],
        aggregatorState: initSubagentAggregatorState(),
        tickerState: initSubagentTickerState(),
      },
      persistedContent: [
        { type: 'think', think: 'Visible reasoning.' },
        {
          type: 'tool_call',
          tool_call: {
            id: 'tool-1',
            name: 'search',
            args: '{"query":"release"}',
            output: 'Found it.',
            progress: 1,
          },
        },
        { type: 'text', text: 'Persisted answer.' },
      ] as unknown as TMessageContentParts[],
      initialProgress: 1,
      isSubmitting: false,
    });

    expect(activity.items).toEqual([
      { type: 'reasoning', text: 'Visible reasoning.' },
      expect.objectContaining({
        type: 'tool',
        toolCallId: 'tool-1',
        name: 'search',
        status: 'completed',
      }),
      { type: 'writing', text: 'Persisted answer.' },
    ]);
  });

  it('rehydrates the selected detached task from its sanitized durable activity', () => {
    const view: SubagentThreadView = {
      threadId: 'thread',
      parentConversationId: 'parent',
      parentMessageId: 'parent-message',
      parentToolCallId: 'parent-tool',
      subagentType: 'researcher',
      subagentKind: 'agent',
      title: 'Research child',
      status: 'completed',
      activity: [
        {
          type: 'tool',
          toolCallId: 'tool-1',
          name: 'search',
          input: '{"query":"release"}',
          output: 'Found it.',
          status: 'completed',
        },
        { type: 'writing', text: 'Durable answer.' },
      ],
      activityTruncated: false,
      messages: [
        {
          messageId: 'task:user',
          parentMessageId: null,
          role: 'user',
          text: 'Investigate the release.',
        },
        {
          messageId: 'task:assistant',
          parentMessageId: 'task:user',
          role: 'assistant',
          text: 'Durable answer.',
        },
      ],
      historyTruncated: false,
    };

    expect(adaptDurableThreadActivity(view, 'task')).toEqual(
      expect.objectContaining({
        title: 'Research child',
        prompt: 'Investigate the release.',
        status: 'completed',
        items: view.activity,
      }),
    );
  });
});
