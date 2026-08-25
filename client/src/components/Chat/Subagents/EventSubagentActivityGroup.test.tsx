import React from 'react';
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ParentSubagentSummary } from 'librechat-data-provider';
import type { ActiveSubagentPanel } from '~/store/subagents';
import EventSubagentActivityGroup from './EventSubagentActivityGroup';
import { activeSubagentPanel } from '~/store/subagents';

const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockChild: ParentSubagentSummary = {
  threadId: 'event-thread',
  parentMessageId: 'parent-message',
  subagentType: 'agent-1',
  subagentKind: 'agent',
  agentId: 'agent-1',
  title: 'Actor child',
  origin: 'event',
  actorId: 'actor-a',
  status: 'running',
  latestTaskId: 'task-1',
  tasks: [{ taskId: 'task-1', status: 'running' }],
  tasksTruncated: false,
};
const mockCompletedChild: ParentSubagentSummary = {
  ...mockChild,
  threadId: 'event-thread-2',
  parentMessageId: 'assistant-message',
  agentId: 'agent-2',
  actorId: 'actor-b',
  status: 'completed',
  latestTaskId: 'task-2',
  tasks: [{ taskId: 'task-2', status: 'completed' }],
};
let mockChildrenByMessage = new Map<string, ParentSubagentSummary[]>();

jest.mock('./ParentSubagentsProvider', () => ({
  useParentSubagents: () => ({
    byMessageId: mockChildrenByMessage,
    byThreadId: new Map([['event-thread', mockChild]]),
    refresh: mockRefresh,
  }),
}));

jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => ({
    'agent-1': { id: 'agent-1', name: 'Visible Agent' },
    'agent-2': { id: 'agent-2', name: 'Completed Agent' },
  }),
}));

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  renderAgentAvatar: () => <span data-testid="agent-avatar" />,
}));
jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  cn: (...values: Array<string | false | undefined>) => values.filter(Boolean).join(' '),
}));
jest.mock('lucide-react', () => ({
  AlertCircle: () => null,
  Bot: () => null,
  ChevronDown: () => null,
  Check: () => null,
  CheckCircle2: () => null,
  CircleAlert: () => null,
  Clock3: () => null,
  LoaderCircle: () => null,
  X: () => null,
  XCircle: () => null,
}));

