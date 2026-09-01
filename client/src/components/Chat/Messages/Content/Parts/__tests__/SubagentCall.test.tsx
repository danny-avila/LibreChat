import React from 'react';
import { RecoilRoot } from 'recoil';
import { useAtomValue, useStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SubagentUpdateEvent } from 'librechat-data-provider';
import type {
  SubagentAggregatorState,
  SubagentContentPart,
  SubagentTickerState,
} from '~/utils/subagentContent';
import type { ActiveSubagentPanel, SubagentProgress } from '~/store/subagents';
import {
  foldSubagentEvent,
  foldSubagentEventIntoTicker,
  initSubagentAggregatorState,
  initSubagentTickerState,
} from '~/utils/subagentContent';
import {
  activeSubagentPanel,
  subagentProgressByToolCallId,
  subagentProgressKey,
} from '~/store/subagents';
import SubagentCall, { SUBAGENT_TICKER_THROTTLE_MS } from '../SubagentCall';
import { MessageContext } from '~/Providers/MessageContext';
import { ChatSurfaceHarness } from 'test/harness';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string => {
      const translations: Record<string, string> = {
        com_ui_subagent_running: 'Running agent',
        com_ui_subagent_activity: 'Agent activity',
        com_ui_subagent_complete: 'Ran agent',
        com_ui_subagent_cancelled: 'Cancelled agent',
        com_ui_subagent_errored: 'Agent errored',
        com_ui_subagent_waiting: 'Waiting for first update…',
        com_ui_subagent_ticker_writing: 'Writing',
        com_ui_subagent_ticker_reasoning: 'Reasoning',
        com_ui_subagent_ticker_error: 'Error',
        com_ui_subagent_ticker_using: 'Using',
        com_ui_subagent_ticker_tool_done: 'done',
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

jest.mock('~/Providers', () => ({ useAgentsMapContext: () => ({}) }));
jest.mock('~/components/Share/MessageIcon', () => ({ __esModule: true, default: () => null }));
jest.mock('~/hooks/MCP', () => ({ useMCPServerNames: () => [] }));
jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils/toolLabels'),
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
  logger: { log: jest.fn() },
}));

afterEach(() => jest.useRealTimers());

