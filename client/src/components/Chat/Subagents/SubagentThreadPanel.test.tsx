import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { ContentTypes, ForkOptions } from 'librechat-data-provider';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const mockUseSubagentActivityStream = jest.fn();
const mockForkMutate = jest.fn();
const mockNavigateToConvo = jest.fn();
const mockShowToast = jest.fn();
const mockApprovalProviderMounted = jest.fn();
const mockApprovalProviderUnmounted = jest.fn();
let mockIsMobile = false;

jest.mock('~/data-provider', () => ({
  useSubagentThreadQuery: (...args: unknown[]) => mockUseSubagentThreadQuery(...args),
  subagentThreadHasTaskEvidence: (view: SubagentThreadView | undefined, taskId: string): boolean =>
    view?.messages.some(
      (message) =>
        message.messageId === `${taskId}:user` || message.messageId === `${taskId}:assistant`,
    ) === true,
  useForkConvoMutation: (options: {
    onSuccess: (result: unknown) => void;
    onError: () => void;
  }) => ({
    mutate: (payload: unknown) => mockForkMutate(payload, options),
    isLoading: false,
  }),
}));

jest.mock('~/data-provider/Subagents/useSubagentActivityStream', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseSubagentActivityStream(...args),
}));

jest.mock('~/hooks', () => ({
  useFocusTrap: jest.fn(),
  useLocalize: () => (key: string) => key,
  useNavigateToConvo: () => ({ navigateToConvo: mockNavigateToConvo }),
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
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('lucide-react', () => ({
  AlertCircle: () => null,
  Bot: () => null,
  CheckCircle2: () => null,
  Clock3: () => null,
  MessagesSquare: () => null,
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
  agentId: 'agent-1',
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
    mockForkMutate.mockClear();
    mockNavigateToConvo.mockClear();
    mockShowToast.mockClear();
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
    expect(mockUseSubagentActivityStream).toHaveBeenCalledWith(selection, false);
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
    expect(screen.queryByRole('button', { name: 'com_ui_continue_chat' })).not.toBeInTheDocument();
  });

  it('continues a completed durable agent task as an ordinary conversation snapshot', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_continue_chat' }));
    expect(mockForkMutate).toHaveBeenCalledWith(
      {
        conversationId: 'child-thread',
        messageId: 'task:assistant',
        option: ForkOptions.DIRECT_PATH,
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );

    const mutationOptions = mockForkMutate.mock.calls[0][1];
    const conversation = { conversationId: 'continued-chat', agent_id: 'agent-1' };
    act(() => mutationOptions.onSuccess({ conversation, messages: [] }));
    expect(mockNavigateToConvo).toHaveBeenCalledWith(conversation);
  });

  it.each([
    ['a running task', { ...completedView, status: 'running' as const }],
    ['a graph child', { ...completedView, subagentKind: 'graph' as const, agentId: undefined }],
    ['a child without an agent identity', { ...completedView, agentId: undefined }],
  ])('does not offer human continuation for %s', (_label, view) => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: view,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(screen.queryByRole('button', { name: 'com_ui_continue_chat' })).not.toBeInTheDocument();
  });

  it('reports continuation failures without closing the child panel', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_continue_chat' }));
    mockForkMutate.mock.calls[0][1].onError();
    expect(mockShowToast).toHaveBeenCalledWith({
      message: 'com_ui_continue_chat_error',
      status: 'error',
    });
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('renders newer detached progress instead of a dispatch-time parent snapshot', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running', activity: [] },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    const progressKey = subagentProgressKey(
      selection.parentMessageId,
      selection.toolCallId,
      selection.partIndex,
    );
    const detachedSelection: ActiveSubagentPanel = {
      ...selection,
      persistedContent: [
        { type: ContentTypes.TEXT, text: 'Dispatch-time snapshot.' },
      ] as TMessageContentParts[],
    };

    render(
      <RecoilRoot
        initializeState={({ set }) =>
          set(subagentProgressByToolCallId(progressKey), {
            subagentRunId: 'child-run',
            subagentType: 'researcher',
            status: 'message_delta',
            contentParts: [{ type: ContentTypes.TEXT, text: 'latest detached text.' }],
            aggregatorState: initSubagentAggregatorState(),
            tickerState: initSubagentTickerState(),
            coverage: 'suffix',
          })
        }
      >
        <SubagentThreadPanel selection={detachedSelection} />
      </RecoilRoot>,
    );

    expect(screen.getByText('Dispatch-time snapshot.latest detached text.')).toBeInTheDocument();
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
    expect(mockUseSubagentActivityStream).toHaveBeenLastCalledWith(selection, true);
  });

  it('opens live activity before the durable child becomes addressable', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isReadinessPending: true,
    });

    const { rerender } = render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );
    expect(mockUseSubagentActivityStream).toHaveBeenLastCalledWith(selection, true);

    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running' },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    rerender(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(mockUseSubagentActivityStream).toHaveBeenLastCalledWith(selection, true);
  });

  it('keeps streaming when terminal thread state belongs to an older task', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        messages: [{ ...completedView.messages[1], messageId: 'older-task:assistant' }],
      },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(mockUseSubagentActivityStream).toHaveBeenLastCalledWith(selection, true);
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