describe('EventSubagentActivityGroup', () => {
  beforeEach(() => {
    mockRefresh.mockReset().mockResolvedValue(undefined);
    mockChildrenByMessage = new Map([['parent-message', [mockChild]]]);
  });

  it('opens the durable event child under its owning parent message', () => {
    let selection: ActiveSubagentPanel | null = null;
    const Observer = () => {
      selection = useRecoilValue(activeSubagentPanel);
      return null;
    };
    render(
      <RecoilRoot>
        <Observer />
        <EventSubagentActivityGroup
          conversationId="parent-conversation"
          parentMessageIds={['parent-message']}
        />
      </RecoilRoot>,
    );

    expect(
      screen.getByRole('region', { name: 'com_ui_subagent_activity' }).parentElement,
    ).toHaveClass('px-4', 'sm:px-0', 'md:max-w-3xl', 'xl:max-w-4xl');
    expect(screen.queryByRole('button', { name: /Visible Agent/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /com_ui_subagent_activity/ }));
    fireEvent.click(screen.getByRole('button', { name: /Visible Agent/ }));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(selection).toEqual(
      expect.objectContaining({
        host: 'conversation',
        parentConversationId: 'parent-conversation',
        parentMessageId: 'parent-message',
        toolCallId: 'event-thread:event-thread',
        durable: { threadId: 'event-thread', taskId: 'task-1' },
        event: {
          actorId: 'actor-a',
          progressKey: 'event-task:event-thread:task-1',
          siblingParentMessageIds: ['parent-message'],
        },
      }),
    );
  });

  it('themes the group root so raw child-row buttons never inherit the unthemed body color', () => {
    render(
      <RecoilRoot>
        <EventSubagentActivityGroup
          conversationId="parent-conversation"
          parentMessageIds={['parent-message']}
        />
      </RecoilRoot>,
    );

    expect(screen.getByRole('region', { name: 'com_ui_subagent_activity' })).toHaveClass(
      'text-text-primary',
    );
  });

  it('matches the width of a parallel assistant response', () => {
    render(
      <RecoilRoot>
        <EventSubagentActivityGroup
          conversationId="parent-conversation"
          parentMessageIds={['parent-message']}
          hasParallelContent
        />
      </RecoilRoot>,
    );

    expect(
      screen.getByRole('region', { name: 'com_ui_subagent_activity' }).parentElement,
    ).toHaveClass('md:max-w-[58rem]', 'xl:max-w-[70rem]');
  });

  it('retains a merged anchor that has no children yet', () => {
    let selection: ActiveSubagentPanel | null = null;
    const Observer = () => {
      selection = useRecoilValue(activeSubagentPanel);
      return null;
    };

    render(
      <RecoilRoot>
        <Observer />
        <EventSubagentActivityGroup
          conversationId="parent-conversation"
          parentMessageIds={['parent-message', 'empty-assistant-message']}
        />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: /com_ui_subagent_activity/ }));
    fireEvent.click(screen.getByRole('button', { name: /Visible Agent/ }));

    expect((selection as ActiveSubagentPanel | null)?.event?.siblingParentMessageIds).toEqual([
      'parent-message',
      'empty-assistant-message',
    ]);
  });

  it('preserves every merged message anchor and uses explicit plural status labels', () => {
    mockChildrenByMessage = new Map([
      ['parent-message', [mockChild]],
      [
        'assistant-message',
        [
          mockCompletedChild,
          {
            ...mockCompletedChild,
            threadId: 'event-thread-3',
            actorId: 'actor-c',
            agentId: undefined,
            title: 'Third actor',
          },
        ],
      ],
    ]);
    let selection: ActiveSubagentPanel | null = null;
    const Observer = () => {
      selection = useRecoilValue(activeSubagentPanel);
      return null;
    };

    render(
      <RecoilRoot>
        <Observer />
        <EventSubagentActivityGroup
          conversationId="parent-conversation"
          parentMessageIds={['parent-message', 'assistant-message']}
        />
      </RecoilRoot>,
    );

    const summary = screen.getByRole('button', { name: /com_ui_subagent_activity/ });
    expect(summary).toHaveAccessibleName(/com_ui_subagent_count_running_one/);
    expect(summary).toHaveAccessibleName(/com_ui_subagent_count_completed_other/);
    fireEvent.click(summary);
    fireEvent.click(screen.getByRole('button', { name: /Completed Agent/ }));

    expect((selection as ActiveSubagentPanel | null)?.event?.siblingParentMessageIds).toEqual([
      'parent-message',
      'assistant-message',
    ]);
  });

  it('does not reopen a child after the user closes it while refresh is pending', async () => {
    let selection: ActiveSubagentPanel | null = null;
    let resolveRefresh!: (value: unknown) => void;
    mockRefresh.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const Observer = () => {
      selection = useRecoilValue(activeSubagentPanel);
      return null;
    };
    const ClosePanel = () => {
      const setSelection = useSetRecoilState(activeSubagentPanel);
      return <button type="button" data-testid="close-panel" onClick={() => setSelection(null)} />;
    };
    render(
      <RecoilRoot>
        <Observer />
        <ClosePanel />
        <EventSubagentActivityGroup
          conversationId="parent-conversation"
          parentMessageIds={['parent-message']}
        />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: /com_ui_subagent_activity/ }));
    fireEvent.click(screen.getByRole('button', { name: /Visible Agent/ }));
    expect(selection).toEqual(
      expect.objectContaining({ durable: expect.objectContaining({ taskId: 'task-1' }) }),
    );
    fireEvent.click(screen.getByTestId('close-panel'));
    expect(selection).toBeNull();

    await act(async () => {
      resolveRefresh({
        children: [
          {
            ...mockChild,
            latestTaskId: 'task-2',
            tasks: [{ taskId: 'task-2', status: 'completed' }],
          },
        ],
      });
    });

    await waitFor(() => expect(selection).toBeNull());
  });
});