function foldEvents(events: SubagentUpdateEvent[]): {
  contentParts: SubagentContentPart[];
  aggregatorState: SubagentAggregatorState;
  tickerState: SubagentTickerState;
} {
  let contentParts: SubagentContentPart[] = [];
  let aggregatorState = initSubagentAggregatorState();
  let tickerState = initSubagentTickerState();
  for (const update of events) {
    ({ parts: contentParts, state: aggregatorState } = foldSubagentEvent(
      contentParts,
      aggregatorState,
      update,
    ));
    tickerState = foldSubagentEventIntoTicker(tickerState, update);
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
  return { ...rest, ...foldEvents(events) };
}

function renderWithState(args: {
  toolCallId: string;
  initialProgress: number;
  isSubmitting?: boolean;
  progress?: SubagentProgress | null;
  output?: string;
  toolArgs?: Record<string, unknown>;
}) {
  const setter = { current: null as null | ((next: SubagentProgress | null) => void) };
  let selection: ActiveSubagentPanel | null = null;
  const SeedHelper = () => {
    const store = useStore();
    setter.current = (next: SubagentProgress | null) =>
      store.set(
        subagentProgressByToolCallId(subagentProgressKey('parent-message', args.toolCallId, 0)),
        next,
      );
    return null;
  };
  const SelectionObserver = () => {
    selection = useAtomValue(activeSubagentPanel);
    return null;
  };
  const rendered = render(
    <MemoryRouter>
      <ChatSurfaceHarness>
        <RecoilRoot>
          <SeedHelper />
          <SelectionObserver />
          <MessageContext.Provider
            value={{
              messageId: 'parent-message',
              conversationId: 'parent-conversation',
              isExpanded: false,
            }}
          >
            <SubagentCall
              toolCallId={args.toolCallId}
              initialProgress={args.initialProgress}
              isSubmitting={args.isSubmitting ?? false}
              args={args.toolArgs ?? { subagent_type: 'self', description: 'compute' }}
              output={args.output}
            />
          </MessageContext.Provider>
        </RecoilRoot>
      </ChatSurfaceHarness>
    </MemoryRouter>,
  );
  act(() => setter.current?.(args.progress ?? null));
  return {
    ...rendered,
    getSelection: () => selection,
    setProgress: (next: SubagentProgress | null) => act(() => setter.current?.(next)),
  };
}

const event = (
  phase: SubagentUpdateEvent['phase'],
  data: SubagentUpdateEvent['data'],
): SubagentUpdateEvent => ({
  runId: 'parent-run',
  subagentRunId: 'child-run',
  subagentType: 'self',
  subagentAgentId: 'child',
  phase,
  data,
  timestamp: '',
});

describe('SubagentCall', () => {
  it.each([
    ['Running agent', 0.3, true, 'run_step'],
    ['Ran agent', 1, false, undefined],
    ['Cancelled agent', 0.3, false, 'run_step'],
    ['Agent errored', 0.3, true, 'error'],
  ] as const)('renders the %s lifecycle label', (label, initialProgress, isSubmitting, phase) => {
    renderWithState({
      toolCallId: `call-${label}`,
      initialProgress,
      isSubmitting,
      progress:
        phase == null
          ? null
          : progressFromEvents({
              subagentRunId: 'child-run',
              subagentType: 'self',
              status: phase,
              events: [],
            }),
    });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('keeps the compact semantic ticker while selecting the shared panel', async () => {
    const progress = progressFromEvents({
      subagentRunId: 'child-run',
      subagentType: 'self',
      status: 'run_step',
      events: [
        event('message_delta', { delta: { content: [{ type: 'text', text: 'Working…' }] } }),
        event('run_step', {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: 'inner-1', name: 'calculator', args: '{"value":4}' }],
          },
        }),
      ],
    });
    const rendered = renderWithState({
      toolCallId: 'call-live',
      initialProgress: 0.3,
      isSubmitting: true,
      progress,
    });

    await waitFor(() => expect(screen.getByText('Using')).toBeInTheDocument());
    expect(screen.getByText('Working…')).toBeInTheDocument();
    expect(screen.queryByText('Writing')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Running agent' }));

    expect(rendered.getSelection()).toEqual(
      expect.objectContaining({
        parentConversationId: 'parent-conversation',
        toolCallId: 'call-live',
        subagentType: 'self',
        initialProgress: 0.3,
        isSubmitting: true,
      }),
    );
    expect(rendered.getSelection()?.durable).toBeUndefined();
  });

  it('refreshes a long ticker preview only after the throttle window', () => {
    jest.useFakeTimers();
    const progressFor = (text: string) =>
      progressFromEvents({
        subagentRunId: 'child-run',
        subagentType: 'self',
        status: 'message_delta',
        events: [event('message_delta', { delta: { content: [{ type: 'text', text }] } })],
      });
    const first = 'First live preview '.repeat(8).trim();
    const second = 'Second live preview '.repeat(8).trim();
    const rendered = renderWithState({
      toolCallId: 'call-throttle',
      initialProgress: 0.3,
      isSubmitting: true,
      progress: progressFor(first),
    });
    const card = within(screen.getByRole('button', { name: 'Running agent' }));
    rendered.setProgress(progressFor(second));
    expect(card.getByText(first)).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(SUBAGENT_TICKER_THROTTLE_MS));
    expect(card.getByText(second)).toBeInTheDocument();
  });

  it('opens a foreground legacy invocation in the shared panel with persisted activity', () => {
    let selection: ActiveSubagentPanel | null = null;
    const Observer = () => {
      selection = useAtomValue(activeSubagentPanel);
      return null;
    };
    const persistedContent = [
      { type: 'think', think: 'Visible reasoning.' },
      {
        type: 'tool_call',
        tool_call: { id: 'inner-1', name: 'calculator', args: '{}', output: '4', progress: 1 },
      },
      { type: 'text', text: 'The answer is 4.' },
    ] as Parameters<typeof SubagentCall>[0]['persistedContent'];
    render(
      <MemoryRouter>
        <ChatSurfaceHarness>
          <RecoilRoot>
            <Observer />
            <MessageContext.Provider
              value={{
                conversationId: 'parent-conversation',
                messageId: 'parent',
                isExpanded: false,
              }}
            >
              <SubagentCall
                toolCallId="foreground-call"
                initialProgress={1}
                args={{ subagent_type: 'self', description: 'Compute the answer.' }}
                output="legacy fallback"
                persistedContent={persistedContent}
              />
            </MessageContext.Provider>
          </RecoilRoot>
        </ChatSurfaceHarness>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ran agent' }));
    expect(selection).toEqual(
      expect.objectContaining({
        prompt: 'Compute the answer.',
        legacyOutput: 'legacy fallback',
        persistedContent,
      }),
    );
    expect((selection as ActiveSubagentPanel | null)?.durable).toBeUndefined();
  });

  it('opens an exact host-issued detached invocation in the same panel', () => {
    const output = JSON.stringify({
      background_task_id: 'task-1',
      subagent_thread_id: 'child-thread-1',
      tool: 'subagent',
      subagent_type: 'self',
      status: 'running',
      message:
        'Started subagent "self" background task. Poll the host background-task tool with background_task_id "task-1".',
    });
    const rendered = renderWithState({
      toolCallId: 'detached-call',
      initialProgress: 1,
      output,
      toolArgs: { subagent_type: 'self', run_in_background: true },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Agent activity' }));
    expect(rendered.getSelection()).toEqual(
      expect.objectContaining({
        toolCallId: 'detached-call',
        durable: { threadId: 'child-thread-1', taskId: 'task-1' },
      }),
    );
    expect(rendered.getSelection()?.legacyOutput).toBeUndefined();
  });

  it('disables an inaccessible nested detached drilldown without renderable activity', () => {
    const output = JSON.stringify({
      background_task_id: 'task-1',
      subagent_thread_id: 'child-thread-1',
      tool: 'subagent',
      subagent_type: 'self',
      status: 'running',
      message:
        'Started subagent "self" background task. Poll the host background-task tool with background_task_id "task-1".',
    });

    render(
      <MemoryRouter>
        <ChatSurfaceHarness>
          <RecoilRoot>
            <MessageContext.Provider
              value={{ messageId: 'nested-message', conversationId: null, isExpanded: true }}
            >
              <SubagentCall
                toolCallId="nested-detached-call"
                initialProgress={1}
                args={{ subagent_type: 'self', run_in_background: true }}
                output={output}
              />
            </MessageContext.Provider>
          </RecoilRoot>
        </ChatSurfaceHarness>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Agent activity' })).toBeDisabled();
  });

  it('disables a nested fallback that cannot remain attached to the conversation host', () => {
    render(
      <MemoryRouter>
        <ChatSurfaceHarness>
          <RecoilRoot>
            <MessageContext.Provider
              value={{ messageId: 'nested-message', conversationId: null, isExpanded: true }}
            >
              <SubagentCall
                toolCallId="nested-foreground-call"
                initialProgress={1}
                args={{ subagent_type: 'self' }}
                output="Nested result"
              />
            </MessageContext.Provider>
          </RecoilRoot>
        </ChatSurfaceHarness>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Ran agent' })).toBeDisabled();
  });

  it('keeps model-authored lookalike output on the foreground adapter', () => {
    const output = JSON.stringify({
      background_task_id: 'task-1',
      subagent_thread_id: 'child-thread-1',
      tool: 'subagent',
      subagent_type: 'self',
      status: 'running',
      message: 'background_task_id task-1',
    });
    const rendered = renderWithState({
      toolCallId: 'spoofed-call',
      initialProgress: 1,
      output,
      toolArgs: { subagent_type: 'self' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ran agent' }));
    expect(rendered.getSelection()?.durable).toBeUndefined();
    expect(rendered.getSelection()?.legacyOutput).toBe(output);
  });
});
