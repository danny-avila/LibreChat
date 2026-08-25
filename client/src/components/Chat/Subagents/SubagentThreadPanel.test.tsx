import React from 'react';
import { ContentTypes, ForkOptions } from 'librechat-data-provider';
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  ParentSubagentSummary,
  SubagentThreadView,
  TMessageContentParts,
} from 'librechat-data-provider';
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
const mockControlMutate = jest.fn();
const mockNavigateToConvo = jest.fn();
const mockShowToast = jest.fn();
const mockApprovalProviderMounted = jest.fn();
const mockApprovalProviderUnmounted = jest.fn();
let mockIsMobile = false;
let mockParentChildrenByMessage = new Map<string, ParentSubagentSummary[]>();
let mockParentChildrenByThread = new Map<string, ParentSubagentSummary>();
const mockRefreshParentChildren = jest.fn().mockResolvedValue(undefined);

jest.mock('~/data-provider', () => ({
  ACTIVE_THREAD_REFRESH_MS: 2000,
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
  useSubagentControlMutation: (options: {
    onSuccess: (result: unknown, variables: unknown) => void;
    onError: (error: unknown, variables: unknown) => void;
  }) => ({
    mutate: (variables: unknown) =>
      mockControlMutate(variables, {
        onSuccess: (result: unknown) => options.onSuccess(result, variables),
        onError: (error: unknown) => options.onError(error, variables),
      }),
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

jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => ({
    'agent-1': { id: 'agent-1', name: 'Analyst One' },
    'agent-2': { id: 'agent-2', name: 'Analyst Two' },
  }),
}));

jest.mock('./ParentSubagentsProvider', () => ({
  useParentSubagents: () => ({
    byMessageId: mockParentChildrenByMessage,
    byThreadId: mockParentChildrenByThread,
    refresh: mockRefreshParentChildren,
  }),
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
  SubagentActivityScrollSurface: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shared-scroll-surface">{children}</div>
  ),
  default: ({
    activity,
    activityId,
    state,
    onCancelControl,
  }: {
    activity: {
      status: string;
      prompt?: string;
      items: Array<{ type: string; text?: string }>;
      controls?: Array<{ invocationId: string; status: string }>;
    };
    activityId?: string;
    state: string;
    onCancelControl?: (controlId: string) => void;
  }) => (
    <div
      data-testid="shared-activity"
      data-activity-id={activityId}
      data-state={state}
      data-status={activity.status}
      data-can-withdraw={onCancelControl != null ? 'true' : 'false'}
    >
      {activity.prompt}
      {activity.items.map((item, index) => (
        <span key={index}>{item.text ?? item.type}</span>
      ))}
      {activity.controls?.map((control) => (
        <span key={control.invocationId}>{control.status}</span>
      ))}
      {onCancelControl != null && (
        <button
          type="button"
          data-testid="withdraw-control"
          onClick={() => onCancelControl('control-1')}
        />
      )}
    </div>
  ),
}));

jest.mock('@librechat/client', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const MockSelectContext = mockReact.createContext((_value: string): void => {});
  return {
    Alert: ({ children, ...props }: React.ComponentProps<'div'>) => (
      <div role="alert" {...props}>
        {children}
      </div>
    ),
    Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
      <button {...props}>{children}</button>
    ),
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange: (value: string) => void;
    }) => <MockSelectContext.Provider value={onValueChange}>{children}</MockSelectContext.Provider>,
    SelectTrigger: ({ children, ...props }: React.ComponentProps<'button'>) => (
      <button role="combobox" aria-controls="mock-select-options" aria-expanded="true" {...props}>
        {children}
      </button>
    ),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div id="mock-select-options">{children}</div>
    ),
    SelectItem: ({
      value,
      children,
      ...props
    }: React.ComponentProps<'button'> & { value: string }) => {
      const onValueChange = mockReact.useContext(MockSelectContext);
      return (
        <button role="option" aria-selected="false" onClick={() => onValueChange(value)} {...props}>
          {children}
        </button>
      );
    },
    Textarea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,
    useMediaQuery: () => mockIsMobile,
    useToastContext: () => ({ showToast: mockShowToast }),
  };
});

