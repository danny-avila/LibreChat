import React from 'react';
import { act, render } from '@testing-library/react';
import type { ParentSubagentIndex, ParentSubagentSummary } from 'librechat-data-provider';
import { ParentSubagentsProvider, useParentSubagents } from './ParentSubagentsProvider';

const mockUseParentSubagentsQuery = jest.fn();

jest.mock('~/data-provider', () => ({
  useParentSubagentsQuery: (...args: unknown[]) => mockUseParentSubagentsQuery(...args),
}));

const eventChild: ParentSubagentSummary = {
  threadId: 'event-thread',
  parentMessageId: 'parent-message',
  subagentType: 'agent-1',
  subagentKind: 'agent',
  title: 'Event child',
  origin: 'event',
  actorId: 'actor-a',
  status: 'completed',
  latestTaskId: 'task-1',
  tasks: [{ taskId: 'task-1', status: 'completed' }],
  tasksTruncated: false,
};
const toolChild: ParentSubagentSummary = {
  ...eventChild,
  threadId: 'tool-thread',
  parentToolCallId: 'tool-call',
  origin: 'tool',
  actorId: undefined,
};

describe('ParentSubagentsProvider', () => {
  it('reconstructs event groups from one durable conversation query and refreshes that index', async () => {
    const refreshed: ParentSubagentIndex = {
      parentConversationId: 'parent-conversation',
      children: [{ ...eventChild, latestTaskId: 'task-2' }],
      childrenTruncated: false,
    };
    const refetch = jest.fn().mockResolvedValue({ data: refreshed });
    mockUseParentSubagentsQuery.mockReturnValue({
      data: {
        parentConversationId: 'parent-conversation',
        children: [eventChild, toolChild],
        childrenTruncated: false,
      },
      refetch,
    });
    let context: ReturnType<typeof useParentSubagents> | undefined;
    const Probe = () => {
      context = useParentSubagents();
      return null;
    };

    render(
      <ParentSubagentsProvider conversationId="parent-conversation" enabled>
        <Probe />
      </ParentSubagentsProvider>,
    );

    expect(mockUseParentSubagentsQuery).toHaveBeenCalledWith('parent-conversation', {
      enabled: true,
    });
    expect(context?.byMessageId.get('parent-message')).toEqual([eventChild]);
    expect(context?.byThreadId.get('tool-thread')).toEqual(toolChild);
    let result: ParentSubagentIndex | undefined;
    await act(async () => {
      result = await context?.refresh();
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(refreshed);
  });
});
