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
import { getDraft } from '~/utils';

const mockUseSubagentThreadQuery = jest.fn();
const mockUseSubagentActivityStream = jest.fn();
const mockForkMutate = jest.fn();
const mockControlMutate = jest.fn();
const mockNavigateToConvo = jest.fn();
const mockShowToast = jest.fn();
const mockGetSubagentThread = jest.fn();
const mockApprovalProviderMounted = jest.fn();
const mockApprovalProviderUnmounted = jest.fn();
let mockIsMobile = false;
let mockParentChildrenByMessage = new Map<string, ParentSubagentSummary[]>();
let mockParentChildrenByThread = new Map<string, ParentSubagentSummary>();
const mockRefreshParentChildren = jest.fn().mockResolvedValue(undefined);

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getSubagentThread: (...args: unknown[]) => mockGetSubagentThread(...args),
    },
  };
});

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

jest.mock('./SubagentConversation', () => ({
  __esModule: true,
  default: ({
    turns,
    stateByTask,
    detailStateByTask,
    onLoadTurnDetails,
  }: {
    turns: Array<{
      taskId: string;
      trigger: { summary: string };
      activity: { items: Array<{ text?: string }>; activityTruncated?: boolean };
    }>;
    stateByTask?: ReadonlyMap<string, string>;
    detailStateByTask?: ReadonlyMap<string, string>;
    onLoadTurnDetails?: (taskId: string) => void;
  }) => (
    <div
      data-testid="subagent-conversation"
      data-state={turns[0] == null ? undefined : stateByTask?.get(turns[0].taskId)}
    >
      {turns.map((turn) => (
        <div key={turn.taskId} data-testid="conversation-turn">
          {turn.trigger.summary}
          {turn.activity.items.map((item, index) => (
            <span key={index}>{item.text}</span>
          ))}
          {turn.activity.activityTruncated === true && onLoadTurnDetails != null && (
            <button type="button" onClick={() => onLoadTurnDetails(turn.taskId)}>
              {`load-${turn.taskId}`}
            </button>
          )}
          {detailStateByTask?.get(turn.taskId)}
        </div>
      ))}
    </div>
  ),
}));