jest.mock('lucide-react', () => ({
  AlertCircle: () => null,
  Bot: () => null,
  CornerDownRight: () => null,
  CheckCircle2: () => null,
  Clock3: () => null,
  ListEnd: () => null,
  MessagesSquare: () => null,
  OctagonX: () => null,
  X: () => null,
  XCircle: () => null,
  Zap: () => null,
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
    window.sessionStorage.clear();
    mockIsMobile = false;
    mockApprovalProviderMounted.mockClear();
    mockApprovalProviderUnmounted.mockClear();
    mockForkMutate.mockClear();
    mockControlMutate.mockClear();
    mockNavigateToConvo.mockClear();
    mockShowToast.mockClear();
    mockRefreshParentChildren.mockClear();
    mockParentChildrenByMessage = new Map();
    mockParentChildrenByThread = new Map();
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
      undefined,
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

  it('submits one command invocation, blocks duplicate clicks, and shows its receipt', async () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running', controlReceipts: [] },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_subagent_control_message'), {
      target: { value: 'Check the primary source.' },
    });
    const queue = screen.getByRole('button', { name: 'com_ui_queue' });
    fireEvent.click(queue);
    fireEvent.click(queue);

    expect(mockControlMutate).toHaveBeenCalledTimes(1);
    const [variables, callbacks] = mockControlMutate.mock.calls[0] as [
      {
        parentConversationId: string;
        threadId: string;
        command: { taskId: string; invocationId: string; action: string; message: string };
      },
      { onSuccess: (value: unknown) => void },
    ];
    expect(variables).toEqual({
      parentConversationId: 'parent-conversation',
      threadId: 'child-thread',
      submittedAt: expect.any(String),
      command: {
        taskId: 'task',
        invocationId: expect.any(String),
        action: 'queue',
        message: 'Check the primary source.',
      },
    });
    act(() => {
      callbacks.onSuccess({
        receipt: {
          invocationId: variables.command.invocationId,
          controlId: 'control-1',
          action: 'queue',
          status: 'accepted',
          createdAt: '2026-08-24T12:00:00.000Z',
          updatedAt: '2026-08-24T12:00:00.000Z',
        },
      });
    });
    expect(screen.getByText('accepted')).toBeInTheDocument();
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-can-withdraw', 'true');
  });

  it('retries an unavailable owner with the same authoritative invocation id', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running', controlReceipts: [] },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_subagent_control_message'), {
      target: { value: 'Use the primary source.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_steer' }));
    const firstCommand = mockControlMutate.mock.calls[0][0].command;
    act(() => {
      mockControlMutate.mock.calls[0][1].onError({ response: { status: 503 } });
    });

    expect(screen.getByLabelText('com_ui_subagent_control_message')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'com_ui_subagent_cancel_task' })).toBeDisabled();
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-can-withdraw', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));

    expect(mockControlMutate).toHaveBeenCalledTimes(2);
    expect(mockControlMutate.mock.calls[1][0].command).toEqual(firstCommand);
  });

  it('releases the composer after a definitive policy rejection', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running', controlReceipts: [] },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_subagent_control_message'), {
      target: { value: 'Blocked guidance.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_steer' }));
    act(() => {
      mockControlMutate.mock.calls[0][1].onError({ response: { status: 400 } });
    });

    expect(screen.getByText('com_ui_subagent_control_reason_invalid_command')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'com_ui_retry' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_subagent_control_message')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'com_ui_subagent_cancel_task' })).toBeEnabled();
  });

  it('retains an ambiguous invocation across closing and reopening the panel', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running', controlReceipts: [] },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    const PanelHost = () => {
      const current = useRecoilValue(activeSubagentPanel);
      const setCurrent = useSetRecoilState(activeSubagentPanel);
      return current == null ? (
        <button type="button" onClick={() => setCurrent(selection)}>
          {selection.subagentType}
        </button>
      ) : (
        <SubagentThreadPanel selection={current} />
      );
    };
    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <PanelHost />
      </RecoilRoot>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_subagent_control_message'), {
      target: { value: 'Use the primary source.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_queue' }));
    const firstCommand = mockControlMutate.mock.calls[0][0].command;
    act(() => {
      mockControlMutate.mock.calls[0][1].onError({ response: { status: 503 } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));
    fireEvent.click(screen.getByRole('button', { name: selection.subagentType }));

    expect(screen.getByRole('button', { name: 'com_ui_retry' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));
    expect(mockControlMutate.mock.calls[1][0].command).toEqual(firstCommand);
  });

  it('retains an ambiguous invocation across a full page-state reload', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running', controlReceipts: [] },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    const first = render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_subagent_control_message'), {
      target: { value: 'Keep the same invocation.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_queue' }));
    const firstCommand = mockControlMutate.mock.calls[0][0].command;
    act(() => {
      mockControlMutate.mock.calls[0][1].onError({ response: { status: 503 } });
    });
    first.unmount();

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );
    expect(screen.getByRole('button', { name: 'com_ui_retry' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));
    expect(mockControlMutate.mock.calls[1][0].command).toEqual(firstCommand);
  });

  it('records an ambiguous result after the panel closes before the mutation settles', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running', controlReceipts: [] },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    const PanelHost = () => {
      const current = useRecoilValue(activeSubagentPanel);
      const setCurrent = useSetRecoilState(activeSubagentPanel);
      return current == null ? (
        <button type="button" onClick={() => setCurrent(selection)}>
          {selection.subagentType}
        </button>
      ) : (
        <SubagentThreadPanel selection={current} />
      );
    };
    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <PanelHost />
      </RecoilRoot>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_subagent_control_message'), {
      target: { value: 'Retry after closing.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_queue' }));
    const firstCommand = mockControlMutate.mock.calls[0][0].command;
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));
    act(() => {
      mockControlMutate.mock.calls[0][1].onError({ response: { status: 503 } });
    });
    fireEvent.click(screen.getByRole('button', { name: selection.subagentType }));

    expect(screen.getByRole('button', { name: 'com_ui_retry' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));
    expect(mockControlMutate.mock.calls[1][0].command).toEqual(firstCommand);
  });

  it('keeps an unavailable-owner retry visible if the child settles before the receipt appears', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running', controlReceipts: [] },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    const { rerender } = render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_subagent_control_message'), {
      target: { value: 'Use the primary source.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_steer' }));
    act(() => {
      mockControlMutate.mock.calls[0][1].onError({ response: { status: 503 } });
    });

    mockUseSubagentThreadQuery.mockReturnValue({
      data: completedView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    rerender(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(
      screen.getByText('com_ui_subagent_control_reason_owner_unavailable'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_retry' })).toBeInTheDocument();
    expect(screen.queryByLabelText('com_ui_subagent_control_message')).not.toBeInTheDocument();
  });

  it('preserves drafted guidance when withdrawing an accepted control', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        status: 'running',
        controlReceipts: [
          {
            invocationId: 'accepted-control',
            controlId: 'control-1',
            action: 'queue',
            status: 'accepted',
            createdAt: '2026-08-24T12:00:00.000Z',
            updatedAt: '2026-08-24T12:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    const composer = screen.getByLabelText('com_ui_subagent_control_message');
    fireEvent.change(composer, { target: { value: 'Keep this draft.' } });
    fireEvent.click(screen.getByTestId('withdraw-control'));
    const command = mockControlMutate.mock.calls[0][0].command;
    act(() => {
      mockControlMutate.mock.calls[0][1].onSuccess({
        receipt: {
          invocationId: command.invocationId,
          controlId: 'control-1',
          action: 'cancel_message',
          status: 'applied',
          createdAt: '2026-08-24T12:00:01.000Z',
          updatedAt: '2026-08-24T12:00:01.000Z',
        },
      });
    });

    expect(composer).toHaveValue('Keep this draft.');
  });

  it('clears transient retry state when refresh returns the same durable invocation', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running', controlReceipts: [] },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    const { rerender } = render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_subagent_control_message'), {
      target: { value: 'Use the primary source.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_steer' }));
    const command = mockControlMutate.mock.calls[0][0].command;
    act(() => {
      mockControlMutate.mock.calls[0][1].onError({ response: { status: 503 } });
    });
    expect(screen.getByRole('button', { name: 'com_ui_retry' })).toBeInTheDocument();
    expect(window.sessionStorage.length).toBe(1);

    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        status: 'running',
        controlReceipts: [
          {
            invocationId: command.invocationId,
            action: 'steer',
            status: 'applied',
            createdAt: '2026-08-24T12:00:00.000Z',
            updatedAt: '2026-08-24T12:00:01.000Z',
          },
        ],
      },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    rerender(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(screen.getByText('applied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'com_ui_retry' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_subagent_control_message')).toHaveValue('');
    expect(
      screen.queryByText('com_ui_subagent_control_reason_owner_unavailable'),
    ).not.toBeInTheDocument();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('closes stale running controls after task cancellation is applied', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running', controlReceipts: [] },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_cancel_task' }));
    const command = mockControlMutate.mock.calls[0][0].command;
    act(() => {
      mockControlMutate.mock.calls[0][1].onSuccess({
        receipt: {
          invocationId: command.invocationId,
          action: 'cancel',
          status: 'applied',
          createdAt: '2026-08-24T12:00:00.000Z',
          updatedAt: '2026-08-24T12:00:01.000Z',
        },
      });
    });

    expect(screen.queryByLabelText('com_ui_subagent_control_message')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'com_ui_subagent_cancel_task' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-can-withdraw', 'false');
  });

  it('reports an inaccessible task without offering a misleading retry', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: { ...completedView, status: 'running', controlReceipts: [] },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_cancel_task' }));
    act(() => {
      mockControlMutate.mock.calls[0][1].onError({ response: { status: 404 } });
    });

    expect(
      screen.getByText('com_ui_subagent_control_reason_task_inaccessible'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'com_ui_retry' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('com_ui_subagent_control_message')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'com_ui_subagent_cancel_task' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-can-withdraw', 'false');
  });

  it('renders rejected and refreshed applied receipts independently from child status', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        status: 'running',
        controlReceipts: [
          {
            invocationId: 'persisted',
            action: 'interrupt',
            status: 'applied',
            createdAt: '2026-08-24T12:00:00.000Z',
            updatedAt: '2026-08-24T12:00:01.000Z',
          },
          {
            invocationId: 'terminal-race',
            action: 'steer',
            status: 'rejected',
            createdAt: '2026-08-24T12:00:02.000Z',
            updatedAt: '2026-08-24T12:00:03.000Z',
            reason: 'task_completed',
          },
        ],
      },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });

    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(screen.getByText('applied')).toBeInTheDocument();
    expect(screen.getByText('rejected')).toBeInTheDocument();
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-status', 'running');
    expect(screen.queryByLabelText('com_ui_subagent_control_message')).not.toBeInTheDocument();
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-can-withdraw', 'false');
  });

  it('does not expose task controls after the selected child is terminal', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: completedView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });

    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, selection)}>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(screen.queryByLabelText('com_ui_subagent_control_message')).not.toBeInTheDocument();
    expect(screen.getByTestId('shared-activity')).toHaveAttribute('data-can-withdraw', 'false');
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

  it('revalidates a cached terminal event task when its lease resumes', async () => {
    const refetch = jest.fn().mockResolvedValue({ data: { ...completedView, status: 'running' } });
    const eventSelection: ActiveSubagentPanel = {
      ...selection,
      event: { actorId: 'actor-1', progressKey: 'event-task:child-thread:task' },
    };
    mockParentChildrenByThread = new Map([
      [
        'child-thread',
        {
          threadId: 'child-thread',
          parentMessageId: 'parent-message',
          subagentType: 'agent-1',
          subagentKind: 'agent',
          title: 'Event child',
          origin: 'event',
          actorId: 'actor-1',
          status: 'running',
          latestTaskId: 'task',
          tasks: [{ taskId: 'task', status: 'running' }],
          tasksTruncated: false,
        },
      ],
    ]);
    mockUseSubagentThreadQuery.mockReturnValue({
      data: completedView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
      refetch,
    });

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={eventSelection} />
      </RecoilRoot>,
    );

    expect(mockUseSubagentThreadQuery).toHaveBeenCalledWith(
      'parent-conversation',
      'child-thread',
      'task',
      { refetchInterval: 2000 },
    );
    expect(mockUseSubagentActivityStream).toHaveBeenLastCalledWith(eventSelection, true);
    expect(
      screen.queryByRole('combobox', { name: 'com_ui_subagent_turn' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(refetch).toHaveBeenCalled());
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

  it('navigates event actors and renders exact durable turns as one chronological thread', () => {
    const first: ParentSubagentSummary = {
      threadId: 'child-thread',
      parentMessageId: 'parent-message',
      subagentType: 'agent-1',
      subagentKind: 'agent',
      agentId: 'agent-1',
      title: 'First actor',
      origin: 'event',
      actorId: 'actor-1',
      status: 'completed',
      latestTaskId: 'task',
      tasks: [
        { taskId: 'task', status: 'completed' },
        { taskId: 'task-earlier', status: 'completed' },
      ],
      tasksTruncated: false,
    };
    const second: ParentSubagentSummary = {
      ...first,
      threadId: 'child-thread-2',
      subagentType: 'agent-2',
      agentId: 'agent-2',
      title: 'Second actor',
      actorId: 'actor-2',
      latestTaskId: 'task-2',
      tasks: [{ taskId: 'task-2', status: 'running' }],
      status: 'running',
    };
    mockParentChildrenByMessage = new Map([
      ['parent-message', [first]],
      ['assistant-message', [second]],
    ]);
    mockParentChildrenByThread = new Map([
      [first.threadId, first],
      [second.threadId, second],
    ]);
    mockUseSubagentThreadQuery.mockReturnValue({
      data: completedView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    const eventSelection: ActiveSubagentPanel = {
      ...selection,
      event: {
        actorId: 'actor-1',
        progressKey: 'event-task:child-thread:task',
        siblingParentMessageIds: ['parent-message', 'assistant-message'],
      },
    };
    let active: ActiveSubagentPanel | null = eventSelection;
    const Observer = () => {
      active = useRecoilValue(activeSubagentPanel);
      return null;
    };

    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, eventSelection)}>
        <Observer />
        <SubagentThreadPanel selection={eventSelection} />
      </RecoilRoot>,
    );

    expect(screen.queryByRole('button', { name: 'com_ui_subagent_turn' })).not.toBeInTheDocument();
    const turns = screen.getAllByTestId('shared-activity');
    expect(turns).toHaveLength(2);
    expect(turns[0]).toHaveAttribute(
      'data-activity-id',
      'parent-message\u0000tool-call\u0000task-earlier',
    );
    expect(turns[1]).toHaveAttribute('data-activity-id', 'parent-message\u0000tool-call\u0000task');
    expect(mockUseSubagentThreadQuery).toHaveBeenCalledWith(
      'parent-conversation',
      'child-thread',
      'task-earlier',
    );

    fireEvent.click(screen.getByRole('option', { name: /Analyst Two/ }));
    expect(active).toEqual(
      expect.objectContaining({
        subagentType: 'agent-2',
        event: {
          actorId: 'actor-2',
          progressKey: 'event-task:child-thread-2:task-2',
          siblingParentMessageIds: ['parent-message', 'assistant-message'],
        },
        durable: { threadId: 'child-thread-2', taskId: 'task-2' },
      }),
    );
    expect(mockRefreshParentChildren).toHaveBeenCalled();
  });

  it('follows a newly appended latest turn while preserving the continuous history', async () => {
    const eventChild: ParentSubagentSummary = {
      threadId: 'child-thread',
      parentMessageId: 'parent-message',
      subagentType: 'agent-1',
      subagentKind: 'agent',
      agentId: 'agent-1',
      title: 'Actor',
      origin: 'event',
      actorId: 'actor-1',
      status: 'running',
      latestTaskId: 'task-new',
      tasks: [
        { taskId: 'task-new', status: 'running' },
        { taskId: 'task-old', status: 'completed' },
      ],
      tasksTruncated: false,
    };
    mockParentChildrenByMessage = new Map([['parent-message', [eventChild]]]);
    mockParentChildrenByThread = new Map([[eventChild.threadId, eventChild]]);
    mockUseSubagentThreadQuery.mockReturnValue({
      data: completedView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    const staleSelection: ActiveSubagentPanel = {
      ...selection,
      durable: { threadId: 'child-thread', taskId: 'task-old' },
      event: { actorId: 'actor-1', progressKey: 'event-task:child-thread:task-old' },
    };
    let active: ActiveSubagentPanel | null = staleSelection;
    const Observer = () => {
      active = useRecoilValue(activeSubagentPanel);
      return null;
    };

    render(
      <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, staleSelection)}>
        <Observer />
        <SubagentThreadPanel selection={staleSelection} />
      </RecoilRoot>,
    );

    await waitFor(() =>
      expect(active?.durable).toEqual({ threadId: 'child-thread', taskId: 'task-new' }),
    );
    expect(screen.getAllByTestId('shared-activity')).toHaveLength(2);
  });

  it('loads retained event history in bounded pages and marks an omitted beginning', () => {
    const tasks = Array.from({ length: 5 }, (_, index) => ({
      taskId: `task-${5 - index}`,
      status: 'completed' as const,
    }));
    const eventChild: ParentSubagentSummary = {
      threadId: 'child-thread',
      parentMessageId: 'parent-message',
      subagentType: 'agent-1',
      subagentKind: 'agent',
      agentId: 'agent-1',
      title: 'Actor',
      origin: 'event',
      actorId: 'actor-1',
      status: 'completed',
      latestTaskId: 'task-5',
      tasks,
      tasksTruncated: true,
    };
    mockParentChildrenByMessage = new Map([['parent-message', [eventChild]]]);
    mockParentChildrenByThread = new Map([[eventChild.threadId, eventChild]]);
    mockUseSubagentThreadQuery.mockReturnValue({
      data: completedView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    const eventSelection: ActiveSubagentPanel = {
      ...selection,
      durable: { threadId: 'child-thread', taskId: 'task-5' },
      event: { actorId: 'actor-1', progressKey: 'event-task:child-thread:task-5' },
    };

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={eventSelection} />
      </RecoilRoot>,
    );

    expect(screen.getAllByTestId('shared-activity')).toHaveLength(3);
    expect(new Set(mockUseSubagentThreadQuery.mock.calls.map((call) => call[2]))).toEqual(
      new Set(['task-5', 'task-4', 'task-3']),
    );
    expect(screen.queryByText('com_ui_subagent_thread_history_truncated')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_load_more' }));

    expect(screen.getAllByTestId('shared-activity')).toHaveLength(5);
    expect(new Set(mockUseSubagentThreadQuery.mock.calls.map((call) => call[2]))).toEqual(
      new Set(['task-5', 'task-4', 'task-3', 'task-2', 'task-1']),
    );
    expect(screen.getByText('com_ui_subagent_thread_history_truncated')).toBeInTheDocument();
  });
});
