import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import type { ChildConversationTurn } from './adapters';
import SubagentConversation from './SubagentConversation';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => undefined,
}));

jest.mock('~/components/Chat/Messages/Content/ContentParts', () => ({
  __esModule: true,
  default: ({
    content,
    messageId,
  }: {
    content: Array<Record<string, unknown>>;
    messageId: string;
  }) => (
    <div data-testid="shared-content-parts" data-message-id={messageId}>
      {content.map((part, index) => (
        <span key={index}>
          {(part.text as string | undefined) ??
            (part.think as string | undefined) ??
            (part.tool_call as { name?: string } | undefined)?.name ??
            ''}
        </span>
      ))}
    </div>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/Container', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('~/components/Chat/Messages/Content/Parts', () => ({
  EmptyText: () => <div data-testid="thinking-cursor" />,
}));

jest.mock('lucide-react', () => ({
  AlertCircle: () => null,
  Bot: () => null,
  CheckCircle2: () => null,
  Clock3: () => null,
  CornerDownRight: () => null,
  Radio: () => null,
  XCircle: () => null,
}));

const turns: ChildConversationTurn[] = [
  {
    taskId: 'task-1',
    trigger: {
      kind: 'parent_dispatch',
      summary: 'Investigate the release.',
      createdAt: '2026-08-25T12:00:00.000Z',
    },
    activity: {
      title: 'Research child',
      status: 'completed',
      items: [
        { type: 'reasoning', text: 'Checked the constraints.' },
        {
          type: 'tool',
          toolCallId: 'search-1',
          name: 'search',
          status: 'completed',
          outputTruncated: true,
        },
        { type: 'writing', text: 'The release is ready.' },
      ],
    },
  },
  {
    taskId: 'task-2',
    trigger: {
      kind: 'external_event',
      summary: 'A deployment event arrived.',
    },
    activity: {
      title: 'Research child',
      status: 'running',
      items: [],
    },
  },
];

describe('SubagentConversation', () => {
  it('renders host triggers and child activity through the main chat row and content modules', () => {
    const { container } = render(
      <RecoilRoot>
        <SubagentConversation turns={turns} />
      </RecoilRoot>,
    );

    expect(screen.getAllByText('com_ui_subagent_trigger_parent_dispatch')).toHaveLength(2);
    expect(screen.getAllByText('com_ui_subagent_trigger_external_event')).toHaveLength(2);
    expect(screen.getByText('Investigate the release.')).toBeInTheDocument();
    expect(screen.getByText('Checked the constraints.')).toBeInTheDocument();
    expect(screen.getByText('search')).toBeInTheDocument();
    expect(screen.getByText('The release is ready.')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_subagent_thread_status_completed')).not.toBeInTheDocument();
    expect(screen.getByText('com_ui_subagent_thread_status_running')).toBeInTheDocument();
    expect(screen.getByTestId('thinking-cursor')).toBeInTheDocument();
    expect(container.querySelectorAll('.message-render')).toHaveLength(4);
    expect(container.querySelectorAll('.user-turn')).toHaveLength(2);
    expect(container.querySelectorAll('.agent-turn')).toHaveLength(2);
    expect(container.querySelector('[data-subagent-conversation]')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_prompt')).not.toBeInTheDocument();
    expect(screen.getAllByText('com_ui_subagent_activity_details_truncated')).toHaveLength(1);
  });
});
