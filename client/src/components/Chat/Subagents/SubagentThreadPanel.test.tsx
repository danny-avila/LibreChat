import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SubagentThreadView } from 'librechat-data-provider';
import type { ActiveSubagentPanel } from '~/store/subagents';
import { activeSubagentPanel } from '~/store/subagents';
import SubagentThreadPanel from './SubagentThreadPanel';

const mockUseSubagentThreadQuery = jest.fn();
const mockSpinnerLabel = 'spinner';
let mockIsMobile = false;

jest.mock('~/data-provider', () => ({
  useSubagentThreadQuery: (...args: unknown[]) => mockUseSubagentThreadQuery(...args),
}));

jest.mock('~/hooks', () => ({
  useFocusTrap: jest.fn(),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  Spinner: () => <span>{mockSpinnerLabel}</span>,
  useMediaQuery: () => mockIsMobile,
}));

jest.mock('lucide-react', () => ({
  AlertCircle: () => null,
  Bot: () => null,
  CheckCircle2: () => null,
  Clock3: () => null,
  X: () => null,
  XCircle: () => null,
}));

const selection: ActiveSubagentPanel = {
  parentConversationId: 'parent-conversation',
  threadId: 'child-thread',
  taskId: 'task',
  toolCallId: 'tool-call',
  subagentType: 'researcher',
};

const completedView: SubagentThreadView = {
  threadId: 'child-thread',
  parentConversationId: 'parent-conversation',
  parentMessageId: 'parent-message',
  parentToolCallId: 'tool-call',
  subagentType: 'researcher',
  subagentKind: 'agent',
  title: 'Research child',
  status: 'completed',
  historyTruncated: true,
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
      text: 'The release is ready.',
      textTruncated: true,
    },
  ],
};

describe('SubagentThreadPanel', () => {
  beforeEach(() => {
    mockIsMobile = false;
  });

  it('renders a bounded read-only activity timeline and closes its selection', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: completedView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    let active: ActiveSubagentPanel | null = selection;
    const Observer = () => {
      active = useRecoilValue(activeSubagentPanel);
      return null;
    };

    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <Observer />
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(mockUseSubagentThreadQuery).toHaveBeenCalledWith(
      'parent-conversation',
      'child-thread',
      'task',
    );
    expect(screen.getByText('Research child')).toBeInTheDocument();
    expect(screen.getByText('com_ui_subagent_thread_status_completed')).toBeInTheDocument();
    expect(screen.getByText('com_ui_subagent_thread_history_truncated')).toBeInTheDocument();
    expect(screen.getByText('Investigate the release.')).toBeInTheDocument();
    expect(screen.getByText('The release is ready.')).toBeInTheDocument();
    expect(screen.getByText('com_ui_subagent_thread_message_truncated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));
    expect(active).toBeNull();
  });

  it('keeps an expected pre-reservation 404 in the readiness state', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isReadinessPending: true,
    });

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(screen.getByText(mockSpinnerLabel)).toBeInTheDocument();
    expect(screen.queryByText('com_ui_subagent_thread_load_error')).not.toBeInTheDocument();
  });

  it('exposes the focus-trapped mobile overlay as a modal dialog', () => {
    mockIsMobile = true;
    mockUseSubagentThreadQuery.mockReturnValue({
      data: completedView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