jest.mock('@librechat/client', () => ({
  Alert: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div role="alert" {...props}>
      {children}
    </div>
  ),
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  Skeleton: () => null,
  ControlCombobox: ({
    items,
    setValue,
    ariaLabel,
    displayValue,
  }: {
    items: { value: string; label: string }[];
    setValue: (value: string) => void;
    ariaLabel: string;
    displayValue?: string;
  }) => (
    <div>
      <button
        type="button"
        role="combobox"
        aria-controls="mock-combobox-options"
        aria-expanded="true"
        aria-label={ariaLabel}
      >
        {displayValue}
      </button>
      <div id="mock-combobox-options">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            role="option"
            aria-selected="false"
            onClick={() => setValue(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  ),
  /** Mirrors the real composer's contract: one field, the caller's action row,
   *  and a send control whose accessible name says what Enter will do. */
  Composer: ({
    value,
    onChange,
    onSubmit,
    canSubmit,
    submitLabel,
    ariaLabel,
    placeholder,
    disabled,
    actions,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    canSubmit: boolean;
    submitLabel: string;
    ariaLabel: string;
    placeholder?: string;
    disabled?: boolean;
    actions?: React.ReactNode;
  }) => (
    <div>
      <textarea
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          event.preventDefault();
          if (canSubmit && value.trim() !== '') onSubmit();
        }}
      />
      {actions}
      <button
        type="button"
        aria-label={submitLabel}
        disabled={disabled === true || !canSubmit}
        onClick={onSubmit}
      >
        {submitLabel}
      </button>
    </div>
  ),
  useMediaQuery: () => mockIsMobile,
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('lucide-react', () => ({
  AlertCircle: () => null,
  CornerUpLeft: () => null,
  CheckCircle2: () => null,
  Clock3: () => null,
  Feather: () => null,
  ListEnd: () => null,
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
  depth: 1,
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
    mockGetSubagentThread.mockReset();
    mockRefreshParentChildren.mockClear();
    mockParentChildrenByMessage = new Map();
    mockParentChildrenByThread = new Map();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
      { keepPreviousData: true },
    );
    expect(mockUseSubagentActivityStream).toHaveBeenCalledWith(selection, false);
    expect(screen.getByText('Research child')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_subagent_depth')).not.toBeInTheDocument();
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

  it('returns to and restores focus on the originating parent activity', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));

    expect(active).toBeNull();
    await waitFor(() =>
      expect(container.querySelector('[data-subagent-tool-call="tool-call"]')).toHaveFocus(),
    );
  });

  it('renders the durable branch as one conversation-native chronological thread', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        turns: [
          {
            taskId: 'task-earlier',
            trigger: { kind: 'parent_dispatch', summary: 'Initial request.' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'Initial response.' }],
            activityTruncated: false,
            messages: [],
          },
          {
            taskId: 'task',
            trigger: { kind: 'parent_continuation', summary: 'Follow-up request.' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'Follow-up response.' }],
            activityTruncated: false,
            messages: [completedView.messages[1]],
          },
        ],
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

    expect(screen.getByTestId('subagent-conversation')).toBeInTheDocument();
    expect(screen.getAllByTestId('conversation-turn')).toHaveLength(2);
    expect(screen.getByText(/Initial request/)).toBeInTheDocument();
    expect(screen.getByText(/Follow-up request/)).toBeInTheDocument();
    expect(screen.queryByTestId('shared-activity')).not.toBeInTheDocument();
  });

  it('keeps the exact selected activity when the bounded response retains only newer turns', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        turns: [
          {
            taskId: 'task-newer',
            trigger: { kind: 'parent_continuation', summary: 'A newer request.' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'A newer response.' }],
            activityTruncated: false,
            messages: [],
          },
        ],
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

    expect(screen.getAllByTestId('conversation-turn')).toHaveLength(2);
    expect(screen.getByText('The release is ready.')).toBeInTheDocument();
    expect(screen.getByText(/A newer request/)).toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText('com_ui_message_input'), {
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

    fireEvent.change(screen.getByLabelText('com_ui_message_input'), {
      target: { value: 'Use the primary source.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_steer' }));
    const firstCommand = mockControlMutate.mock.calls[0][0].command;
    act(() => {
      mockControlMutate.mock.calls[0][1].onError({ response: { status: 503 } });
    });

    expect(screen.getByLabelText('com_ui_message_input')).toBeDisabled();
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

    fireEvent.change(screen.getByLabelText('com_ui_message_input'), {
      target: { value: 'Blocked guidance.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_steer' }));
    act(() => {
      mockControlMutate.mock.calls[0][1].onError({ response: { status: 400 } });
    });

    expect(screen.getByText('com_ui_subagent_control_reason_invalid_command')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'com_ui_retry' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_message_input')).toBeEnabled();
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

    fireEvent.change(screen.getByLabelText('com_ui_message_input'), {
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

    fireEvent.change(screen.getByLabelText('com_ui_message_input'), {
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

    fireEvent.change(screen.getByLabelText('com_ui_message_input'), {
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

    fireEvent.change(screen.getByLabelText('com_ui_message_input'), {
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
    /** The settled child leaves the composer standing — Enter continues the
     *  thread from here — but nothing in it still addresses the finished run. */
    expect(screen.queryByRole('button', { name: 'com_ui_steer' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'com_ui_subagent_cancel_task' }),
    ).not.toBeInTheDocument();
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

    const composer = screen.getByLabelText('com_ui_message_input');
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

    fireEvent.change(screen.getByLabelText('com_ui_message_input'), {
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
    expect(screen.getByLabelText('com_ui_message_input')).toHaveValue('');
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

    expect(screen.queryByLabelText('com_ui_message_input')).not.toBeInTheDocument();
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
    expect(screen.queryByLabelText('com_ui_message_input')).not.toBeInTheDocument();
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
    expect(screen.queryByLabelText('com_ui_message_input')).not.toBeInTheDocument();
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

    expect(screen.queryByRole('button', { name: 'com_ui_steer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'com_ui_queue' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'com_ui_subagent_cancel_task' }),
    ).not.toBeInTheDocument();
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
    expect(screen.getByTestId('subagent-conversation')).toHaveAttribute('data-state', 'ready');
    expect(
      screen.queryByRole('button', { name: 'com_ui_subagent_continue_new_chat' }),
    ).not.toBeInTheDocument();
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

    /** The settled thread keeps ONE composer: Enter continues from it, and what
     *  the reader typed rides along instead of being discarded with the panel. */
    fireEvent.change(screen.getByLabelText('com_ui_message_input'), {
      target: { value: 'Take this further.' },
    });
    fireEvent.keyDown(screen.getByLabelText('com_ui_message_input'), { key: 'Enter' });
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
    expect(getDraft('continued-chat')).toBe('Take this further.');
  });

  it('continues with no draft when the reader asks for the chat without typing', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_continue_new_chat' }));
    const mutationOptions = mockForkMutate.mock.calls[0][1];
    const conversation = { conversationId: 'empty-continuation', agent_id: 'agent-1' };
    act(() => mutationOptions.onSuccess({ conversation, messages: [] }));
    expect(mockNavigateToConvo).toHaveBeenCalledWith(conversation);
    expect(getDraft('empty-continuation')).toBe('');
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

    expect(
      screen.queryByRole('button', { name: 'com_ui_subagent_continue_new_chat' }),
    ).not.toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText('com_ui_message_input'), {
      target: { value: 'Carry this over.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_continue_new_chat' }));
    expect(screen.getByLabelText('com_ui_message_input')).toHaveValue('');
    act(() => mockForkMutate.mock.calls[0][1].onError());
    expect(mockShowToast).toHaveBeenCalledWith({
      message: 'com_ui_continue_chat_error',
      status: 'error',
    });
    expect(screen.getByRole('region')).toBeInTheDocument();
    /** The panel is still open on this path, so the draft that failed to travel
     *  comes back rather than being lost with the request. */
    expect(screen.getByLabelText('com_ui_message_input')).toHaveValue('Carry this over.');
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

    expect(screen.getByTestId('subagent-conversation')).toHaveAttribute('data-state', 'loading');
    expect(screen.queryByTestId('shared-activity')).not.toBeInTheDocument();
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
      { keepPreviousData: true, refetchInterval: 2000 },
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

    expect(screen.getByTestId('subagent-conversation')).toHaveAttribute('data-state', 'error');
    expect(screen.queryByTestId('shared-activity')).not.toBeInTheDocument();
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
    expect(screen.getByTestId('subagent-conversation')).toHaveAttribute('data-state', 'ready');
    expect(screen.queryByTestId('shared-activity')).not.toBeInTheDocument();
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

  it('keeps a single event actor in the compact header without a duplicate selector', () => {
    const eventChild: ParentSubagentSummary = {
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
      tasks: [{ taskId: 'task', status: 'completed' }],
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

    render(
      <RecoilRoot>
        <SubagentThreadPanel
          selection={{
            ...selection,
            event: { actorId: 'actor-1', progressKey: 'event-task:child-thread:task' },
          }}
        />
      </RecoilRoot>,
    );

    expect(screen.getByRole('heading', { name: 'Analyst One' })).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'com_ui_subagent_actor' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('com_ui_subagent_depth')).not.toBeInTheDocument();
  });

  it.each([
    ['newest known task', 'task-new', 'last'],
    ['displaced older task', 'task-old-displaced', 'first'],
  ] as const)(
    'places a turn missing from the durable window per its identity: %s',
    (_label, selectedTaskId, position) => {
      mockParentChildrenByThread = new Map([
        [
          'child-thread',
          {
            threadId: 'child-thread',
            parentMessageId: 'parent-message',
            parentToolCallId: 'tool-call',
            subagentType: 'researcher',
            subagentKind: 'agent',
            title: 'Research child',
            origin: 'tool',
            status: 'running',
            latestTaskId: 'task-new',
            tasks: [{ taskId: 'task-new', status: 'running' }],
            tasksTruncated: false,
          } as ParentSubagentSummary,
        ],
      ]);
      mockUseSubagentThreadQuery.mockReturnValue({
        data: {
          ...completedView,
          turns: [
            {
              taskId: 'task-durable',
              trigger: { kind: 'parent_dispatch', summary: 'Durable window turn' },
              status: 'completed',
              activity: [{ type: 'writing', text: 'Durable result' }],
              activityTruncated: false,
              messages: [],
            },
          ],
        },
        isLoading: false,
        isError: false,
        isReadinessPending: false,
      });
      const missingSelection: ActiveSubagentPanel = {
        ...selection,
        prompt: 'Synthesized window turn',
        durable: { threadId: 'child-thread', taskId: selectedTaskId },
      };
      render(
        <RecoilRoot initializeState={({ set }) => set(activeSubagentPanel, missingSelection)}>
          <SubagentThreadPanel selection={missingSelection} />
        </RecoilRoot>,
      );

      const turns = screen.getAllByTestId('conversation-turn');
      expect(turns).toHaveLength(2);
      const synthesizedIndex = position === 'last' ? 1 : 0;
      expect(turns[synthesizedIndex]).toHaveTextContent('Synthesized window turn');
      expect(turns[1 - synthesizedIndex]).toHaveTextContent('Durable window turn');
    },
  );

  it('loads an exact older turn projection only after the local disclosure is opened', async () => {
    const truncatedView: SubagentThreadView = {
      ...completedView,
      turns: [
        {
          taskId: 'task-old',
          trigger: { kind: 'parent_dispatch', summary: 'Old prompt' },
          status: 'completed',
          activity: [],
          activityTruncated: true,
          messages: [],
        },
        {
          taskId: 'task',
          trigger: { kind: 'parent_continuation', summary: 'Current prompt' },
          status: 'completed',
          activity: [{ type: 'writing', text: 'Current result' }],
          activityTruncated: false,
          messages: [],
        },
      ],
    };
    mockUseSubagentThreadQuery.mockReturnValue({
      data: truncatedView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    mockGetSubagentThread.mockResolvedValue({
      ...completedView,
      activity: [{ type: 'writing', text: 'Loaded exact activity' }],
      activityTruncated: false,
      messages: [
        {
          messageId: 'task-old:assistant',
          parentMessageId: 'task-old:user',
          role: 'assistant',
          text: 'Loaded exact activity',
        },
      ],
    });

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    expect(mockGetSubagentThread).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'load-task-old' }));
    await waitFor(() => expect(screen.getByText('Loaded exact activity')).toBeInTheDocument());
    expect(mockGetSubagentThread).toHaveBeenCalledTimes(1);
    expect(mockGetSubagentThread).toHaveBeenCalledWith(
      'parent-conversation',
      'child-thread',
      'task-old',
    );
  });

  it('retains partial activity when an exact historical task has vanished', async () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        turns: [
          {
            taskId: 'task-old',
            trigger: { kind: 'parent_dispatch', summary: 'Retained prompt' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'Retained partial result' }],
            activityTruncated: true,
            messages: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    mockGetSubagentThread.mockResolvedValue({
      ...completedView,
      activity: [],
      activityTruncated: false,
      messages: [],
      turns: [],
    });

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'load-task-old' }));
    await waitFor(() =>
      expect(screen.getAllByTestId('conversation-turn')[1]).toHaveTextContent('unavailable'),
    );
    expect(screen.getByText('Retained partial result')).toBeInTheDocument();
  });

  it('prepends an older bounded page without adding it to live polling', async () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        nextCursor: 'older:assistant',
        turns: [
          {
            taskId: 'task',
            trigger: { kind: 'parent_dispatch', summary: 'Current prompt' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'Current result' }],
            activityTruncated: false,
            messages: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    mockGetSubagentThread.mockResolvedValue({
      ...completedView,
      activity: [],
      messages: [],
      historyTruncated: false,
      turns: [
        {
          taskId: 'older',
          trigger: { kind: 'parent_dispatch', summary: 'Older prompt' },
          status: 'completed',
          activity: [{ type: 'writing', text: 'Older result' }],
          activityTruncated: false,
          messages: [],
        },
      ],
    });

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }));
    await waitFor(() => expect(screen.getAllByTestId('conversation-turn')).toHaveLength(2));
    expect(mockGetSubagentThread).toHaveBeenCalledWith(
      'parent-conversation',
      'child-thread',
      undefined,
      'older:assistant',
    );
    expect(mockUseSubagentThreadQuery.mock.calls.every((call) => call[2] === 'task')).toBe(true);
  });

  it('discards an older-page response when the latest cursor generation advances', async () => {
    let resolveOlderPage: (view: SubagentThreadView) => void = () => undefined;
    const olderPage = new Promise<SubagentThreadView>((resolve) => {
      resolveOlderPage = resolve;
    });
    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        nextCursor: 'older-a:assistant',
        turns: [
          {
            taskId: 'task',
            trigger: { kind: 'parent_dispatch', summary: 'Current prompt' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'Current result' }],
            activityTruncated: false,
            messages: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    mockGetSubagentThread.mockReturnValueOnce(olderPage);

    const { rerender } = render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }));

    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        nextCursor: 'older-b:assistant',
        turns: [
          {
            taskId: 'task-new',
            trigger: { kind: 'parent_continuation', summary: 'New prompt' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'New result' }],
            activityTruncated: false,
            messages: [],
          },
          {
            taskId: 'task',
            trigger: { kind: 'parent_dispatch', summary: 'Current prompt' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'Current result' }],
            activityTruncated: false,
            messages: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    rerender(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    await act(async () => {
      resolveOlderPage({
        ...completedView,
        activity: [],
        messages: [],
        turns: [
          {
            taskId: 'older-a',
            trigger: { kind: 'parent_dispatch', summary: 'Displaced prompt' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'Displaced result' }],
            activityTruncated: false,
            messages: [],
          },
        ],
      });
      await olderPage;
    });

    expect(screen.queryByText('Displaced result')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }),
      ).toBeEnabled(),
    );
  });

  it('shows only the retry control after an earlier-history request fails', async () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        nextCursor: 'older:assistant',
        turns: [
          {
            taskId: 'task',
            trigger: { kind: 'parent_dispatch', summary: 'Current prompt' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'Current result' }],
            activityTruncated: false,
            messages: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    mockGetSubagentThread.mockRejectedValueOnce(new Error('history unavailable'));

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'com_ui_retry' })).toBeEnabled());
    expect(
      screen.queryByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }),
    ).not.toBeInTheDocument();
  });

  it('shows a compact inaccessible-history boundary when no recovery cursor exists', () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        historyTruncated: true,
        turns: [
          {
            taskId: 'task',
            trigger: { kind: 'parent_dispatch', summary: 'Current prompt' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'Current result' }],
            activityTruncated: false,
            messages: [],
          },
        ],
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

    expect(
      screen.getByRole('status', { name: 'com_ui_subagent_thread_history_truncated' }),
    ).toHaveTextContent('•••');
    expect(
      screen.queryByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }),
    ).not.toBeInTheDocument();
  });

  it('preserves an unrecoverable boundary while loading later cursor pages', async () => {
    mockUseSubagentThreadQuery.mockReturnValue({
      data: {
        ...completedView,
        nextCursor: 'older:assistant',
        turns: [],
      },
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    });
    mockGetSubagentThread
      .mockResolvedValueOnce({
        ...completedView,
        nextCursor: 'oldest:assistant',
        historyTruncated: true,
        historyUnavailable: true,
        activity: [],
        messages: [],
        turns: [],
      })
      .mockResolvedValueOnce({
        ...completedView,
        historyTruncated: false,
        activity: [],
        messages: [],
        turns: [],
      });

    render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }));
    await waitFor(() =>
      expect(mockGetSubagentThread).toHaveBeenLastCalledWith(
        'parent-conversation',
        'child-thread',
        undefined,
        'older:assistant',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }));
    await waitFor(() =>
      expect(mockGetSubagentThread).toHaveBeenLastCalledWith(
        'parent-conversation',
        'child-thread',
        undefined,
        'oldest:assistant',
      ),
    );

    expect(
      screen.getByRole('status', { name: 'com_ui_subagent_thread_history_truncated' }),
    ).toHaveTextContent('•••');
  });

  it('preserves a cursorless truncated boundary after the latest polling window moves', async () => {
    let latestView: SubagentThreadView = {
      ...completedView,
      historyTruncated: true,
      historyUnavailable: undefined,
      nextCursor: undefined,
      turns: [],
    };
    mockUseSubagentThreadQuery.mockImplementation(() => ({
      data: latestView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    }));

    const { rerender } = render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );
    expect(
      screen.getByRole('status', { name: 'com_ui_subagent_thread_history_truncated' }),
    ).toBeInTheDocument();

    latestView = {
      ...latestView,
      historyTruncated: false,
      nextCursor: 'new-boundary:assistant',
    };
    rerender(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('status', { name: 'com_ui_subagent_thread_history_truncated' }),
      ).toBeInTheDocument(),
    );
  });

  it('rejects stale exact-detail responses across an actor A-B-A switch', async () => {
    let resolveStaleDetail: (view: SubagentThreadView) => void = () => undefined;
    const staleDetail = new Promise<SubagentThreadView>((resolve) => {
      resolveStaleDetail = resolve;
    });
    const viewFor = (threadId: string, taskId: string): SubagentThreadView => ({
      ...completedView,
      threadId,
      activity: [],
      activityTruncated: true,
      messages: [],
      turns: [
        {
          taskId,
          trigger: { kind: 'parent_dispatch', summary: `${threadId} prompt` },
          status: 'completed',
          activity: [],
          activityTruncated: true,
          messages: [],
        },
      ],
    });
    mockUseSubagentThreadQuery.mockImplementation(
      (_parentConversationId: string, requestedThreadId: string, requestedTaskId: string) => ({
        data: viewFor(requestedThreadId, requestedTaskId),
        isLoading: false,
        isError: false,
        isReadinessPending: false,
      }),
    );
    mockGetSubagentThread.mockReturnValueOnce(staleDetail).mockResolvedValueOnce({
      ...completedView,
      threadId: 'thread-a',
      activity: [{ type: 'writing', text: 'Fresh detail' }],
      activityTruncated: false,
      messages: [
        {
          messageId: 'task-a:assistant',
          parentMessageId: 'task-a:user',
          role: 'assistant',
          text: 'Fresh detail',
        },
      ],
    });
    const selectionA: ActiveSubagentPanel = {
      ...selection,
      durable: { threadId: 'thread-a', taskId: 'task-a' },
    };
    const selectionB: ActiveSubagentPanel = {
      ...selection,
      durable: { threadId: 'thread-b', taskId: 'task-b' },
    };

    const { rerender } = render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selectionA} />
      </RecoilRoot>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'load-task-a' }));
    rerender(
      <RecoilRoot>
        <SubagentThreadPanel selection={selectionB} />
      </RecoilRoot>,
    );
    rerender(
      <RecoilRoot>
        <SubagentThreadPanel selection={selectionA} />
      </RecoilRoot>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'load-task-a' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'load-task-a' }));
    await waitFor(() => expect(screen.getByText('Fresh detail')).toBeInTheDocument());

    await act(async () => {
      resolveStaleDetail({
        ...completedView,
        threadId: 'thread-a',
        activity: [{ type: 'writing', text: 'Stale detail' }],
        activityTruncated: false,
        messages: [],
      });
      await staleDetail;
    });

    expect(screen.getByText('Fresh detail')).toBeInTheDocument();
    expect(screen.queryByText('Stale detail')).not.toBeInTheDocument();
  });

  it('rejects stale history responses across an actor A-B-A switch', async () => {
    let resolveStaleHistory: (view: SubagentThreadView) => void = () => undefined;
    const staleHistory = new Promise<SubagentThreadView>((resolve) => {
      resolveStaleHistory = resolve;
    });
    const viewFor = (threadId: string, taskId: string): SubagentThreadView => ({
      ...completedView,
      threadId,
      nextCursor: `${taskId}-older:assistant`,
      activity: [{ type: 'writing', text: `${threadId} current` }],
      turns: [
        {
          taskId,
          trigger: { kind: 'parent_dispatch', summary: `${threadId} prompt` },
          status: 'completed',
          activity: [{ type: 'writing', text: `${threadId} current` }],
          activityTruncated: false,
          messages: [],
        },
      ],
    });
    mockUseSubagentThreadQuery.mockImplementation(
      (_parentConversationId: string, requestedThreadId: string, requestedTaskId: string) => ({
        data: viewFor(requestedThreadId, requestedTaskId),
        isLoading: false,
        isError: false,
        isReadinessPending: false,
      }),
    );
    mockGetSubagentThread.mockReturnValueOnce(staleHistory).mockResolvedValueOnce({
      ...completedView,
      threadId: 'thread-a',
      activity: [],
      messages: [],
      turns: [
        {
          taskId: 'fresh-older',
          trigger: { kind: 'parent_dispatch', summary: 'Fresh older prompt' },
          status: 'completed',
          activity: [{ type: 'writing', text: 'Fresh older result' }],
          activityTruncated: false,
          messages: [],
        },
      ],
    });
    const selectionA: ActiveSubagentPanel = {
      ...selection,
      durable: { threadId: 'thread-a', taskId: 'task-a' },
    };
    const selectionB: ActiveSubagentPanel = {
      ...selection,
      durable: { threadId: 'thread-b', taskId: 'task-b' },
    };

    const { rerender } = render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selectionA} />
      </RecoilRoot>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }));
    rerender(
      <RecoilRoot>
        <SubagentThreadPanel selection={selectionB} />
      </RecoilRoot>,
    );
    rerender(
      <RecoilRoot>
        <SubagentThreadPanel selection={selectionA} />
      </RecoilRoot>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }));
    await waitFor(() => expect(screen.getByText('Fresh older result')).toBeInTheDocument());

    await act(async () => {
      resolveStaleHistory({
        ...completedView,
        threadId: 'thread-a',
        activity: [],
        messages: [],
        turns: [
          {
            taskId: 'stale-older',
            trigger: { kind: 'parent_dispatch', summary: 'Stale older prompt' },
            status: 'completed',
            activity: [{ type: 'writing', text: 'Stale older result' }],
            activityTruncated: false,
            messages: [],
          },
        ],
      });
      await staleHistory;
    });

    expect(screen.getByText('Fresh older result')).toBeInTheDocument();
    expect(screen.queryByText('Stale older result')).not.toBeInTheDocument();
  });

  it('retains a latest-window turn displaced after older history has loaded', async () => {
    const makeTurn = (taskId: string, text: string) => ({
      taskId,
      trigger: { kind: 'parent_dispatch' as const, summary: `${text} prompt` },
      status: 'completed' as const,
      activity: [{ type: 'writing' as const, text }],
      activityTruncated: false,
      messages: [],
    });
    let latestView: SubagentThreadView = {
      ...completedView,
      nextCursor: 'boundary:assistant',
      activity: [{ type: 'writing', text: 'Current result' }],
      turns: [makeTurn('boundary', 'Boundary result'), makeTurn('task', 'Current result')],
    };
    let resolveReconnect: (view: SubagentThreadView) => void = () => undefined;
    const reconnectPage = new Promise<SubagentThreadView>((resolve) => {
      resolveReconnect = resolve;
    });
    mockUseSubagentThreadQuery.mockImplementation(() => ({
      data: latestView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    }));
    mockGetSubagentThread
      .mockResolvedValueOnce({
        ...completedView,
        nextCursor: 'very-old:assistant',
        activity: [],
        messages: [],
        turns: [makeTurn('very-old', 'Very old result')],
      })
      .mockResolvedValueOnce({
        ...completedView,
        nextCursor: 'middle-older:assistant',
        activity: [],
        messages: [],
        historyTruncated: true,
        turns: [makeTurn('middle-newer', 'Newer middle result')],
      })
      .mockReturnValueOnce(reconnectPage);

    const { rerender } = render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }));
    await waitFor(() => expect(screen.getAllByTestId('conversation-turn')).toHaveLength(3));

    latestView = {
      ...latestView,
      nextCursor: 'middle:assistant',
      turns: [makeTurn('task-new', 'New result'), makeTurn('task-newer', 'Newest result')],
    };
    rerender(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    await waitFor(() => expect(screen.getAllByTestId('conversation-turn')).toHaveLength(5));
    expect(screen.getByText('Very old result')).toBeInTheDocument();
    expect(screen.getByText('Boundary result')).toBeInTheDocument();
    expect(screen.getByText('Current result')).toBeInTheDocument();
    expect(screen.getByText('New result')).toBeInTheDocument();
    expect(screen.getByText('Newest result')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }));
    await waitFor(() =>
      expect(mockGetSubagentThread).toHaveBeenLastCalledWith(
        'parent-conversation',
        'child-thread',
        undefined,
        'middle:assistant',
      ),
    );
    await waitFor(() => expect(screen.getAllByTestId('conversation-turn')).toHaveLength(6));

    latestView = {
      ...latestView,
      nextCursor: 'new-live-boundary:assistant',
      turns: [makeTurn('task-final', 'Final live result')],
    };
    rerender(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );
    await waitFor(() => expect(screen.getAllByTestId('conversation-turn')).toHaveLength(7));

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }));
    await waitFor(() =>
      expect(mockGetSubagentThread).toHaveBeenLastCalledWith(
        'parent-conversation',
        'child-thread',
        undefined,
        'middle-older:assistant',
      ),
    );

    latestView = {
      ...latestView,
      nextCursor: 'ultimate-live-boundary:assistant',
      turns: [makeTurn('task-ultimate', 'Ultimate live result')],
    };
    rerender(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );
    await waitFor(() => expect(screen.getByText('Ultimate live result')).toBeInTheDocument());

    await act(async () => {
      resolveReconnect({
        ...completedView,
        activity: [],
        messages: [],
        historyTruncated: false,
        turns: [
          makeTurn('boundary', 'Boundary result'),
          makeTurn('middle-older', 'Older middle result'),
        ],
      });
      await reconnectPage;
    });

    await waitFor(() => expect(screen.getAllByTestId('conversation-turn')).toHaveLength(9));
    expect(screen.getAllByTestId('conversation-turn').map((turn) => turn.textContent)).toEqual([
      expect.stringContaining('Very old result'),
      expect.stringContaining('Boundary result'),
      expect.stringContaining('Current result'),
      expect.stringContaining('Older middle result'),
      expect.stringContaining('Newer middle result'),
      expect.stringContaining('New result'),
      expect.stringContaining('Newest result'),
      expect.stringContaining('Final live result'),
      expect.stringContaining('Ultimate live result'),
    ]);
    expect(
      screen.queryByRole('button', { name: 'com_ui_subagent_load_earlier_activity' }),
    ).not.toBeInTheDocument();
  });

  it('does not accumulate displaced latest-window turns before history is requested', async () => {
    const makeTurn = (taskId: string, text: string) => ({
      taskId,
      trigger: { kind: 'parent_dispatch' as const, summary: `${text} prompt` },
      status: 'completed' as const,
      activity: [{ type: 'writing' as const, text }],
      activityTruncated: false,
      messages: [],
    });
    let latestView: SubagentThreadView = {
      ...completedView,
      nextCursor: 'old:assistant',
      turns: [makeTurn('old', 'Old result'), makeTurn('task', 'Current result')],
    };
    mockUseSubagentThreadQuery.mockImplementation(() => ({
      data: latestView,
      isLoading: false,
      isError: false,
      isReadinessPending: false,
    }));

    const { rerender } = render(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );
    expect(screen.getByText('Old result')).toBeInTheDocument();

    latestView = {
      ...latestView,
      nextCursor: 'task:assistant',
      turns: [makeTurn('task', 'Current result'), makeTurn('new', 'New result')],
    };
    rerender(
      <RecoilRoot>
        <SubagentThreadPanel selection={selection} />
      </RecoilRoot>,
    );

    await waitFor(() => expect(screen.queryByText('Old result')).not.toBeInTheDocument());
    expect(screen.getByText('Current result prompt')).toBeInTheDocument();
    expect(screen.getByText('New result')).toBeInTheDocument();
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
    expect(
      screen.getByRole('status', { name: 'com_ui_subagent_thread_history_truncated' }),
    ).toHaveTextContent('•••');
  });

  it('marks a truncated one-task legacy event window as incomplete', () => {
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
      latestTaskId: 'task',
      tasks: [{ taskId: 'task', status: 'completed' }],
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

    render(
      <RecoilRoot>
        <SubagentThreadPanel
          selection={{
            ...selection,
            event: { actorId: 'actor-1', progressKey: 'event-task:child-thread:task' },
          }}
        />
      </RecoilRoot>,
    );

    expect(screen.getAllByTestId('shared-activity')).toHaveLength(1);
    expect(
      screen.getByRole('status', { name: 'com_ui_subagent_thread_history_truncated' }),
    ).toHaveTextContent('•••');
  });
});
