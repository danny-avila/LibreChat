import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SubagentThreadView, TMessageContentParts } from 'librechat-data-provider';
import type { ActiveSubagentPanel } from '~/store/subagents';
import {
  activeSubagentPanel,
  subagentProgressByToolCallId,
  subagentProgressKey,
} from '~/store/subagents';
import { initSubagentAggregatorState, initSubagentTickerState } from '~/utils/subagentContent';
import SubagentThreadPanel from './SubagentThreadPanel';

const mockUseSubagentThreadQuery = jest.fn();
const mockApprovalProviderMounted = jest.fn();
const mockApprovalProviderUnmounted = jest.fn();
let mockIsMobile = false;

jest.mock('~/data-provider', () => ({
  useSubagentThreadQuery: (...args: unknown[]) => mockUseSubagentThreadQuery(...args),
}));

jest.mock('~/hooks', () => ({
  useFocusTrap: jest.fn(),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Chat/Messages/Content/ApprovalContext', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => {
    const mockReact = jest.requireActual<typeof import('react')>('react');
    mockReact.useEffect(() => {
      mockApprovalProviderMounted();
      return () => mockApprovalProviderUnmounted();
    }, []);
    return children;
  },
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock('./SubagentActivity', () => ({
  __esModule: true,
  default: ({
    activity,
    state,
  }: {
    activity: { status: string; prompt?: string; items: Array<{ type: string; text?: string }> };
    state: string;
  }) => (
    <div data-testid="shared-activity" data-state={state} data-status={activity.status}>
      {activity.prompt}
      {activity.items.map((item, index) => (
        <span key={index}>{item.text ?? item.type}</span>
      ))}
    </div>
  ),
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
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
  host: 'conversation',
  parentConversationId: 'parent-conversation',
  parentMessageId: 'parent-message',
  toolCallId: 'tool-call',
  partIndex: 2,
  subagentType: 'researcher',
  initialProgress: 1,
  isSubmitting: false,
  durable: { threadId: 'child-thread', taskId: 'task' },
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
  activity: [{ type: 'writing', text: 'The release is ready.' }],
  activityTruncated: false,
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
    mockApprovalProviderMounted.mockClear();
    mockApprovalProviderUnmounted.mockClear();
  });

  it('renders a bounded read-only activity timeline and closes its selection', async () => {
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

    const { container } = render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <button
          type="button"
          data-subagent-tool-call="tool-call"
          data-subagent-parent-message="parent-message"
          data-subagent-part-index="2"
        />
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
    expect(screen.getByText('Investigate the release.')).toBeInTheDocument();
    expect(screen.getByText('The release is ready.')).toBeInTheDocument();
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-status', 'completed');

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));
    expect(active).toBeNull();
    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-subagent-tool-call="tool-call"][data-subagent-parent-message="parent-message"][data-subagent-part-index="2"]',
        ),
      ).toHaveFocus(),
    );
  });

  it('renders foreground persisted activity through the same shared panel without a durable read', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    const foreground: ActiveSubagentPanel = {
      host: 'conversation',
      parentConversationId: 'parent-conversation',
      parentMessageId: 'parent-message',
      toolCallId: 'foreground-call',
      partIndex: 3,
      subagentType: 'researcher',
      prompt: 'Review this change.',
      persistedContent: [
        { type: 'text', text: 'Review complete.' },
      ] as unknown as TMessageContentParts[],
      initialProgress: 1,
      isSubmitting: false,
    };

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={foreground} />
      </RecoilRoot>,
    );

    expect(screen.getByText('Review this change.')).toBeInTheDocument();
    expect(screen.getByText('Review complete.')).toBeInTheDocument();
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-state', 'ready');
  });

  it('resets invocation-scoped approval state when the selected card changes', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    const { rerender } = render(
      <RecoilRoot>
        <SubagentThreadPanel selection={{ ...selection, durable: undefined }} />
      </RecoilRoot>,
    );

    expect(mockApprovalProviderMounted).toHaveBeenCalledTimes(1);
    expect(mockApprovalProviderUnmounted).not.toHaveBeenCalled();

    rerender(
      <RecoilRoot>
        <SubagentThreadPanel
          selection={{ ...selection, partIndex: selection.partIndex + 1, durable: undefined }}
        />
      </RecoilRoot>,
    );

    expect(mockApprovalProviderUnmounted).toHaveBeenCalledTimes(1);
    expect(mockApprovalProviderMounted).toHaveBeenCalledTimes(2);
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

    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-state', 'loading');
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-status', 'dispatched');
  });

  it('surfaces a durable read failure after the readiness window', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isReadinessPending: false,
    });

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-state', 'error');
  });

  it('shows live detached activity while its durable view is still becoming ready', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isReadinessPending: false,
    });

    render(
      <RecoilRoot
        initializeState={({ set }) =>
          set(
            subagentProgressByToolCallId(
              subagentProgressKey(
                selection.parentMessageId,
                selection.toolCallId,
                selection.partIndex,
              ),
            ),
            {
              subagentRunId: 'run',
              subagentType: 'researcher',
              status: 'message_delta',
              contentParts: [{ type: ContentTypes.TEXT, text: 'Live child update.' }],
              aggregatorState: initSubagentAggregatorState(),
              tickerState: initSubagentTickerState(),
            },
          )
        }
      >
        <SubagentThreadPanel selection={{ ...selection, runStepStatus: 'completed' }} />
      </RecoilRoot>,
    );

    expect(screen.getByText('Live child update.')).toBeInTheDocument();
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-state', 'ready');
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-status', 'running');
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
