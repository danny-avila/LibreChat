import React from 'react';
import { RecoilRoot, useRecoilCallback } from 'recoil';
import { render, screen, act } from '@testing-library/react';
import SubagentCall from '../SubagentCall';
import { subagentProgressByToolCallId, type SubagentProgress } from '~/store/subagents';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, values?: Record<string, unknown>): string => {
      const arg0 = (values?.[0] as string | undefined) ?? '';
      const arg1 = (values?.[1] as string | undefined) ?? '';
      const translations: Record<string, string> = {
        com_ui_subagent_running: `Subagent "${arg0}" is working…`,
        com_ui_subagent_complete: `Subagent "${arg0}" finished`,
        com_ui_subagent_cancelled: `Subagent "${arg0}" cancelled`,
        com_ui_subagent_errored: `Subagent "${arg0}" errored`,
        com_ui_subagent_waiting: 'Waiting for first update…',
        com_ui_subagent_dialog_title: `Subagent: ${arg0}`,
        com_ui_subagent_dialog_description: 'Isolated child run.',
        com_ui_subagent_no_result_yet: 'No result yet.',
        com_ui_subagent_empty_result: 'No text.',
        com_ui_subagent_ticker_writing: 'Writing',
        com_ui_subagent_ticker_reasoning: 'Reasoning',
        com_ui_subagent_ticker_error: 'Error',
        com_ui_subagent_ticker_using: `Using tool: ${arg0}`,
        com_ui_subagent_ticker_using_with_args: `Using ${arg0}(${arg1})`,
        com_ui_subagent_ticker_tool_complete: `Tool ${arg0} complete`,
        com_ui_subagent_ticker_tool_output: `${arg0} → ${arg1}`,
      };
      return translations[key] ?? key;
    },
}));

/** Stub the leaf content-part renderers — the tests only need to confirm
 *  that the right TMessageContentParts flow through to them. */
jest.mock('../Text', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <div data-testid="text-part">{text}</div>,
}));

jest.mock('../Reasoning', () => ({
  __esModule: true,
  default: ({ reasoning }: { reasoning: string }) => (
    <div data-testid="reasoning-part">{reasoning}</div>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/ToolCall', () => ({
  __esModule: true,
  default: ({ name, output }: { name: string; output: string }) => (
    <div data-testid="tool-call-part" data-name={name}>
      {output}
    </div>
  ),
}));

jest.mock('../Attachment', () => ({
  AttachmentGroup: ({ attachments }: { attachments: unknown }) => (
    <div data-testid="attachment-group">{JSON.stringify(attachments)}</div>
  ),
}));

jest.mock('@librechat/client', () => ({
  OGDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-title">{children}</div>
  ),
  OGDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-description">{children}</div>
  ),
}));

