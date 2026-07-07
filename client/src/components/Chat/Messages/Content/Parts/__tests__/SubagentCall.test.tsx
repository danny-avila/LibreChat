import React from 'react';
import { RecoilRoot, useRecoilCallback, useRecoilValue } from 'recoil';
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
import type { SubagentUpdateEvent } from 'librechat-data-provider';
import type {
  SubagentContentPart,
  SubagentTickerState,
  SubagentAggregatorState,
} from '~/utils/subagentContent';
import type { SubagentProgress } from '~/store/subagents';
import {
  foldSubagentEvent,
  foldSubagentEventIntoTicker,
  initSubagentAggregatorState,
  initSubagentTickerState,
} from '~/utils/subagentContent';
import { SUBAGENT_TICKER_THROTTLE_MS } from '../subagentShared';
import SubagentCall from '../SubagentCall';
import store from '~/store';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, values?: Record<string, unknown>): string => {
      const arg0 = (values?.[0] as string | undefined) ?? '';
      const translations: Record<string, string> = {
        com_ui_subagent_running: 'Running agent',
        com_ui_subagent_complete: 'Ran agent',
        com_ui_subagent_cancelled: 'Agent stopped',
        com_ui_subagent_errored: 'Agent failed',
        com_ui_subagent_waiting: 'Working…',
        com_ui_subagent_ticker_writing: 'Writing',
        com_ui_subagent_ticker_reasoning: 'Reasoning',
        com_ui_subagent_ticker_error: 'Error',
        com_ui_subagent_ticker_using: 'Using',
        com_ui_subagent_ticker_tool_done: 'done',
        com_ui_used_n_tools: `Used ${arg0} tools`,
      };
      return translations[key] ?? key;
    },
}));

jest.mock('../Attachment', () => ({
  AttachmentGroup: ({ attachments }: { attachments: unknown }) => (
    <div data-testid="attachment-group">{JSON.stringify(attachments)}</div>
  ),
}));

jest.mock('lucide-react', () => ({
  // eslint-disable-next-line i18next/no-literal-string
  ChevronRight: () => <span>chevron</span>,
  // eslint-disable-next-line i18next/no-literal-string
  Users: () => <span>users</span>,
}));

/** No agents-map context → the header renders the `Users` fallback. */
jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => ({}),
}));

