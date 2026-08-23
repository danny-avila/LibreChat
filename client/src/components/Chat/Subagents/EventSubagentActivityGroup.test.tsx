import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { fireEvent, render, screen } from '@testing-library/react';
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

jest.mock('./ParentSubagentsProvider', () => ({
  useParentSubagents: () => ({
    byMessageId: new Map([['parent-message', [mockChild]]]),
    byThreadId: new Map([['event-thread', mockChild]]),
    refresh: mockRefresh,
  }),
}));

jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => ({ 'agent-1': { id: 'agent-1', name: 'Visible Agent' } }),
}));

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  renderAgentAvatar: () => <span data-testid="agent-avatar" />,
}));
jest.mock('@librechat/client', () => ({
  cn: (...values: Array<string | false | undefined>) => values.filter(Boolean).join(' '),
}));
jest.mock('lucide-react', () => ({
  AlertCircle: () => null,
  Bot: () => null,
  Check: () => null,
  CheckCircle2: () => null,
  CircleAlert: () => null,
  Clock3: () => null,
  LoaderCircle: () => null,
  X: () => null,
  XCircle: () => null,
}));

describe('EventSubagentActivityGroup', () => {
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
          parentMessageId="parent-message"
        />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Visible Agent/ }));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(selection).toEqual(
      expect.objectContaining({
        host: 'conversation',
        parentConversationId: 'parent-conversation',
        parentMessageId: 'parent-message',
        toolCallId: 'event-thread:event-thread',
        durable: { threadId: 'event-thread', taskId: 'task-1' },
        event: { actorId: 'actor-a' },
      }),
    );
  });
});
