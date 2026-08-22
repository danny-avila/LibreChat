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

  it('redacts detached live reasoning while retaining its activity marker', () => {
    const activity = adaptLivePersistedActivity({
      title: 'researcher',
      progress: null,
      persistedContent: [
        { type: ContentTypes.THINK, think: 'private live reasoning' },
        { type: ContentTypes.TEXT, text: 'Visible answer.' },
      ] as TMessageContentParts[],
      initialProgress: 0,
      isSubmitting: true,
      reasoningVisibility: 'marker',
    });

    expect(activity.items).toEqual([
      { type: 'reasoning' },
      { type: 'writing', text: 'Visible answer.' },
    ]);
    expect(JSON.stringify(activity)).not.toContain('private live reasoning');
  });

  it('keeps an empty-output approval pending', () => {
    const activity = adaptLivePersistedActivity({
      title: 'researcher',
      progress: null,
      persistedContent: [
        {
          type: ContentTypes.TOOL_CALL,
          [ContentTypes.TOOL_CALL]: {
            id: 'tool',
            name: 'protected_tool',
            args: '{}',
            output: '',
            progress: 0.1,
            approval: { expires_at: 123 },
          },
        },
      ] as unknown as TMessageContentParts[],
      initialProgress: 0,
      isSubmitting: true,
    });

    expect(activity.items[0]).toEqual(
      expect.objectContaining({
        type: 'tool',
        status: 'running',
        output: '',
        approval: expect.any(Object),
      }),
    );
  });

  it('keeps shared-message activity read-only by omitting approval controls', () => {
    const activity = adaptLivePersistedActivity({
      title: 'researcher',
      progress: null,
      persistedContent: [
        {
          type: ContentTypes.TOOL_CALL,
          [ContentTypes.TOOL_CALL]: {
            id: 'tool',
            name: 'protected_tool',
            args: '{}',
            output: '',
            progress: 0.1,
            approval: { expires_at: 123 },
          },
        },
      ] as unknown as TMessageContentParts[],
      initialProgress: 1,
      isSubmitting: false,
      approvalVisibility: 'hidden',
    });

    expect(activity.items[0]).toEqual(
      expect.objectContaining({ type: 'tool', name: 'protected_tool' }),
    );
    expect(activity.items[0]).not.toHaveProperty('approval');
  });

  it('uses the exact assistant row as terminal authority for an older API response', () => {
    const oldView = {
      threadId: 'thread',
      parentConversationId: 'parent',
      parentMessageId: 'parent-message',
      parentToolCallId: 'parent-tool',
      subagentType: 'researcher',
      subagentKind: 'agent',
      title: 'Research child',
      status: 'running',
      messages: [
        {
          messageId: 'task:assistant',
          parentMessageId: 'task:user',
          role: 'assistant',
          text: 'Done.',
        },
      ],
      historyTruncated: false,
    } as SubagentThreadView;

    expect(adaptDurableThreadActivity(oldView, 'task')).toEqual(
      expect.objectContaining({ status: 'completed', items: [{ type: 'writing', text: 'Done.' }] }),
    );
  });
});