jest.mock('~/components/Share/MessageIcon', () => ({
  __esModule: true,
  default: ({ agent }: { agent?: { name?: string } }) => (
    <span data-testid="agent-icon">{agent?.name ?? ''}</span>
  ),
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils/groupToolCalls'),
  ...jest.requireActual('~/utils/toolLabels'),
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

afterEach(() => {
  jest.useRealTimers();
});

function foldEvents(events: SubagentUpdateEvent[]): {
  contentParts: SubagentContentPart[];
  aggregatorState: SubagentAggregatorState;
  tickerState: SubagentTickerState;
} {
  let contentParts: SubagentContentPart[] = [];
  let aggregatorState = initSubagentAggregatorState();
  let tickerState = initSubagentTickerState();
  for (const event of events) {
    ({ parts: contentParts, state: aggregatorState } = foldSubagentEvent(
      contentParts,
      aggregatorState,
      event,
    ));
    tickerState = foldSubagentEventIntoTicker(tickerState, event);
  }
  return { contentParts, aggregatorState, tickerState };
}

function progressFromEvents(
  base: { events: SubagentUpdateEvent[] } & Omit<
    SubagentProgress,
    'contentParts' | 'aggregatorState' | 'tickerState'
  >,
): SubagentProgress {
  const { events, ...rest } = base;
  const aggregates = foldEvents(events);
  return { ...rest, ...aggregates };
}

/** Surfaces the shared right-panel atoms so tests can assert that clicking /
 *  streaming opens the panel (sets `currentSubagentRunId`) instead of a dialog. */
function PanelProbe() {
  const runId = useRecoilValue(store.currentSubagentRunId);
  const runs = useRecoilValue(store.subagentRunsState);
  return (
    <>
      <div data-testid="current-run-id">{runId ?? ''}</div>
      <div data-testid="registered-run-ids">{Object.keys(runs ?? {}).join(',')}</div>
    </>
  );
}

function renderWithState(args: {
  toolCallId: string;
  initialProgress: number;
  isSubmitting?: boolean;
  output?: string | null;
  progress?: SubagentProgress | null;
  initializeStreaming?: boolean;
}) {
  const setter = { current: null as null | ((next: SubagentProgress | null) => void) };
  const SeedHelper = () => {
    setter.current = useRecoilCallback(
      ({ set }) =>
        (next: SubagentProgress | null) => {
          set(store.subagentProgressByToolCallId(args.toolCallId), next);
        },
      [],
    );
    return null;
  };
  const rendered = render(
    <RecoilRoot
      initializeState={({ set }) => {
        if (args.initializeStreaming) {
          set(store.isSubmittingFamily(0), true);
        }
      }}
    >
      <SeedHelper />
      <PanelProbe />
      <SubagentCall
        toolCallId={args.toolCallId}
        initialProgress={args.initialProgress}
        isSubmitting={args.isSubmitting ?? false}
        output={args.output}
        args={{ subagent_type: 'self', description: 'compute' }}
      />
    </RecoilRoot>,
  );
  const setProgress = (next: SubagentProgress | null) => {
    act(() => {
      setter.current?.(next);
    });
  };
  setProgress(args.progress ?? null);
  return { ...rendered, setProgress };
}

describe('SubagentCall — status resolution', () => {
  it('renders "Running agent" while streaming and no terminal envelope has arrived', () => {
    renderWithState({
      toolCallId: 'call_running',
      initialProgress: 0.3,
      isSubmitting: true,
      progress: progressFromEvents({
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'run_step',
      }),
    });
    expect(screen.getByText('Running agent')).toBeInTheDocument();
  });

  it('renders "Ran agent" when the subagent emits a `stop` phase', () => {
    renderWithState({
      toolCallId: 'call_stopped',
      initialProgress: 1,
      isSubmitting: true,
      progress: progressFromEvents({
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'stop',
      }),
    });
    expect(screen.getByText('Ran agent')).toBeInTheDocument();
  });

  it('renders "Ran agent" when the tool call progress reaches 1', () => {
    renderWithState({
      toolCallId: 'call_done',
      initialProgress: 1,
      isSubmitting: false,
      progress: null,
    });
    expect(screen.getByText('Ran agent')).toBeInTheDocument();
  });

  it('renders "Agent stopped" when the stream stops before a terminal envelope', () => {
    renderWithState({
      toolCallId: 'call_cancelled',
      initialProgress: 0.4,
      isSubmitting: false,
      progress: progressFromEvents({
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'run_step',
      }),
    });
    expect(screen.getByText('Agent stopped')).toBeInTheDocument();
  });

  it('renders "Agent failed" when the subagent emits an `error` phase', () => {
    renderWithState({
      toolCallId: 'call_error',
      initialProgress: 0.4,
      isSubmitting: true,
      progress: progressFromEvents({
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'error',
      }),
    });
    expect(screen.getByText('Agent failed')).toBeInTheDocument();
  });
});

describe('SubagentCall — inline preview', () => {
  it('shows the latest activity line while running', async () => {
    renderWithState({
      toolCallId: 'call_ticker',
      initialProgress: 0.3,
      isSubmitting: true,
      progress: progressFromEvents({
        subagentRunId: 'run_a',
        subagentType: 'self',
        status: 'message_delta',
        events: ['Hello ', 'world', '!'].map((text) => ({
          runId: 'p',
          subagentRunId: 'run_a',
          subagentType: 'self',
          subagentAgentId: 'child',
          phase: 'message_delta' as const,
          data: { delta: { content: [{ type: 'text', text }] } },
          timestamp: '',
        })),
      }),
    });
    await waitFor(
      () => {
        expect(screen.getByText('Hello world!')).toBeInTheDocument();
      },
      { timeout: 2500 },
    );
    // A single collapsed live line — one "Writing:" label, not three.
    expect(screen.getAllByText('Writing:')).toHaveLength(1);
  });

  it('shows a one-line result summary from the final text once finished', () => {
    renderWithState({
      toolCallId: 'call_summary',
      initialProgress: 1,
      isSubmitting: false,
      progress: progressFromEvents({
        subagentRunId: 'run_a',
        subagentType: 'self',
        status: 'stop',
        events: [
          {
            runId: 'p',
            subagentRunId: 'run_a',
            subagentType: 'self',
            subagentAgentId: 'child',
            phase: 'message_delta',
            data: { delta: { content: [{ type: 'text', text: 'The final answer is 42.' }] } },
            timestamp: '',
          },
        ],
      }),
    });
    expect(screen.getByText('The final answer is 42.')).toBeInTheDocument();
    // No live ticker label once finished.
    expect(screen.queryByText('Writing:')).not.toBeInTheDocument();
  });

  it('refreshes long live previews after the throttle window', () => {
    jest.useFakeTimers();
    const firstPreview = 'First live preview '.repeat(8).trim();
    const secondPreview = 'Second live preview '.repeat(8).trim();
    const progressForText = (text: string): SubagentProgress =>
      progressFromEvents({
        subagentRunId: 'run_a',
        subagentType: 'self',
        status: 'message_delta',
        events: [
          {
            runId: 'p',
            subagentRunId: 'run_a',
            subagentType: 'self',
            subagentAgentId: 'child',
            phase: 'message_delta',
            data: { delta: { content: [{ type: 'text', text }] } },
            timestamp: '',
          },
        ],
      });

    const { setProgress } = renderWithState({
      toolCallId: 'call_throttled',
      initialProgress: 0.3,
      isSubmitting: true,
      progress: progressForText(firstPreview),
    });
    const card = within(screen.getByRole('button', { name: /Running agent/ }));

    expect(card.getByText(firstPreview)).toBeInTheDocument();
    setProgress(progressForText(secondPreview));
    expect(card.getByText(firstPreview)).toBeInTheDocument();
    expect(card.queryByText(secondPreview)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(SUBAGENT_TICKER_THROTTLE_MS - 1);
    });
    expect(card.queryByText(secondPreview)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(card.getByText(secondPreview)).toBeInTheDocument();
  });
});

describe('SubagentCall — panel open contract', () => {
  it('registers the run into the shared registry on mount', async () => {
    renderWithState({
      toolCallId: 'call_register',
      initialProgress: 1,
      isSubmitting: false,
      progress: null,
    });
    await waitFor(() => {
      expect(screen.getByTestId('registered-run-ids')).toHaveTextContent('call_register');
    });
  });

  it('opens the shared panel (sets currentSubagentRunId) on click — no dialog', () => {
    renderWithState({
      toolCallId: 'call_open',
      initialProgress: 1,
      isSubmitting: false,
      progress: null,
    });
    expect(screen.getByTestId('current-run-id')).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button', { name: /Ran agent/ }));
    expect(screen.getByTestId('current-run-id')).toHaveTextContent('call_open');
  });

  it('toggles the panel closed when clicking the already-open card', () => {
    renderWithState({
      toolCallId: 'call_toggle',
      initialProgress: 1,
      isSubmitting: false,
      progress: null,
    });
    fireEvent.click(screen.getByRole('button', { name: /Ran agent/ }));
    expect(screen.getByTestId('current-run-id')).toHaveTextContent('call_toggle');
    fireEvent.click(screen.getByRole('button', { name: /Ran agent/ }));
    expect(screen.getByTestId('current-run-id')).toHaveTextContent('');
  });

  it('auto-focuses the panel when the run first mounts mid-stream', async () => {
    renderWithState({
      toolCallId: 'call_autofocus',
      initialProgress: 0.3,
      isSubmitting: true,
      initializeStreaming: true,
      progress: progressFromEvents({
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'run_step',
      }),
    });
    await waitFor(() => {
      expect(screen.getByTestId('current-run-id')).toHaveTextContent('call_autofocus');
    });
  });

  it('does NOT auto-focus for a history mount (not streaming)', () => {
    renderWithState({
      toolCallId: 'call_history',
      initialProgress: 1,
      isSubmitting: false,
      progress: null,
    });
    expect(screen.getByTestId('current-run-id')).toHaveTextContent('');
  });
});