jest.mock('lucide-react', () => ({
  // eslint-disable-next-line i18next/no-literal-string
  ChevronRight: () => <span>chevron</span>,
  // eslint-disable-next-line i18next/no-literal-string
  Users: () => <span>users</span>,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

/**
 * Mount the component inside a RecoilRoot and expose a setter so each test
 * can seed the `subagentProgressByToolCallId` atom with the state under test.
 * Real Recoil, no mocks of the store — matches the hook-integration test
 * style in useStepHandler.spec.ts.
 */
function renderWithState(args: {
  toolCallId: string;
  initialProgress: number;
  isSubmitting?: boolean;
  progress?: SubagentProgress | null;
}) {
  const setter = { current: null as null | ((next: SubagentProgress | null) => void) };
  const SeedHelper = () => {
    setter.current = useRecoilCallback(
      ({ set }) =>
        (next: SubagentProgress | null) => {
          set(subagentProgressByToolCallId(args.toolCallId), next);
        },
      [],
    );
    return null;
  };
  const rendered = render(
    <RecoilRoot>
      <SeedHelper />
      <SubagentCall
        toolCallId={args.toolCallId}
        initialProgress={args.initialProgress}
        isSubmitting={args.isSubmitting ?? false}
        args={{ subagent_type: 'self', description: 'compute' }}
      />
    </RecoilRoot>,
  );
  act(() => {
    setter.current?.(args.progress ?? null);
  });
  return rendered;
}

describe('SubagentCall — status resolution', () => {
  it('renders "working…" while streaming and no terminal envelope has arrived', () => {
    renderWithState({
      toolCallId: 'call_running',
      initialProgress: 0.3,
      isSubmitting: true,
      progress: {
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'run_step',
      },
    });
    expect(screen.getByText('Subagent "self" is working…')).toBeInTheDocument();
  });

  it('renders "finished" when the subagent emits a `stop` phase', () => {
    renderWithState({
      toolCallId: 'call_stopped',
      initialProgress: 0.3,
      isSubmitting: true,
      progress: {
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'stop',
      },
    });
    expect(screen.getByText('Subagent "self" finished')).toBeInTheDocument();
  });

  it('renders "finished" when the tool call progress reaches 1', () => {
    renderWithState({
      toolCallId: 'call_done',
      initialProgress: 1,
      isSubmitting: false,
      progress: null,
    });
    expect(screen.getByText('Subagent "self" finished')).toBeInTheDocument();
  });

  it('renders "cancelled" when the stream stops before a terminal envelope (Codex P2 regression)', () => {
    /**
     * Codex P2 on #12725: the old `running` computation ignored whether the
     * parent run was still streaming, so a user stop or dropped connection
     * would leave the ticker permanently "working…". Mirror the behavior
     * of `ToolCall.tsx` — `!isSubmitting && !finished` → cancelled.
     */
    renderWithState({
      toolCallId: 'call_cancelled',
      initialProgress: 0.4,
      isSubmitting: false,
      progress: {
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'run_step',
      },
    });
    expect(screen.getByText('Subagent "self" cancelled')).toBeInTheDocument();
  });

  it('renders "errored" when the subagent emits an `error` phase', () => {
    renderWithState({
      toolCallId: 'call_error',
      initialProgress: 0.4,
      isSubmitting: true,
      progress: {
        subagentRunId: 'run_a',
        subagentType: 'self',
        events: [],
        status: 'error',
      },
    });
    expect(screen.getByText('Subagent "self" errored')).toBeInTheDocument();
  });
});

describe('SubagentCall — ticker', () => {
  it('renders semantic text lines instead of raw event names', () => {
    renderWithState({
      toolCallId: 'call_ticker',
      initialProgress: 0.3,
      isSubmitting: true,
      progress: {
        subagentRunId: 'run_a',
        subagentType: 'self',
        status: 'run_step',
        events: [
          {
            runId: 'p',
            subagentRunId: 'run_a',
            subagentType: 'self',
            subagentAgentId: 'child',
            phase: 'message_delta',
            data: { delta: { content: [{ type: 'text', text: 'Computing result…' }] } },
            timestamp: '',
          },
          {
            runId: 'p',
            subagentRunId: 'run_a',
            subagentType: 'self',
            subagentAgentId: 'child',
            phase: 'run_step',
            data: {
              stepDetails: {
                type: 'tool_calls',
                tool_calls: [{ id: 'c1', name: 'calculator', args: '{"expression":"42*58"}' }],
              },
            },
            timestamp: '',
          },
          {
            runId: 'p',
            subagentRunId: 'run_a',
            subagentType: 'self',
            subagentAgentId: 'child',
            phase: 'run_step_completed',
            data: {
              result: {
                type: 'tool_call',
                tool_call: {
                  id: 'c1',
                  name: 'calculator',
                  output: '42*58 = 2436',
                  progress: 1,
                },
              },
            },
            timestamp: '',
          },
        ],
      },
    });

    /** Raw event names never appear in the ticker. */
    expect(screen.queryByText(/on_run_step/)).not.toBeInTheDocument();
    expect(screen.queryByText(/on_message_delta/)).not.toBeInTheDocument();
    /** Semantic lines do. */
    expect(screen.getByText('Using calculator(expression=42*58)')).toBeInTheDocument();
    expect(screen.getByText('calculator → 42*58 = 2436')).toBeInTheDocument();
  });

  it('collapses a streak of message_delta events into one live Writing line', () => {
    renderWithState({
      toolCallId: 'call_writing',
      initialProgress: 0.3,
      isSubmitting: true,
      progress: {
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
      },
    });
    expect(screen.getByText('Writing: Hello world!')).toBeInTheDocument();
    /** Only one "Writing" line, not three. */
    expect(screen.getAllByText(/Writing:/)).toHaveLength(1);
  });
});

describe('SubagentCall — dialog content', () => {
  it('renders aggregated text, reasoning, and tool_call parts through leaf renderers', () => {
    renderWithState({
      toolCallId: 'call_dialog',
      initialProgress: 0.4,
      isSubmitting: true,
      progress: {
        subagentRunId: 'run_a',
        subagentType: 'self',
        status: 'stop',
        events: [
          {
            runId: 'p',
            subagentRunId: 'run_a',
            subagentType: 'self',
            subagentAgentId: 'child',
            phase: 'reasoning_delta',
            data: { delta: { content: [{ type: 'think', think: 'Let me compute.' }] } },
            timestamp: '',
          },
          {
            runId: 'p',
            subagentRunId: 'run_a',
            subagentType: 'self',
            subagentAgentId: 'child',
            phase: 'run_step',
            data: {
              stepDetails: {
                type: 'tool_calls',
                tool_calls: [{ id: 'c1', name: 'calculator', args: '{}' }],
              },
            },
            timestamp: '',
          },
          {
            runId: 'p',
            subagentRunId: 'run_a',
            subagentType: 'self',
            subagentAgentId: 'child',
            phase: 'run_step_completed',
            data: {
              result: {
                type: 'tool_call',
                tool_call: { id: 'c1', name: 'calculator', output: '4', progress: 1 },
              },
            },
            timestamp: '',
          },
          {
            runId: 'p',
            subagentRunId: 'run_a',
            subagentType: 'self',
            subagentAgentId: 'child',
            phase: 'message_delta',
            data: { delta: { content: [{ type: 'text', text: 'The answer is 4.' }] } },
            timestamp: '',
          },
        ],
      },
    });

    /** The mocked `OGDialog` always renders children, so dialog content is
     *  inspectable without simulating a click. */
    expect(screen.getByTestId('reasoning-part')).toHaveTextContent('Let me compute.');
    expect(screen.getByTestId('tool-call-part')).toHaveAttribute('data-name', 'calculator');
    expect(screen.getByTestId('tool-call-part')).toHaveTextContent('4');
    expect(screen.getByTestId('text-part')).toHaveTextContent('The answer is 4.');
  });

  it('falls back to the raw tool output when no content parts were recorded', () => {
    renderWithState({
      toolCallId: 'call_fallback',
      initialProgress: 1,
      isSubmitting: false,
      progress: null,
    });
    /** No events → no aggregated parts. The SubagentCall should still
     *  render the raw final `output` that came back in the parent's
     *  tool_call (we pass it explicitly below). */
    const { rerender } = render(
      <RecoilRoot>
        <SubagentCall
          toolCallId="call_fallback_2"
          initialProgress={1}
          output="raw final text"
          isSubmitting={false}
        />
      </RecoilRoot>,
    );
    expect(screen.getByText('raw final text')).toBeInTheDocument();
    rerender(<RecoilRoot />);
  });

  it('renders persistedContent parts when no live events are available (page-refresh flow)', () => {
    /**
     * After a refresh the Recoil atom is empty — the child's history has
     * to come from the `subagent_content` array the backend attached to
     * the tool_call at message-save time. Verifies that a
     * `persistedContent` prop routes through the same leaf renderers
     * (Text / Reasoning / ToolCall) as live aggregation so a reopened
     * dialog looks identical to how the run streamed.
     */
    const persistedContent = [
      { type: 'think', think: 'Prior thinking.' },
      {
        type: 'tool_call',
        tool_call: {
          id: 'inner-1',
          name: 'calculator',
          args: '{"expression":"42*58"}',
          output: '2436',
          progress: 1,
        },
      },
      { type: 'text', text: 'Final persisted answer.' },
    ] as unknown as Parameters<typeof SubagentCall>[0]['persistedContent'];

    render(
      <RecoilRoot>
        <SubagentCall
          toolCallId="call_refresh"
          initialProgress={1}
          isSubmitting={false}
          persistedContent={persistedContent}
        />
      </RecoilRoot>,
    );

    expect(screen.getByTestId('reasoning-part')).toHaveTextContent('Prior thinking.');
    expect(screen.getByTestId('tool-call-part')).toHaveAttribute('data-name', 'calculator');
    expect(screen.getByTestId('tool-call-part')).toHaveTextContent('2436');
    expect(screen.getByTestId('text-part')).toHaveTextContent('Final persisted answer.');
  });

  it('prefers live aggregated events over persistedContent while the stream is active', () => {
    /**
     * Guard against regression: if the backend's persisted snapshot and
     * the live atom are both populated, the live atom wins. Otherwise
     * mid-stream renders would flicker between the latest chunk and the
     * previously-persisted state.
     */
    renderWithState({
      toolCallId: 'call_live_wins',
      initialProgress: 0.4,
      isSubmitting: true,
      progress: {
        subagentRunId: 'run_live',
        subagentType: 'self',
        status: 'message_delta',
        events: [
          {
            runId: 'p',
            subagentRunId: 'run_live',
            subagentType: 'self',
            subagentAgentId: 'child',
            phase: 'message_delta',
            data: { delta: { content: [{ type: 'text', text: 'Live answer.' }] } },
            timestamp: '',
          },
        ],
      },
    });
    /** Re-render with BOTH a populated atom and a different persisted
     *  snapshot — live should win. */
    render(
      <RecoilRoot>
        <SubagentCall
          toolCallId="call_both"
          initialProgress={0.5}
          isSubmitting
          persistedContent={
            [{ type: 'text', text: 'Stale persisted answer.' }] as unknown as Parameters<
              typeof SubagentCall
            >[0]['persistedContent']
          }
        />
      </RecoilRoot>,
    );
    /** Only the first mount seeded the atom; the second mount has no
     *  live events so it falls back to persisted. Both should render —
     *  confirming the preference rule resolves independently per mount. */
    expect(screen.getByText('Live answer.')).toBeInTheDocument();
    expect(screen.getByText('Stale persisted answer.')).toBeInTheDocument();
  });
});
